/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Document Engine  -  Field Resolver (Pure Function Engine)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Resolves merge field placeholders from pre-fetched data.
 * NO side effects, NO database calls, NO I/O.
 *
 * Input:  field mappings + resolution context (pre-fetched data)
 * Output: array of resolved fields with status tracking
 */

import type { DocumentTemplateMappingRow } from '@/lib/types/database'
import type { FieldResolutionContext, ResolvedField } from '@/lib/types/document-engine'

// ─── Core Resolver ──────────────────────────────────────────────────────────

/**
 * Resolve all merge field mappings against the provided context.
 * Returns one ResolvedField per mapping.
 */
export function resolveFields(
  mappings: DocumentTemplateMappingRow[],
  ctx: FieldResolutionContext
): ResolvedField[] {
  return mappings
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((mapping) => resolveField(mapping, ctx))
}

/**
 * Resolve a single field mapping.
 */
function resolveField(
  mapping: DocumentTemplateMappingRow,
  ctx: FieldResolutionContext
): ResolvedField {
  const { field_key, display_name, source_entity, source_path, default_value, fallback_rule, format_rule } = mapping

  // Custom fields come from explicit user input
  if (source_entity === 'custom') {
    const customValue = ctx.customValues[field_key] ?? ''
    const isEmpty = !customValue
    return {
      field_key,
      display_name,
      resolved_value: isEmpty && default_value ? default_value : customValue,
      source_entity,
      source_path,
      was_empty: isEmpty && !default_value,
      used_default: isEmpty && !!default_value,
      used_fallback: false,
    }
  }

  // Get the data source object
  const sourceData = getSourceData(source_entity, ctx)
  let rawValue = getNestedValue(sourceData, source_path)

  let wasEmpty = rawValue === undefined || rawValue === null || rawValue === ''
  let usedDefault = false
  let usedFallback = false

  // Apply default value if empty
  if (wasEmpty && default_value) {
    rawValue = default_value
    usedDefault = true
    wasEmpty = false
  }

  // Apply fallback rule if still empty
  if (wasEmpty && fallback_rule) {
    const fallbackResult = resolveFallback(fallback_rule, ctx)
    if (fallbackResult !== null) {
      rawValue = fallbackResult
      usedFallback = true
      wasEmpty = false
    }
  }

  // Convert to string
  let stringValue = rawValue !== undefined && rawValue !== null ? String(rawValue) : ''

  // Apply transform
  if (stringValue && format_rule) {
    stringValue = applyTransform(stringValue, format_rule)
  }

  return {
    field_key,
    display_name,
    resolved_value: stringValue,
    source_entity,
    source_path,
    was_empty: wasEmpty,
    used_default: usedDefault,
    used_fallback: usedFallback,
  }
}

// ─── Data Source Access ──────────────────────────────────────────────────────

function getSourceData(
  sourceEntity: string,
  ctx: FieldResolutionContext
): Record<string, unknown> {
  switch (sourceEntity) {
    case 'matter': return ctx.matter
    case 'contact': return ctx.contact
    case 'billing': return ctx.billing
    case 'tenant': return ctx.tenant
    case 'user': return ctx.lawyer
    default: return {}
  }
}

/**
 * Traverse a dot-notation path to get a nested value.
 * e.g. getNestedValue({ a: { b: 'hello' } }, 'a.b') → 'hello'
 */
export function getNestedValue(
  obj: Record<string, unknown>,
  path: string
): unknown {
  if (!path) return undefined
  const parts = path.split('.')
  let current: unknown = obj
  for (const part of parts) {
    if (current === null || current === undefined) return undefined
    if (typeof current !== 'object') return undefined
    current = (current as Record<string, unknown>)[part]
  }
  return current
}

// ─── Fallback Resolution ────────────────────────────────────────────────────

/**
 * Resolve a fallback rule. Format: "source_entity.source_path"
 * e.g. "contact.email_secondary" as fallback for "contact.email_primary"
 */
function resolveFallback(
  fallbackRule: string,
  ctx: FieldResolutionContext
): string | null {
  const dotIndex = fallbackRule.indexOf('.')
  if (dotIndex === -1) return null

  const entity = fallbackRule.substring(0, dotIndex)
  const path = fallbackRule.substring(dotIndex + 1)
  const sourceData = getSourceData(entity, ctx)
  const value = getNestedValue(sourceData, path)

  if (value === undefined || value === null || value === '') return null
  return String(value)
}

// ─── Transforms ─────────────────────────────────────────────────────────────

/**
 * Apply a formatting transform to a resolved string value.
 */
export function applyTransform(value: string, transform: string): string {
  switch (transform) {
    case 'none':
      return value

    case 'uppercase':
      return value.toUpperCase()

    case 'titlecase':
      return value
        .split(' ')
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ')

    case 'date_long': {
      const date = parseDate(value)
      if (!date) return value
      return date.toLocaleDateString('en-CA', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    }

    case 'date_short': {
      const date = parseDate(value)
      if (!date) return value
      return date.toISOString().split('T')[0]
    }

    case 'currency': {
      const num = parseFloat(value)
      if (isNaN(num)) return value
      return new Intl.NumberFormat('en-CA', {
        style: 'currency',
        currency: 'CAD',
        minimumFractionDigits: 2,
      }).format(num)
    }

    default:
      return value
  }
}

function parseDate(value: string): Date | null {
  const d = new Date(value)
  return isNaN(d.getTime()) ? null : d
}

// ─── Placeholder Substitution ───────────────────────────────────────────────

/**
 * Replace all {{field_key}} placeholders in a text string with resolved values.
 */
export function substituteFields(
  text: string,
  resolvedFields: Record<string, string>
): string {
  return text.replace(/\{\{([^}]+)\}\}/g, (match, fieldKey: string) => {
    const trimmedKey = fieldKey.trim()
    return resolvedFields[trimmedKey] ?? match // leave placeholder if unresolved
  })
}

/**
 * Build a lookup map from resolved fields for fast substitution.
 */
export function buildFieldMap(fields: ResolvedField[]): Record<string, string> {
  const map: Record<string, string> = {}
  for (const f of fields) {
    map[f.field_key] = f.resolved_value
  }
  return map
}

/**
 * Check which required fields are missing (unresolved).
 * Returns field keys that are required but have was_empty = true.
 */
export function findMissingRequiredFields(
  mappings: DocumentTemplateMappingRow[],
  resolved: ResolvedField[]
): { field_key: string; display_name: string }[] {
  const resolvedMap = new Map(resolved.map((f) => [f.field_key, f]))
  return mappings
    .filter((m) => m.is_required)
    .filter((m) => {
      const r = resolvedMap.get(m.field_key)
      return !r || r.was_empty
    })
    .map((m) => ({ field_key: m.field_key, display_name: m.display_name }))
}
