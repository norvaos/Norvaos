/**
 * Tests for the Document Engine  -  Condition Evaluator
 *
 * Covers:
 *   - evaluateAllConditions(): batch evaluation
 *   - evaluateConditionsDetailed(): audit-ready detailed results
 *   - shouldInclude(): condition-gated inclusion logic
 *   - All 10 operators: equals, not_equals, is_empty, is_not_empty,
 *     greater_than, less_than, contains, in_list, truthy, falsy
 *   - AND / OR logic operators
 *   - Edge cases: missing fields, empty rules, raw array format
 */

import { describe, it, expect } from 'vitest'
import {
  evaluateAllConditions,
  evaluateConditionsDetailed,
  shouldInclude,
} from '../condition-evaluator'
import type { DocumentTemplateConditionRow } from '@/lib/types/database'

// ── Test Fixtures ────────────────────────────────────────────────────────────

function makeCondition(
  overrides?: Partial<DocumentTemplateConditionRow>
): DocumentTemplateConditionRow {
  return {
    id: 'cond-1',
    tenant_id: 'tenant-1',
    template_version_id: 'version-1',
    condition_key: 'show_flat_fee',
    label: 'Show if flat fee',
    rules: {
      rules: [
        { field_key: 'billing_type', operator: 'equals', value: 'flat_fee' },
      ],
    },
    logic_operator: 'AND',
    evaluation_order: 0,
    created_at: new Date().toISOString(),
    ...overrides,
  } as DocumentTemplateConditionRow
}

// ── Operator Tests ───────────────────────────────────────────────────────────

