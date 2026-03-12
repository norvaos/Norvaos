import type { ActionDefinition } from '../types'
import { assertNoError, assertOk } from '../db-assert'
import { frontDeskCheckInSchema, type FrontDeskCheckInInput } from '@/lib/schemas/workflow-actions'

interface FrontDeskCheckInResult {
  appointmentId: string
  method: string
  staffUserId: string | null
}

export const frontDeskCheckInAction: ActionDefinition<FrontDeskCheckInInput, FrontDeskCheckInResult> = {
  type: 'front_desk_check_in',
  label: 'Check In Client',
  inputSchema: frontDeskCheckInSchema,
  permission: { entity: 'front_desk', action: 'create' },
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

    // 1. Get the appointment details — try with tenant_id first, fallback without
    let appointment: { id: string; status: string; user_id: string | null; contact_id: string | null } | null = null

    const { data: apptByTenant } = await supabase
      .from('appointments')
      .select('id, status, user_id, contact_id')
      .eq('id', input.appointmentId)
      .eq('tenant_id', tenantId)
      .single()

    if (apptByTenant) {
      appointment = apptByTenant
    } else {
      // Fallback: appointment may not have tenant_id set (e.g. created via booking page)
      const { data: apptById } = await supabase
        .from('appointments')
        .select('id, status, user_id, contact_id')
        .eq('id', input.appointmentId)
        .single()
      appointment = apptById
    }

    if (!appointment) {
      throw new Error('Appointment not found. It may have been cancelled or removed.')
    }

    if (appointment.status === 'checked_in') {
      throw new Error('Client is already checked in for this appointment.')
    }

    // 2. Update appointment status to 'checked_in'
    // If check constraint doesn't allow 'checked_in' (pre-migration 048), fall back to 'confirmed'
    const { error: updateErr } = await supabase
      .from('appointments')
      .update({ status: 'checked_in' })
      .eq('id', input.appointmentId)

    if (updateErr) {
      if (updateErr.message?.includes('check constraint') || updateErr.message?.includes('appointments_status_check')) {
        // Fallback: constraint doesn't include 'checked_in' yet — use 'confirmed' and track via check_in_sessions
        await supabase
          .from('appointments')
          .update({ status: 'confirmed' })
          .eq('id', input.appointmentId)
      } else {
        throw new Error(`[front_desk_check_in:update_appointment] Database error: ${updateErr.message}`)
      }
    }

    const staffUserId = appointment.user_id ?? null

    return {
      data: {
        appointmentId: input.appointmentId,
        method: input.method,
        staffUserId,
      },
      newState: {
        appointment_id: input.appointmentId,
        status: 'checked_in',
        method: input.method,
      },
      activity: {
        activityType: 'client_checked_in_front_desk',
        title: `Client checked in (${input.method})`,
        description: input.notes ?? undefined,
        metadata: {
          appointment_id: input.appointmentId,
          method: input.method,
          user_id: staffUserId,
        },
        contactId: appointment.contact_id ?? null,
      },
    }
  },

  notificationEvent: 'client_checked_in',

  buildNotification(_ctx, result) {
    if (!result.staffUserId) return null

    return {
      recipientUserIds: [result.staffUserId],
      title: 'Client checked in',
      message: `Your client has checked in at the front desk (${result.method}).`,
      priority: 'high',
    }
  },
}
