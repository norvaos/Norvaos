/**
 * IRCC Forms Engine  -  Unified Condition Engine
 *
 * Pure function module (no I/O, no database, no side effects).
 * Works identically on client and server.
 *
 * Supports 14 operators, AND/OR grouped logic with recursive nesting
 * (capped at 3 levels), and backward compatibility with legacy
 * show_when / required_condition formats.
 */

import type {
  ConditionOperator,
  ConditionRule,
  FieldCondition,
  ConditionEvalResult,
  RuleEvalResult,
  LegacyShowWhen,
  LegacyRequiredCondition,
} from './types/conditions'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum allowed nesting depth for condition groups */
const MAX_NESTING_DEPTH = 3

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Resolves a dot-notation path against a flat or nested values map.
 * e.g. getValueAtPath({ 'personal.family_name': 'Smith' }, 'personal.family_name')
 *      → 'Smith'
 * Also handles nested objects:
 *      getValueAtPath({ personal: { family_name: 'Smith' } }, 'personal.family_name')
 *      → 'Smith'
 */
function getValueAtPath(
  values: Record<string, unknown>,
  path: string
): unknown {
  // Fast path: direct key lookup (covers flat maps)
  if (path in values) return values[path]

  // Slow path: walk dot-separated segments into nested objects
  const segments = path.split('.')
  let current: unknown = values
  for (const segment of segments) {
    if (current === null || current === undefined) return undefined
    if (typeof current !== 'object') return undefined
    current = (current as Record<string, unknown>)[segment]
  }
  return current
}

/**
 * Attempts numeric conversion for comparison operators.
 * Returns [numA, numB] if both convert, otherwise [strA, strB].
 */
function toComparable(a: unknown, b: unknown): [number, number] | [string, string] {
  const numA = Number(a)
  const numB = Number(b)
  if (!Number.isNaN(numA) && !Number.isNaN(numB) && a !== '' && b !== '') {
    return [numA, numB]
  }
  return [String(a ?? ''), String(b ?? '')]
}

/**
 * Checks whether a value is "truthy" according to our definition:
 * not null, not undefined, not empty string, not false, not 0.
 */
function isTruthy(value: unknown): boolean {
  if (value === null || value === undefined) return false
  if (value === '') return false
  if (value === false) return false
  if (value === 0) return false
  return true
}

/**
 * Checks whether a value "has a value" (not null and not undefined).
 * 0, false, and empty string all count as having a value.
 */
function hasValue(value: unknown): boolean {
  return value !== null && value !== undefined
}

// ---------------------------------------------------------------------------
// Rule evaluation
// ---------------------------------------------------------------------------

/**
 * Evaluates a single condition rule against a values map.
 *
 * @param rule  The condition rule to evaluate
 * @param values  Flat map of profile_path to value
 * @returns Whether the rule is satisfied
 */
export function evaluateRule(
  rule: ConditionRule,
  values: Record<string, unknown>
): boolean {
  const actual = getValueAtPath(values, rule.field_path)
  const expected = rule.value

  switch (rule.operator) {
    // --- Equality ---
    case 'equals':
      // Loose equality to handle string/number coercion (e.g. "1" == 1)
      // eslint-disable-next-line eqeqeq
      return actual == expected

    case 'not_equals':
      // eslint-disable-next-line eqeqeq
      return actual != expected

    // --- Set membership ---
    case 'in': {
      const list = Array.isArray(expected) ? expected : [expected]
      // eslint-disable-next-line eqeqeq
      return list.some((v) => v == actual)
    }

    case 'not_in': {
      const list = Array.isArray(expected) ? expected : [expected]
      // eslint-disable-next-line eqeqeq
      return !list.some((v) => v == actual)
    }

    // --- Truthiness / existence ---
    case 'truthy':
      return isTruthy(actual)

    case 'falsy':
      return !isTruthy(actual)

    case 'has_value':
      return hasValue(actual)

    case 'no_value':
      return !hasValue(actual)

    // --- Numeric / string comparison ---
    case 'greater_than': {
      const [a, b] = toComparable(actual, expected)
      return a > b
    }

    case 'less_than': {
      const [a, b] = toComparable(actual, expected)
      return a < b
    }

    case 'greater_or_equal': {
      const [a, b] = toComparable(actual, expected)
      return a >= b
    }

    case 'less_or_equal': {
      const [a, b] = toComparable(actual, expected)
      return a <= b
    }

    // --- Contains ---
    case 'contains': {
      if (Array.isArray(actual)) {
        // eslint-disable-next-line eqeqeq
        return actual.some((item) => item == expected)
      }
      if (typeof actual === 'string') {
        return actual.includes(String(expected ?? ''))
      }
      return false
    }

    case 'not_contains': {
      if (Array.isArray(actual)) {
        // eslint-disable-next-line eqeqeq
        return !actual.some((item) => item == expected)
      }
      if (typeof actual === 'string') {
        return !actual.includes(String(expected ?? ''))
      }
      return true
    }

    default: {
      // Unknown operator  -  fail closed (return false)
      const _exhaustive: never = rule.operator
      return false
    }
  }
}

