import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import { createAdminClient } from '@/lib/supabase/admin'
import { processAppointmentAutomationTrigger } from '@/lib/services/appointment-automation'
import { withTiming } from '@/lib/middleware/request-timing'

/**
 * POST /api/appointments/[id]/check-in
 *
 * Mark a confirmed appointment as checked-in (client has arrived).
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

    const { data: appointment } = await admin
      .from('appointments')
      .select('id, status, contact_id, lead_id, guest_name, user_id')
      .eq('id', appointmentId)
      .eq('tenant_id', tenantId)
      .single()

    if (!appointment) {
      return NextResponse.json({ error: 'Appointment not found' }, { status: 404 })
    }

    if (appointment.status !== 'confirmed') {
      return NextResponse.json({ error: 'Appointment is not in confirmed status' }, { status: 400 })
    }

    // Update status
    const { error: updateError } = await admin
      .from('appointments')
      .update({
        status: 'checked_in',
        checked_in_at: new Date().toISOString(),
      })
      .eq('id', appointmentId)

    if (updateError) {
      console.error('Check-in update error:', updateError)
      return NextResponse.json({ error: 'Failed to check in' }, { status: 500 })
    }

    // Log activity (fire-and-forget)
    if (appointment.contact_id) {
      admin.from('activities').insert({
        tenant_id: tenantId,
        user_id: auth.userId,
        activity_type: 'appointment_checked_in',
        title: `Client checked in: ${appointment.guest_name}`,
        entity_type: 'contact',
        entity_id: appointment.contact_id,
        metadata: { appointment_id: appointmentId },
      }).then(() => {})
    }

    // Fire automation (fire-and-forget)
    processAppointmentAutomationTrigger({
      supabase: admin,
      tenantId,
      appointmentId,
      contactId: appointment.contact_id,
      leadId: appointment.lead_id,
      triggerType: 'appointment_checked_in',
      userId: auth.userId,
    }).catch(console.error)

    return NextResponse.json({ success: true })
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('Check-in error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export const POST = withTiming(handlePost, 'POST /api/appointments/[id]/check-in')
