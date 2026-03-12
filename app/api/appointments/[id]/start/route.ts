import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import { createAdminClient } from '@/lib/supabase/admin'
import { withTiming } from '@/lib/middleware/request-timing'

/**
 * POST /api/appointments/[id]/start
 *
 * Lawyer starts the meeting. Updates status to 'in_meeting'.
 * Returns leadId/matterId so frontend can navigate to Command Centre.
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

    if (appointment.status !== 'checked_in') {
      return NextResponse.json({ error: 'Client has not checked in yet' }, { status: 400 })
    }

    // Update status
    const { error: updateError } = await admin
      .from('appointments')
      .update({
        status: 'in_meeting',
        started_at: new Date().toISOString(),
      })
      .eq('id', appointmentId)

    if (updateError) {
      console.error('Start meeting error:', updateError)
      return NextResponse.json({ error: 'Failed to start meeting' }, { status: 500 })
    }

    // Log activity (fire-and-forget)
    if (appointment.contact_id) {
      admin.from('activities').insert({
        tenant_id: tenantId,
        user_id: auth.userId,
        activity_type: 'appointment_started',
        title: `Meeting started: ${appointment.guest_name}`,
        entity_type: 'contact',
        entity_id: appointment.contact_id,
        metadata: { appointment_id: appointmentId },
      }).then(() => {})
    }

    // Find the lead or matter for Command Centre navigation
    let leadId: string | null = appointment.lead_id
    let matterId: string | null = null

    // If contact has a lead, find it
    if (!leadId && appointment.contact_id) {
      const { data: lead } = await admin
        .from('leads')
        .select('id')
        .eq('contact_id', appointment.contact_id)
        .eq('tenant_id', tenantId)
        .neq('status', 'lost')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (lead) leadId = lead.id
    }

    // Check if lead has been converted to a matter
    if (leadId) {
      const { data: lead } = await admin
        .from('leads')
        .select('converted_matter_id')
        .eq('id', leadId)
        .single()

      if (lead?.converted_matter_id) {
        matterId = lead.converted_matter_id
      }
    }

    return NextResponse.json({
      success: true,
      leadId,
      matterId,
    })
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('Start meeting error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export const POST = withTiming(handlePost, 'POST /api/appointments/[id]/start')
