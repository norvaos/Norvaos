import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * GET /api/booking/[slug]?date=YYYY-MM-DD
 *
 * Public endpoint — returns booking page config + available time slots
 * for the requested date. If no date is provided, returns just the config.
 */
export async function GET(
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
      return NextResponse.json({
        success: true,
        bookingPage: page,
        slots: null,
      })
    }

    // 2. Compute available slots for the requested date
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
        })
      }

      // Use override hours
      const overrideStart = override.start_time || workingHours.start
      const overrideEnd = override.end_time || workingHours.end
      const slots = await computeSlots(
        admin,
        page.id,
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
      })
    }

    // Use override hours or default working hours
    const startTime = override?.start_time || workingHours.start
    const endTime = override?.end_time || workingHours.end

    const slots = await computeSlots(
      admin,
      page.id,
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function computeSlots(
  admin: ReturnType<typeof createAdminClient>,
  bookingPageId: string,
  date: string,
  startTime: string,
  endTime: string,
  durationMinutes: number,
  bufferMinutes: number,
  minNoticeHours: number,
  _timezone: string
): Promise<TimeSlot[]> {
  // Get existing appointments for this date
  const { data: existingAppointments } = await admin
    .from('appointments')
    .select('start_time, end_time')
    .eq('booking_page_id', bookingPageId)
    .eq('appointment_date', date)
    .eq('status', 'confirmed')

  const booked = (existingAppointments ?? []).map((a) => ({
    start: timeToMinutes(a.start_time),
    end: timeToMinutes(a.end_time),
  }))

  // Compute minimum allowed start time based on notice hours
  const now = new Date()
  const todayStr = now.toISOString().split('T')[0]
  let minStartMinutes = 0
  if (date === todayStr) {
    const currentMinutes = now.getHours() * 60 + now.getMinutes()
    minStartMinutes = currentMinutes + minNoticeHours * 60
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

    // Check overlap with existing appointments (including buffer)
    const hasConflict = booked.some((b) => {
      const bookingWithBuffer = { start: b.start - bufferMinutes, end: b.end + bufferMinutes }
      return t < bookingWithBuffer.end && slotEnd > bookingWithBuffer.start
    })

    slots.push({
      time: minutesToTime(t),
      available: !hasConflict,
    })
  }

  return slots
}

function timeToMinutes(time: string): number {
  const parts = time.split(':')
  return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10)
}

function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`
}
