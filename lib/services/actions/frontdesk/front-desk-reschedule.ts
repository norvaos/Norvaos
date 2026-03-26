import type { ActionDefinition } from '../types'
import { assertNoError } from '../db-assert'
import { frontDeskRescheduleSchema, type FrontDeskRescheduleInput } from '@/lib/schemas/workflow-actions'

interface FrontDeskRescheduleResult {
  appointmentId: string
  oldDate: string
  newDate: string
}

export const frontDeskRescheduleAction: ActionDefinition<FrontDeskRescheduleInput, FrontDeskRescheduleResult> = {
  type: 'front_desk_reschedule',
  label: 'Reschedule Appointment',
  inputSchema: frontDeskRescheduleSchema,
  permission: { entity: 'front_desk', action: 'edit' },
  allowedSources: ['front_desk'],
  entityType: 'appointment',
  getEntityId: (input) => input.appointmentId,

  async snapshotBefore({ input, supabase }) {
    const { data } = await supabase
      .from('appointments')
      .select('appointment_date, start_time, status')
      .eq('id', input.appointmentId)
      .single()
    return data as Record<string, unknown> | null
  },

  async execute({ input, tenantId, userId, supabase }) {
    if (!userId) throw new Error('User authentication required')

    // 1. Verify appointment exists  -  try with tenant_id first, fallback without
    let appointment: { id: string; appointment_date: string; start_time: string | null; contact_id: string | null; user_id: string | null } | null = null

    const { data: apptByTenant } = await supabase
      .from('appointments')
      .select('id, appointment_date, start_time, contact_id, user_id')
      .eq('id', input.appointmentId)
      .eq('tenant_id', tenantId)
      .single()

    if (apptByTenant) {
      appointment = apptByTenant
    } else {
      const { data: apptById } = await supabase
        .from('appointments')
        .select('id, appointment_date, start_time, contact_id, user_id')
        .eq('id', input.appointmentId)
        .single()
      appointment = apptById
    }

    if (!appointment) {
      throw new Error('Appointment not found. It may have been cancelled or removed.')
    }

    const oldDate = appointment.appointment_date
    const oldTime = appointment.start_time

    // 2. Update the appointment with new date and time
    assertNoError(
      await supabase
        .from('appointments')
        .update({
          appointment_date: input.newDate,
          start_time: input.newStartTime,
          status: 'confirmed',
        })
        .eq('id', input.appointmentId),
      'front_desk_reschedule:update_appointment'
    )

    return {
      data: {
        appointmentId: input.appointmentId,
        oldDate,
        newDate: input.newDate,
      },
      newState: {
        appointment_date: input.newDate,
        start_time: input.newStartTime,
        status: 'scheduled',
      },
      activity: {
        activityType: 'appointment_rescheduled',
        title: `Appointment rescheduled  -  ${input.reason}`,
        description: `Moved from ${oldDate} ${oldTime} to ${input.newDate} ${input.newStartTime}`,
        metadata: {
          appointment_id: input.appointmentId,
          old_date: oldDate,
          old_time: oldTime,
          new_date: input.newDate,
          new_time: input.newStartTime,
          reason: input.reason,
          contact_id: appointment.contact_id,
          user_id: appointment.user_id,
        },
        contactId: appointment.contact_id,
      },
    }
  },
}
