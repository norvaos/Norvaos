/**
 * Tests for lib/services/deficiency-engine.ts
 *
 * Covers:
 *   validateDeficiencyCreate  -  required fields, min lengths, valid enum values
 *   shouldSetChronicFlag  -  threshold at 3
 *   hasBlockingDeficiencies  -  open / in_progress / reopened vs resolved / closed
 *   computeReopenTransition  -  counter increment, chronic trigger, timestamps
 *   computeResolveTransition  -  status and timestamp correctness
 *
 * Sprint 6, Week 1  -  2026-03-17
 */

import { describe, it, expect } from 'vitest'
import {
  validateDeficiencyCreate,
  shouldSetChronicFlag,
  hasBlockingDeficiencies,
  computeReopenTransition,
  computeResolveTransition,
  type DeficiencyCreateInput,
} from '../deficiency-engine'
import type { MatterDeficiencyRow } from '@/lib/types/database'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeValidInput(overrides?: Partial<DeficiencyCreateInput>): DeficiencyCreateInput {
  return {
    matter_id: 'matter-uuid-001',
    severity: 'minor',
    category: 'document_quality',
    description: 'This is a sufficiently long description that exceeds the minimum requirement.',
    ...overrides,
  }
}

function makeDeficiency(overrides?: Partial<MatterDeficiencyRow>): MatterDeficiencyRow {
  return {
    id: 'def-001',
    tenant_id: 'tenant-001',
    matter_id: 'matter-001',
    stage_id: null,
    created_by: 'user-001',
    assigned_to_user_id: null,
    severity: 'minor',
    category: 'document_quality',
    description: 'A deficiency description that is long enough to satisfy the minimum.',
    status: 'open',
    reopen_count: 0,
    chronic_flag: false,
    resolution_notes: null,
    resolution_evidence_path: null,
    resolved_at: null,
    resolved_by: null,
    reopened_at: null,
    reopened_by: null,
    chronic_escalated_at: null,
    chronic_escalated_to: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  }
}

// ─── validateDeficiencyCreate ─────────────────────────────────────────────────

describe('validateDeficiencyCreate', () => {
  it('returns valid for correct input', () => {
    const result = validateDeficiencyCreate(makeValidInput())
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('returns invalid when description is less than 50 characters', () => {
    const result = validateDeficiencyCreate(makeValidInput({ description: 'Too short.' }))
    expect(result.valid).toBe(false)
    const err = result.errors.find((e) => e.field === 'description')
    expect(err).toBeDefined()
    expect(err!.message).toMatch(/50/)
  })

  it('returns invalid when description is exactly 49 characters', () => {
    const fortyNineChars = 'a'.repeat(49)
    const result = validateDeficiencyCreate(makeValidInput({ description: fortyNineChars }))
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.field === 'description')).toBe(true)
  })

  it('returns valid when description is exactly 50 characters', () => {
    const fiftyChars = 'a'.repeat(50)
    const result = validateDeficiencyCreate(makeValidInput({ description: fiftyChars }))
    expect(result.valid).toBe(true)
  })

  it('returns invalid when severity is not a valid value', () => {
    const result = validateDeficiencyCreate(
      makeValidInput({ severity: 'extreme' as 'minor' }),
    )
    expect(result.valid).toBe(false)
    const err = result.errors.find((e) => e.field === 'severity')
    expect(err).toBeDefined()
    expect(err!.message).toMatch(/minor|major|critical/)
  })

  it('returns invalid when category is empty string', () => {
    const result = validateDeficiencyCreate(makeValidInput({ category: '' }))
    expect(result.valid).toBe(false)
    const err = result.errors.find((e) => e.field === 'category')
    expect(err).toBeDefined()
    expect(err!.message).toMatch(/required/)
  })

  it('returns invalid when category is whitespace only', () => {
    const result = validateDeficiencyCreate(makeValidInput({ category: '   ' }))
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.field === 'category')).toBe(true)
  })

  it('accumulates multiple errors when multiple fields fail', () => {
    const result = validateDeficiencyCreate(
      makeValidInput({ description: 'short', category: '', severity: 'bad' as 'minor' }),
    )
    expect(result.valid).toBe(false)
    expect(result.errors.length).toBeGreaterThanOrEqual(3)
  })
})

// ─── shouldSetChronicFlag ─────────────────────────────────────────────────────

describe('shouldSetChronicFlag', () => {
  it('returns false for reopen_count of 0', () => {
    expect(shouldSetChronicFlag(0)).toBe(false)
  })

  it('returns false for reopen_count of 1', () => {
    expect(shouldSetChronicFlag(1)).toBe(false)
  })

  it('returns false for reopen_count of 2', () => {
    expect(shouldSetChronicFlag(2)).toBe(false)
  })

  it('returns true for reopen_count of 3', () => {
    expect(shouldSetChronicFlag(3)).toBe(true)
  })

  it('returns true for reopen_count greater than 3', () => {
    expect(shouldSetChronicFlag(4)).toBe(true)
    expect(shouldSetChronicFlag(10)).toBe(true)
    expect(shouldSetChronicFlag(100)).toBe(true)
  })
})

// ─── hasBlockingDeficiencies ──────────────────────────────────────────────────