describe('evaluateAllConditions  -  operators', () => {
  it('equals  -  passes when values match', () => {
    const conditions = [makeCondition()]
    const fields = { billing_type: 'flat_fee' }
    const results = evaluateAllConditions(conditions, fields)

    expect(results.get('show_flat_fee')).toBe(true)
  })

  it('equals  -  fails when values differ', () => {
    const conditions = [makeCondition()]
    const fields = { billing_type: 'hourly' }
    const results = evaluateAllConditions(conditions, fields)

    expect(results.get('show_flat_fee')).toBe(false)
  })

  it('not_equals  -  passes when values differ', () => {
    const conditions = [makeCondition({
      condition_key: 'not_hourly',
      rules: { rules: [{ field_key: 'billing_type', operator: 'not_equals', value: 'hourly' }] },
    })]
    const fields = { billing_type: 'flat_fee' }
    const results = evaluateAllConditions(conditions, fields)

    expect(results.get('not_hourly')).toBe(true)
  })

  it('is_empty  -  passes when field is null', () => {
    const conditions = [makeCondition({
      condition_key: 'no_notes',
      rules: { rules: [{ field_key: 'notes', operator: 'is_empty' }] },
    })]
    const results = evaluateAllConditions(conditions, {})

    expect(results.get('no_notes')).toBe(true)
  })

  it('is_empty  -  passes when field is empty string', () => {
    const conditions = [makeCondition({
      condition_key: 'no_notes',
      rules: { rules: [{ field_key: 'notes', operator: 'is_empty' }] },
    })]
    const results = evaluateAllConditions(conditions, { notes: '' })

    expect(results.get('no_notes')).toBe(true)
  })

  it('is_not_empty  -  passes when field has value', () => {
    const conditions = [makeCondition({
      condition_key: 'has_notes',
      rules: { rules: [{ field_key: 'notes', operator: 'is_not_empty' }] },
    })]
    const results = evaluateAllConditions(conditions, { notes: 'Some notes' })

    expect(results.get('has_notes')).toBe(true)
  })

  it('greater_than  -  passes when actual > expected', () => {
    const conditions = [makeCondition({
      condition_key: 'high_value',
      rules: { rules: [{ field_key: 'amount', operator: 'greater_than', value: 1000 }] },
    })]
    const results = evaluateAllConditions(conditions, { amount: '5000' })

    expect(results.get('high_value')).toBe(true)
  })

  it('greater_than  -  fails when actual <= expected', () => {
    const conditions = [makeCondition({
      condition_key: 'high_value',
      rules: { rules: [{ field_key: 'amount', operator: 'greater_than', value: 1000 }] },
    })]
    const results = evaluateAllConditions(conditions, { amount: '500' })

    expect(results.get('high_value')).toBe(false)
  })

  it('less_than  -  passes when actual < expected', () => {
    const conditions = [makeCondition({
      condition_key: 'low_value',
      rules: { rules: [{ field_key: 'amount', operator: 'less_than', value: 1000 }] },
    })]
    const results = evaluateAllConditions(conditions, { amount: '500' })

    expect(results.get('low_value')).toBe(true)
  })

  it('contains  -  passes when substring found (case-insensitive)', () => {
    const conditions = [makeCondition({
      condition_key: 'has_immigration',
      rules: { rules: [{ field_key: 'practice_area', operator: 'contains', value: 'IMMIG' }] },
    })]
    const results = evaluateAllConditions(conditions, { practice_area: 'immigration' })

    expect(results.get('has_immigration')).toBe(true)
  })

  it('in_list  -  passes when value is in the list', () => {
    const conditions = [makeCondition({
      condition_key: 'is_immigration_or_family',
      rules: { rules: [{ field_key: 'practice_area', operator: 'in_list', value: ['immigration', 'family'] }] },
    })]
    const results = evaluateAllConditions(conditions, { practice_area: 'immigration' })

    expect(results.get('is_immigration_or_family')).toBe(true)
  })

  it('in_list  -  fails when value is not in the list', () => {
    const conditions = [makeCondition({
      condition_key: 'is_immigration_or_family',
      rules: { rules: [{ field_key: 'practice_area', operator: 'in_list', value: ['immigration', 'family'] }] },
    })]
    const results = evaluateAllConditions(conditions, { practice_area: 'criminal' })

    expect(results.get('is_immigration_or_family')).toBe(false)
  })

  it('truthy  -  passes for non-empty, non-zero, non-false values', () => {
    const conditions = [makeCondition({
      condition_key: 'has_retainer',
      rules: { rules: [{ field_key: 'has_retainer', operator: 'truthy' }] },
    })]
    const results = evaluateAllConditions(conditions, { has_retainer: 'yes' })

    expect(results.get('has_retainer')).toBe(true)
  })

  it('truthy  -  fails for "false" string', () => {
    const conditions = [makeCondition({
      condition_key: 'has_retainer',
      rules: { rules: [{ field_key: 'has_retainer', operator: 'truthy' }] },
    })]
    const results = evaluateAllConditions(conditions, { has_retainer: 'false' })

    expect(results.get('has_retainer')).toBe(false)
  })

  it('falsy  -  passes for null/empty/0/false', () => {
    const conditions = [makeCondition({
      condition_key: 'no_retainer',
      rules: { rules: [{ field_key: 'has_retainer', operator: 'falsy' }] },
    })]

    // null (missing field)
    expect(evaluateAllConditions(conditions, {}).get('no_retainer')).toBe(true)
    // empty string
    expect(evaluateAllConditions(conditions, { has_retainer: '' }).get('no_retainer')).toBe(true)
    // zero
    expect(evaluateAllConditions(conditions, { has_retainer: '0' }).get('no_retainer')).toBe(true)
    // false string
    expect(evaluateAllConditions(conditions, { has_retainer: 'false' }).get('no_retainer')).toBe(true)
  })
})

// ── Logic Operators ──────────────────────────────────────────────────────────

describe('evaluateAllConditions  -  logic operators', () => {
  it('AND  -  passes only when all rules pass', () => {
    const conditions = [makeCondition({
      condition_key: 'flat_fee_and_immigration',
      logic_operator: 'AND',
      rules: {
        rules: [
          { field_key: 'billing_type', operator: 'equals', value: 'flat_fee' },
          { field_key: 'practice_area', operator: 'equals', value: 'immigration' },
        ],
      },
    })]

    // Both pass
    expect(
      evaluateAllConditions(conditions, { billing_type: 'flat_fee', practice_area: 'immigration' })
        .get('flat_fee_and_immigration')
    ).toBe(true)

    // One fails
    expect(
      evaluateAllConditions(conditions, { billing_type: 'flat_fee', practice_area: 'family' })
        .get('flat_fee_and_immigration')
    ).toBe(false)
  })

  it('OR  -  passes when any rule passes', () => {
    const conditions = [makeCondition({
      condition_key: 'flat_or_block',
      logic_operator: 'OR',
      rules: {
        rules: [
          { field_key: 'billing_type', operator: 'equals', value: 'flat_fee' },
          { field_key: 'billing_type', operator: 'equals', value: 'block_fee' },
        ],
      },
    })]

    expect(
      evaluateAllConditions(conditions, { billing_type: 'flat_fee' }).get('flat_or_block')
    ).toBe(true)

    expect(
      evaluateAllConditions(conditions, { billing_type: 'block_fee' }).get('flat_or_block')
    ).toBe(true)

    expect(
      evaluateAllConditions(conditions, { billing_type: 'hourly' }).get('flat_or_block')
    ).toBe(false)
  })
})

