import type { ActionDefinition } from '../types'
import { assertNoError } from '../db-assert'
import { frontDeskCancelNoShowSchema, type FrontDeskCancelNoShowInput } from '@/lib/schemas/workflow-actions'

interface FrontDeskCancelNoShowResult {
  appointmentId: string
  action: string
  reason: string
}

export const frontDeskCancelNoShowAction: ActionDefinition<FrontDeskCancelNoShowInput, FrontDeskCancelNoShowResult> = {
  type: 'front_desk_cancel_no_show',
  label: 'Cancel / No Show',
  inputSchema: frontDeskCancelNoShowSchema,
  permission: { entity: 'front_desk', action: 'edit' },
  allowedSources: ['front_desk'],
  entityType: 'appointment',
  getEntityId: (input) => input.appointmentId,

  async snapshotBefore({ input, supabase, tenantId }) {
    const { data } = await supabase
      .from('appointments')
      .select('status')
      .eq('id', input.appointmentId)
      .eq('tenant_id', tenantId)
      .single()
    return data as Record<string, unknown> | null
  },

  async execute({ input, tenantId, userId, supabase }) {
    if (!userId) throw new Error('User authentication required')

    // 1. Verify appointment exists
    const { data: appointment, error: apptErr } = await supabase
      .from('appointments')
      .select('id, appointment_date, start_time, contact_id, user_id, status')
      .eq('id', input.appointmentId)
      .eq('tenant_id', tenantId)
      .single()

    if (apptErr || !appointment) {
      throw new Error('Appointment not found')
    }

    // 2. Determine the new status based on input.action
    const newStatus = input.action === 'cancel' ? 'cancelled' : 'no_show'

    // 3. Update appointment status
    assertNoError(
      await supabase
        .from('appointments')
        .update({
          status: newStatus,
          cancellation_reason: input.reason,
          cancelled_at: new Date().toISOString(),
        })
        .eq('id', input.appointmentId)
        .eq('tenant_id', tenantId),
      'front_desk_cancel_no_show:update_appointment'
    )

    // 4. Determine activity type based on action
    const activityType = input.action === 'cancel'
      ? 'appointment_cancelled'
      : 'appointment_no_show'

    const actionLabel = input.action === 'cancel' ? 'Cancelled' : 'No-show'

    return {
      data: {
        appointmentId: input.appointmentId,
        action: input.action,
        reason: input.reason,
      },
      newState: {
        status: newStatus,
        cancellation_reason: input.reason,
        cancelled_at: new Date().toISOString(),
        cancelled_by: userId,
      },
      activity: {
        activityType,
        title: `${actionLabel} — ${input.reason}`,
        description: `Appointment on ${appointment.appointment_date} at ${appointment.start_time} marked as ${actionLabel.toLowerCase()}`,
        metadata: {
          appointment_id: input.appointmentId,
          action: input.action,
          reason: input.reason,
          previous_status: appointment.status,
          appointment_date: appointment.appointment_date,
          start_time: appointment.start_time,
          contact_id: appointment.contact_id,
          user_id: appointment.user_id,
        },
        contactId: appointment.contact_id,
      },
    }
  },
}
