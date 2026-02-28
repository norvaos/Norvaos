import type { FieldCondition } from '@/lib/types/intake-field'

/**
 * Evaluate whether a conditional visibility rule is satisfied.
 *
 * Used by both the public form renderer (client) and the submission API
 * (server) to determine which fields/sections are visible given the
 * current set of form values.
 *
 * @returns `true` if the field/section should be visible.
 */
export function evaluateCondition(
  condition: FieldCondition | undefined | null,
  values: Record<string, unknown>,
): boolean {
  // No condition → always visible
  if (!condition) return true

  const raw = values[condition.field_id]

  // Extract the effective string value.
  // For select fields using the "Other" object shape { selected, custom },
  // compare against the `selected` key.
  const effective: unknown =
    raw !== null &&
    typeof raw === 'object' &&
    !Array.isArray(raw) &&
    'selected' in (raw as Record<string, unknown>)
      ? (raw as { selected: unknown }).selected
      : raw

  switch (condition.operator) {
    case 'equals':
      return String(effective ?? '') === String(condition.value ?? '')

    case 'not_equals':
      return String(effective ?? '') !== String(condition.value ?? '')

    case 'in': {
      const allowed = Array.isArray(condition.value) ? condition.value : [condition.value]
      return allowed.includes(String(effective ?? ''))
    }

    case 'not_in': {
      const blocked = Array.isArray(condition.value) ? condition.value : [condition.value]
      return !blocked.includes(String(effective ?? ''))
    }

    case 'is_truthy':
      return !!effective && effective !== '' && effective !== '0' && effective !== 'false'

    case 'is_falsy':
      return !effective || effective === '' || effective === '0' || effective === 'false'

    default:
      // Unknown operator → default to visible
      return true
  }
}