// ---------------------------------------------------------------------------
// Condition evaluation (with optional trace)
// ---------------------------------------------------------------------------

/**
 * Recursively evaluates a FieldCondition group against values.
 * Respects MAX_NESTING_DEPTH to prevent infinite recursion.
 */
function evaluateGroup(
  condition: FieldCondition,
  values: Record<string, unknown>,
  depth: number,
  trace: boolean
): { result: boolean; evalResult?: ConditionEvalResult } {
  if (depth > MAX_NESTING_DEPTH) {
    // Exceeded nesting cap  -  fail closed
    return {
      result: false,
      evalResult: trace
        ? { result: false, condition, rule_results: [], group_results: [] }
        : undefined,
    }
  }

  const ruleResults: RuleEvalResult[] = []
  const groupResults: ConditionEvalResult[] = []

  // Evaluate flat rules
  const ruleBooleans: boolean[] = []
  for (const rule of condition.rules) {
    const ruleResult = evaluateRule(rule, values)
    ruleBooleans.push(ruleResult)
    if (trace) {
      ruleResults.push({
        rule,
        result: ruleResult,
        actual_value: getValueAtPath(values, rule.field_path),
      })
    }
  }

  // Evaluate nested groups
  const groupBooleans: boolean[] = []
  if (condition.groups) {
    for (const subGroup of condition.groups) {
      const sub = evaluateGroup(subGroup, values, depth + 1, trace)
      groupBooleans.push(sub.result)
      if (trace && sub.evalResult) {
        groupResults.push(sub.evalResult)
      }
    }
  }

  // Combine all booleans with the group logic
  const allBooleans = [...ruleBooleans, ...groupBooleans]

  let result: boolean
  if (allBooleans.length === 0) {
    // Empty group  -  vacuously true
    result = true
  } else if (condition.logic === 'AND') {
    result = allBooleans.every(Boolean)
  } else {
    result = allBooleans.some(Boolean)
  }

  return {
    result,
    evalResult: trace
      ? { result, condition, rule_results: ruleResults, group_results: groupResults.length > 0 ? groupResults : undefined }
      : undefined,
  }
}

/**
 * Evaluates a condition against a set of values.
 *
 * If `condition` is null or undefined the result is `true` (no condition = always shown / always required).
 *
 * @param condition  The condition to evaluate (should already be normalised)
 * @param values     Flat map of profile_path to value
 * @param options    Pass `{ trace: true }` for a detailed ConditionEvalResult (returned via evaluateConditionWithTrace)
 * @returns `true` or `false`
 */
export function evaluateCondition(
  condition: FieldCondition | null | undefined,
  values: Record<string, unknown>,
  options?: { trace?: boolean }
): boolean {
  if (!condition) return true
  const { result } = evaluateGroup(condition, values, 1, options?.trace ?? false)
  return result
}

/**
 * Evaluates a condition and returns a detailed trace for debugging.
 *
 * @param condition  The condition to evaluate
 * @param values     Flat map of profile_path to value
 * @returns A ConditionEvalResult with per-rule actual values and per-group results
 */
export function evaluateConditionWithTrace(
  condition: FieldCondition,
  values: Record<string, unknown>
): ConditionEvalResult {
  const { result, evalResult } = evaluateGroup(condition, values, 1, true)
  // evalResult is always defined when trace=true
  return evalResult ?? { result, condition, rule_results: [] }
}

// ---------------------------------------------------------------------------
// Legacy normalisation
// ---------------------------------------------------------------------------

/**
 * Normalises legacy condition formats into the unified FieldCondition.
 *
 * - Returns `null` if input is null or undefined.
 * - If input already has a `logic` key (i.e. is a FieldCondition), returns as-is.
 * - If input has a `profile_path` key (LegacyShowWhen), wraps in an AND group.
 * - If input has a `when_path` key (LegacyRequiredCondition), converts to an IN operator rule.
 *
 * @param legacy  A legacy or modern condition, or null/undefined
 * @returns A normalised FieldCondition, or null
 */
