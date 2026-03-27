/**
 * PII dual-write helpers for NorvaOS.
 *
 * During the dual-write phase, every contact/lead/matter_immigration insert
 * or update that touches PII columns must also write the corresponding
 * `*_encrypted` column. These helpers merge the encrypted fields into the
 * payload so callers can spread the result into their Supabase `.insert()`
 * or `.update()` call.
 *
 * Usage:
 *   const payload = { first_name: 'Jane', last_name: 'Doe', ... }
 *   await supabase.from('contacts').insert({ ...payload, ...withContactPIIEncrypted(payload) })
 */

import {
  encryptContactPII,
  encryptLeadPII,
  encryptMatterImmigrationPII,
  encryptAppointmentPII,
  type ContactPII,
  type ContactPIIEncrypted,
  type LeadPII,
  type LeadPIIEncrypted,
  type MatterImmigrationPII,
  type MatterImmigrationPIIEncrypted,
  type AppointmentPII,
  type AppointmentPIIEncrypted,
} from '@/lib/services/pii-encryption'

/**
 * Extracts contact PII fields from a payload and returns the encrypted
 * counterparts. Spread into your Supabase insert/update alongside the
 * original payload.
 */
export function withContactPIIEncrypted(
  payload: Record<string, unknown>
): ContactPIIEncrypted | Record<string, never> {
  // Skip encryption entirely when key is not configured (dev environment)
  if (!process.env.PII_ENCRYPTION_KEY) return {}

  const pii: ContactPII = {
    first_name: payload.first_name as string | null | undefined,
    last_name: payload.last_name as string | null | undefined,
    date_of_birth: payload.date_of_birth as string | null | undefined,
    address: (payload.address_line1 ?? payload.address) as string | null | undefined,
    passport_number: payload.passport_number as string | null | undefined,
    phone: (payload.phone_primary ?? payload.phone) as string | null | undefined,
    email: (payload.email_primary ?? payload.email) as string | null | undefined,
  }
  return encryptContactPII(pii)
}

/**
 * Extracts lead PII fields from a payload and returns the encrypted
 * counterparts.
 */
export function withLeadPIIEncrypted(
  payload: Record<string, unknown>
): LeadPIIEncrypted | Record<string, never> {
  if (!process.env.PII_ENCRYPTION_KEY) return {}
  const pii: LeadPII = {
    first_name: payload.first_name as string | null | undefined,
    last_name: payload.last_name as string | null | undefined,
    email: payload.email as string | null | undefined,
    phone: payload.phone as string | null | undefined,
  }
  return encryptLeadPII(pii)
}

/**
 * Extracts matter immigration PII fields from a payload and returns the
 * encrypted counterparts.
 */
export function withMatterImmigrationPIIEncrypted(
  payload: Record<string, unknown>
): MatterImmigrationPIIEncrypted | Record<string, never> {
  if (!process.env.PII_ENCRYPTION_KEY) return {}
  const pii: MatterImmigrationPII = {
    passport_number: payload.passport_number as string | null | undefined,
    date_of_birth: payload.date_of_birth as string | null | undefined,
    uci_number: payload.uci_number as string | null | undefined,
    prior_refusal_details: payload.prior_refusal_details as string | null | undefined,
    criminal_record_details: payload.criminal_record_details as string | null | undefined,
    medical_issue_details: payload.medical_issue_details as string | null | undefined,
    sponsor_name: payload.sponsor_name as string | null | undefined,
  }
  return encryptMatterImmigrationPII(pii)
}

/**
 * Extracts appointment PII fields from a payload and returns the encrypted
 * counterparts.
 */
export function withAppointmentPIIEncrypted(
  payload: Record<string, unknown>
): AppointmentPIIEncrypted | Record<string, never> {
  if (!process.env.PII_ENCRYPTION_KEY) return {}
  const pii: AppointmentPII = {
    guest_name: payload.guest_name as string | null | undefined,
    guest_email: payload.guest_email as string | null | undefined,
    guest_phone: payload.guest_phone as string | null | undefined,
  }
  return encryptAppointmentPII(pii)
}
