import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createRateLimiter } from '@/lib/middleware/rate-limit'
import { validatePortalToken, PortalAuthError } from '@/lib/services/portal-auth'

const tokenLookupLimiter = createRateLimiter({ windowMs: 60_000, maxRequests: 30 })

// ── Slot Computation (from /api/booking/[slug]/route.ts) ────────────────

const SYNC_FRESHNESS_MINUTES = 5
const SYNC_TIMEOUT_MS = 4000

interface TimeSlot {
  time: string
  available: boolean
}

interface BusyBlock {
  start: number
  end: number
}

async function computeSlots(
  admin: ReturnType<typeof createAdminClient>,
  bookingPageId: string,
  userId: string,
  tenantId: string,
  date: string,
  startTime: string,
  endTime: string,
  durationMinutes: number,
  bufferMinutes: number,
  minNoticeHours: number,
  timezone: string
): Promise<TimeSlot[]> {
  const tz = timezone || 'UTC'
  const prevDate = shiftDate(date, -1)
  const nextDate = shiftDate(date, +1)

  const [appointmentsRes, calendarEventsRes] = await Promise.all([
    admin
      .from('appointments')
      .select('start_time, end_time')
      .eq('booking_page_id', bookingPageId)
      .eq('appointment_date', date)
      .in('status', ['confirmed', 'checked_in', 'in_meeting']),
    admin
      .from('calendar_events')
      .select('start_at, end_at, all_day, show_as')
      .eq('created_by', userId)
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .neq('status', 'cancelled')
      .gte('start_at', prevDate + 'T00:00:00')
      .lte('start_at', nextDate + 'T23:59:59'),
  ])

  const appointmentBlocks: BusyBlock[] = (appointmentsRes.data ?? []).map((a: { start_time: string; end_time: string }) => ({
    start: timeToMinutes(a.start_time),
    end: timeToMinutes(a.end_time),
  }))

  const calendarBlocks: BusyBlock[] = (calendarEventsRes.data ?? [])
    .filter((e: { show_as: string | null }) => e.show_as !== 'free')
    .map((e: { start_at: string; end_at: string; all_day: boolean }) => eventToBusyBlock(e, date, tz))
    .filter((b: BusyBlock | null): b is BusyBlock => b !== null)

  const allBusy = [...appointmentBlocks, ...calendarBlocks]

  const nowInTz = nowInTimezone(tz)
  const todayStr = dateInTimezone(tz)
  let minStartMinutes = 0
  if (date === todayStr) {
    minStartMinutes = nowInTz + minNoticeHours * 60
  } else if (date < todayStr) {
    return []
  }

  const slotDuration = durationMinutes + bufferMinutes
  const dayStart = timeToMinutes(startTime)
  const dayEnd = timeToMinutes(endTime)
  const slots: TimeSlot[] = []

  for (let t = dayStart; t + durationMinutes <= dayEnd; t += slotDuration) {
    const slotEnd = t + durationMinutes
    if (t < minStartMinutes) continue

    const hasConflict = allBusy.some((b) => {
      const blockWithBuffer = { start: b.start - bufferMinutes, end: b.end + bufferMinutes }
      return t < blockWithBuffer.end && slotEnd > blockWithBuffer.start
    })

    slots.push({ time: minutesToTime(t), available: !hasConflict })
  }

  return slots
}

function eventToBusyBlock(
  event: { start_at: string; end_at: string; all_day: boolean },
  targetDate: string,
  timezone: string
): BusyBlock | null {
  if (event.all_day) {
    const eventLocalDate = toLocalDateStr(event.start_at, timezone)
    if (eventLocalDate !== targetDate) return null
    return { start: 0, end: 24 * 60 }
  }

  const startLocalDate = toLocalDateStr(event.start_at, timezone)
  const endLocalDate = toLocalDateStr(event.end_at, timezone)

  if (startLocalDate === targetDate) {
    const startMinutes = isoToMinutesInTimezone(event.start_at, timezone)
    const endMinutes = endLocalDate === targetDate
      ? isoToMinutesInTimezone(event.end_at, timezone)
      : 24 * 60
    return { start: startMinutes, end: endMinutes }
  }

  if (endLocalDate === targetDate || (startLocalDate < targetDate && endLocalDate > targetDate)) {
    const endMinutes = endLocalDate === targetDate
      ? isoToMinutesInTimezone(event.end_at, timezone)
      : 24 * 60
    return { start: 0, end: endMinutes }
  }

  return null
}

