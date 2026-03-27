/**
 * PII column-level encryption service for NorvaOS.
 *
 * Provides AES-256-GCM encryption/decryption for personally identifiable
 * information stored in Supabase. Encrypted values are stored as
 * `iv:authTag:ciphertext` (all hex-encoded).
 *
 * The encryption key is derived from the `PII_ENCRYPTION_KEY` environment
 * variable using SHA-256. The key must NEVER be hardcoded.
 *
 * Pattern matches `lib/services/oauth/encryption.ts`.
 */

import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'crypto'

// ---------------------------------------------------------------------------
// Key derivation
// ---------------------------------------------------------------------------

/**
 * Derives a 32-byte AES-256 key from the `PII_ENCRYPTION_KEY` env var
 * using SHA-256. Throws if the variable is not set.
 */
function getDerivedKey(): Buffer {
  const raw = process.env.PII_ENCRYPTION_KEY
  if (!raw) {
    throw new Error(
      'PII encryption key not configured. Set the PII_ENCRYPTION_KEY environment variable.',
    )
  }
  return createHash('sha256').update(raw).digest()
}

// ---------------------------------------------------------------------------
// Core encrypt / decrypt
// ---------------------------------------------------------------------------

/**
 * Encrypts a plaintext string using AES-256-GCM with a random 12-byte IV.
 *
 * @param plaintext - The string to encrypt.
 * @returns The encrypted payload as `iv:authTag:ciphertext` (hex-encoded),
 *          or `null` if `plaintext` is null/undefined.
 */
