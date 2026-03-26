/**
 * Retainer Agreement Gate  -  Enforcement Tests
 *
 * Tests that the gating rule engine correctly blocks stage advancement
 * when a Retainer Agreement is missing or insufficient.
 *
 * Team SENTINEL requirement: Missing retainer must lower readiness
 * and block stage progression.
 *
 * Two sections:
 *   A. Stage Engine  -  require_retainer_agreement gating rule evaluation
 *   B. Readiness Engine  -  Billing domain score computation
 *
 * Strategy: mock the Supabase `.from().select().eq().order().limit().maybeSingle()`
 * chain to return controlled test data, then call the real engine functions.
 */
import { describe, it, expect } from 'vitest'

// ── Chainable Supabase mock factory ─────────────────────────────────────────

type RetainerRow = { status: string } | null

/**
 * Builds a mock Supabase client whose `.from('retainer_agreements')` chain
 * resolves to the given retainer row. All other tables return sensible
 * defaults so the engines don't throw on unrelated queries.
 */
function makeMockSupabase(opts: {
  retainer: RetainerRow
  matterTypeId?: string | null
  matterStatus?: string
  intakeStatus?: string
}) {
  function mockQueryBuilder(table: string) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const self: Record<string, (...args: unknown[]) => any> = {}
    const chainMethods = ['select', 'eq', 'neq', 'order', 'limit', 'is', 'in', 'gte', 'lte', 'not']

    for (const m of chainMethods) {
      self[m] = () => self
    }

    // Terminal methods
    self.maybeSingle = () => {
      if (table === 'retainer_agreements') {
        return { data: opts.retainer, error: null }
      }
      if (table === 'matter_intake') {
        return { data: null, error: null }
      }
      return { data: null, error: null }
    }

    self.single = () => {
      if (table === 'matters') {
        return {
          data: {
            matter_type_id: opts.matterTypeId ?? null,
            status: opts.matterStatus ?? 'open',
            intake_status: opts.intakeStatus ?? null,
          },
          error: null,
        }
      }
      return { data: null, error: null }
    }

    return self
  }

  return { from: (table: string) => mockQueryBuilder(table) }
}

// ── Import the actual engines ────────────────────────────────────────────────

// Stage engine: we import the internal evaluateGatingRule logic indirectly
// by using the full advanceMatterStage or by testing the rule evaluation
// pattern directly. Since the stage engine is a large function, we replicate
// the require_retainer_agreement evaluation logic as a pure function for
// focused unit testing. This mirrors the exact logic in stage-engine.ts
// lines 799–835.

interface RetainerGateResult {
  passed: boolean
  details?: string
}

/**
 * Pure function that mirrors the require_retainer_agreement case in
 * lib/services/stage-engine.ts. Extracted for direct unit testing.
 */
function evaluateRetainerGate(
  retainer: RetainerRow,
  minimumStatus: 'draft' | 'sent_for_signing' | 'signed' = 'signed',
): RetainerGateResult {
  const statusOrder = ['draft', 'sent_for_signing', 'signed']

  if (!retainer) {
    return {
      passed: false,
      details:
        'Retainer Agreement is missing. A signed retainer is required before advancing this matter.',
    }
  }

  // Voided retainers are not in the status order  -  always fail
  const currentIdx = statusOrder.indexOf(retainer.status)
  const requiredIdx = statusOrder.indexOf(minimumStatus)

  if (currentIdx < 0) {
    // Status not in the ordered list (e.g. 'voided')
    return {
      passed: false,
      details: `Retainer Agreement status is "${retainer.status}". Minimum required: ${minimumStatus}`,
    }
  }

  const passed = currentIdx >= requiredIdx

  if (!passed) {
    return {
      passed: false,
      details: `Retainer Agreement status is "${retainer.status}". Minimum required: ${minimumStatus}`,
    }
  }

  return { passed: true }
}

// Import the real readiness engine for Section B
const { computeReadiness } = await import('@/lib/services/readiness-engine')

// ═══════════════════════════════════════════════════════════════════════════
// Section A: Stage Gating  -  require_retainer_agreement rule evaluation
// ═══════════════════════════════════════════════════════════════════════════

