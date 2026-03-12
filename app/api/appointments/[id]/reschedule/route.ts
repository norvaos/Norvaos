import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendBookingConfirmationEmail } from '@/lib/services/booking-email-service'
import { withTiming } from '@/lib/middleware/request-timing'

/**
 * POST /api/appointments/[id]/reschedule
 *
 * Reschedule a confirmed appointment to a new date/time.
 * Body: { date, time }
 */
async function handlePost(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: appointmentId } = await params
    const auth = await authenticateRequest()
    requirePermission(auth, 'front_desk', 'edit')

    const tenantId = auth.tenantId

    const body = await request.json()
    const { date, time } = body as { date: string; time: string }

    if (!date || !time) {
      return NextResponse.json({ error: 'date and time are required' }, { status: 400 })
    }

    const admin = createAdminClient()

    // Fetch appointment with booking page details
    const { data: appointment } = await admin
      .from('appointments')
      .select('id, status, contact_id, guest_name, booking_page_id, duration_minutes')
      .eq('id', appointmentId)
      .eq('tenant_id', tenantId)
      .single()

    if (!appointment) {
      return NextResponse.json({ error: 'Appointment not found' }, { status: 404 })
    }

    if (appointment.status !== 'confirmed') {
      return NextResponse.json({ error: 'Only confirmed appointments can be rescheduled' }, { status: 400 })
    }

    // Check slot availability (prevent double-booking, exclude current appointment)
    const endTime = addMinutesToTime(time, appointment.duration_minutes)
    const { data: conflicting } = await admin
      .from('appointments')
      .select('id')
      .eq('booking_page_id', appointment.booking_page_id)
      .eq('appointment_date', date)
      .eq('status', 'confirmed')
      .neq('id', appointmentId)
      .lt('start_time', endTime)
      .gt('end_time', time)
      .limit(1)

    if (conflicting && conflicting.length > 0) {
      return NextResponse.json(
        { error: 'This time slot is no longer available.' },
        { status: 409 }
      )
    }

    // Update appointment
    const { error: updateError } = await admin
      .from('appointments')
      .update({
        appointment_date: date,
        start_time: time,
        end_time: endTime,
        updated_at: new Date().toISOString(),
      })
      .eq('id', appointmentId)

    if (updateError) {
      console.error('Reschedule update error:', updateError)
      return NextResponse.json({ error: 'Failed to reschedule appointment' }, { status: 500 })
    }

    // Log activity (fire-and-forget)
    if (appointment.contact_id) {
      admin.from('activities').insert({
        tenant_id: tenantId,
        user_id: auth.userId,
        activity_type: 'booking_rescheduled',
        title: `Rescheduled booking: ${appointment.guest_name}`,
        entity_type: 'contact',
        entity_id: appointment.contact_id,
        metadata: {
          appointment_id: appointmentId,
          new_date: date,
          new_time: time,
        },
      }).then(() => {})
    }

    // Send updated confirmation email (fire-and-forget)
    sendBookingConfirmationEmail({ supabase: admin, tenantId, appointmentId })

    return NextResponse.json({ success: true })
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('Reschedule appointment error:', err)
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

export const POST = withTiming(handlePost, 'POST /api/appointments/[id]/reschedule')
