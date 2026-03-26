/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Document Engine  -  Condition Evaluator (Pure Function Engine)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Evaluates conditional sections/clauses based on resolved field values.
 * Uses structured JSON rules (not free-text expressions).
 * NO side effects, NO database calls, NO I/O.
 *
 * Input:  conditions (from DB) + resolved field values
 * Output: map of condition_key → boolean result
 */

import type { DocumentTemplateConditionRow } from '@/lib/types/database'
import type {
  ConditionEvaluation,
  ConditionOperator,
  ConditionRule,
  ConditionRulesJson,
} from '@/lib/types/document-engine'

// ─── Core Evaluator ─────────────────────────────────────────────────────────

/**
 * Evaluate all conditions and return a map of condition_key → boolean.
 */
export function evaluateAllConditions(
  conditions: DocumentTemplateConditionRow[],
  resolvedFields: Record<string, string>
): Map<string, boolean> {
  const results = new Map<string, boolean>()
  for (const condition of conditions.sort((a, b) => a.evaluation_order - b.evaluation_order)) {
    const evaluation = evaluateCondition(condition, resolvedFields)
    results.set(condition.condition_key, evaluation.result)
  }
  return results
}

/**
 * Evaluate all conditions and return detailed results for audit/snapshot.
 */
export function evaluateConditionsDetailed(
  conditions: DocumentTemplateConditionRow[],
  resolvedFields: Record<string, string>
): ConditionEvaluation[] {
  return conditions
    .sort((a, b) => a.evaluation_order - b.evaluation_order)
    .map((c) => evaluateCondition(c, resolvedFields))
}

/**
 * Evaluate a single condition against resolved field values.
 */
export function evaluateCondition(
  condition: DocumentTemplateConditionRow,
  resolvedFields: Record<string, string>
): ConditionEvaluation {
  const rulesJson = parseRules(condition.rules)
  const logicOp = condition.logic_operator || 'AND'

  const ruleResults = rulesJson.rules.map((rule) => {
    const actualValue = resolvedFields[rule.field_key] ?? null
    const passed = evaluateRule(rule, actualValue)
    return {
      field_key: rule.field_key,
      operator: rule.operator,
      expected_value: rule.value,
      actual_value: actualValue,
      passed,
    }
  })

  const result =
    logicOp === 'OR'
      ? ruleResults.some((r) => r.passed)
      : ruleResults.every((r) => r.passed)

  return {
    condition_key: condition.condition_key,
    label: condition.label,
    result,
    logic_operator: logicOp,
    rule_results: ruleResults,
  }
}

// ─── Rule Evaluation ────────────────────────────────────────────────────────

/**
 * Evaluate a single rule against an actual value.
 */
function evaluateRule(rule: ConditionRule, actualValue: string | null): boolean {
  const op = rule.operator as ConditionOperator
  const expected = rule.value

  switch (op) {
    case 'equals':
      return actualValue === String(expected ?? '')

    case 'not_equals':
      return actualValue !== String(expected ?? '')

    case 'is_empty':
      return actualValue === null || actualValue === ''

    case 'is_not_empty':
      return actualValue !== null && actualValue !== ''

    case 'greater_than': {
      if (actualValue === null) return false
      const numActual = parseFloat(actualValue)
      const numExpected = parseFloat(String(expected ?? '0'))
      if (isNaN(numActual) || isNaN(numExpected)) return false
      return numActual > numExpected
    }

    case 'less_than': {
      if (actualValue === null) return false
      const numActual = parseFloat(actualValue)
      const numExpected = parseFloat(String(expected ?? '0'))
      if (isNaN(numActual) || isNaN(numExpected)) return false
      return numActual < numExpected
    }

    case 'contains':
      if (actualValue === null) return false
      return actualValue.toLowerCase().includes(String(expected ?? '').toLowerCase())

    case 'in_list': {
      if (actualValue === null) return false
      const list = Array.isArray(expected) ? expected.map(String) : []
      return list.includes(actualValue)
    }

    case 'truthy':
      return actualValue !== null && actualValue !== '' && actualValue !== '0' && actualValue.toLowerCase() !== 'false'

    case 'falsy':
      return actualValue === null || actualValue === '' || actualValue === '0' || actualValue.toLowerCase() === 'false'

    default:
      return false
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Parse the JSONB rules field into a typed structure.
 * Handles both raw arrays and wrapped { rules: [...] } format.
 */
function parseRules(rawRules: unknown): ConditionRulesJson {
  if (!rawRules || typeof rawRules !== 'object') {
    return { rules: [] }
  }

  // Handle { rules: [...] } format
  if ('rules' in (rawRules as Record<string, unknown>)) {
    const r = (rawRules as Record<string, unknown>).rules
    if (Array.isArray(r)) {
      return { rules: r as ConditionRule[] }
    }
  }

  // Handle raw array format
  if (Array.isArray(rawRules)) {
    return { rules: rawRules as ConditionRule[] }
  }

  return { rules: [] }
}

/**
 * Check whether a section/element with a condition_key should be included
 * in the rendered output.
 *
 * - If condition_key is null/undefined → always include
 * - If condition_key not found in results → exclude (fail-closed)
 * - Otherwise → use the evaluation result
 */
export function shouldInclude(
  conditionKey: string | null | undefined,
  conditionResults: Map<string, boolean>
): boolean {
  if (!conditionKey) return true
  const result = conditionResults.get(conditionKey)
  // Fail-closed: if condition not found, exclude the section
  return result === true
}
