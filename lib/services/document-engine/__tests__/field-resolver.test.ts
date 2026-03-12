/**
 * Tests for the Document Engine — Field Resolver
 *
 * Covers:
 *   - resolveFields(): full resolution pipeline
 *   - getNestedValue(): dot-notation traversal
 *   - applyTransform(): formatting transforms
 *   - substituteFields(): placeholder substitution
 *   - buildFieldMap(): resolved fields → lookup map
 *   - findMissingRequiredFields(): required field validation
 */

import { describe, it, expect } from 'vitest'
import {
  resolveFields,
  getNestedValue,
  applyTransform,
  substituteFields,
  buildFieldMap,
  findMissingRequiredFields,
} from '../field-resolver'
import type { DocumentTemplateMappingRow } from '@/lib/types/database'
import type { FieldResolutionContext } from '@/lib/types/document-engine'

// ── Test Fixtures ────────────────────────────────────────────────────────────

function makeContext(overrides?: Partial<FieldResolutionContext>): FieldResolutionContext {
  return {
    matter: {
      title: 'Smith v. Jones',
      practice_area: 'immigration',
      file_number: 'MAT-2024-001',
      address: { street: '123 Main St', city: 'Toronto', province: 'ON' },
    },
    contact: {
      full_name: 'John Smith',
      email: 'john@example.com',
      phone: '416-555-1234',
      email_secondary: 'john.alt@example.com',
    },
    billing: {
      billing_type: 'flat_fee',
      total_amount: 5000,
      professional_fees: 4000,
      hst_amount: 650,
    },
    tenant: {
      name: 'ABC Law Firm',
      firm_address: '456 Bay St, Toronto, ON',
      firm_phone: '416-555-9999',
    },
    lawyer: {
      full_name: 'Jane Lawyer',
      lso_number: '12345P',
    },
    customValues: {},
    ...overrides,
  }
}

function makeMapping(overrides?: Partial<DocumentTemplateMappingRow>): DocumentTemplateMappingRow {
  return {
    id: 'mapping-1',
    tenant_id: 'tenant-1',
    template_version_id: 'version-1',
    field_key: 'client_name',
    display_name: 'Client Name',
    source_entity: 'contact',
    source_path: 'full_name',
    field_type: 'text',
    is_required: false,
    default_value: null,
    format_rule: null,
    fallback_rule: null,
    sort_order: 0,
    created_at: new Date().toISOString(),
    ...overrides,
  } as DocumentTemplateMappingRow
}

// ── getNestedValue ───────────────────────────────────────────────────────────

describe('getNestedValue', () => {
  it('retrieves a top-level property', () => {
    expect(getNestedValue({ name: 'hello' }, 'name')).toBe('hello')
  })

  it('retrieves a nested property via dot notation', () => {
    const obj = { address: { city: 'Toronto' } }
    expect(getNestedValue(obj, 'address.city')).toBe('Toronto')
  })

  it('retrieves deeply nested property', () => {
    const obj = { a: { b: { c: { d: 'deep' } } } }
    expect(getNestedValue(obj, 'a.b.c.d')).toBe('deep')
  })

  it('returns undefined for missing path', () => {
    expect(getNestedValue({ name: 'hello' }, 'missing')).toBeUndefined()
  })

  it('returns undefined for partially valid path', () => {
    expect(getNestedValue({ a: { b: 'yes' } }, 'a.b.c')).toBeUndefined()
  })

  it('returns undefined for empty path', () => {
    expect(getNestedValue({ name: 'hello' }, '')).toBeUndefined()
  })

  it('handles null intermediate values', () => {
    expect(getNestedValue({ a: null } as Record<string, unknown>, 'a.b')).toBeUndefined()
  })
})

// ── applyTransform ───────────────────────────────────────────────────────────