// ── Edge Cases ───────────────────────────────────────────────────────────────

describe('evaluateAllConditions  -  edge cases', () => {
  it('handles empty rules array', () => {
    const conditions = [makeCondition({
      condition_key: 'empty_rules',
      rules: { rules: [] },
      logic_operator: 'AND',
    })]
    // AND with no rules → every() returns true for empty array
    expect(evaluateAllConditions(conditions, {}).get('empty_rules')).toBe(true)
  })

  it('handles raw array rules format', () => {
    const conditions = [makeCondition({
      condition_key: 'raw_array',
      rules: [{ field_key: 'billing_type', operator: 'equals', value: 'flat_fee' }] as unknown,
    })]
    const results = evaluateAllConditions(conditions, { billing_type: 'flat_fee' })
    expect(results.get('raw_array')).toBe(true)
  })

  it('handles invalid rules (null)', () => {
    const conditions = [makeCondition({
      condition_key: 'null_rules',
      rules: null as unknown,
    })]
    // Should not throw, empty rules → AND over empty → true
    expect(evaluateAllConditions(conditions, {}).get('null_rules')).toBe(true)
  })

  it('greater_than fails gracefully for non-numeric values', () => {
    const conditions = [makeCondition({
      condition_key: 'non_numeric',
      rules: { rules: [{ field_key: 'amount', operator: 'greater_than', value: 1000 }] },
    })]
    const results = evaluateAllConditions(conditions, { amount: 'not-a-number' })
    expect(results.get('non_numeric')).toBe(false)
  })

  it('evaluates multiple conditions independently', () => {
    const conditions = [
      makeCondition({ condition_key: 'cond_a', evaluation_order: 0 }),
      makeCondition({
        id: 'cond-2',
        condition_key: 'cond_b',
        evaluation_order: 1,
        rules: { rules: [{ field_key: 'billing_type', operator: 'equals', value: 'hourly' }] },
      }),
    ]
    const results = evaluateAllConditions(conditions, { billing_type: 'flat_fee' })
    expect(results.get('cond_a')).toBe(true)
    expect(results.get('cond_b')).toBe(false)
  })
})

// ── evaluateConditionsDetailed ───────────────────────────────────────────────

describe('evaluateConditionsDetailed', () => {
  it('returns detailed rule results for audit', () => {
    const conditions = [makeCondition()]
    const results = evaluateConditionsDetailed(conditions, { billing_type: 'flat_fee' })

    expect(results).toHaveLength(1)
    expect(results[0].condition_key).toBe('show_flat_fee')
    expect(results[0].result).toBe(true)
    expect(results[0].logic_operator).toBe('AND')
    expect(results[0].rule_results).toHaveLength(1)
    expect(results[0].rule_results[0]).toEqual({
      field_key: 'billing_type',
      operator: 'equals',
      expected_value: 'flat_fee',
      actual_value: 'flat_fee',
      passed: true,
    })
  })

  it('shows actual_value as null for missing fields', () => {
    const conditions = [makeCondition()]
    const results = evaluateConditionsDetailed(conditions, {})

    expect(results[0].rule_results[0].actual_value).toBeNull()
    expect(results[0].rule_results[0].passed).toBe(false)
  })
})

// ── shouldInclude ────────────────────────────────────────────────────────────

describe('shouldInclude', () => {
  it('returns true when condition_key is null', () => {
    expect(shouldInclude(null, new Map())).toBe(true)
  })

  it('returns true when condition_key is undefined', () => {
    expect(shouldInclude(undefined, new Map())).toBe(true)
  })

  it('returns true when condition evaluated to true', () => {
    const results = new Map([['show_flat_fee', true]])
    expect(shouldInclude('show_flat_fee', results)).toBe(true)
  })

  it('returns false when condition evaluated to false', () => {
    const results = new Map([['show_flat_fee', false]])
    expect(shouldInclude('show_flat_fee', results)).toBe(false)
  })

  it('returns false (fail-closed) when condition_key not in results', () => {
    expect(shouldInclude('unknown_condition', new Map())).toBe(false)
  })
})
