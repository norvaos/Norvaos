import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import { createAdminClient } from '@/lib/supabase/admin'
import { processAppointmentAutomationTrigger } from '@/lib/services/appointment-automation'
import { withTiming } from '@/lib/middleware/request-timing'

/**
 * POST /api/appointments/[id]/complete
 *
 * Complete an in-meeting appointment. Triggers completion automations.
 * Body: { notes? }
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
    const body = await request.json().catch(() => ({}))
    const { notes } = body as { notes?: string }

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

    if (appointment.status !== 'in_meeting' && appointment.status !== 'checked_in') {
      return NextResponse.json({ error: 'Appointment is not in an active state' }, { status: 400 })
    }

    // Update status
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updateData: Record<string, any> = {
      status: 'completed',
      completed_at: new Date().toISOString(),
    }
    if (notes) {
      updateData.guest_notes = notes
    }

    const { error: updateError } = await admin
      .from('appointments')
      .update(updateData)
      .eq('id', appointmentId)

    if (updateError) {
      console.error('Complete appointment error:', updateError)
      return NextResponse.json({ error: 'Failed to complete appointment' }, { status: 500 })
    }

    // Log activity (fire-and-forget)
    if (appointment.contact_id) {
      admin.from('activities').insert({
        tenant_id: tenantId,
        user_id: auth.userId,
        activity_type: 'appointment_completed',
        title: `Appointment completed: ${appointment.guest_name}`,
        entity_type: 'contact',
        entity_id: appointment.contact_id,
        metadata: {
          appointment_id: appointmentId,
          notes: notes ?? null,
        },
      }).then(() => {})
    }

    // Fire automation (fire-and-forget)
    processAppointmentAutomationTrigger({
      supabase: admin,
      tenantId,
      appointmentId,
      contactId: appointment.contact_id,
      leadId: appointment.lead_id,
      triggerType: 'appointment_completed',
      userId: auth.userId,
    }).catch(console.error)

    return NextResponse.json({ success: true })
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('Complete appointment error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export const POST = withTiming(handlePost, 'POST /api/appointments/[id]/complete')
