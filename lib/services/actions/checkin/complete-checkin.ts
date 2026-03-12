import type { ActionDefinition } from '../types'
import { assertNoError } from '../db-assert'
import { completeCheckInSchema, type CompleteCheckInInput } from '@/lib/schemas/workflow-actions'

interface CompleteCheckInResult {
  sessionId: string
  completed: boolean
  bookingAppointmentId: string | null
}

/**
 * Complete a kiosk check-in session.
 * Rule #9: data_safety_acknowledged must be true.
 * Rule #16: Creates durable activity + notification (not just realtime).
 */
export const completeCheckInAction: ActionDefinition<CompleteCheckInInput, CompleteCheckInResult> = {
  type: 'complete_check_in',
  label: 'Complete Kiosk Check-In',
  inputSchema: completeCheckInSchema,
  permission: null, // Kiosk token auth
  allowedSources: ['kiosk'],
  entityType: 'check_in',
  getEntityId: (input) => input.sessionId,

  async execute({ input, tenantId, supabase }) {
    // 1. Fetch session
    const { data: session, error: sessionErr } = await supabase
      .from('check_in_sessions')
      .select('id, booking_appointment_id, contact_id, matter_id, status')
      .eq('id', input.sessionId)
      .eq('tenant_id', tenantId)
      .single()

    if (sessionErr || !session) {
      throw new Error('Check-in session not found')
    }

    if (session.status === 'completed') {
      throw new Error('Session already completed')
    }

    // 2. Update session to completed
    assertNoError(
      await supabase
        .from('check_in_sessions')
        .update({
          status: 'completed',
          current_step: 'confirmation',
          data_safety_acknowledged: true,
          completed_at: new Date().toISOString(),
        })
        .eq('id', input.sessionId),
      'complete_check_in:update_session'
    )

    // 3. Update booking appointment status if linked
    if (session.booking_appointment_id) {
      assertNoError(
        await supabase
          .from('appointments')
          .update({
            status: 'checked_in',
          })
          .eq('id', session.booking_appointment_id),
        'complete_check_in:update_appointment'
      )
    }

    // 4. Notification dispatch
    // Phase 7 Fix 5b: Notification is NOT inserted here inside execute() because
    // this runs OUTSIDE the atomic transaction. If the triple-write (Step 7) fails,
    // the notification would persist but the audit trail wouldn't — creating an
    // orphaned notification. Instead, the kiosk complete route handles notification
    // dispatch as a non-blocking post-commit step. The durable activity record
    // (written atomically in Step 7) serves as the authoritative record.

    return {
      data: {
        sessionId: input.sessionId,
        completed: true,
        bookingAppointmentId: session.booking_appointment_id,
      },
      newState: {
        status: 'completed',
        completed_at: new Date().toISOString(),
        data_safety_acknowledged: true,
      },
      activity: {
        // Rule #16: Durable activity record (not just realtime)
        activityType: 'kiosk_check_in_completed',
        title: 'Client checked in via kiosk',
        description: 'Client completed self-service check-in at lobby kiosk',
        metadata: {
          session_id: input.sessionId,
          booking_appointment_id: session.booking_appointment_id,
          contact_id: session.contact_id,
        },
        matterId: session.matter_id,
        contactId: session.contact_id,
      },
    }
  },

  notificationEvent: 'client_checked_in',
  buildNotification: () => {
    // Notification dispatch is handled by the kiosk complete route as a
    // non-blocking post-commit step (Phase 7 Fix 5b).
    return null
  },
}
