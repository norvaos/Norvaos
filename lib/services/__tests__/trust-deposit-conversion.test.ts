/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Trust Deposit → Lead Conversion Bridge  -  Unit Tests
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Proves:
 * - Explicit leadId triggers conversion
 * - Implicit lookup via matter's originating_lead_id
 * - Skipped when no lead is associated
 * - Skipped when lead already converted
 * - Skipped when lead is lost or disqualified
 * - Conflict block prevents conversion
 * - Conflict review allows conversion (non-blocking)
 * - Conflict check failure is non-blocking
 * - Contact name + matter type build the matter title
 * - Conversion failure propagates blocked reasons
 * - Top-level exceptions are caught and returned as errors
 * - Zero and negative amountCents are tolerated
 * - Currency precision: amountCents is passed through as-is (integer cents)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { convertLeadOnTrustDeposit, type TrustDepositConversionParams } from '../trust-deposit-conversion'
import { createMockSupabase } from '@/lib/test-utils/mock-supabase'

// ─── Mocks ──────────────────────────────────────────────────────────────────

vi.mock('../lead-conversion-executor', () => ({
  convertLeadToMatter: vi.fn(),
}))

vi.mock('../conflict-check-enhanced', () => ({
  runAndPersistEnhancedConflictCheck: vi.fn(),
}))

