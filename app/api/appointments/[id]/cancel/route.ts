import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendBookingCancellationEmail } from '@/lib/services/booking-email-service'
import { withTiming } from '@/lib/middleware/request-timing'

/**
 * POST /api/appointments/[id]/cancel
 *
 * Cancel a confirmed appointment and send cancellation email.
 * Body: { reason? }
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
    const { reason } = body as { reason?: string }

    const admin = createAdminClient()

    // Verify appointment exists and belongs to tenant
    const { data: appointment } = await admin
      .from('appointments')
      .select('id, status, contact_id, guest_name, booking_page_id')
      .eq('id', appointmentId)
      .eq('tenant_id', tenantId)
      .single()

    if (!appointment) {
      return NextResponse.json({ error: 'Appointment not found' }, { status: 404 })
    }

    if (appointment.status === 'cancelled') {
      return NextResponse.json({ error: 'Appointment is already cancelled' }, { status: 400 })
    }

    // Update status
    const { error: updateError } = await admin
      .from('appointments')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', appointmentId)

    if (updateError) {
      console.error('Cancel update error:', updateError)
      return NextResponse.json({ error: 'Failed to cancel appointment' }, { status: 500 })
    }

    // Log activity (fire-and-forget)
    if (appointment.contact_id) {
      admin.from('activities').insert({
        tenant_id: tenantId,
        user_id: auth.userId,
        activity_type: 'booking_cancelled',
        title: `Cancelled booking: ${appointment.guest_name}`,
        entity_type: 'contact',
        entity_id: appointment.contact_id,
        metadata: {
          appointment_id: appointmentId,
          reason: reason ?? null,
        },
      }).then(() => {})
    }

    // Send cancellation email (fire-and-forget)
    sendBookingCancellationEmail({
      supabase: admin,
      tenantId,
      appointmentId,
      cancellationReason: reason,
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('Cancel appointment error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export const POST = withTiming(handlePost, 'POST /api/appointments/[id]/cancel')
