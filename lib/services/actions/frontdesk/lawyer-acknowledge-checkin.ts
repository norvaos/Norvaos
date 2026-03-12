import type { ActionDefinition } from '../types'
import { assertNoError } from '../db-assert'
import { lawyerAcknowledgeCheckInSchema, type LawyerAcknowledgeCheckInInput } from '@/lib/schemas/workflow-actions'

interface LawyerAcknowledgeResult {
  appointmentId: string
}

/**
 * Lawyer acknowledges a client check-in.
 * Updates appointment status from 'checked_in' → 'in_meeting'.
 * This removes the check-in from the front desk queue.
 */
export const lawyerAcknowledgeCheckInAction: ActionDefinition<LawyerAcknowledgeCheckInInput, LawyerAcknowledgeResult> = {
  type: 'lawyer_acknowledge_checkin',
  label: 'Acknowledge Check-In',
  inputSchema: lawyerAcknowledgeCheckInSchema,
  permission: { entity: 'appointments', action: 'edit' },
  allowedSources: ['dashboard', 'front_desk'],
  entityType: 'appointment',
  getEntityId: (input) => input.appointmentId,

  async snapshotBefore({ input, supabase }) {
    const { data } = await supabase
      .from('appointments')
      .select('status')
      .eq('id', input.appointmentId)
      .single()
    return data as Record<string, unknown> | null
  },

  async execute({ input, userId, supabase }) {
    if (!userId) throw new Error('User authentication required')

    // 1. Get the appointment
    const { data: appointment } = await supabase
      .from('appointments')
      .select('id, status, user_id, contact_id')
      .eq('id', input.appointmentId)
      .single()

    if (!appointment) {
      throw new Error('Appointment not found')
    }

    if (appointment.status !== 'checked_in') {
      throw new Error('Client has not checked in yet')
    }

    // 2. Update to in_meeting
    // If check constraint doesn't allow 'in_meeting' (pre-migration 048), fall back to 'completed'
    const { error: updateErr } = await supabase
      .from('appointments')
      .update({ status: 'in_meeting' })
      .eq('id', input.appointmentId)

    if (updateErr) {
      if (updateErr.message?.includes('check constraint') || updateErr.message?.includes('appointments_status_check')) {
        await supabase
          .from('appointments')
          .update({ status: 'completed' })
          .eq('id', input.appointmentId)
      } else {
        throw new Error(`[lawyer_acknowledge_checkin:update_appointment] Database error: ${updateErr.message}`)
      }
    }

    return {
      data: {
        appointmentId: input.appointmentId,
      },
      newState: {
        appointment_id: input.appointmentId,
        status: 'in_meeting',
      },
      activity: {
        activityType: 'lawyer_acknowledged_checkin',
        title: 'Lawyer acknowledged client check-in',
        description: 'Client is now in meeting with assigned lawyer.',
        metadata: {
          appointment_id: input.appointmentId,
          user_id: appointment.user_id,
        },
        contactId: appointment.contact_id,
      },
    }
  },
}