describe('hasBlockingDeficiencies', () => {
  it('returns false when the array is empty', () => {
    expect(hasBlockingDeficiencies([])).toBe(false)
  })

  it('returns false when all deficiencies are resolved', () => {
    const defs = [
      makeDeficiency({ status: 'resolved' }),
      makeDeficiency({ status: 'resolved' }),
    ]
    expect(hasBlockingDeficiencies(defs)).toBe(false)
  })

  it('returns false when all deficiencies are closed', () => {
    const defs = [
      makeDeficiency({ status: 'closed' }),
      makeDeficiency({ status: 'closed' }),
    ]
    expect(hasBlockingDeficiencies(defs)).toBe(false)
  })

  it('returns false when mix of resolved and closed', () => {
    const defs = [
      makeDeficiency({ status: 'resolved' }),
      makeDeficiency({ status: 'closed' }),
    ]
    expect(hasBlockingDeficiencies(defs)).toBe(false)
  })

  it('returns true when any deficiency is open', () => {
    const defs = [
      makeDeficiency({ status: 'resolved' }),
      makeDeficiency({ status: 'open' }),
    ]
    expect(hasBlockingDeficiencies(defs)).toBe(true)
  })

  it('returns true when any deficiency is in_progress', () => {
    const defs = [
      makeDeficiency({ status: 'resolved' }),
      makeDeficiency({ status: 'in_progress' }),
    ]
    expect(hasBlockingDeficiencies(defs)).toBe(true)
  })

  it('returns true when any deficiency is reopened', () => {
    const defs = [
      makeDeficiency({ status: 'resolved' }),
      makeDeficiency({ status: 'reopened' }),
    ]
    expect(hasBlockingDeficiencies(defs)).toBe(true)
  })

  it('returns true when only one deficiency exists and it is open', () => {
    expect(hasBlockingDeficiencies([makeDeficiency({ status: 'open' })])).toBe(true)
  })
})

// ─── computeReopenTransition ──────────────────────────────────────────────────

describe('computeReopenTransition', () => {
  it('increments reopen_count by 1', () => {
    const def = makeDeficiency({ reopen_count: 0 })
    const result = computeReopenTransition(def, 'user-reopener')
    expect(result.newReopenCount).toBe(1)
  })

  it('increments reopen_count correctly from non-zero', () => {
    const def = makeDeficiency({ reopen_count: 2 })
    const result = computeReopenTransition(def, 'user-reopener')
    expect(result.newReopenCount).toBe(3)
  })

  it('sets status to reopened', () => {
    const def = makeDeficiency({ status: 'resolved', reopen_count: 0 })
    const result = computeReopenTransition(def, 'user-reopener')
    expect(result.newStatus).toBe('reopened')
  })

  it('sets chronic_flag to false when new reopen_count is below 3', () => {
    const def = makeDeficiency({ reopen_count: 1 })
    const result = computeReopenTransition(def, 'user-reopener')
    expect(result.newReopenCount).toBe(2)
    expect(result.chronicFlag).toBe(false)
  })

  it('sets chronic_flag when new reopen_count reaches 3', () => {
    const def = makeDeficiency({ reopen_count: 2 })
    const result = computeReopenTransition(def, 'user-reopener')
    expect(result.newReopenCount).toBe(3)
    expect(result.chronicFlag).toBe(true)
  })

  it('keeps chronic_flag true when already beyond 3', () => {
    const def = makeDeficiency({ reopen_count: 5 })
    const result = computeReopenTransition(def, 'user-reopener')
    expect(result.newReopenCount).toBe(6)
    expect(result.chronicFlag).toBe(true)
  })

  it('sets reopened_at to an ISO timestamp within 5 seconds of now', () => {
    const before = Date.now()
    const def = makeDeficiency({ reopen_count: 0 })
    const result = computeReopenTransition(def, 'user-reopener')
    const after = Date.now()

    const ts = new Date(result.reopenedAt).getTime()
    expect(ts).toBeGreaterThanOrEqual(before)
    expect(ts).toBeLessThanOrEqual(after + 5000)
  })
})

// ─── computeResolveTransition ─────────────────────────────────────────────────

describe('computeResolveTransition', () => {
  it('sets status to resolved', () => {
    const def = makeDeficiency({ status: 'open' })
    const result = computeResolveTransition(def, {
      resolution_notes: 'This has been corrected by uploading the correct document.',
    })
    expect(result.newStatus).toBe('resolved')
  })

  it('sets resolved_at to an ISO timestamp within 5 seconds of now', () => {
    const before = Date.now()
    const def = makeDeficiency({ status: 'open' })
    const result = computeResolveTransition(def, {
      resolution_notes: 'Resolved after client submitted corrected documentation.',
    })
    const after = Date.now()

    const ts = new Date(result.resolvedAt).getTime()
    expect(ts).toBeGreaterThanOrEqual(before)
    expect(ts).toBeLessThanOrEqual(after + 5000)
  })

  it('works regardless of current status', () => {
    for (const status of ['open', 'in_progress', 'reopened'] as const) {
      const def = makeDeficiency({ status })
      const result = computeResolveTransition(def, {
        resolution_notes: 'Resolved after receiving the corrected information from the client.',
      })
      expect(result.newStatus).toBe('resolved')
    }
  })
})