describe('applyTransform', () => {
  it('returns value unchanged for "none" transform', () => {
    expect(applyTransform('hello world', 'none')).toBe('hello world')
  })

  it('converts to uppercase', () => {
    expect(applyTransform('hello world', 'uppercase')).toBe('HELLO WORLD')
  })

  it('converts to titlecase', () => {
    expect(applyTransform('john smith', 'titlecase')).toBe('John Smith')
  })

  it('formats currency', () => {
    const result = applyTransform('5000', 'currency')
    // Intl.NumberFormat for CAD — format varies by locale, check key parts
    expect(result).toContain('5,000.00')
  })

  it('returns original value for invalid currency input', () => {
    expect(applyTransform('not-a-number', 'currency')).toBe('not-a-number')
  })

  it('formats date_short as ISO date', () => {
    const result = applyTransform('2024-06-15T10:30:00Z', 'date_short')
    expect(result).toBe('2024-06-15')
  })

  it('returns original value for invalid date', () => {
    expect(applyTransform('not-a-date', 'date_long')).toBe('not-a-date')
  })

  it('returns value unchanged for unknown transform', () => {
    expect(applyTransform('hello', 'unknown_transform')).toBe('hello')
  })
})

// ── substituteFields ─────────────────────────────────────────────────────────

describe('substituteFields', () => {
  it('replaces a single placeholder', () => {
    const result = substituteFields('Hello {{client_name}}!', { client_name: 'John' })
    expect(result).toBe('Hello John!')
  })

  it('replaces multiple placeholders', () => {
    const result = substituteFields(
      '{{client_name}} hired {{lawyer_name}}.',
      { client_name: 'John', lawyer_name: 'Jane' }
    )
    expect(result).toBe('John hired Jane.')
  })

  it('leaves unresolved placeholders intact', () => {
    const result = substituteFields('Hello {{unknown_field}}!', {})
    expect(result).toBe('Hello {{unknown_field}}!')
  })

  it('handles placeholders with whitespace', () => {
    const result = substituteFields('Hello {{ client_name }}!', { client_name: 'John' })
    expect(result).toBe('Hello John!')
  })

  it('handles text with no placeholders', () => {
    const result = substituteFields('No placeholders here.', { client_name: 'John' })
    expect(result).toBe('No placeholders here.')
  })
})

// ── buildFieldMap ────────────────────────────────────────────────────────────

describe('buildFieldMap', () => {
  it('creates a lookup map from resolved fields', () => {
    const map = buildFieldMap([
      { field_key: 'a', display_name: 'A', resolved_value: 'val_a', source_entity: 'matter', source_path: 'a', was_empty: false, used_default: false, used_fallback: false },
      { field_key: 'b', display_name: 'B', resolved_value: 'val_b', source_entity: 'contact', source_path: 'b', was_empty: false, used_default: false, used_fallback: false },
    ])
    expect(map).toEqual({ a: 'val_a', b: 'val_b' })
  })

  it('returns empty map for empty array', () => {
    expect(buildFieldMap([])).toEqual({})
  })
})

// ── resolveFields ────────────────────────────────────────────────────────────

