import type { ActionDefinition } from '../types'
import { assertNoError } from '../db-assert'
import { verifyIdentitySchema, type VerifyIdentityInput } from '@/lib/schemas/workflow-actions'

interface VerifyIdentityResult {
  sessionId: string
  verified: boolean
  contactId: string | null
}

/**
 * Verify a returning client's identity via date of birth.
 * Rule #8: Identity verification required before revealing matter/appointment details.
 */
export const verifyIdentityAction: ActionDefinition<VerifyIdentityInput, VerifyIdentityResult> = {
  type: 'verify_identity',
  label: 'Verify Client Identity',
  inputSchema: verifyIdentitySchema,
  permission: null, // Kiosk token auth
  allowedSources: ['kiosk'],
  entityType: 'check_in',
  getEntityId: (input) => input.sessionId,

  async execute({ input, tenantId, supabase }) {
    // 1. Fetch the session
    const { data: session, error: sessionErr } = await supabase
      .from('check_in_sessions')
      .select('id, booking_appointment_id, contact_id, status')
      .eq('id', input.sessionId)
      .eq('tenant_id', tenantId)
      .single()

    if (sessionErr || !session) {
      throw new Error('Check-in session not found')
    }

    if (session.status !== 'started') {
      throw new Error('Session is not in the correct state for identity verification')
    }

    // 2. Find the contact linked to the appointment
    let contactId: string | null = session.contact_id

    if (!contactId && session.booking_appointment_id) {
      const { data: appt } = await supabase
        .from('booking_appointments')
        .select('contact_id')
        .eq('id', session.booking_appointment_id)
        .single()
      contactId = appt?.contact_id ?? null
    }

    // 3. Verify DOB against contact record
    let verified = false
    if (contactId) {
      const { data: contact } = await supabase
        .from('contacts')
        .select('date_of_birth')
        .eq('id', contactId)
        .eq('tenant_id', tenantId)
        .single()

      if (contact?.date_of_birth) {
        verified = contact.date_of_birth === input.dateOfBirth
      }
    }

    // 4. Update session status
    if (verified) {
      assertNoError(
        await supabase
          .from('check_in_sessions')
          .update({
            status: 'identity_verified',
            dob_verified: true,
            contact_id: contactId,
            current_step: 'id_scan',
          })
          .eq('id', input.sessionId),
        'verify_identity:update_session'
      )
    }

    return {
      data: {
        sessionId: input.sessionId,
        verified,
        contactId: verified ? contactId : null,
      },
      newState: {
        status: verified ? 'identity_verified' : 'started',
        dob_verified: verified,
        contact_id: contactId,
      },
      activity: {
        activityType: verified ? 'identity_verified' : 'identity_verification_failed',
        title: verified ? 'Client identity verified' : 'Identity verification failed',
        description: verified
          ? 'Client verified via date of birth at kiosk'
          : 'Client DOB did not match records',
        metadata: {
          session_id: input.sessionId,
          verified,
          contact_id: contactId,
        },
      },
    }
  },
}
