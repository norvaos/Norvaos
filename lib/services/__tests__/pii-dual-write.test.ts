/**
 * Tests for lib/services/pii-dual-write.ts
 *
 * Covers:
 *   withContactPIIEncrypted — field extraction, encryption format, round-trip
 *   withLeadPIIEncrypted — field extraction, encryption format, round-trip
 *   withMatterImmigrationPIIEncrypted — field extraction, encryption format, round-trip
 *   withAppointmentPIIEncrypted — field extraction, encryption format, round-trip
 *   Missing fields — null encrypted values, no errors
 *
 * Sprint 6 — 2026-03-25
 */

import {
  withContactPIIEncrypted,
  withLeadPIIEncrypted,
  withMatterImmigrationPIIEncrypted,
  withAppointmentPIIEncrypted,
} from '@/lib/services/pii-dual-write'

import { decryptPII } from '@/lib/services/pii-encryption'

const TEST_KEY = 'test-pii-encryption-key-for-unit-tests-32bytes!'

// ─── Setup / Teardown ────────────────────────────────────────────────────────

beforeEach(() => {
  process.env.PII_ENCRYPTION_KEY = TEST_KEY
})

afterEach(() => {
  delete process.env.PII_ENCRYPTION_KEY
})

// ─── Helper ──────────────────────────────────────────────────────────────────

/** Asserts a value is a valid encrypted string (3 colon-separated hex segments). */
function expectEncryptedFormat(val: unknown) {
  expect(typeof val).toBe('string')
  const parts = (val as string).split(':')
  expect(parts).toHaveLength(3)
  for (const part of parts) {
    expect(part).toMatch(/^[0-9a-f]+$/i)
  }
}

// ─── withContactPIIEncrypted ─────────────────────────────────────────────────

describe('withContactPIIEncrypted', () => {
  it('returns *_encrypted keys in valid encrypted format', () => {
    const payload = {
      first_name: 'John',
      last_name: 'Doe',
      email_primary: 'john@example.com',
      phone_primary: '+1-555-0100',
      date_of_birth: '1990-01-15',
      address_line1: '123 Main St',
      passport_number: 'AB1234567',
    }

    const result = withContactPIIEncrypted(payload)

    expect(result).toHaveProperty('first_name_encrypted')
    expect(result).toHaveProperty('last_name_encrypted')
    expect(result).toHaveProperty('email_encrypted')
    expect(result).toHaveProperty('phone_encrypted')
    expect(result).toHaveProperty('date_of_birth_encrypted')
    expect(result).toHaveProperty('address_encrypted')
    expect(result).toHaveProperty('passport_number_encrypted')

    expectEncryptedFormat(result.first_name_encrypted)
    expectEncryptedFormat(result.last_name_encrypted)
    expectEncryptedFormat(result.email_encrypted)
    expectEncryptedFormat(result.phone_encrypted)
    expectEncryptedFormat(result.date_of_birth_encrypted)
    expectEncryptedFormat(result.address_encrypted)
    expectEncryptedFormat(result.passport_number_encrypted)
  })

  it('round-trips correctly via decryptPII', () => {
    const payload = {
      first_name: 'Jane',
      last_name: 'وسیر',
      email_primary: 'jane@waseer.ca',
      phone_primary: '+1-613-555-0199',
      date_of_birth: '1985-06-20',
      address_line1: '456 Elm Ave',
      passport_number: 'CD9876543',
    }

    const result = withContactPIIEncrypted(payload)

    expect(decryptPII(result.first_name_encrypted!)).toBe('Jane')
    expect(decryptPII(result.last_name_encrypted!)).toBe('وسیر')
    expect(decryptPII(result.email_encrypted!)).toBe('jane@waseer.ca')
    expect(decryptPII(result.phone_encrypted!)).toBe('+1-613-555-0199')
    expect(decryptPII(result.date_of_birth_encrypted!)).toBe('1985-06-20')
    expect(decryptPII(result.address_encrypted!)).toBe('456 Elm Ave')
    expect(decryptPII(result.passport_number_encrypted!)).toBe('CD9876543')
  })
})

// ─── withLeadPIIEncrypted ────────────────────────────────────────────────────

describe('withLeadPIIEncrypted', () => {
  it('returns *_encrypted keys in valid encrypted format', () => {
    const payload = {
      first_name: 'Ahmed',
      last_name: 'Khan',
      email: 'ahmed@example.com',
      phone: '+92-300-1234567',
    }

    const result = withLeadPIIEncrypted(payload)

    expect(result).toHaveProperty('first_name_encrypted')
    expect(result).toHaveProperty('last_name_encrypted')
    expect(result).toHaveProperty('email_encrypted')
    expect(result).toHaveProperty('phone_encrypted')

    expectEncryptedFormat(result.first_name_encrypted)
    expectEncryptedFormat(result.last_name_encrypted)
    expectEncryptedFormat(result.email_encrypted)
    expectEncryptedFormat(result.phone_encrypted)
  })

  it('round-trips correctly via decryptPII', () => {
    const payload = {
      first_name: 'Ahmed',
      last_name: 'وسیر',
      email: 'ahmed@waseer.ca',
      phone: '+92-300-1234567',
    }

    const result = withLeadPIIEncrypted(payload)

    expect(decryptPII(result.first_name_encrypted!)).toBe('Ahmed')
    expect(decryptPII(result.last_name_encrypted!)).toBe('وسیر')
    expect(decryptPII(result.email_encrypted!)).toBe('ahmed@waseer.ca')
    expect(decryptPII(result.phone_encrypted!)).toBe('+92-300-1234567')
  })
})

// ─── withMatterImmigrationPIIEncrypted ───────────────────────────────────────