export function encryptPII(plaintext: string | null | undefined): string | null {
  if (plaintext == null) return null

  // Gracefully skip encryption when key is not configured (dev environment)
  const raw = process.env.PII_ENCRYPTION_KEY
  if (!raw) return null

  const key = getDerivedKey()
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()

  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`
}

/**
 * Decrypts a value previously encrypted by {@link encryptPII}.
 *
 * @param encrypted - The `iv:authTag:ciphertext` string (hex-encoded).
 * @returns The original plaintext, or `null` if `encrypted` is null/undefined.
 */
export function decryptPII(encrypted: string | null | undefined): string | null {
  if (encrypted == null) return null

  const key = getDerivedKey()
  const [ivHex, authTagHex, ciphertextHex] = encrypted.split(':')
  const iv = Buffer.from(ivHex, 'hex')
  const authTag = Buffer.from(authTagHex, 'hex')
  const ciphertext = Buffer.from(ciphertextHex, 'hex')

  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(authTag)

  return decipher.update(ciphertext) + decipher.final('utf8')
}

// ---------------------------------------------------------------------------
// Contact PII helpers
// ---------------------------------------------------------------------------

/** Plaintext contact PII fields. */
export interface ContactPII {
  first_name?: string | null
  last_name?: string | null
  date_of_birth?: string | null
  address?: string | null
  passport_number?: string | null
  phone?: string | null
  email?: string | null
}

/** Encrypted contact PII fields (column-level). */
export interface ContactPIIEncrypted {
  first_name_encrypted?: string | null
  last_name_encrypted?: string | null
  date_of_birth_encrypted?: string | null
  address_encrypted?: string | null
  passport_number_encrypted?: string | null
  phone_encrypted?: string | null
  email_encrypted?: string | null
}

/**
 * Encrypts all PII fields on a contact object.
 *
 * @param contact - Object with optional plaintext PII fields.
 * @returns Object with corresponding `*_encrypted` fields.
 */
export function encryptContactPII(contact: ContactPII): ContactPIIEncrypted {
  return {
    first_name_encrypted: encryptPII(contact.first_name),
    last_name_encrypted: encryptPII(contact.last_name),
    date_of_birth_encrypted: encryptPII(contact.date_of_birth),
    address_encrypted: encryptPII(contact.address),
    passport_number_encrypted: encryptPII(contact.passport_number),
    phone_encrypted: encryptPII(contact.phone),
    email_encrypted: encryptPII(contact.email),
  }
}

/**
 * Decrypts all PII fields on an encrypted contact object.
 *
 * @param encrypted - Object with optional `*_encrypted` fields.
 * @returns Object with plaintext PII fields.
 */
export function decryptContactPII(encrypted: ContactPIIEncrypted): ContactPII {
  return {
    first_name: decryptPII(encrypted.first_name_encrypted),
    last_name: decryptPII(encrypted.last_name_encrypted),
    date_of_birth: decryptPII(encrypted.date_of_birth_encrypted),
    address: decryptPII(encrypted.address_encrypted),
    passport_number: decryptPII(encrypted.passport_number_encrypted),
    phone: decryptPII(encrypted.phone_encrypted),
    email: decryptPII(encrypted.email_encrypted),
  }
}

// ---------------------------------------------------------------------------
// Lead PII helpers
// ---------------------------------------------------------------------------

/** Plaintext lead PII fields. */
export interface LeadPII {
  first_name?: string | null
  last_name?: string | null
  email?: string | null
  phone?: string | null
}

/** Encrypted lead PII fields (column-level). */
export interface LeadPIIEncrypted {
  first_name_encrypted?: string | null
  last_name_encrypted?: string | null
  email_encrypted?: string | null
  phone_encrypted?: string | null
}

/**
 * Encrypts all PII fields on a lead object.
 *
 * @param lead - Object with optional plaintext PII fields.
 * @returns Object with corresponding `*_encrypted` fields.
 */
export function encryptLeadPII(lead: LeadPII): LeadPIIEncrypted {
  return {
    first_name_encrypted: encryptPII(lead.first_name),
    last_name_encrypted: encryptPII(lead.last_name),
    email_encrypted: encryptPII(lead.email),
    phone_encrypted: encryptPII(lead.phone),
  }
}

/**
 * Decrypts all PII fields on an encrypted lead object.
 *
 * @param encrypted - Object with optional `*_encrypted` fields.
 * @returns Object with plaintext PII fields.
 */
export function decryptLeadPII(encrypted: LeadPIIEncrypted): LeadPII {
  return {
    first_name: decryptPII(encrypted.first_name_encrypted),
    last_name: decryptPII(encrypted.last_name_encrypted),
    email: decryptPII(encrypted.email_encrypted),
    phone: decryptPII(encrypted.phone_encrypted),
  }
}

// ---------------------------------------------------------------------------
// Matter Immigration PII helpers
// ---------------------------------------------------------------------------

/** Plaintext matter immigration PII fields. */
export interface MatterImmigrationPII {
  passport_number?: string | null
  date_of_birth?: string | null
  uci_number?: string | null
  prior_refusal_details?: string | null
  criminal_record_details?: string | null
  medical_issue_details?: string | null
  sponsor_name?: string | null
}

/** Encrypted matter immigration PII fields (column-level). */
export interface MatterImmigrationPIIEncrypted {
  passport_number_encrypted?: string | null
  date_of_birth_encrypted?: string | null
  uci_number_encrypted?: string | null
  prior_refusal_details_encrypted?: string | null
  criminal_record_details_encrypted?: string | null
  medical_issue_details_encrypted?: string | null
  sponsor_name_encrypted?: string | null
}

export function encryptMatterImmigrationPII(data: MatterImmigrationPII): MatterImmigrationPIIEncrypted {
  return {
    passport_number_encrypted: encryptPII(data.passport_number),
    date_of_birth_encrypted: encryptPII(data.date_of_birth),
    uci_number_encrypted: encryptPII(data.uci_number),
    prior_refusal_details_encrypted: encryptPII(data.prior_refusal_details),
    criminal_record_details_encrypted: encryptPII(data.criminal_record_details),
    medical_issue_details_encrypted: encryptPII(data.medical_issue_details),
    sponsor_name_encrypted: encryptPII(data.sponsor_name),
  }
}

export function decryptMatterImmigrationPII(encrypted: MatterImmigrationPIIEncrypted): MatterImmigrationPII {
  return {
    passport_number: decryptPII(encrypted.passport_number_encrypted),
    date_of_birth: decryptPII(encrypted.date_of_birth_encrypted),
    uci_number: decryptPII(encrypted.uci_number_encrypted),
    prior_refusal_details: decryptPII(encrypted.prior_refusal_details_encrypted),
    criminal_record_details: decryptPII(encrypted.criminal_record_details_encrypted),
    medical_issue_details: decryptPII(encrypted.medical_issue_details_encrypted),
    sponsor_name: decryptPII(encrypted.sponsor_name_encrypted),
  }
}

// ---------------------------------------------------------------------------
// Appointment PII helpers
// ---------------------------------------------------------------------------

/** Plaintext appointment PII fields. */
export interface AppointmentPII {
  guest_name?: string | null
  guest_email?: string | null
  guest_phone?: string | null
}

/** Encrypted appointment PII fields (column-level). */
export interface AppointmentPIIEncrypted {
  guest_name_encrypted?: string | null
  guest_email_encrypted?: string | null
  guest_phone_encrypted?: string | null
}

export function encryptAppointmentPII(data: AppointmentPII): AppointmentPIIEncrypted {
  return {
    guest_name_encrypted: encryptPII(data.guest_name),
    guest_email_encrypted: encryptPII(data.guest_email),
    guest_phone_encrypted: encryptPII(data.guest_phone),
  }
}

export function decryptAppointmentPII(encrypted: AppointmentPIIEncrypted): AppointmentPII {
  return {
    guest_name: decryptPII(encrypted.guest_name_encrypted),
    guest_email: decryptPII(encrypted.guest_email_encrypted),
    guest_phone: decryptPII(encrypted.guest_phone_encrypted),
  }
}
