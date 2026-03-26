/**
 * Tests for the Checklist Engine.
 *
 * Covers: calculateCompletionScore()
 *  -  empty list, all-required, mixed required/optional, status branches
 *   (approved, not_applicable, pending, received, rejected),
 *   zero-required-but-items-exist, rounding, missingRequired names.
 */

import { describe, it, expect } from 'vitest'
import {
  calculateCompletionScore,
  type ChecklistScore,
} from '../checklist-engine'
import type { Database } from '@/lib/types/database'

type MatterChecklistItem = Database['public']['Tables']['matter_checklist_items']['Row']

// ── Test Fixtures ────────────────────────────────────────────────────────────

function makeItem(overrides: Partial<MatterChecklistItem> = {}): MatterChecklistItem {
  return {
    id: crypto.randomUUID(),
    tenant_id: 'tenant-1',
    matter_id: 'matter-1',
    checklist_template_id: null,
    document_name: 'Generic Document',
    document_id: null,
    description: null,
    category: 'general',
    is_required: true,
    is_custom: false,
    status: 'pending',
    sort_order: 0,
    notes: null,
    requested_at: null,
    received_at: null,
    approved_at: null,
    approved_by: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  }
}

// ── calculateCompletionScore ─────────────────────────────────────────────────

describe('calculateCompletionScore', () => {
  // ── Empty list branch ────────────────────────────────────────────────────

  it('returns 100% complete for an empty item list', () => {
    const score = calculateCompletionScore([])
    expect(score).toEqual<ChecklistScore>({
      total: 0,
      required: 0,
      requiredApproved: 0,
      completionPercent: 100,
      isComplete: true,
      missingRequired: [],
    })
  })

  // ── All required, all approved ───────────────────────────────────────────

  it('returns 100% when all required items are approved', () => {
    const items = [
      makeItem({ document_name: 'Passport', is_required: true, status: 'approved' }),
      makeItem({ document_name: 'Photo', is_required: true, status: 'approved' }),
    ]
    const score = calculateCompletionScore(items)
    expect(score.total).toBe(2)
    expect(score.required).toBe(2)
    expect(score.requiredApproved).toBe(2)
    expect(score.completionPercent).toBe(100)
    expect(score.isComplete).toBe(true)
    expect(score.missingRequired).toEqual([])
  })

  // ── not_applicable counts as approved ────────────────────────────────────

  it('treats not_applicable as approved for required items', () => {
    const items = [
      makeItem({ document_name: 'Passport', is_required: true, status: 'not_applicable' }),
      makeItem({ document_name: 'Photo', is_required: true, status: 'approved' }),
    ]
    const score = calculateCompletionScore(items)
    expect(score.requiredApproved).toBe(2)
    expect(score.completionPercent).toBe(100)
    expect(score.isComplete).toBe(true)
    expect(score.missingRequired).toEqual([])
  })

  // ── All required, none approved ──────────────────────────────────────────

  it('returns 0% when no required items are approved', () => {
    const items = [
      makeItem({ document_name: 'Passport', is_required: true, status: 'pending' }),
      makeItem({ document_name: 'Photo', is_required: true, status: 'pending' }),
    ]
    const score = calculateCompletionScore(items)
    expect(score.requiredApproved).toBe(0)
    expect(score.completionPercent).toBe(0)
    expect(score.isComplete).toBe(false)
    expect(score.missingRequired).toEqual(['Passport', 'Photo'])
  })

  // ── Partial completion ───────────────────────────────────────────────────

  it('calculates correct percentage for partial completion', () => {
    const items = [
      makeItem({ document_name: 'Passport', is_required: true, status: 'approved' }),
      makeItem({ document_name: 'Photo', is_required: true, status: 'pending' }),
      makeItem({ document_name: 'Birth Cert', is_required: true, status: 'pending' }),
    ]
    const score = calculateCompletionScore(items)
    expect(score.required).toBe(3)
    expect(score.requiredApproved).toBe(1)
    expect(score.completionPercent).toBe(33) // Math.round(1/3 * 100) = 33
    expect(score.isComplete).toBe(false)
    expect(score.missingRequired).toEqual(['Photo', 'Birth Cert'])
  })

  // ── Rounding: 2 of 3 = 67% ──────────────────────────────────────────────

  it('rounds percentage correctly (2/3 => 67)', () => {
    const items = [
      makeItem({ is_required: true, status: 'approved' }),
      makeItem({ is_required: true, status: 'approved' }),
      makeItem({ document_name: 'Missing', is_required: true, status: 'pending' }),
    ]
    const score = calculateCompletionScore(items)
    expect(score.completionPercent).toBe(67)
  })

  // ── Optional-only items (no required) ────────────────────────────────────

  it('returns 100% when all items are optional (zero required)', () => {
    const items = [
      makeItem({ document_name: 'Cover Letter', is_required: false, status: 'pending' }),
      makeItem({ document_name: 'References', is_required: false, status: 'pending' }),
    ]
    const score = calculateCompletionScore(items)
    expect(score.total).toBe(2)
    expect(score.required).toBe(0)
    expect(score.requiredApproved).toBe(0)
    expect(score.completionPercent).toBe(100)
    expect(score.isComplete).toBe(true)
    expect(score.missingRequired).toEqual([])
  })

  // ── Mixed required and optional ──────────────────────────────────────────

  it('ignores optional items for completion calculation', () => {
    const items = [
      makeItem({ document_name: 'Passport', is_required: true, status: 'approved' }),
      makeItem({ document_name: 'Cover Letter', is_required: false, status: 'pending' }),
      makeItem({ document_name: 'Photo', is_required: true, status: 'pending' }),
    ]
    const score = calculateCompletionScore(items)
    expect(score.total).toBe(3)
    expect(score.required).toBe(2)
    expect(score.requiredApproved).toBe(1)
    expect(score.completionPercent).toBe(50)
    expect(score.isComplete).toBe(false)
    expect(score.missingRequired).toEqual(['Photo'])
  })

  // ── Various non-approved statuses count as missing ───────────────────────

  it.each([
    'pending',
    'received',
    'rejected',
    'requested',
  ])('status "%s" counts as missing for required items', (status) => {
    const items = [
      makeItem({ document_name: 'Doc A', is_required: true, status }),
    ]
    const score = calculateCompletionScore(items)
    expect(score.isComplete).toBe(false)
    expect(score.missingRequired).toEqual(['Doc A'])
  })

  // ── Only approved and not_applicable clear required ──────────────────────

  it.each(['approved', 'not_applicable'])(
    'status "%s" clears a required item',
    (status) => {
      const items = [
        makeItem({ document_name: 'Doc A', is_required: true, status }),
      ]
      const score = calculateCompletionScore(items)
      expect(score.isComplete).toBe(true)
      expect(score.missingRequired).toEqual([])
      expect(score.requiredApproved).toBe(1)
    },
  )

  // ── Single required item ─────────────────────────────────────────────────

  it('handles a single required approved item', () => {
    const items = [makeItem({ is_required: true, status: 'approved' })]
    const score = calculateCompletionScore(items)
    expect(score.total).toBe(1)
    expect(score.required).toBe(1)
    expect(score.requiredApproved).toBe(1)
    expect(score.completionPercent).toBe(100)
    expect(score.isComplete).toBe(true)
  })

  it('handles a single required pending item', () => {
    const items = [makeItem({ document_name: 'Only Doc', is_required: true, status: 'pending' })]
    const score = calculateCompletionScore(items)
    expect(score.completionPercent).toBe(0)
    expect(score.isComplete).toBe(false)
    expect(score.missingRequired).toEqual(['Only Doc'])
  })

  // ── Large list ───────────────────────────────────────────────────────────

  it('handles a large list of items correctly', () => {
    const items: MatterChecklistItem[] = []
    for (let i = 0; i < 100; i++) {
      items.push(
        makeItem({
          document_name: `Doc ${i}`,
          is_required: true,
          status: i < 75 ? 'approved' : 'pending',
        }),
      )
    }
    const score = calculateCompletionScore(items)
    expect(score.total).toBe(100)
    expect(score.required).toBe(100)
    expect(score.requiredApproved).toBe(75)
    expect(score.completionPercent).toBe(75)
    expect(score.isComplete).toBe(false)
    expect(score.missingRequired).toHaveLength(25)
  })

  // ── missingRequired preserves document_name ──────────────────────────────

  it('populates missingRequired with correct document_name values', () => {
    const items = [
      makeItem({ document_name: 'Police Clearance', is_required: true, status: 'pending' }),
      makeItem({ document_name: 'Medical Exam', is_required: true, status: 'received' }),
      makeItem({ document_name: 'Passport', is_required: true, status: 'approved' }),
    ]
    const score = calculateCompletionScore(items)
    expect(score.missingRequired).toEqual(['Police Clearance', 'Medical Exam'])
  })

  // ── Mix of not_applicable and approved ───────────────────────────────────

  it('counts a mix of approved and not_applicable as fully complete', () => {
    const items = [
      makeItem({ is_required: true, status: 'approved' }),
      makeItem({ is_required: true, status: 'not_applicable' }),
      makeItem({ is_required: true, status: 'approved' }),
      makeItem({ is_required: true, status: 'not_applicable' }),
    ]
    const score = calculateCompletionScore(items)
    expect(score.requiredApproved).toBe(4)
    expect(score.completionPercent).toBe(100)
    expect(score.isComplete).toBe(true)
  })

  // ── Single optional item ─────────────────────────────────────────────────

  it('single optional pending item yields 100% complete', () => {
    const items = [makeItem({ is_required: false, status: 'pending' })]
    const score = calculateCompletionScore(items)
    expect(score.total).toBe(1)
    expect(score.required).toBe(0)
    expect(score.completionPercent).toBe(100)
    expect(score.isComplete).toBe(true)
  })
})