describe('withMatterImmigrationPIIEncrypted', () => {
  it('returns *_encrypted keys in valid encrypted format', () => {
    const payload = {
      passport_number: 'XY1234567',
      date_of_birth: '1992-03-10',
      uci_number: '1234-5678',
      prior_refusal_details: 'Refused in 2020 for incomplete docs',
      criminal_record_details: 'None',
      medical_issue_details: 'None',
      sponsor_name: 'Ali Khan',
    }

    const result = withMatterImmigrationPIIEncrypted(payload)

    expect(result).toHaveProperty('passport_number_encrypted')
    expect(result).toHaveProperty('date_of_birth_encrypted')
    expect(result).toHaveProperty('uci_number_encrypted')
    expect(result).toHaveProperty('prior_refusal_details_encrypted')
    expect(result).toHaveProperty('criminal_record_details_encrypted')
    expect(result).toHaveProperty('medical_issue_details_encrypted')
    expect(result).toHaveProperty('sponsor_name_encrypted')

    expectEncryptedFormat(result.passport_number_encrypted)
    expectEncryptedFormat(result.date_of_birth_encrypted)
    expectEncryptedFormat(result.uci_number_encrypted)
    expectEncryptedFormat(result.prior_refusal_details_encrypted)
    expectEncryptedFormat(result.criminal_record_details_encrypted)
    expectEncryptedFormat(result.medical_issue_details_encrypted)
    expectEncryptedFormat(result.sponsor_name_encrypted)
  })

  it('round-trips correctly via decryptPII', () => {
    const payload = {
      passport_number: 'XY1234567',
      date_of_birth: '1992-03-10',
      uci_number: '1234-5678',
      prior_refusal_details: 'Refused in 2020 for incomplete docs',
      criminal_record_details: 'None',
      medical_issue_details: 'None',
      sponsor_name: 'Ali Khan',
    }

    const result = withMatterImmigrationPIIEncrypted(payload)

    expect(decryptPII(result.passport_number_encrypted!)).toBe('XY1234567')
    expect(decryptPII(result.date_of_birth_encrypted!)).toBe('1992-03-10')
    expect(decryptPII(result.uci_number_encrypted!)).toBe('1234-5678')
    expect(decryptPII(result.prior_refusal_details_encrypted!)).toBe('Refused in 2020 for incomplete docs')
    expect(decryptPII(result.criminal_record_details_encrypted!)).toBe('None')
    expect(decryptPII(result.medical_issue_details_encrypted!)).toBe('None')
    expect(decryptPII(result.sponsor_name_encrypted!)).toBe('Ali Khan')
  })
})

// ─── withAppointmentPIIEncrypted ─────────────────────────────────────────────

describe('withAppointmentPIIEncrypted', () => {
  it('returns *_encrypted keys in valid encrypted format', () => {
    const payload = {
      guest_name: 'Sarah Connor',
      guest_email: 'sarah@example.com',
      guest_phone: '+1-416-555-0142',
    }

    const result = withAppointmentPIIEncrypted(payload)

    expect(result).toHaveProperty('guest_name_encrypted')
    expect(result).toHaveProperty('guest_email_encrypted')
    expect(result).toHaveProperty('guest_phone_encrypted')

    expectEncryptedFormat(result.guest_name_encrypted)
    expectEncryptedFormat(result.guest_email_encrypted)
    expectEncryptedFormat(result.guest_phone_encrypted)
  })

  it('round-trips correctly via decryptPII', () => {
    const payload = {
      guest_name: 'Sarah Connor',
      guest_email: 'sarah@example.com',
      guest_phone: '+1-416-555-0142',
    }

    const result = withAppointmentPIIEncrypted(payload)

    expect(decryptPII(result.guest_name_encrypted!)).toBe('Sarah Connor')
    expect(decryptPII(result.guest_email_encrypted!)).toBe('sarah@example.com')
    expect(decryptPII(result.guest_phone_encrypted!)).toBe('+1-416-555-0142')
  })
})

// ─── Missing fields → null encrypted values ─────────────────────────────────

describe('missing fields produce null encrypted values (no errors)', () => {
  it('withContactPIIEncrypted with empty payload', () => {
    const result = withContactPIIEncrypted({})

    expect(result.first_name_encrypted).toBeNull()
    expect(result.last_name_encrypted).toBeNull()
    expect(result.email_encrypted).toBeNull()
    expect(result.phone_encrypted).toBeNull()
    expect(result.date_of_birth_encrypted).toBeNull()
    expect(result.address_encrypted).toBeNull()
    expect(result.passport_number_encrypted).toBeNull()
  })

  it('withLeadPIIEncrypted with empty payload', () => {
    const result = withLeadPIIEncrypted({})

    expect(result.first_name_encrypted).toBeNull()
    expect(result.last_name_encrypted).toBeNull()
    expect(result.email_encrypted).toBeNull()
    expect(result.phone_encrypted).toBeNull()
  })

  it('withMatterImmigrationPIIEncrypted with empty payload', () => {
    const result = withMatterImmigrationPIIEncrypted({})

    expect(result.passport_number_encrypted).toBeNull()
    expect(result.date_of_birth_encrypted).toBeNull()
    expect(result.uci_number_encrypted).toBeNull()
    expect(result.prior_refusal_details_encrypted).toBeNull()
    expect(result.criminal_record_details_encrypted).toBeNull()
    expect(result.medical_issue_details_encrypted).toBeNull()
    expect(result.sponsor_name_encrypted).toBeNull()
  })

  it('withAppointmentPIIEncrypted with empty payload', () => {
    const result = withAppointmentPIIEncrypted({})

    expect(result.guest_name_encrypted).toBeNull()
    expect(result.guest_email_encrypted).toBeNull()
    expect(result.guest_phone_encrypted).toBeNull()
  })
})
