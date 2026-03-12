import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendBookingNoShowEmail } from '@/lib/services/booking-email-service'
import { processAppointmentAutomationTrigger } from '@/lib/services/appointment-automation'
import { withTiming } from '@/lib/middleware/request-timing'

/**
 * POST /api/appointments/[id]/no-show
 *
 * Mark a confirmed appointment as no-show and send notification email.
 */
async function handlePost(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: appointmentId } = await params
    const auth = await authenticateRequest()
    requirePermission(auth, 'front_desk', 'edit')

    const tenantId = auth.tenantId
    const admin = createAdminClient()

    // Verify appointment exists and belongs to tenant
    const { data: appointment } = await admin
      .from('appointments')
      .select('id, status, contact_id, lead_id, guest_name')
      .eq('id', appointmentId)
      .eq('tenant_id', tenantId)
      .single()

    if (!appointment) {
      return NextResponse.json({ error: 'Appointment not found' }, { status: 404 })
    }

    if (appointment.status === 'no_show') {
      return NextResponse.json({ error: 'Appointment is already marked as no-show' }, { status: 400 })
    }

    // Update status
    const { error: updateError } = await admin
      .from('appointments')
      .update({ status: 'no_show', updated_at: new Date().toISOString() })
      .eq('id', appointmentId)

    if (updateError) {
      console.error('No-show update error:', updateError)
      return NextResponse.json({ error: 'Failed to update appointment' }, { status: 500 })
    }

    // Log activity (fire-and-forget)
    if (appointment.contact_id) {
      admin.from('activities').insert({
        tenant_id: tenantId,
        user_id: auth.userId,
        activity_type: 'booking_no_show',
        title: `No-show: ${appointment.guest_name}`,
        entity_type: 'contact',
        entity_id: appointment.contact_id,
        metadata: { appointment_id: appointmentId },
      }).then(() => {})
    }

    // Send no-show email (fire-and-forget)
    sendBookingNoShowEmail({ supabase: admin, tenantId, appointmentId })

    // Fire no-show automation (fire-and-forget)
    processAppointmentAutomationTrigger({
      supabase: admin,
      tenantId,
      appointmentId,
      contactId: appointment.contact_id,
      leadId: appointment.lead_id,
      triggerType: 'appointment_no_show',
      userId: auth.userId,
    }).catch(console.error)

    return NextResponse.json({ success: true })
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('No-show appointment error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export const POST = withTiming(handlePost, 'POST /api/appointments/[id]/no-show')