// ── Calendar Freshness ──────────────────────────────────────────────────

interface CalendarSyncStatus {
  enabled: boolean
  lastSyncAt: string | null
  stale: boolean
}

async function ensureCalendarFresh(
  admin: ReturnType<typeof createAdminClient>,
  userId: string
): Promise<CalendarSyncStatus> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: conn } = await (admin as any)
      .from('microsoft_connections')
      .select('id, last_calendar_sync_at, calendar_sync_enabled')
      .eq('user_id', userId)
      .eq('is_active', true)
      .single()

    if (!conn) return { enabled: false, lastSyncAt: null, stale: false }
    if (!conn.calendar_sync_enabled) {
      return { enabled: false, lastSyncAt: conn.last_calendar_sync_at ?? null, stale: false }
    }

    const lastSync = conn.last_calendar_sync_at ? new Date(conn.last_calendar_sync_at).getTime() : 0
    const staleCutoff = Date.now() - SYNC_FRESHNESS_MINUTES * 60 * 1000

    if (lastSync >= staleCutoff) {
      return { enabled: true, lastSyncAt: conn.last_calendar_sync_at ?? null, stale: false }
    }

    try {
      const { syncCalendarPull } = await import('@/lib/services/microsoft-sync')
      const syncPromise = syncCalendarPull(conn.id, admin)
      const timeoutPromise = new Promise<null>((resolve) =>
        setTimeout(() => resolve(null), SYNC_TIMEOUT_MS)
      )
      const result = await Promise.race([syncPromise, timeoutPromise])
      if (result) {
        return { enabled: true, lastSyncAt: new Date().toISOString(), stale: false }
      }
      return { enabled: true, lastSyncAt: conn.last_calendar_sync_at ?? null, stale: true }
    } catch {
      return { enabled: true, lastSyncAt: conn.last_calendar_sync_at ?? null, stale: true }
    }
  } catch {
    return { enabled: false, lastSyncAt: null, stale: false }
  }
}

// ── Time Helpers ────────────────────────────────────────────────────────

function timeToMinutes(time: string): number {
  const parts = time.split(':')
  return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10)
}

