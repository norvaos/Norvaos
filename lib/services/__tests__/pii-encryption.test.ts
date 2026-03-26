/**
 * Tests for lib/services/pii-encryption.ts
 *
 * Covers:
 *   encryptPII / decryptPII — format, round-trip, random IV, env guard
 *   encryptContactPII / decryptContactPII — field-level encrypt/decrypt
 *   encryptLeadPII / decryptLeadPII — field-level encrypt/decrypt
 *   Null/undefined/empty-string edge cases
 *
 * Sprint 6 — 2026-03-25
 */

import {
  encryptPII,
  decryptPII,
  encryptContactPII,
  decryptContactPII,
  encryptLeadPII,
  decryptLeadPII,
} from '@/lib/services/pii-encryption'

const TEST_KEY = 'test-pii-encryption-key-for-unit-tests-32bytes!'

// ─── Setup / Teardown ────────────────────────────────────────────────────────

beforeEach(() => {
  process.env.PII_ENCRYPTION_KEY = TEST_KEY
})

afterEach(() => {
  delete process.env.PII_ENCRYPTION_KEY
})

// ─── encryptPII / decryptPII ─────────────────────────────────────────────────

describe('encryptPII', () => {
  it('returns a string in format iv:authTag:ciphertext (3 colon-separated hex segments)', () => {
    const encrypted = encryptPII('hello world')
    const parts = encrypted.split(':')
    expect(parts).toHaveLength(3)
    // Each segment should be a valid hex string
    for (const part of parts) {
      expect(part).toMatch(/^[0-9a-f]+$/i)
    }
  })

  it('produces different ciphertext for the same input (random IV)', () => {
    const a = encryptPII('same input')
    const b = encryptPII('same input')
    expect(a).not.toBe(b)
    // But both should decrypt to the same value
    expect(decryptPII(a)).toBe('same input')
    expect(decryptPII(b)).toBe('same input')
  })

  it('throws if PII_ENCRYPTION_KEY is not set', () => {
    delete process.env.PII_ENCRYPTION_KEY
    expect(() => encryptPII('anything')).toThrow()
  })

  it('encrypts and decrypts an empty string correctly', () => {
    const encrypted = encryptPII('')
    expect(typeof encrypted).toBe('string')
    expect(decryptPII(encrypted)).toBe('')
  })
})

describe('decryptPII', () => {
  it('round-trips correctly for ASCII text', () => {
    const text = 'Hello, World! 123'
    expect(decryptPII(encryptPII(text))).toBe(text)
  })

  it('round-trips correctly for Unicode / Nastaliq text', () => {
    const arabic = 'وسیر'
    expect(decryptPII(encryptPII(arabic))).toBe(arabic)

    const mixed = 'Client: وسیر — Case #42'
    expect(decryptPII(encryptPII(mixed))).toBe(mixed)
  })

  it('round-trips correctly for long text', () => {
    const long = 'A'.repeat(10_000)
    expect(decryptPII(encryptPII(long))).toBe(long)
  })

  it('throws on tampered ciphertext', () => {
    const encrypted = encryptPII('sensitive data')
    const parts = encrypted.split(':')
    // Tamper with the ciphertext portion
    const tampered = `${parts[0]}:${parts[1]}:${parts[2].slice(0, -2)}ff`
    expect(() => decryptPII(tampered)).toThrow()
  })
})

// ─── Null / undefined handling ───────────────────────────────────────────────

describe('null/undefined inputs', () => {
  it('encryptPII returns null for null input', () => {
    expect(encryptPII(null as unknown as string)).toBeNull()
  })

  it('encryptPII returns null for undefined input', () => {
    expect(encryptPII(undefined as unknown as string)).toBeNull()
  })

  it('decryptPII returns null for null input', () => {
    expect(decryptPII(null as unknown as string)).toBeNull()
  })

  it('decryptPII returns null for undefined input', () => {
    expect(decryptPII(undefined as unknown as string)).toBeNull()
  })
})

// ─── encryptContactPII / decryptContactPII ───────────────────────────────────

describe('encryptContactPII', () => {
  it('encrypts all fields and returns *_encrypted keys', () => {
    const contact = {
      first_name: 'John',
      last_name: 'Doe',
      email: 'john@example.com',
      phone: '+1-555-0100',
    }

    const encrypted = encryptContactPII(contact)

    // Should have _encrypted suffix keys
    expect(encrypted).toHaveProperty('first_name_encrypted')
    expect(encrypted).toHaveProperty('last_name_encrypted')
    expect(encrypted).toHaveProperty('email_encrypted')
    expect(encrypted).toHaveProperty('phone_encrypted')

    // Encrypted values should be colon-separated hex strings
    for (const key of Object.keys(encrypted)) {
      if (key.endsWith('_encrypted')) {
        const val = encrypted[key as keyof typeof encrypted] as string
        expect(val.split(':')).toHaveLength(3)
      }
    }
  })

  it('round-trips correctly with decryptContactPII', () => {
    const contact = {
      first_name: 'Jane',
      last_name: 'وسیر',
      email: 'jane@waseer.ca',
      phone: '+1-613-555-0199',
    }

    const encrypted = encryptContactPII(contact)
    const decrypted = decryptContactPII(encrypted)

    expect(decrypted.first_name).toBe(contact.first_name)
    expect(decrypted.last_name).toBe(contact.last_name)
    expect(decrypted.email).toBe(contact.email)
    expect(decrypted.phone).toBe(contact.phone)
  })
})

// ─── encryptLeadPII / decryptLeadPII ─────────────────────────────────────────

describe('encryptLeadPII / decryptLeadPII', () => {
  it('round-trips correctly', () => {
    const lead = {
      first_name: 'Ahmed',
      last_name: 'وسیر',
      email: 'ahmed@example.com',
      phone: '+92-300-1234567',
    }

    const encrypted = encryptLeadPII(lead)
    const decrypted = decryptLeadPII(encrypted)

    expect(decrypted.first_name).toBe(lead.first_name)
    expect(decrypted.last_name).toBe(lead.last_name)
    expect(decrypted.email).toBe(lead.email)
    expect(decrypted.phone).toBe(lead.phone)
  })
})