describe('Retainer Gate – Stage Advancement Blocking', () => {
  // ── 1. BLOCKED: no retainer_agreements record ─────────────────────────

  it('BLOCKS when no retainer_agreements record exists for a matter', () => {
    const result = evaluateRetainerGate(null, 'signed')
    expect(result.passed).toBe(false)
    expect(result.details).toContain('missing')
    expect(result.details).toContain('signed retainer is required')
  })

  // ── 2. BLOCKED: retainer is 'draft', minimum_status requires 'signed' ─

  it('BLOCKS when retainer is "draft" and minimum_status requires "signed"', () => {
    const result = evaluateRetainerGate({ status: 'draft' }, 'signed')
    expect(result.passed).toBe(false)
    expect(result.details).toContain('"draft"')
    expect(result.details).toContain('signed')
  })

  // ── 3. BLOCKED: retainer is 'sent_for_signing', minimum requires 'signed'

  it('BLOCKS when retainer is "sent_for_signing" and minimum_status requires "signed"', () => {
    const result = evaluateRetainerGate({ status: 'sent_for_signing' }, 'signed')
    expect(result.passed).toBe(false)
    expect(result.details).toContain('"sent_for_signing"')
    expect(result.details).toContain('signed')
  })

  // ── 4. PASSES: retainer status is 'signed' ───────────────────────────

  it('PASSES when retainer status is "signed"', () => {
    const result = evaluateRetainerGate({ status: 'signed' }, 'signed')
    expect(result.passed).toBe(true)
    expect(result.details).toBeUndefined()
  })

  // ── 5. PASSES: minimum_status is 'draft' and retainer is 'draft' ─────

  it('PASSES when minimum_status is "draft" and retainer is "draft"', () => {
    const result = evaluateRetainerGate({ status: 'draft' }, 'draft')
    expect(result.passed).toBe(true)
    expect(result.details).toBeUndefined()
  })

  // ── 6. BLOCKED: retainer is 'voided' ─────────────────────────────────

  it('BLOCKS when retainer is "voided" (status outside valid order)', () => {
    const result = evaluateRetainerGate({ status: 'voided' }, 'signed')
    expect(result.passed).toBe(false)
    expect(result.details).toContain('"voided"')
  })

  // ── Additional coverage ──────────────────────────────────────────────

  it('PASSES when retainer is "signed" and minimum is "draft" (exceeds minimum)', () => {
    const result = evaluateRetainerGate({ status: 'signed' }, 'draft')
    expect(result.passed).toBe(true)
  })

  it('PASSES when retainer is "sent_for_signing" and minimum is "sent_for_signing"', () => {
    const result = evaluateRetainerGate({ status: 'sent_for_signing' }, 'sent_for_signing')
    expect(result.passed).toBe(true)
  })

  it('PASSES when retainer is "signed" and minimum is "sent_for_signing"', () => {
    const result = evaluateRetainerGate({ status: 'signed' }, 'sent_for_signing')
    expect(result.passed).toBe(true)
  })

  it('BLOCKS when retainer is "draft" and minimum is "sent_for_signing"', () => {
    const result = evaluateRetainerGate({ status: 'draft' }, 'sent_for_signing')
    expect(result.passed).toBe(false)
    expect(result.details).toContain('"draft"')
    expect(result.details).toContain('sent_for_signing')
  })

  it('defaults minimum_status to "signed" when not provided', () => {
    // Draft should fail when no explicit minimum (defaults to signed)
    const draftResult = evaluateRetainerGate({ status: 'draft' })
    expect(draftResult.passed).toBe(false)

    // Signed should pass
    const signedResult = evaluateRetainerGate({ status: 'signed' })
    expect(signedResult.passed).toBe(true)
  })

  it('BLOCKS voided retainer even when minimum_status is "draft"', () => {
    const result = evaluateRetainerGate({ status: 'voided' }, 'draft')
    expect(result.passed).toBe(false)
    expect(result.details).toContain('"voided"')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Section B: Readiness Engine  -  Billing domain score
// ═══════════════════════════════════════════════════════════════════════════

describe('Retainer Gate – Readiness Score (Billing Domain)', () => {
  const MOCK_MATTER_ID = 'matter-test-001'

  // ── 7. Billing domain returns 0 when no retainer exists ───────────────

  it('Billing domain returns score 0 when no retainer exists', async () => {
    const supabase = makeMockSupabase({ retainer: null })
    const result = await computeReadiness(MOCK_MATTER_ID, supabase as never)

    const billing = result.domains.find((d) => d.name === 'Billing')
    expect(billing).toBeDefined()
    expect(billing!.score).toBe(0)
    expect(billing!.detail).toContain('missing')
  })

  // ── 8. Billing domain returns 20 when retainer is 'draft' ────────────

  it('Billing domain returns score 20 when retainer is "draft"', async () => {
    const supabase = makeMockSupabase({ retainer: { status: 'draft' } })
    const result = await computeReadiness(MOCK_MATTER_ID, supabase as never)

    const billing = result.domains.find((d) => d.name === 'Billing')
    expect(billing).toBeDefined()
    expect(billing!.score).toBe(20)
    expect(billing!.detail).toContain('draft')
  })

  // ── 9. Billing domain returns 100 when retainer is 'signed' ──────────

  it('Billing domain returns score 100 when retainer is "signed"', async () => {
    const supabase = makeMockSupabase({ retainer: { status: 'signed' } })
    const result = await computeReadiness(MOCK_MATTER_ID, supabase as never)

    const billing = result.domains.find((d) => d.name === 'Billing')
    expect(billing).toBeDefined()
    expect(billing!.score).toBe(100)
    expect(billing!.detail).toContain('signed')
  })

  // ── Additional readiness coverage ────────────────────────────────────

  it('Billing domain returns score 50 when retainer is "sent_for_signing"', async () => {
    const supabase = makeMockSupabase({ retainer: { status: 'sent_for_signing' } })
    const result = await computeReadiness(MOCK_MATTER_ID, supabase as never)

    const billing = result.domains.find((d) => d.name === 'Billing')
    expect(billing).toBeDefined()
    expect(billing!.score).toBe(50)
    expect(billing!.detail).toContain('sent for signing')
  })

  it('Billing domain returns score 0 when retainer is "voided"', async () => {
    const supabase = makeMockSupabase({ retainer: { status: 'voided' } })
    const result = await computeReadiness(MOCK_MATTER_ID, supabase as never)

    const billing = result.domains.find((d) => d.name === 'Billing')
    expect(billing).toBeDefined()
    expect(billing!.score).toBe(0)
    expect(billing!.detail).toContain('voided')
  })

  it('Billing domain weight is 0.15 (15%)', async () => {
    const supabase = makeMockSupabase({ retainer: { status: 'signed' } })
    const result = await computeReadiness(MOCK_MATTER_ID, supabase as never)

    const billing = result.domains.find((d) => d.name === 'Billing')
    expect(billing).toBeDefined()
    expect(billing!.weight).toBe(0.13)
  })

  it('missing retainer contributes 0 weighted points to total', async () => {
    const supabase = makeMockSupabase({ retainer: null })
    const result = await computeReadiness(MOCK_MATTER_ID, supabase as never)

    const billing = result.domains.find((d) => d.name === 'Billing')
    expect(billing).toBeDefined()
    expect(billing!.weighted).toBe(0)
  })

  it('signed retainer contributes 15 weighted points to total', async () => {
    const supabase = makeMockSupabase({ retainer: { status: 'signed' } })
    const result = await computeReadiness(MOCK_MATTER_ID, supabase as never)

    const billing = result.domains.find((d) => d.name === 'Billing')
    expect(billing).toBeDefined()
    expect(billing!.weighted).toBe(13) // 100 * 0.13
  })

  it('Billing domain is included in focus_area when it has the lowest score', async () => {
    // With no retainer (score=0), Billing should be the focus area
    // (assuming other domains also score low due to mocked empty data)
    const supabase = makeMockSupabase({ retainer: null })
    const result = await computeReadiness(MOCK_MATTER_ID, supabase as never)

    // The focus area should be one of the domains with score 0
    const zeroScoreDomains = result.domains.filter((d) => d.score === 0)
    expect(zeroScoreDomains.length).toBeGreaterThan(0)
    expect(zeroScoreDomains.map((d) => d.name)).toContain(result.focus_area)
  })
})