describe('resolveFields', () => {
  it('resolves a field from the contact entity', () => {
    const ctx = makeContext()
    const mappings = [makeMapping()]
    const result = resolveFields(mappings, ctx)

    expect(result).toHaveLength(1)
    expect(result[0].field_key).toBe('client_name')
    expect(result[0].resolved_value).toBe('John Smith')
    expect(result[0].was_empty).toBe(false)
  })

  it('resolves a field from the matter entity', () => {
    const ctx = makeContext()
    const mappings = [makeMapping({ field_key: 'matter_title', source_entity: 'matter', source_path: 'title' })]
    const result = resolveFields(mappings, ctx)

    expect(result[0].resolved_value).toBe('Smith v. Jones')
  })

  it('resolves a nested field', () => {
    const ctx = makeContext()
    const mappings = [makeMapping({ field_key: 'city', source_entity: 'matter', source_path: 'address.city' })]
    const result = resolveFields(mappings, ctx)

    expect(result[0].resolved_value).toBe('Toronto')
  })

  it('resolves a field from the tenant entity', () => {
    const ctx = makeContext()
    const mappings = [makeMapping({ field_key: 'firm_name', source_entity: 'tenant', source_path: 'name' })]
    const result = resolveFields(mappings, ctx)

    expect(result[0].resolved_value).toBe('ABC Law Firm')
  })

  it('resolves a field from the user (lawyer) entity', () => {
    const ctx = makeContext()
    const mappings = [makeMapping({ field_key: 'lawyer_name', source_entity: 'user', source_path: 'full_name' })]
    const result = resolveFields(mappings, ctx)

    expect(result[0].resolved_value).toBe('Jane Lawyer')
  })

  it('uses default value when field is empty', () => {
    const ctx = makeContext({ contact: { full_name: '' } })
    const mappings = [makeMapping({ default_value: 'Unknown Client' })]
    const result = resolveFields(mappings, ctx)

    expect(result[0].resolved_value).toBe('Unknown Client')
    expect(result[0].used_default).toBe(true)
    expect(result[0].was_empty).toBe(false)
  })

  it('marks field as empty when no value and no default', () => {
    const ctx = makeContext({ contact: {} })
    const mappings = [makeMapping()]
    const result = resolveFields(mappings, ctx)

    expect(result[0].resolved_value).toBe('')
    expect(result[0].was_empty).toBe(true)
  })

  it('uses fallback rule when primary and default are empty', () => {
    const ctx = makeContext({ contact: { full_name: '', email_secondary: 'fallback@test.com' } })
    const mappings = [makeMapping({
      field_key: 'client_email',
      source_path: 'email',
      default_value: null,
      fallback_rule: 'contact.email_secondary',
    })]
    const result = resolveFields(mappings, ctx)

    expect(result[0].resolved_value).toBe('fallback@test.com')
    expect(result[0].used_fallback).toBe(true)
  })

  it('applies format_rule transform', () => {
    const ctx = makeContext()
    const mappings = [makeMapping({ format_rule: 'uppercase' })]
    const result = resolveFields(mappings, ctx)

    expect(result[0].resolved_value).toBe('JOHN SMITH')
  })

  it('resolves custom fields from customValues', () => {
    const ctx = makeContext({ customValues: { special_note: 'Custom content here' } })
    const mappings = [makeMapping({
      field_key: 'special_note',
      source_entity: 'custom',
      source_path: '',
    })]
    const result = resolveFields(mappings, ctx)

    expect(result[0].resolved_value).toBe('Custom content here')
    expect(result[0].source_entity).toBe('custom')
  })

  it('sorts results by sort_order', () => {
    const ctx = makeContext()
    const mappings = [
      makeMapping({ field_key: 'second', source_path: 'full_name', sort_order: 2 }),
      makeMapping({ field_key: 'first', source_path: 'email', sort_order: 1 }),
    ]
    const result = resolveFields(mappings, ctx)

    expect(result[0].field_key).toBe('first')
    expect(result[1].field_key).toBe('second')
  })

  it('returns empty string for unknown source entity', () => {
    const ctx = makeContext()
    const mappings = [makeMapping({ source_entity: 'unknown_entity', source_path: 'whatever' })]
    const result = resolveFields(mappings, ctx)

    expect(result[0].resolved_value).toBe('')
    expect(result[0].was_empty).toBe(true)
  })

  it('converts numeric values to strings', () => {
    const ctx = makeContext()
    const mappings = [makeMapping({
      field_key: 'total',
      source_entity: 'billing',
      source_path: 'total_amount',
    })]
    const result = resolveFields(mappings, ctx)

    expect(result[0].resolved_value).toBe('5000')
  })
})

// ── findMissingRequiredFields ────────────────────────────────────────────────

describe('findMissingRequiredFields', () => {
  it('returns empty array when all required fields are resolved', () => {
    const ctx = makeContext()
    const mappings = [makeMapping({ is_required: true })]
    const resolved = resolveFields(mappings, ctx)
    const missing = findMissingRequiredFields(mappings, resolved)

    expect(missing).toHaveLength(0)
  })

  it('identifies missing required fields', () => {
    const ctx = makeContext({ contact: {} })
    const mappings = [makeMapping({ is_required: true })]
    const resolved = resolveFields(mappings, ctx)
    const missing = findMissingRequiredFields(mappings, resolved)

    expect(missing).toHaveLength(1)
    expect(missing[0].field_key).toBe('client_name')
    expect(missing[0].display_name).toBe('Client Name')
  })

  it('ignores optional fields that are empty', () => {
    const ctx = makeContext({ contact: {} })
    const mappings = [makeMapping({ is_required: false })]
    const resolved = resolveFields(mappings, ctx)
    const missing = findMissingRequiredFields(mappings, resolved)

    expect(missing).toHaveLength(0)
  })

  it('does not flag required fields that used defaults', () => {
    const ctx = makeContext({ contact: { full_name: '' } })
    const mappings = [makeMapping({ is_required: true, default_value: 'Default Name' })]
    const resolved = resolveFields(mappings, ctx)
    const missing = findMissingRequiredFields(mappings, resolved)

    expect(missing).toHaveLength(0)
  })
})