export function normalizeLegacyCondition(
  legacy: LegacyShowWhen | LegacyRequiredCondition | FieldCondition | null | undefined
): FieldCondition | null {
  if (legacy === null || legacy === undefined) return null

  // Already unified format
  if ('logic' in legacy) {
    return legacy as FieldCondition
  }

  // LegacyShowWhen: { profile_path, operator, value }
  if ('profile_path' in legacy) {
    const sw = legacy as LegacyShowWhen
    let operator: ConditionOperator
    switch (sw.operator) {
      case 'is_truthy':
        operator = 'truthy'
        break
      case 'is_falsy':
        operator = 'falsy'
        break
      default:
        operator = sw.operator as ConditionOperator
    }

    const rule: ConditionRule = {
      field_path: sw.profile_path,
      operator,
      ...(operator !== 'truthy' && operator !== 'falsy' ? { value: sw.value } : {}),
    }

    return { logic: 'AND', rules: [rule] }
  }

  // LegacyRequiredCondition: { when_path, equals: string[] }
  if ('when_path' in legacy) {
    const rc = legacy as LegacyRequiredCondition
    const rule: ConditionRule = {
      field_path: rc.when_path,
      operator: 'in',
      value: rc.equals,
    }
    return { logic: 'AND', rules: [rule] }
  }

  return null
}

// ---------------------------------------------------------------------------
// Dependency graph
// ---------------------------------------------------------------------------

/**
 * Extracts all profile_paths referenced in a condition (for dependency tracking).
 *
 * @param condition  A FieldCondition (possibly with nested groups)
 * @returns Array of unique profile_path strings
 */
export function extractDependencyPaths(
  condition: FieldCondition | null | undefined
): string[] {
  if (!condition) return []

  const paths = new Set<string>()

  function walk(cond: FieldCondition, depth: number): void {
    if (depth > MAX_NESTING_DEPTH) return
    for (const rule of cond.rules) {
      paths.add(rule.field_path)
    }
    if (cond.groups) {
      for (const group of cond.groups) {
        walk(group, depth + 1)
      }
    }
  }

  walk(condition, 1)
  return Array.from(paths)
}

/**
 * Builds a dependency graph from a list of fields.
 *
 * Returns a map of `{ parent_profile_path: field_id[] }` where each parent
 * is a profile_path referenced in some field's `show_when` or `required_condition`.
 * Both legacy and unified formats are accepted  -  they are normalised internally.
 *
 * @param fields  Array of objects with id, show_when, and required_condition
 * @returns Adjacency map for change propagation
 */
export function buildDependencyGraph(
  fields: Array<{
    id: string
    show_when: FieldCondition | LegacyShowWhen | null
    required_condition: FieldCondition | LegacyRequiredCondition | null
  }>
): Map<string, string[]> {
  const graph = new Map<string, string[]>()

  function addEdge(parentPath: string, childId: string): void {
    const existing = graph.get(parentPath)
    if (existing) {
      if (!existing.includes(childId)) {
        existing.push(childId)
      }
    } else {
      graph.set(parentPath, [childId])
    }
  }

  for (const field of fields) {
    // Normalise show_when
    const showCond = normalizeLegacyCondition(field.show_when as LegacyShowWhen | FieldCondition | null)
    for (const path of extractDependencyPaths(showCond)) {
      addEdge(path, field.id)
    }

    // Normalise required_condition
    const reqCond = normalizeLegacyCondition(field.required_condition as LegacyRequiredCondition | FieldCondition | null)
    for (const path of extractDependencyPaths(reqCond)) {
      addEdge(path, field.id)
    }
  }

  return graph
}

/**
 * Given a changed field_path and a dependency graph, returns all field IDs
 * that depend on the changed field (direct and transitive, up to maxDepth).
 *
 * Uses breadth-first traversal with cycle detection.
 *
 * @param changedPath  The profile_path that changed
 * @param graph        Adjacency map from buildDependencyGraph
 * @param maxDepth     Maximum traversal depth (default 3)
 * @returns Array of dependent field IDs (deduplicated)
 */
export function getDependentFields(
  changedPath: string,
  graph: Map<string, string[]>,
  maxDepth: number = 3
): string[] {
  const visited = new Set<string>()
  const result: string[] = []

  // BFS queue: [path_or_id, currentDepth]
  const queue: Array<[string, number]> = [[changedPath, 0]]

  while (queue.length > 0) {
    const [current, depth] = queue.shift()!
    if (depth >= maxDepth) continue

    const children = graph.get(current)
    if (!children) continue

    for (const childId of children) {
      if (!visited.has(childId)) {
        visited.add(childId)
        result.push(childId)
        // The child field ID might itself be a parent path in the graph
        // (i.e. other fields depend on it), so we continue BFS from it
        queue.push([childId, depth + 1])
      }
    }
  }

  return result
}