function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`
}

function addMinutesToTime(time: string, minutes: number): string {
  const total = timeToMinutes(time) + minutes
  return minutesToTime(total)
}

function isoToMinutesInTimezone(isoString: string, timezone: string): number {
  const d = new Date(isoString)
  const localStr = d.toLocaleString('en-US', {
    timeZone: timezone, hour12: false, hour: '2-digit', minute: '2-digit',
  })
  const [h, m] = localStr.split(':').map(Number)
  return h * 60 + m
}

function toLocalDateStr(isoString: string, timezone: string): string {
  return new Date(isoString).toLocaleDateString('en-CA', { timeZone: timezone })
}

function nowInTimezone(timezone: string): number {
  const now = new Date()
  const localStr = now.toLocaleString('en-US', {
    timeZone: timezone, hour12: false, hour: '2-digit', minute: '2-digit',
  })
  const [h, m] = localStr.split(':').map(Number)
  return h * 60 + m
}

function dateInTimezone(timezone: string): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: timezone })
}

function shiftDate(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().split('T')[0]
}

// ── GET /api/portal/[token]/booking ─────────────────────────────────────

async function handleGet(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
    const { allowed, retryAfterMs } = tokenLookupLimiter.check(ip)
    if (!allowed) {
      return NextResponse.json(
        { error: 'Too many requests' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil(retryAfterMs / 1000)) } }
      )
    }

    const { token } = await params

    let link: Awaited<ReturnType<typeof validatePortalToken>>
    try {
      link = await validatePortalToken(token)
    } catch (error) {
      if (error instanceof PortalAuthError) {
        return NextResponse.json({ error: error.message }, { status: error.status })
      }
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }

    const admin = createAdminClient()

    // 1. Get matter's responsible lawyer
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: matter } = await (admin as any)
      .from('matters')
      .select('responsible_lawyer_id')
      .eq('id', link.matter_id)
      .single()

    if (!matter?.responsible_lawyer_id) {
      return NextResponse.json({ available: false, reason: 'no_lawyer' })
    }

    // 2. Find lawyer's published booking page
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: page } = await (admin as any)
      .from('booking_pages')
      .select('id, title, description, duration_minutes, buffer_minutes, working_hours, timezone, max_days_ahead, min_notice_hours, theme_color, confirmation_message, user_id, tenant_id')
      .eq('user_id', matter.responsible_lawyer_id)
      .eq('status', 'published')
      .eq('is_active', true)
      .limit(1)
      .maybeSingle()

    if (!page) {
      return NextResponse.json({ available: false, reason: 'no_booking_page' })
    }

    // 3. Get lawyer name (try users table first, then contacts)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: lawyerUser } = await (admin as any)
      .from('users')
      .select('first_name, last_name')
      .eq('id', matter.responsible_lawyer_id)
      .maybeSingle()

    let lawyerFullName = ''
    if (lawyerUser) {
      lawyerFullName = [lawyerUser.first_name, lawyerUser.last_name].filter(Boolean).join(' ')
    }
    // Fallback: check contacts table (responsible_lawyer_id might reference a contact)
    if (!lawyerFullName) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: lawyerContact } = await (admin as any)
        .from('contacts')
        .select('first_name, last_name')
        .eq('id', matter.responsible_lawyer_id)
        .maybeSingle()
      if (lawyerContact) {
        lawyerFullName = [lawyerContact.first_name, lawyerContact.last_name].filter(Boolean).join(' ')
      }
    }

    // 4. Get contact info for pre-fill
    let guestInfo = { name: '', email: '', phone: '' }
    if (link.contact_id) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: contact } = await (admin as any)
        .from('contacts')
        .select('first_name, last_name, email_primary, phone_primary')
        .eq('id', link.contact_id)
        .single()

      if (contact) {
        guestInfo = {
          name: [contact.first_name, contact.last_name].filter(Boolean).join(' '),
          email: contact.email_primary ?? '',
          phone: contact.phone_primary ?? '',
        }
      }
    }

    // 5. If date requested, compute available slots
    const url = new URL(request.url)
    const dateParam = url.searchParams.get('date')

    if (!dateParam) {
      return NextResponse.json({
        available: true,
        bookingPage: {
          id: page.id,
          title: page.title,
          description: page.description,
          duration_minutes: page.duration_minutes,
          working_hours: page.working_hours,
          max_days_ahead: page.max_days_ahead,
          min_notice_hours: page.min_notice_hours,
          theme_color: page.theme_color,
        },
        lawyerName: lawyerFullName,
        guestInfo,
        slots: null,
      })
    }

    // Ensure calendar is fresh
    const syncStatus = await ensureCalendarFresh(admin, page.user_id)

    const workingHours = page.working_hours as { start: string; end: string; days: number[] }
    const requestedDate = new Date(dateParam + 'T00:00:00')
    const dayOfWeek = requestedDate.getDay()

    // Check working day + overrides
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: override } = await (admin as any)
      .from('booking_page_overrides')
      .select('*')
      .eq('booking_page_id', page.id)
      .eq('override_date', dateParam)
      .maybeSingle()

    let startTime = workingHours.start
    let endTime = workingHours.end
    let isWorkDay = workingHours.days.includes(dayOfWeek)

    if (override) {
      if (!override.is_available) {
        return NextResponse.json({ available: true, bookingPage: { id: page.id, title: page.title, duration_minutes: page.duration_minutes, working_hours: page.working_hours, max_days_ahead: page.max_days_ahead }, lawyerName: lawyerFullName, guestInfo, slots: [], calendarSync: syncStatus })
      }
      isWorkDay = true
      if (override.start_time) startTime = override.start_time
      if (override.end_time) endTime = override.end_time
    }

    if (!isWorkDay) {
      return NextResponse.json({ available: true, bookingPage: { id: page.id, title: page.title, duration_minutes: page.duration_minutes, working_hours: page.working_hours, max_days_ahead: page.max_days_ahead }, lawyerName: lawyerFullName, guestInfo, slots: [], calendarSync: syncStatus })
    }

    const slots = await computeSlots(
      admin, page.id, page.user_id, page.tenant_id,
      dateParam, startTime, endTime,
      page.duration_minutes, page.buffer_minutes ?? 0,
      page.min_notice_hours ?? 0, page.timezone ?? 'America/Toronto'
    )

    return NextResponse.json({
      available: true,
      bookingPage: {
        id: page.id,
        title: page.title,
        description: page.description,
        duration_minutes: page.duration_minutes,
        working_hours: page.working_hours,
        max_days_ahead: page.max_days_ahead,
        min_notice_hours: page.min_notice_hours,
        theme_color: page.theme_color,
        confirmation_message: page.confirmation_message,
      },
      lawyerName: lawyerFullName,
      guestInfo,
      slots: slots.filter((s) => s.available),
      calendarSync: syncStatus,
    })
  } catch (err) {
    console.error('[Portal Booking] GET error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ── POST /api/portal/[token]/booking ────────────────────────────────────

async function handlePost(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
    const { allowed, retryAfterMs } = tokenLookupLimiter.check(ip)
    if (!allowed) {
      return NextResponse.json(
        { error: 'Too many requests' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil(retryAfterMs / 1000)) } }
      )
    }

    const { token } = await params

    let link: Awaited<ReturnType<typeof validatePortalToken>>
    try {
      link = await validatePortalToken(token)
    } catch (error) {
      if (error instanceof PortalAuthError) {
        return NextResponse.json({ error: error.message }, { status: error.status })
      }
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }

    const admin = createAdminClient()

    const body = await request.json()
    const { date, time, meeting_type, notes } = body as {
      date: string
      time: string
      meeting_type: 'in_person' | 'video' | 'phone'
      notes?: string
    }

    if (!date || !time || !meeting_type) {
      return NextResponse.json({ error: 'date, time, and meeting_type are required' }, { status: 400 })
    }

    // 1. Resolve lawyer + booking page
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: matter } = await (admin as any)
      .from('matters')
      .select('responsible_lawyer_id')
      .eq('id', link.matter_id)
      .single()

    if (!matter?.responsible_lawyer_id) {
      return NextResponse.json({ error: 'No lawyer assigned' }, { status: 400 })
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: page } = await (admin as any)
      .from('booking_pages')
      .select('id, user_id, tenant_id, duration_minutes, timezone, confirmation_message, title')
      .eq('user_id', matter.responsible_lawyer_id)
      .eq('status', 'published')
      .eq('is_active', true)
      .limit(1)
      .maybeSingle()

    if (!page) {
      return NextResponse.json({ error: 'Booking not available' }, { status: 404 })
    }

    // 2. Double-check availability
    const endTime = addMinutesToTime(time, page.duration_minutes)

    const { data: conflicting } = await admin
      .from('appointments')
      .select('id')
      .eq('booking_page_id', page.id)
      .eq('appointment_date', date)
      .eq('status', 'confirmed')
      .lt('start_time', endTime)
      .gt('end_time', time)
      .limit(1)

    if (conflicting && conflicting.length > 0) {
      return NextResponse.json({ error: 'This time slot is no longer available.' }, { status: 409 })
    }

    // Calendar event conflict check
    const tz = page.timezone || 'UTC'
    const prevDate = shiftDate(date, -1)
    const nextDate = shiftDate(date, +1)

    const { data: nearbyCalendarEvents } = await admin
      .from('calendar_events')
      .select('start_at, end_at, show_as')
      .eq('created_by', page.user_id)
      .eq('tenant_id', page.tenant_id)
      .eq('is_active', true)
      .neq('status', 'cancelled')
      .neq('show_as', 'free')
      .gte('start_at', prevDate + 'T00:00:00')
      .lte('start_at', nextDate + 'T23:59:59')

    const slotStartMin = timeToMinutes(time)
    const slotEndMin = timeToMinutes(endTime)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const hasCalendarConflict = (nearbyCalendarEvents ?? []).some((e: any) => {
      const eventStartDate = toLocalDateStr(e.start_at, tz)
      const eventEndDate = toLocalDateStr(e.end_at, tz)
      if (eventStartDate > date && eventEndDate > date) return false
      if (eventEndDate < date) return false
      const eventStartMin = eventStartDate === date ? isoToMinutesInTimezone(e.start_at, tz) : 0
      const eventEndMin = eventEndDate === date ? isoToMinutesInTimezone(e.end_at, tz) : 24 * 60
      return slotStartMin < eventEndMin && slotEndMin > eventStartMin
    })

    if (hasCalendarConflict) {
      return NextResponse.json({ error: 'This time slot is no longer available.' }, { status: 409 })
    }

    // 3. Get contact info
    let guestName = ''
    let guestEmail = ''
    let guestPhone = ''
    if (link.contact_id) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: contact } = await (admin as any)
        .from('contacts')
        .select('first_name, last_name, email_primary, phone_primary')
        .eq('id', link.contact_id)
        .single()
      if (contact) {
        guestName = [contact.first_name, contact.last_name].filter(Boolean).join(' ')
        guestEmail = contact.email_primary ?? ''
        guestPhone = contact.phone_primary ?? ''
      }
    }

    // 4. Create appointment
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: appointment, error: appointmentError } = await (admin as any)
      .from('appointments')
      .insert({
        tenant_id: link.tenant_id,
        booking_page_id: page.id,
        user_id: page.user_id,
        contact_id: link.contact_id,
        matter_id: link.matter_id,
        appointment_date: date,
        start_time: time,
        end_time: endTime,
        duration_minutes: page.duration_minutes,
        guest_name: guestName,
        guest_email: guestEmail,
        guest_phone: guestPhone,
        guest_notes: notes ?? null,
        answers: { meeting_type },
        status: 'confirmed',
      })
      .select('id')
      .single()

    if (appointmentError) {
      console.error('[Portal Booking] Appointment creation error:', appointmentError)
      return NextResponse.json({ error: 'Failed to create appointment' }, { status: 500 })
    }

    // 5. Log activity (fire-and-forget)
    if (link.contact_id) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(admin as any).from('activities').insert({
        tenant_id: link.tenant_id,
        user_id: page.user_id,
        activity_type: 'booking_created',
        title: `Portal Booking: ${guestName} — ${page.title}`,
        entity_type: 'contact',
        entity_id: link.contact_id,
        metadata: {
          appointment_id: appointment.id,
          booking_page: page.title,
          date,
          time,
          meeting_type,
          source: 'client_portal',
          matter_id: link.matter_id,
        },
      }).then(() => {})
    }

    return NextResponse.json({
      success: true,
      appointment_id: appointment.id,
      confirmation_message: page.confirmation_message ?? 'Your appointment has been booked.',
    }, { status: 201 })
  } catch (err) {
    console.error('[Portal Booking] POST error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export { handleGet as GET, handlePost as POST }
