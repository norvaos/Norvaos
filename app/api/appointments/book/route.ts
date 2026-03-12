import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendBookingConfirmationEmail } from '@/lib/services/booking-email-service'
import { withTiming } from '@/lib/middleware/request-timing'
import { z } from 'zod'

const bookAppointmentSchema = z.object({
  bookingPageId: z.string().uuid('bookingPageId must be a valid UUID'),
  contactId: z.string().uuid('contactId must be a valid UUID'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be in YYYY-MM-DD format'),
  time: z.string().regex(/^\d{2}:\d{2}$/, 'time must be in HH:mm format'),
  notes: z.string().max(2000).optional(),
})

/**
 * POST /api/appointments/book
 *
 * Authenticated CRM-initiated booking. Creates an appointment for a contact
 * using an existing booking page's slot availability.
 *
 * Body: { bookingPageId, contactId, date, time, notes? }
 */
async function handlePost(request: Request) {
  try {
    const auth = await authenticateRequest()
    requirePermission(auth, 'front_desk', 'create')

    const tenantId = auth.tenantId

    const body = await request.json()
    const parsed = bookAppointmentSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
        { status: 400 }
      )
    }

    const { bookingPageId, contactId, date, time, notes } = parsed.data

    const admin = createAdminClient()

    // 1. Fetch booking page config
    const { data: page, error: pageError } = await admin
      .from('booking_pages')
      .select('*')
      .eq('id', bookingPageId)
      .eq('tenant_id', tenantId)
      .single()

    if (pageError || !page) {
      return NextResponse.json({ error: 'Booking page not found' }, { status: 404 })
    }

    // 2. Fetch contact info
    const { data: contact } = await admin
      .from('contacts')
      .select('id, first_name, last_name, email_primary, phone_primary')
      .eq('id', contactId)
      .eq('tenant_id', tenantId)
      .single()

    if (!contact) {
      return NextResponse.json({ error: 'Contact not found' }, { status: 404 })
    }

    // 3. Check slot availability (prevent double-booking)
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
      return NextResponse.json(
        { error: 'This time slot is no longer available.' },
        { status: 409 }
      )
    }

    // 3b. Timezone-safe calendar event conflict check (Outlook/Office 365 sync)
    const tz = page.timezone || 'UTC'
    const prevDate = shiftDate(date, -1)
    const nextDate = shiftDate(date, +1)

    const { data: nearbyCalendarEvents } = await admin
      .from('calendar_events')
      .select('start_at, end_at, show_as')
      .eq('created_by', page.user_id)
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .neq('status', 'cancelled')
      .neq('show_as', 'free')
      .gte('start_at', prevDate + 'T00:00:00')
      .lte('start_at', nextDate + 'T23:59:59')

    const slotStartMin = timeToMinutes(time)
    const slotEndMin = timeToMinutes(endTime)

    const hasCalendarConflict = (nearbyCalendarEvents ?? []).some((e) => {
      const eventStartDate = toLocalDateStr(e.start_at, tz)
      const eventEndDate = toLocalDateStr(e.end_at, tz)

      if (eventStartDate > date && eventEndDate > date) return false
      if (eventEndDate < date) return false

      const eventStartMin = eventStartDate === date
        ? isoToMinutesInTimezone(e.start_at, tz)
        : 0
      const eventEndMin = eventEndDate === date
        ? isoToMinutesInTimezone(e.end_at, tz)
        : 24 * 60

      return slotStartMin < eventEndMin && slotEndMin > eventStartMin
    })

    if (hasCalendarConflict) {
      return NextResponse.json(
        { error: 'This time slot is no longer available.' },
        { status: 409 }
      )
    }

    // 4. Create appointment
    const guestName = [contact.first_name, contact.last_name].filter(Boolean).join(' ') || 'Client'
    const { data: appointment, error: appointmentError } = await admin
      .from('appointments')
      .insert({
        tenant_id: tenantId,
        booking_page_id: page.id,
        user_id: page.user_id,
        contact_id: contactId,
        appointment_date: date,
        start_time: time,
        end_time: endTime,
        duration_minutes: page.duration_minutes,
        guest_name: guestName,
        guest_email: contact.email_primary ?? '',
        guest_phone: contact.phone_primary ?? null,
        guest_notes: notes ?? null,
        answers: {},
        status: 'confirmed',
      })
      .select('id')
      .single()

    if (appointmentError) {
      console.error('Appointment creation error:', appointmentError)
      return NextResponse.json({ error: 'Failed to create appointment' }, { status: 500 })
    }

    // 5. Log activity (fire-and-forget)
    admin.from('activities').insert({
      tenant_id: tenantId,
      user_id: page.user_id,
      activity_type: 'booking_created',
      title: `Booking: ${guestName} — ${page.title}`,
      entity_type: 'contact',
      entity_id: contactId,
      metadata: {
        appointment_id: appointment.id,
        booking_page: page.title,
        date,
        time,
        guest_name: guestName,
        source: 'crm',
      },
    }).then(() => {})

    // 6. Send confirmation email (fire-and-forget)
    sendBookingConfirmationEmail({ supabase: admin, tenantId, appointmentId: appointment.id })

    return NextResponse.json(
      { success: true, appointment_id: appointment.id },
      { status: 201 }
    )
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('Internal booking error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

function addMinutesToTime(time: string, minutes: number): string {
  const parts = time.split(':')
  const totalMinutes = parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10) + minutes
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`
}

function timeToMinutes(time: string): number {
  const parts = time.split(':')
  return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10)
}

function isoToMinutesInTimezone(isoString: string, timezone: string): number {
  const d = new Date(isoString)
  const localStr = d.toLocaleString('en-US', {
    timeZone: timezone,
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
  })
  const [h, m] = localStr.split(':').map(Number)
  return h * 60 + m
}

function toLocalDateStr(isoString: string, timezone: string): string {
  return new Date(isoString).toLocaleDateString('en-CA', { timeZone: timezone })
}

function shiftDate(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().split('T')[0]
}

export const POST = withTiming(handlePost, 'POST /api/appointments/book')
