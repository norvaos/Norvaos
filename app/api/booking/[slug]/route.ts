import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { withTiming } from '@/lib/middleware/request-timing'

/** How many minutes before we consider the calendar sync stale */
const SYNC_FRESHNESS_MINUTES = 5

/** Maximum time (ms) to wait for a background calendar sync before returning stale data */
const SYNC_TIMEOUT_MS = 4000

/**
 * GET /api/booking/[slug]?date=YYYY-MM-DD
 *
 * Public endpoint — returns booking page config + available time slots
 * for the requested date. If no date is provided, returns just the config.
 *
 * The response includes a `calendarSync` object describing whether the
 * lawyer's Outlook calendar events are being factored into availability:
 *   { enabled: boolean; lastSyncAt: string | null; stale: boolean }
 */
async function handleGet(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params
    const admin = createAdminClient()
    const url = new URL(request.url)
    const dateParam = url.searchParams.get('date') // 'YYYY-MM-DD'

    // 1. Fetch booking page by slug
    const { data: page, error: pageError } = await admin
      .from('booking_pages')
      .select('*')
      .eq('slug', slug)
      .eq('status', 'published')
      .eq('is_active', true)
      .single()

    if (pageError || !page) {
      return NextResponse.json(
        { success: false, error: 'Booking page not found' },
        { status: 404 }
      )
    }

    // If no date requested, return just the page info
    if (!dateParam) {
      const syncStatus = await getCalendarSyncStatus(admin, page.user_id)
      return NextResponse.json({
        success: true,
        bookingPage: page,
        slots: null,
        calendarSync: syncStatus,
      })
    }

    // 2. Ensure calendar data is fresh before computing slots
    //    (awaits the sync with a timeout instead of fire-and-forget)
    const syncStatus = await ensureCalendarFresh(admin, page.user_id)

    // 3. Compute available slots for the requested date
    const requestedDate = new Date(dateParam + 'T00:00:00')
    const dayOfWeek = requestedDate.getDay() // 0=Sun, 1=Mon, ...

    const workingHours = page.working_hours as {
      start: string
      end: string
      days: number[]
    }

    // Check if it's a working day
    if (!workingHours.days.includes(dayOfWeek)) {
      // Check overrides — maybe this day is available
      const { data: override } = await admin
        .from('booking_page_overrides')
        .select('*')
        .eq('booking_page_id', page.id)
        .eq('override_date', dateParam)
        .single()

      if (!override || !override.is_available) {
        return NextResponse.json({
          success: true,
          bookingPage: page,
          slots: [],
          calendarSync: syncStatus,
        })
      }

      // Use override hours
      const overrideStart = override.start_time || workingHours.start
      const overrideEnd = override.end_time || workingHours.end
      const slots = await computeSlots(
        admin,
        page.id,
        page.user_id,
        page.tenant_id,
        dateParam,
        overrideStart,
        overrideEnd,
        page.duration_minutes,
        page.buffer_minutes,
        page.min_notice_hours,
        page.timezone
      )

      return NextResponse.json({
        success: true,
        bookingPage: page,
        slots,
        calendarSync: syncStatus,
      })
    }

    // Check if there's an override making this day unavailable
    const { data: override } = await admin
      .from('booking_page_overrides')
      .select('*')
      .eq('booking_page_id', page.id)
      .eq('override_date', dateParam)
      .single()

    if (override && !override.is_available) {
      return NextResponse.json({
        success: true,
        bookingPage: page,
        slots: [],
        calendarSync: syncStatus,
      })
    }

    // Use override hours or default working hours
    const startTime = override?.start_time || workingHours.start
    const endTime = override?.end_time || workingHours.end

    const slots = await computeSlots(
      admin,
      page.id,
      page.user_id,
      page.tenant_id,
      dateParam,
      startTime,
      endTime,
      page.duration_minutes,
      page.buffer_minutes,
      page.min_notice_hours,
      page.timezone
    )

    return NextResponse.json({
      success: true,
      bookingPage: page,
      slots,
      calendarSync: syncStatus,
    })
  } catch (err) {
    console.error('Booking page fetch error:', err)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// ── Slot Computation ────────────────────────────────────────────────────────

interface TimeSlot {
  time: string // 'HH:mm'
  available: boolean
}

interface BusyBlock {
  start: number // minutes since midnight
  end: number
}

async function computeSlots(
  admin: ReturnType<typeof createAdminClient>,
  bookingPageId: string,
  userId: string,
  tenantId: string,
  date: string,        // 'YYYY-MM-DD' (local date in booking page timezone)
  startTime: string,
  endTime: string,
  durationMinutes: number,
  bufferMinutes: number,
  minNoticeHours: number,
  timezone: string
): Promise<TimeSlot[]> {
  const tz = timezone || 'UTC'

  // ── Build timezone-aware UTC query range ──────────────────────────
  // Calendar events are stored with UTC timestamps. To find all events
  // that fall on `date` in the booking page's timezone, we pad the query
  // by ±1 day. Events are then filtered in code by checking their local-
  // timezone date. This handles cross-midnight boundary cases correctly.
  const prevDate = shiftDate(date, -1)
  const nextDate = shiftDate(date, +1)

  // Fetch existing appointments AND calendar events in parallel
  const [appointmentsRes, calendarEventsRes] = await Promise.all([
    // Existing appointments for this booking page on this date
    admin
      .from('appointments')
      .select('start_time, end_time')
      .eq('booking_page_id', bookingPageId)
      .eq('appointment_date', date)
      .in('status', ['confirmed', 'checked_in', 'in_meeting']),

    // Calendar events for this user (padded ±1 day for timezone safety)
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

  // Convert appointments to busy blocks
  const appointmentBlocks: BusyBlock[] = (appointmentsRes.data ?? []).map((a) => ({
    start: timeToMinutes(a.start_time),
    end: timeToMinutes(a.end_time),
  }))

  // Convert calendar events to busy blocks (skip 'free' events)
  // Filter to only events that actually overlap with the target local date
  const calendarBlocks: BusyBlock[] = (calendarEventsRes.data ?? [])
    .filter((e) => e.show_as !== 'free')
    .map((e) => eventToBusyBlock(e, date, tz))
    .filter((b): b is BusyBlock => b !== null)

  // Merge all busy blocks
  const allBusy = [...appointmentBlocks, ...calendarBlocks]

  // Compute minimum allowed start time based on notice hours
  // Use the booking page's timezone for "now" comparison
  const nowInTz = nowInTimezone(tz)
  const todayStr = dateInTimezone(tz)
  let minStartMinutes = 0
  if (date === todayStr) {
    minStartMinutes = nowInTz + minNoticeHours * 60
  } else if (date < todayStr) {
    return [] // Past date
  }

  // Generate slots
  const slotDuration = durationMinutes + bufferMinutes
  const dayStart = timeToMinutes(startTime)
  const dayEnd = timeToMinutes(endTime)
  const slots: TimeSlot[] = []

  for (let t = dayStart; t + durationMinutes <= dayEnd; t += slotDuration) {
    const slotEnd = t + durationMinutes

    // Check min notice
    if (t < minStartMinutes) {
      continue
    }

    // Check overlap with any busy block (appointments + calendar events)
    const hasConflict = allBusy.some((b) => {
      const blockWithBuffer = { start: b.start - bufferMinutes, end: b.end + bufferMinutes }
      return t < blockWithBuffer.end && slotEnd > blockWithBuffer.start
    })

    slots.push({
      time: minutesToTime(t),
      available: !hasConflict,
    })
  }

  return slots
}

// ── Calendar Event → Busy Block ──────────────────────────────────────────────

/**
 * Convert a calendar event (with UTC timestamps) to a BusyBlock in the
 * booking page's local timezone. Returns null if the event doesn't overlap
 * with the target date in the local timezone.
 */
function eventToBusyBlock(
  event: { start_at: string; end_at: string; all_day: boolean },
  targetDate: string,
  timezone: string
): BusyBlock | null {
  if (event.all_day) {
    // All-day events: check if the event date matches (in local tz)
    const eventLocalDate = toLocalDateStr(event.start_at, timezone)
    if (eventLocalDate !== targetDate) return null
    return { start: 0, end: 24 * 60 }
  }

  // Get the local date of the event start and end
  const startLocalDate = toLocalDateStr(event.start_at, timezone)
  const endLocalDate = toLocalDateStr(event.end_at, timezone)

  // Case 1: Event starts on the target date
  if (startLocalDate === targetDate) {
    const startMinutes = isoToMinutesInTimezone(event.start_at, timezone)
    // If event ends on the same day, use actual end; otherwise block till midnight
    const endMinutes = endLocalDate === targetDate
      ? isoToMinutesInTimezone(event.end_at, timezone)
      : 24 * 60
    return { start: startMinutes, end: endMinutes }
  }

  // Case 2: Event started before target date but extends into it
  if (endLocalDate === targetDate || (startLocalDate < targetDate && endLocalDate > targetDate)) {
    const endMinutes = endLocalDate === targetDate
      ? isoToMinutesInTimezone(event.end_at, timezone)
      : 24 * 60
    return { start: 0, end: endMinutes }
  }

  // Case 3: Multi-day event that spans across target date entirely
  if (startLocalDate < targetDate && endLocalDate > targetDate) {
    return { start: 0, end: 24 * 60 }
  }

  // Event doesn't overlap with target date
  return null
}

// ── Calendar Freshness Sync ──────────────────────────────────────────────────

interface CalendarSyncStatus {
  enabled: boolean
  lastSyncAt: string | null
  stale: boolean
}

/**
 * Check whether the user has calendar sync enabled and return status info.
 */
async function getCalendarSyncStatus(
  admin: ReturnType<typeof createAdminClient>,
  userId: string
): Promise<CalendarSyncStatus> {
  try {
    const { data: conn } = await admin
      .from('microsoft_connections')
      .select('calendar_sync_enabled, last_calendar_sync_at')
      .eq('user_id', userId)
      .eq('is_active', true)
      .single()

    if (!conn) {
      return { enabled: false, lastSyncAt: null, stale: false }
    }

    const lastSync = conn.last_calendar_sync_at
      ? new Date(conn.last_calendar_sync_at).getTime()
      : 0
    const staleCutoff = Date.now() - SYNC_FRESHNESS_MINUTES * 60 * 1000

    return {
      enabled: conn.calendar_sync_enabled ?? false,
      lastSyncAt: conn.last_calendar_sync_at ?? null,
      stale: lastSync < staleCutoff,
    }
  } catch {
    return { enabled: false, lastSyncAt: null, stale: false }
  }
}

/**
 * Ensure calendar data is fresh by awaiting the sync (with timeout) if stale.
 * Returns the sync status. If the sync takes longer than SYNC_TIMEOUT_MS,
 * we proceed with potentially stale data.
 */
async function ensureCalendarFresh(
  admin: ReturnType<typeof createAdminClient>,
  userId: string
): Promise<CalendarSyncStatus> {
  try {
    const { data: conn } = await admin
      .from('microsoft_connections')
      .select('id, last_calendar_sync_at, calendar_sync_enabled')
      .eq('user_id', userId)
      .eq('is_active', true)
      .single()

    if (!conn) {
      return { enabled: false, lastSyncAt: null, stale: false }
    }

    if (!conn.calendar_sync_enabled) {
      return {
        enabled: false,
        lastSyncAt: conn.last_calendar_sync_at ?? null,
        stale: false,
      }
    }

    const lastSync = conn.last_calendar_sync_at
      ? new Date(conn.last_calendar_sync_at).getTime()
      : 0
    const staleCutoff = Date.now() - SYNC_FRESHNESS_MINUTES * 60 * 1000

    if (lastSync >= staleCutoff) {
      // Data is fresh
      return {
        enabled: true,
        lastSyncAt: conn.last_calendar_sync_at ?? null,
        stale: false,
      }
    }

    // Data is stale — await sync with timeout so this response uses fresh data
    try {
      const { syncCalendarPull } = await import('@/lib/services/microsoft-sync')
      const syncPromise = syncCalendarPull(conn.id, admin)
      const timeoutPromise = new Promise<null>((resolve) =>
        setTimeout(() => resolve(null), SYNC_TIMEOUT_MS)
      )

      const result = await Promise.race([syncPromise, timeoutPromise])

      if (result) {
        // Sync completed within timeout
        return {
          enabled: true,
          lastSyncAt: new Date().toISOString(),
          stale: false,
        }
      }

      // Sync timed out — data may still be stale but we proceed anyway
      console.warn('[booking/slots] Calendar sync timed out, using potentially stale data')
      return {
        enabled: true,
        lastSyncAt: conn.last_calendar_sync_at ?? null,
        stale: true,
      }
    } catch (err) {
      console.warn('[booking/slots] Calendar sync failed:', err instanceof Error ? err.message : err)
      return {
        enabled: true,
        lastSyncAt: conn.last_calendar_sync_at ?? null,
        stale: true,
      }
    }
  } catch {
    // No Microsoft connection — graceful fallback
    return { enabled: false, lastSyncAt: null, stale: false }
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function timeToMinutes(time: string): number {
  const parts = time.split(':')
  return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10)
}

function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`
}

/**
 * Convert an ISO timestamp to minutes-since-midnight in a specific timezone.
 * Used to convert Outlook event times (stored as UTC ISO strings) to the
 * booking page's local timezone for slot conflict checking.
 */
function isoToMinutesInTimezone(isoString: string, timezone: string): number {
  const date = new Date(isoString)
  const localStr = date.toLocaleString('en-US', {
    timeZone: timezone,
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
  })
  // localStr format: "HH:MM"
  const [h, m] = localStr.split(':').map(Number)
  return h * 60 + m
}

/**
 * Convert an ISO timestamp to a 'YYYY-MM-DD' string in the given timezone.
 */
function toLocalDateStr(isoString: string, timezone: string): string {
  const d = new Date(isoString)
  return d.toLocaleDateString('en-CA', { timeZone: timezone })
  // en-CA locale returns 'YYYY-MM-DD' format
}

/**
 * Get current minutes-since-midnight in a timezone.
 */
function nowInTimezone(timezone: string): number {
  const now = new Date()
  const localStr = now.toLocaleString('en-US', {
    timeZone: timezone,
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
  })
  const [h, m] = localStr.split(':').map(Number)
  return h * 60 + m
}

/**
 * Get today's date as 'YYYY-MM-DD' in a timezone.
 */
function dateInTimezone(timezone: string): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: timezone })
}

/**
 * Shift a date string by ±N days. Returns 'YYYY-MM-DD'.
 */
function shiftDate(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T12:00:00Z') // Use noon to avoid DST edge cases
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().split('T')[0]
}

export const GET = withTiming(handleGet, 'GET /api/booking/[slug]')
