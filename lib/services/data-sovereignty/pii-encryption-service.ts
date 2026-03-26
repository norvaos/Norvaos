/**
 * PII Column-Level Encryption Service  -  Directive 004, Pillar 3
 *
 * Wraps norva_encrypt/norva_decrypt at the application layer using
 * AES-256-GCM. Decryption happens ONLY in memory  -  never in DB.
 *
 * Encryption key: NORVA_VAULT_ENCRYPTION_KEY environment variable (64-char hex = 32 bytes).
 * Storage format: `iv:authTag:ciphertext` (all hex-encoded).
 *
 * Pattern matches `lib/services/oauth/encryption.ts`.
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

// ---------------------------------------------------------------------------
// Key management
// ---------------------------------------------------------------------------

/**
 * Reads and validates the NORVA_VAULT_ENCRYPTION_KEY from env.
 * The key must be a 64-character hex string (32 bytes).
 */
function getEncryptionKey(): Buffer {
  const key = process.env.NORVA_VAULT_ENCRYPTION_KEY

  if (!key) {
    throw new Error(
      'Norva Vault encryption key not configured. Set NORVA_VAULT_ENCRYPTION_KEY (64-char hex).',
    )
  }

  const buf = Buffer.from(key, 'hex')

  if (buf.length !== 32) {
    throw new Error(
      `NORVA_VAULT_ENCRYPTION_KEY must be exactly 32 bytes (64 hex characters). Got ${buf.length} bytes.`,
    )
  }

  return buf
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

  const key = getEncryptionKey()
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()

  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`
}

/**
 * Decrypts a value previously encrypted by {@link encryptPII}.
 * Decryption happens strictly in memory  -  the plaintext is never persisted.
 *
 * @param encrypted - The `iv:authTag:ciphertext` string (hex-encoded).
 * @returns The original plaintext, or `null` if `encrypted` is null/undefined.
 */
export function decryptPII(encrypted: string | null | undefined): string | null {
  if (encrypted == null) return null

  const key = getEncryptionKey()
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

/** Plaintext contact PII fields for Norva Vault encryption. */
export interface NorvaContactPII {
  firstName?: string | null
  lastName?: string | null
  email?: string | null
  phone?: string | null
  address?: string | null
  dateOfBirth?: string | null
  passportNumber?: string | null
}

/** Encrypted contact PII fields. */
export interface NorvaContactPIIEncrypted {
  firstName?: string | null
  lastName?: string | null
  email?: string | null
  phone?: string | null
  address?: string | null
  dateOfBirth?: string | null
  passportNumber?: string | null
}

/**
 * Encrypts all PII fields on a contact object using the Norva Vault key.
 *
 * @param contact - Object with optional plaintext PII fields.
 * @returns Object with all fields encrypted (same shape, encrypted values).
 */
export function encryptContactPII(contact: NorvaContactPII): NorvaContactPIIEncrypted {
  return {
    firstName: encryptPII(contact.firstName),
    lastName: encryptPII(contact.lastName),
    email: encryptPII(contact.email),
    phone: encryptPII(contact.phone),
    address: encryptPII(contact.address),
    dateOfBirth: encryptPII(contact.dateOfBirth),
    passportNumber: encryptPII(contact.passportNumber),
  }
}

/**
 * Decrypts all PII fields on an encrypted contact object.
 * All decryption is in-memory only  -  plaintext is never written to storage.
 *
 * @param encrypted - Object with encrypted field values.
 * @returns Object with plaintext PII fields.
 */
export function decryptContactPII(encrypted: NorvaContactPIIEncrypted): NorvaContactPII {
  return {
    firstName: decryptPII(encrypted.firstName),
    lastName: decryptPII(encrypted.lastName),
    email: decryptPII(encrypted.email),
    phone: decryptPII(encrypted.phone),
    address: decryptPII(encrypted.address),
    dateOfBirth: decryptPII(encrypted.dateOfBirth),
    passportNumber: decryptPII(encrypted.passportNumber),
  }
}
