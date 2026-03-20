/**
 * IRCC Forms Engine — Condition Types
 *
 * Unified condition model supporting AND/OR grouped logic with 14 operators.
 * Used by show_when, required_condition, and composite_validation_rules.
 * Replaces the legacy FieldShowWhen and FieldRequiredCondition types.
 */

/** All supported comparison operators */
export type ConditionOperator =
  | 'equals'
  | 'not_equals'
  | 'in'
  | 'not_in'
  | 'truthy'
  | 'falsy'
  | 'has_value'
  | 'no_value'
  | 'greater_than'
  | 'less_than'
  | 'greater_or_equal'
  | 'less_or_equal'
  | 'contains'
  | 'not_contains'

/** A single comparison rule */
export interface ConditionRule {
  /** profile_path of the field to check */
  field_path: string
  /** Comparison operator */
  operator: ConditionOperator
  /** Value to compare against. Not needed for truthy/falsy/has_value/no_value */
  value?: unknown
}

/** A group of rules with AND/OR logic, supporting recursive nesting */
export interface FieldCondition {
  /** How to combine rules in this group */
  logic: 'AND' | 'OR'
  /** Flat rules in this group */
  rules: ConditionRule[]
  /** Nested sub-groups for complex logic */
  groups?: FieldCondition[]
}

/** Result of evaluating a condition, with trace info for debugging */
export interface ConditionEvalResult {
  /** Whether the condition evaluated to true */
  result: boolean
  /** The condition that was evaluated */
  condition: FieldCondition
  /** Per-rule evaluation detail (for condition trace panel) */
  rule_results: RuleEvalResult[]
  /** Per-group evaluation detail */
  group_results?: ConditionEvalResult[]
}

export interface RuleEvalResult {
  rule: ConditionRule
  result: boolean
  /** The actual value found at field_path */
  actual_value: unknown
}

/** Legacy show_when format for backward compatibility */
export interface LegacyShowWhen {
  profile_path: string
  operator: 'equals' | 'not_equals' | 'is_truthy' | 'is_falsy'
  value?: string | number | boolean
}

/** Legacy required_condition format for backward compatibility */
export interface LegacyRequiredCondition {
  when_path: string
  equals: string[]
}

/**
 * Normalizes a legacy show_when or required_condition into the unified FieldCondition format.
 */
export function normalizeLegacyCondition(
  legacy: LegacyShowWhen | LegacyRequiredCondition | FieldCondition | null
): FieldCondition | null {
  // implementation in condition-engine.ts
  return null // placeholder
}