vi.mock('@/lib/utils/logger', () => ({
  log: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

import { convertLeadToMatter } from '../lead-conversion-executor'
import { runAndPersistEnhancedConflictCheck } from '../conflict-check-enhanced'

const mockedConvert = vi.mocked(convertLeadToMatter)
const mockedConflictCheck = vi.mocked(runAndPersistEnhancedConflictCheck)

// ─── Fixtures ───────────────────────────────────────────────────────────────

const TENANT_ID = 'tenant-1'
const USER_ID = 'user-1'
const LEAD_ID = 'lead-1'
const MATTER_ID = 'matter-1'
const CONTACT_ID = 'contact-1'

function makeActiveLead(overrides: Record<string, unknown> = {}) {
  return {
    id: LEAD_ID,
    status: 'active',
    converted_matter_id: null,
    contact_id: CONTACT_ID,
    matter_type_id: 'mt-1',
    practice_area_id: 'pa-1',
    responsible_lawyer_id: 'lawyer-1',
    assigned_to: null,
    ...overrides,
  }
}

function defaultParams(overrides: Partial<TrustDepositConversionParams> = {}): TrustDepositConversionParams {
  return {
    supabase: createMockSupabase({}),
    tenantId: TENANT_ID,
    userId: USER_ID,
    amountCents: 150000,
    leadId: LEAD_ID,
    ...overrides,
  }
}

function setupConflictClear() {
  mockedConflictCheck.mockResolvedValue({
    severity: 'clear',
    match_count: 0,
    matches: [],
  } as any)
}

function setupConversionSuccess(matterId = MATTER_ID) {
  mockedConvert.mockResolvedValue({
    success: true,
    matterId,
  } as any)
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('convertLeadOnTrustDeposit', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setupConflictClear()
    setupConversionSuccess()
  })

  // ── Path 1: Explicit leadId ─────────────────────────────────────────────

  describe('explicit leadId path', () => {
    it('converts a lead when explicit leadId is provided', async () => {
      const supabase = createMockSupabase({
        leads: {
          selectData: makeActiveLead(),
        },
        contacts: {
          selectData: { first_name: 'Zia', last_name: 'Waseer' },
        },
        matter_types: {
          selectData: { name: 'Immigration' },
        },
        matters: {
          selectData: { matter_number: 'M-2026-001' },
        },
      })

      const result = await convertLeadOnTrustDeposit(defaultParams({ supabase }))

      expect(result.converted).toBe(true)
      expect(result.matterId).toBe(MATTER_ID)
      expect(result.matterNumber).toBe('M-2026-001')
      expect(result.error).toBeUndefined()
    })
  })

  // ── Path 2: Implicit via matter's originating_lead_id ───────────────────

  describe('implicit lookup via matterId', () => {
    it('resolves leadId from matter.originating_lead_id when no explicit leadId', async () => {
      const supabase = createMockSupabase({
        matters: {
          selectData: { originating_lead_id: LEAD_ID, matter_number: 'M-2026-002' },
        },
        leads: {
          selectData: makeActiveLead(),
        },
        contacts: {
          selectData: { first_name: 'Arjun', last_name: 'Patel' },
        },
        matter_types: {
          selectData: { name: 'Family Law' },
        },
      })

      const result = await convertLeadOnTrustDeposit(
        defaultParams({ supabase, leadId: undefined, matterId: 'some-matter' }),
      )

      expect(result.converted).toBe(true)
      expect(result.matterId).toBe(MATTER_ID)
    })

    it('returns skipped when matter has no originating_lead_id', async () => {
      const supabase = createMockSupabase({
        matters: {
          selectData: { originating_lead_id: null },
        },
      })

      const result = await convertLeadOnTrustDeposit(
        defaultParams({ supabase, leadId: undefined, matterId: 'some-matter' }),
      )

      expect(result.converted).toBe(false)
      expect(result.skippedReason).toBe('No lead associated with this deposit.')
    })
  })

  // ── No lead associated ──────────────────────────────────────────────────

  describe('no lead associated', () => {
    it('returns skipped when neither leadId nor matterId is provided', async () => {
      const result = await convertLeadOnTrustDeposit(
        defaultParams({ leadId: undefined, matterId: undefined }),
      )

      expect(result.converted).toBe(false)
      expect(result.skippedReason).toBe('No lead associated with this deposit.')
    })
  })

  // ── Lead eligibility checks ─────────────────────────────────────────────

  describe('lead eligibility', () => {
    it('returns skipped when lead is not found', async () => {
      const supabase = createMockSupabase({
        leads: { selectData: null },
      })

      const result = await convertLeadOnTrustDeposit(defaultParams({ supabase }))

      expect(result.converted).toBe(false)
      expect(result.skippedReason).toBe('Lead not found.')
    })

    it('returns skipped when lead is already converted (status = converted)', async () => {
      const supabase = createMockSupabase({
        leads: {
          selectData: makeActiveLead({
            status: 'converted',
            converted_matter_id: 'existing-matter',
          }),
        },
      })

      const result = await convertLeadOnTrustDeposit(defaultParams({ supabase }))

      expect(result.converted).toBe(false)
      expect(result.skippedReason).toBe('Lead already converted.')
      expect(result.matterId).toBe('existing-matter')
    })

    it('returns skipped when lead has converted_matter_id but status is not "converted"', async () => {
      const supabase = createMockSupabase({
        leads: {
          selectData: makeActiveLead({
            status: 'active',
            converted_matter_id: 'existing-matter',
          }),
        },
      })

      const result = await convertLeadOnTrustDeposit(defaultParams({ supabase }))

      expect(result.converted).toBe(false)
      expect(result.skippedReason).toBe('Lead already converted.')
    })

    it('returns skipped when lead status is "lost"', async () => {
      const supabase = createMockSupabase({
        leads: {
          selectData: makeActiveLead({ status: 'lost' }),
        },
      })

      const result = await convertLeadOnTrustDeposit(defaultParams({ supabase }))

      expect(result.converted).toBe(false)
      expect(result.skippedReason).toContain('lost')
    })

    it('returns skipped when lead status is "disqualified"', async () => {
      const supabase = createMockSupabase({
        leads: {
          selectData: makeActiveLead({ status: 'disqualified' }),
        },
      })

      const result = await convertLeadOnTrustDeposit(defaultParams({ supabase }))

      expect(result.converted).toBe(false)
      expect(result.skippedReason).toContain('disqualified')
    })
  })

  // ── Conflict check behaviour ────────────────────────────────────────────

  describe('conflict check', () => {
    it('blocks conversion when conflict severity is "block"', async () => {
      mockedConflictCheck.mockResolvedValue({
        severity: 'block',
        match_count: 2,
        matches: [
          { contact_name: 'John Doe', match_field: 'passport', has_matters: true },
          { contact_name: 'Jane Doe', match_field: 'name+dob', has_matters: false },
        ],
      } as any)

      const supabase = createMockSupabase({
        leads: { selectData: makeActiveLead() },
      })

      const result = await convertLeadOnTrustDeposit(defaultParams({ supabase }))

      expect(result.converted).toBe(false)
      expect(result.error).toContain('Conflict detected')
      expect(result.error).toContain('2 match(es)')
      expect(mockedConvert).not.toHaveBeenCalled()
    })

    it('allows conversion when conflict severity is "review" (non-blocking)', async () => {
      mockedConflictCheck.mockResolvedValue({
        severity: 'review',
        match_count: 1,
        matches: [{ contact_name: 'John Doe', match_field: 'name', has_matters: false }],
      } as any)

      const supabase = createMockSupabase({
        leads: { selectData: makeActiveLead() },
        contacts: { selectData: { first_name: 'Test', last_name: 'User' } },
        matter_types: { selectData: { name: 'Immigration' } },
        matters: { selectData: { matter_number: 'M-2026-003' } },
      })

      const result = await convertLeadOnTrustDeposit(defaultParams({ supabase }))

      expect(result.converted).toBe(true)
      expect(mockedConvert).toHaveBeenCalled()
    })

    it('proceeds with conversion when conflict check throws an error (non-blocking)', async () => {
      mockedConflictCheck.mockRejectedValue(new Error('Conflict engine offline'))

      const supabase = createMockSupabase({
        leads: { selectData: makeActiveLead() },
        contacts: { selectData: { first_name: 'Test', last_name: 'User' } },
        matter_types: { selectData: { name: 'Immigration' } },
        matters: { selectData: { matter_number: 'M-2026-004' } },
      })

      const result = await convertLeadOnTrustDeposit(defaultParams({ supabase }))

      expect(result.converted).toBe(true)
      expect(mockedConvert).toHaveBeenCalled()
    })
  })

  // ── Matter title construction ───────────────────────────────────────────

  describe('matter title construction', () => {
    it('builds title from contact name and matter type', async () => {
      const supabase = createMockSupabase({
        leads: { selectData: makeActiveLead() },
        contacts: { selectData: { first_name: 'Zia', last_name: 'Waseer' } },
        matter_types: { selectData: { name: 'Immigration' } },
        matters: { selectData: { matter_number: 'M-001' } },
      })

      await convertLeadOnTrustDeposit(defaultParams({ supabase }))

      expect(mockedConvert).toHaveBeenCalledWith(
        expect.objectContaining({
          matterData: expect.objectContaining({
            title: 'Zia Waseer  -  Immigration',
          }),
        }),
      )
    })

    it('uses "New Matter" when contact has no name', async () => {
      const supabase = createMockSupabase({
        leads: { selectData: makeActiveLead({ contact_id: null, matter_type_id: null }) },
        matters: { selectData: { matter_number: 'M-001' } },
      })

      await convertLeadOnTrustDeposit(defaultParams({ supabase }))

      expect(mockedConvert).toHaveBeenCalledWith(
        expect.objectContaining({
          matterData: expect.objectContaining({
            title: 'New Matter',
          }),
        }),
      )
    })

    it('uses contact name only when no matter type is set', async () => {
      const supabase = createMockSupabase({
        leads: { selectData: makeActiveLead({ matter_type_id: null }) },
        contacts: { selectData: { first_name: 'Arjun', last_name: 'Patel' } },
        matters: { selectData: { matter_number: 'M-001' } },
      })

      await convertLeadOnTrustDeposit(defaultParams({ supabase }))

      expect(mockedConvert).toHaveBeenCalledWith(
        expect.objectContaining({
          matterData: expect.objectContaining({
            title: 'Arjun Patel',
          }),
        }),
      )
    })

    it('handles contact with only first name', async () => {
      const supabase = createMockSupabase({
        leads: { selectData: makeActiveLead({ matter_type_id: null }) },
        contacts: { selectData: { first_name: 'Arjun', last_name: null } },
        matters: { selectData: { matter_number: 'M-001' } },
      })

      await convertLeadOnTrustDeposit(defaultParams({ supabase }))

      expect(mockedConvert).toHaveBeenCalledWith(
        expect.objectContaining({
          matterData: expect.objectContaining({
            title: 'Arjun',
          }),
        }),
      )
    })
  })

  // ── Conversion executor integration ─────────────────────────────────────

  describe('conversion executor', () => {
    it('passes gate overrides to skip conflict_cleared and intake_complete', async () => {
      const supabase = createMockSupabase({
        leads: { selectData: makeActiveLead() },
        contacts: { selectData: { first_name: 'Test', last_name: 'User' } },
        matter_types: { selectData: { name: 'Immigration' } },
        matters: { selectData: { matter_number: 'M-001' } },
      })

      await convertLeadOnTrustDeposit(defaultParams({ supabase }))

      expect(mockedConvert).toHaveBeenCalledWith(
        expect.objectContaining({
          gateOverrides: {
            conflict_cleared: false,
            intake_complete: false,
          },
        }),
      )
    })

    it('passes responsible_lawyer_id from lead', async () => {
      const supabase = createMockSupabase({
        leads: { selectData: makeActiveLead({ responsible_lawyer_id: 'lawyer-99' }) },
        contacts: { selectData: { first_name: 'Test', last_name: 'User' } },
        matter_types: { selectData: { name: 'Immigration' } },
        matters: { selectData: { matter_number: 'M-001' } },
      })

      await convertLeadOnTrustDeposit(defaultParams({ supabase }))

      expect(mockedConvert).toHaveBeenCalledWith(
        expect.objectContaining({
          matterData: expect.objectContaining({
            responsibleLawyerId: 'lawyer-99',
          }),
        }),
      )
    })

    it('falls back to assigned_to when responsible_lawyer_id is null', async () => {
      const supabase = createMockSupabase({
        leads: {
          selectData: makeActiveLead({
            responsible_lawyer_id: null,
            assigned_to: 'assignee-1',
          }),
        },
        contacts: { selectData: { first_name: 'Test', last_name: 'User' } },
        matter_types: { selectData: { name: 'Immigration' } },
        matters: { selectData: { matter_number: 'M-001' } },
      })

      await convertLeadOnTrustDeposit(defaultParams({ supabase }))

      expect(mockedConvert).toHaveBeenCalledWith(
        expect.objectContaining({
          matterData: expect.objectContaining({
            responsibleLawyerId: 'assignee-1',
          }),
        }),
      )
    })

    it('returns error when conversion executor reports failure with blocked reasons', async () => {
      mockedConvert.mockResolvedValue({
        success: false,
        error: null,
        gateResults: {
          blockedReasons: ['Retainer not signed', 'Payment pending'],
        },
      } as any)

      const supabase = createMockSupabase({
        leads: { selectData: makeActiveLead() },
        contacts: { selectData: { first_name: 'Test', last_name: 'User' } },
        matter_types: { selectData: { name: 'Immigration' } },
      })

      const result = await convertLeadOnTrustDeposit(defaultParams({ supabase }))

      expect(result.converted).toBe(false)
      expect(result.error).toContain('Retainer not signed')
      expect(result.error).toContain('Payment pending')
    })

    it('returns error string when conversion executor returns error', async () => {
      mockedConvert.mockResolvedValue({
        success: false,
        error: 'Unexpected DB error',
        gateResults: { blockedReasons: [] },
      } as any)

      const supabase = createMockSupabase({
        leads: { selectData: makeActiveLead() },
        contacts: { selectData: { first_name: 'Test', last_name: 'User' } },
        matter_types: { selectData: { name: 'Immigration' } },
      })

      const result = await convertLeadOnTrustDeposit(defaultParams({ supabase }))

      expect(result.converted).toBe(false)
      expect(result.error).toBe('Unexpected DB error')
    })
  })

  // ── Top-level error handling ────────────────────────────────────────────

  describe('top-level error handling', () => {
    it('catches and returns unknown exceptions as error', async () => {
      const supabase = {
        from: vi.fn(() => { throw new Error('Connection refused') }),
      } as any

      const result = await convertLeadOnTrustDeposit(
        defaultParams({ supabase, leadId: undefined, matterId: 'some-matter' }),
      )

      expect(result.converted).toBe(false)
      expect(result.error).toBe('Connection refused')
    })

    it('handles non-Error thrown values', async () => {
      const supabase = {
        from: vi.fn(() => { throw 'string error' }),
      } as any

      const result = await convertLeadOnTrustDeposit(
        defaultParams({ supabase, leadId: undefined, matterId: 'some-matter' }),
      )

      expect(result.converted).toBe(false)
      expect(result.error).toBe('Unknown error')
    })
  })

  // ── Edge cases: amounts ─────────────────────────────────────────────────

  describe('edge cases for amountCents', () => {
    it('tolerates zero amountCents', async () => {
      const supabase = createMockSupabase({
        leads: { selectData: makeActiveLead() },
        contacts: { selectData: { first_name: 'Test', last_name: 'User' } },
        matter_types: { selectData: { name: 'Immigration' } },
        matters: { selectData: { matter_number: 'M-001' } },
      })

      const result = await convertLeadOnTrustDeposit(
        defaultParams({ supabase, amountCents: 0 }),
      )

      expect(result.converted).toBe(true)
    })

    it('tolerates negative amountCents (reversal scenario)', async () => {
      const supabase = createMockSupabase({
        leads: { selectData: makeActiveLead() },
        contacts: { selectData: { first_name: 'Test', last_name: 'User' } },
        matter_types: { selectData: { name: 'Immigration' } },
        matters: { selectData: { matter_number: 'M-001' } },
      })

      const result = await convertLeadOnTrustDeposit(
        defaultParams({ supabase, amountCents: -5000 }),
      )

      expect(result.converted).toBe(true)
    })

    it('handles fractional cents (currency precision boundary)', async () => {
      const supabase = createMockSupabase({
        leads: { selectData: makeActiveLead() },
        contacts: { selectData: { first_name: 'Test', last_name: 'User' } },
        matter_types: { selectData: { name: 'Immigration' } },
        matters: { selectData: { matter_number: 'M-001' } },
      })

      // amountCents should be integer, but service should not break on floats
      const result = await convertLeadOnTrustDeposit(
        defaultParams({ supabase, amountCents: 150099.5 }),
      )

      expect(result.converted).toBe(true)
    })
  })
})
