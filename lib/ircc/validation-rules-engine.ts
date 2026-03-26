/**
 * IRCC Forms Engine  -  Validation Rules Engine
 *
 * Replaces the hardcoded form-validator.ts with a metadata-driven approach.
 * All validation rules are derived from ircc_form_fields metadata and
 * composite_validation_rules table rows.
 *
 * Pure logic module  -  database access is injected via the ValidationDataAccess
 * interface, making this testable without a real database.
 */

import type { AnswerMap, AnswerRecord, CompletionState } from './types/answers'
import type { FieldCondition } from './types/conditions'
import type {
  CompositeValidationRule,
  CompositeValidationResult,
} from './types/reuse'
import { evaluateCondition, normalizeLegacyCondition } from './condition-engine'

// ---------------------------------------------------------------------------
// Data Access Interface
// ---------------------------------------------------------------------------

/** Injectable data access layer for validation operations. */
export interface ValidationDataAccess {
  /** Get form fields for validation. */
  getFormFields(formId: string): Promise<
    Array<{
      id: string
      profile_path: string | null
      label: string | null
      field_type: string | null
      is_required: boolean
      is_mapped: boolean
      is_meta_field: boolean
      is_blocking: boolean
      min_length: number | null
      max_length: number | null
      validation_pattern: string | null
      validation_message: string | null
      options: Array<{ label: string; value: string }> | null
      show_when: unknown
      required_condition: unknown
      section_id: string | null
    }>
  >

  /** Get composite validation rules for a form (and global rules where form_id IS NULL). */
  getCompositeRules(
    formId: string,
    tenantId: string
  ): Promise<CompositeValidationRule[]>

  /** Get all form instances for a matter (for matter-scope composite rules). */
  getMatterInstances(matterId: string): Promise<
    Array<{
      id: string
      form_id: string
      person_id: string | null
      answers: AnswerMap
    }>
  >
}

// ---------------------------------------------------------------------------
// Error Types
// ---------------------------------------------------------------------------

/** Validation error codes covering all possible validation failure modes. */
export type ValidationErrorCode =
  | 'missing_required'
  | 'min_length'
  | 'max_length'
  | 'pattern_mismatch'
  | 'invalid_enum'
  | 'required_condition_unmet'
  | 'composite_rule_failed'
  | 'stale_answer'
  | 'unresolved_conflict'

/** A single validation issue with full context for UI display and debugging. */
export interface ValidationIssue {
  /** Machine-readable error code */
  code: ValidationErrorCode
  /** The profile_path of the affected field */
  profile_path: string
  /** The field ID (if available) */
  field_id?: string
  /** Human-readable field label */
  label: string
  /** Detailed message for staff */
  message: string
  /** Client-friendly message (simpler language) */
  message_client?: string
  /** Whether this issue blocks generation */
  blocking: boolean
  /** The composite rule key or field ID that triggered this */
  rule_key?: string
}

/** Aggregated validation result for a form instance. */
export interface ValidationResult {
  /** All issues found */
  issues: ValidationIssue[]
  /** Blocking issues only */
  blocking_issues: ValidationIssue[]
  /** Warning issues only */
  warnings: ValidationIssue[]
  /** Whether the form is valid for generation (no blocking issues) */
  is_valid: boolean
  /** Summary counts */
  summary: {
    total_issues: number
    blocking: number
    warnings: number
    missing_required: number
    stale: number
    pattern_errors: number
    composite_failures: number
  }
}

// ---------------------------------------------------------------------------
// Default Patterns
// ---------------------------------------------------------------------------

/**
 * Default validation patterns applied by field type when no explicit
 * validation_pattern is set on the field metadata.
 */
export const DEFAULT_PATTERNS: Record<
  string,
  { pattern: RegExp; message: string }
> = {
  email: {
    pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    message: 'Must be a valid email address',
  },
  phone: {
    pattern: /^\+?[\d\s()\-]{7,20}$/,
    message: 'Must be a valid phone number',
  },
  date: {
    pattern: /^\d{4}-\d{2}-\d{2}$/,
    message: 'Must be a valid date (YYYY-MM-DD)',
  },
}

// ---------------------------------------------------------------------------
// Internal Helpers
// ---------------------------------------------------------------------------

/**
 * Flattens an AnswerMap into a plain values map by extracting .value from
 * each AnswerRecord. Optionally skips stale answers.
 *
 * @param answers   The answer map to flatten
 * @param skipStale If true, stale answers are excluded from the result
 * @returns A flat map of profile_path to raw value
 */
function flattenAnswers(
  answers: AnswerMap,
  skipStale: boolean = false
): Record<string, unknown> {
  const flat: Record<string, unknown> = {}
  for (const [path, record] of Object.entries(answers)) {
    if (skipStale && record.stale) continue
    flat[path] = record.value
  }
  return flat
}

/**
 * Checks whether a value is considered "empty" for required-field purposes.
 * null, undefined, empty string, and empty arrays are all empty.
 */
function isEmpty(value: unknown): boolean {
  if (value === null || value === undefined) return true
  if (typeof value === 'string' && value.trim() === '') return true
  if (Array.isArray(value) && value.length === 0) return true
  return false
}

/**
 * Coerces a value to a string for length and pattern checks.
 * Returns empty string for null/undefined.
 */
function toStr(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  return String(value)
}

/**
 * Builds a ValidationResult from a list of issues.
 */
function buildResult(issues: ValidationIssue[]): ValidationResult {
  const blocking_issues = issues.filter((i) => i.blocking)
  const warnings = issues.filter((i) => !i.blocking)

  return {
    issues,
    blocking_issues,
    warnings,
    is_valid: blocking_issues.length === 0,
    summary: {
      total_issues: issues.length,
      blocking: blocking_issues.length,
      warnings: warnings.length,
      missing_required: issues.filter(
        (i) => i.code === 'missing_required' || i.code === 'required_condition_unmet'
      ).length,
      stale: issues.filter((i) => i.code === 'stale_answer').length,
      pattern_errors: issues.filter((i) => i.code === 'pattern_mismatch').length,
      composite_failures: issues.filter(
        (i) => i.code === 'composite_rule_failed'
      ).length,
    },
  }
}

// ---------------------------------------------------------------------------
// Single Field Validation
// ---------------------------------------------------------------------------

/**
 * Validates a single field value against its metadata definition.
 *
 * Checks (in order):
 * 1. Required  -  is_required and value is empty
 * 2. Min length  -  value exists but is shorter than min_length
 * 3. Max length  -  value exists but exceeds max_length
 * 4. Pattern  -  explicit validation_pattern on the field, or default by field_type
 * 5. Enum  -  value must be one of the defined options
 *
 * Pure function with no database access.
 *
 * @param value  The raw answer value to validate
 * @param field  Field metadata from ircc_form_fields
 * @param mode   'draft' = all issues are non-blocking; 'final' = blocking inherits from field
 * @returns Array of validation issues (may be empty)
 */
export function validateFieldValue(
  value: unknown,
  field: {
    profile_path: string
    label: string | null
    field_type: string | null
    is_required: boolean
    is_blocking: boolean
    min_length: number | null
    max_length: number | null
    validation_pattern: string | null
    validation_message: string | null
    options: Array<{ label: string; value: string }> | null
  },
  mode: 'draft' | 'final'
): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const label = field.label ?? field.profile_path
  const blocking = mode === 'final' ? field.is_blocking : false

  // 1. Required check
  if (field.is_required && isEmpty(value)) {
    issues.push({
      code: 'missing_required',
      profile_path: field.profile_path,
      label,
      message: `${label} is required`,
      message_client: `Please fill in ${label}`,
      blocking,
    })
    // If required and empty, skip further checks  -  they are meaningless
    return issues
  }

  // No value  -  nothing further to validate
  if (isEmpty(value)) return issues

  const strVal = toStr(value)

  // 2. Min length
  if (field.min_length !== null && strVal.length < field.min_length) {
    issues.push({
      code: 'min_length',
      profile_path: field.profile_path,
      label,
      message: `${label} must be at least ${field.min_length} characters (currently ${strVal.length})`,
      message_client: `${label} is too short`,
      blocking,
    })
  }

  // 3. Max length
  if (field.max_length !== null && strVal.length > field.max_length) {
    issues.push({
      code: 'max_length',
      profile_path: field.profile_path,
      label,
      message: `${label} must not exceed ${field.max_length} characters (currently ${strVal.length})`,
      message_client: `${label} is too long`,
      blocking,
    })
  }

  // 4. Pattern  -  explicit or default by field type
  if (field.validation_pattern) {
    try {
      const regex = new RegExp(field.validation_pattern)
      if (!regex.test(strVal)) {
        issues.push({
          code: 'pattern_mismatch',
          profile_path: field.profile_path,
          label,
          message:
            field.validation_message ?? `${label} does not match the expected format`,
          message_client: field.validation_message ?? `${label} format is invalid`,
          blocking,
        })
      }
    } catch {
      // Invalid regex in field metadata  -  skip pattern check silently
    }
  } else if (field.field_type && field.field_type in DEFAULT_PATTERNS) {
    const { pattern, message } = DEFAULT_PATTERNS[field.field_type]
    if (!pattern.test(strVal)) {
      issues.push({
        code: 'pattern_mismatch',
        profile_path: field.profile_path,
        label,
        message: `${label}: ${message}`,
        message_client: message,
        blocking,
      })
    }
  }

  // 5. Enum validation  -  value must be in the options list
  if (field.options && field.options.length > 0) {
    const allowedValues = field.options.map((o) => o.value)
    const checkValue = typeof value === 'string' ? value : String(value)
    if (!allowedValues.includes(checkValue)) {
      issues.push({
        code: 'invalid_enum',
        profile_path: field.profile_path,
        label,
        message: `${label} has an invalid value "${checkValue}". Allowed: ${allowedValues.join(', ')}`,
        message_client: `${label} has an invalid selection`,
        blocking,
      })
    }
  }

  return issues
}

// ---------------------------------------------------------------------------
// Composite Rule Evaluation
// ---------------------------------------------------------------------------

/**
 * Evaluates composite validation rules against form or matter data.
 *
 * Composite rules handle multi-field and multi-entity validation that
 * individual field metadata cannot express. They are stored in the
 * composite_validation_rules table and evaluated using the condition engine.
 *
 * Scopes:
 * - 'form': evaluate against the single instance's answers
 * - 'matter': evaluate against all instances' answers merged
 * - 'entity': evaluate against all instances for the same person_id
 *
 * @param rules       Active composite rules to evaluate
 * @param instanceId  The current form instance ID
 * @param answers     The current instance's answers
 * @param dataAccess  Injected data access for fetching matter instances
 * @param matterId    The matter this instance belongs to
 * @param personId    The person this instance is for (nullable)
 * @returns Array of composite validation results
 */
export async function evaluateCompositeRules(
  rules: CompositeValidationRule[],
  instanceId: string,
  answers: AnswerMap,
  dataAccess: ValidationDataAccess,
  matterId: string,
  personId: string | null
): Promise<CompositeValidationResult[]> {
  if (rules.length === 0) return []

  const results: CompositeValidationResult[] = []
  const flatAnswers = flattenAnswers(answers)

  // Lazily load matter instances only if needed
  let matterInstances: Awaited<
    ReturnType<ValidationDataAccess['getMatterInstances']>
  > | null = null

  async function getMatterData(): Promise<
    Awaited<ReturnType<ValidationDataAccess['getMatterInstances']>>
  > {
    if (!matterInstances) {
      matterInstances = await dataAccess.getMatterInstances(matterId)
    }
    return matterInstances
  }

  for (const rule of rules) {
    if (!rule.is_active) continue

    let valuesForEval: Record<string, unknown>

    switch (rule.scope) {
      case 'form': {
        // Evaluate against just this instance's answers
        valuesForEval = flatAnswers
        break
      }

      case 'matter': {
        // Merge all instances' answers for the matter
        const instances = await getMatterData()
        const merged: Record<string, unknown> = {}
        for (const inst of instances) {
          const instFlat = flattenAnswers(inst.answers)
          Object.assign(merged, instFlat)
        }
        // Current instance answers take precedence
        Object.assign(merged, flatAnswers)
        valuesForEval = merged
        break
      }

      case 'entity': {
        // Merge all instances for the same person_id
        if (!personId) {
          // No person context  -  cannot evaluate entity-scope rule, skip
          results.push({ rule, passed: true })
          continue
        }
        const instances = await getMatterData()
        const entityInstances = instances.filter(
          (inst) => inst.person_id === personId
        )
        const merged: Record<string, unknown> = {}
        for (const inst of entityInstances) {
          const instFlat = flattenAnswers(inst.answers)
          Object.assign(merged, instFlat)
        }
        // Current instance answers take precedence
        Object.assign(merged, flatAnswers)
        valuesForEval = merged
        break
      }

      default: {
        // Unknown scope  -  skip
        results.push({ rule, passed: true })
        continue
      }
    }

    // Evaluate the rule's condition against the assembled values
    const passed = evaluateCondition(rule.condition, valuesForEval)

    // Identify failing fields: any field_path in the rule whose value is empty
    // or does not satisfy its part of the condition
    let failing_fields: string[] | undefined
    if (!passed) {
      failing_fields = rule.field_paths.filter((fp) => {
        const val = valuesForEval[fp]
        return val === null || val === undefined || val === ''
      })
      // If no fields are obviously empty, report all field_paths
      if (failing_fields.length === 0) {
        failing_fields = [...rule.field_paths]
      }
    }

    results.push({
      rule,
      passed,
      ...(failing_fields ? { failing_fields } : {}),
    })
  }

  return results
}

// ---------------------------------------------------------------------------
// Form Instance Validation
// ---------------------------------------------------------------------------

/**
 * Validates a form instance's answers against its field definitions.
 *
 * This replaces the hardcoded validateFormData() in form-validator.ts.
 * All rules are derived from field metadata:
 *
 * - is_required -> missing_required check
 * - required_condition -> conditional required check (only if condition is met)
 * - min_length -> minimum length check
 * - max_length -> maximum length check
 * - validation_pattern -> regex pattern check
 * - field_type -> type-specific default validation (email, phone, date)
 * - options -> enum validation (value must be in options list)
 *
 * Only validates visible fields (show_when evaluates to true).
 * Stale answers are flagged as separate blocking issues.
 *
 * @param instanceId  The form instance being validated
 * @param formId      The form definition ID (to look up field metadata)
 * @param answers     Current answers on this instance
 * @param mode        'draft' = all non-blocking; 'final' = blocking inherits from field
 * @param dataAccess  Injected data access
 * @param tenantId    Tenant ID for composite rule lookup
 * @param matterId    Matter ID (optional, needed for composite rules)
 * @returns Aggregated validation result
 */
export async function validateFormInstance(
  instanceId: string,
  formId: string,
  answers: AnswerMap,
  mode: 'draft' | 'final',
  dataAccess: ValidationDataAccess,
  tenantId: string,
  matterId?: string
): Promise<ValidationResult> {
  const allIssues: ValidationIssue[] = []

  // 1. Load field definitions
  const fields = await dataAccess.getFormFields(formId)

  // 2. Build flat values map for condition evaluation (include all answers)
  const flatValues = flattenAnswers(answers)

  // 3. Validate each field
  for (const field of fields) {
    // Skip meta fields  -  they are not user-fillable
    if (field.is_meta_field) continue

    // Skip fields without a profile_path  -  cannot validate
    if (!field.profile_path) continue

    // 3a. Evaluate show_when  -  skip hidden fields entirely
    const showCondition = normalizeLegacyCondition(
      field.show_when as Parameters<typeof normalizeLegacyCondition>[0]
    )
    if (showCondition) {
      const isVisible = evaluateCondition(showCondition, flatValues)
      if (!isVisible) continue
    }

    // 3b. Determine effective required status
    let effectiveRequired = field.is_required

    // If there's a required_condition, evaluate it
    if (field.required_condition) {
      const reqCondition = normalizeLegacyCondition(
        field.required_condition as Parameters<typeof normalizeLegacyCondition>[0]
      )
      if (reqCondition) {
        const conditionMet = evaluateCondition(reqCondition, flatValues)
        if (conditionMet) {
          // Condition is met  -  field is conditionally required
          effectiveRequired = true
        }
        // If condition is NOT met and field is not inherently required, skip required check
        // but still run other validations if a value exists
      }
    }

    // 3c. Get the answer record and value
    const answerRecord: AnswerRecord | undefined = answers[field.profile_path]
    const value = answerRecord?.value

    // 3d. Run field validation with effective required status
    const fieldIssues = validateFieldValue(
      value,
      {
        profile_path: field.profile_path,
        label: field.label,
        field_type: field.field_type,
        is_required: effectiveRequired,
        is_blocking: field.is_blocking,
        min_length: field.min_length,
        max_length: field.max_length,
        validation_pattern: field.validation_pattern,
        validation_message: field.validation_message,
        options: field.options,
      },
      mode
    )

    // Attach field_id to each issue
    for (const issue of fieldIssues) {
      issue.field_id = field.id
    }

    // 3e. If there's a required_condition and the field is empty because
    // the condition was met (but not inherently required), tag with
    // specific code for UI distinction
    if (
      field.required_condition &&
      !field.is_required &&
      effectiveRequired &&
      isEmpty(value)
    ) {
      // Replace code from missing_required to required_condition_unmet
      for (const issue of fieldIssues) {
        if (issue.code === 'missing_required') {
          issue.code = 'required_condition_unmet'
        }
      }
    }

    allIssues.push(...fieldIssues)
  }

  // 4. Flag stale answers as separate issues
  for (const [path, record] of Object.entries(answers)) {
    if (record.stale) {
      // Find the field definition for context
      const field = fields.find((f) => f.profile_path === path)
      const label = field?.label ?? path

      allIssues.push({
        code: 'stale_answer',
        profile_path: path,
        field_id: field?.id,
        label,
        message: `${label} is stale${record.stale_reason ? `: ${record.stale_reason}` : ''} and needs review`,
        message_client: `${label} may be outdated  -  please review`,
        blocking: mode === 'final',
      })
    }
  }

  // 5. Evaluate composite rules (if we have a matter context)
  if (matterId) {
    const compositeRules = await dataAccess.getCompositeRules(formId, tenantId)
    const activeRules = compositeRules.filter((r) => r.is_active)

    if (activeRules.length > 0) {
      // Determine person_id from the first answer or null
      // (In practice, the caller should know this, but we can infer from matter instances)
      let personId: string | null = null
      const instances = await dataAccess.getMatterInstances(matterId)
      const thisInstance = instances.find((inst) => inst.id === instanceId)
      if (thisInstance) {
        personId = thisInstance.person_id
      }

      const compositeResults = await evaluateCompositeRules(
        activeRules,
        instanceId,
        answers,
        dataAccess,
        matterId,
        personId
      )

      for (const cr of compositeResults) {
        if (!cr.passed) {
          allIssues.push({
            code: 'composite_rule_failed',
            profile_path: cr.failing_fields?.[0] ?? '',
            label: cr.rule.description,
            message: cr.rule.error_message_staff ?? cr.rule.error_message,
            message_client: cr.rule.error_message,
            blocking:
              mode === 'final' ? cr.rule.severity === 'blocking' : false,
            rule_key: cr.rule.rule_key,
          })
        }
      }
    }
  }

  return buildResult(allIssues)
}

// ---------------------------------------------------------------------------
// Generation Readiness Check
// ---------------------------------------------------------------------------

/**
 * Checks whether a form instance is ready for document generation.
 *
 * This is the metadata-driven replacement for computePackReadinessFromDB.
 * Generation is blocked if any of the following are true:
 *
 * - Any blocking validation issues exist (final mode)
 * - Any stale answers exist (stale_count > 0)
 * - Any unresolved conflicts exist
 * - Any composite blocking rules fail
 *
 * @param instanceId  The form instance to check
 * @param formId      The form definition ID
 * @param answers     Current answers on this instance
 * @param dataAccess  Injected data access
 * @param tenantId    Tenant ID for composite rule lookup
 * @param matterId    The matter this instance belongs to
 * @param personId    The person this instance is for (nullable)
 * @returns Readiness result with full breakdown of blockers
 */
export async function checkGenerationReadiness(
  instanceId: string,
  formId: string,
  answers: AnswerMap,
  dataAccess: ValidationDataAccess,
  tenantId: string,
  matterId: string,
  personId: string | null
): Promise<{
  ready: boolean
  validation: ValidationResult
  stale_count: number
  unresolved_conflicts: string[]
  composite_failures: CompositeValidationResult[]
  /** Combined list of all blockers for UI display */
  blockers: ValidationIssue[]
}> {
  // 1. Run full validation in final mode
  const validation = await validateFormInstance(
    instanceId,
    formId,
    answers,
    'final',
    dataAccess,
    tenantId,
    matterId
  )

  // 2. Count stale answers
  const stale_count = Object.values(answers).filter((r) => r.stale).length

  // 3. Detect unresolved conflicts
  // An unresolved conflict is when multiple different values exist for the
  // same profile_path across different instances and none has been explicitly
  // resolved (verified). We check by looking at all matter instances.
  const unresolved_conflicts: string[] = []
  const instances = await dataAccess.getMatterInstances(matterId)

  // Build a map of profile_path → distinct non-null values across instances
  const valuesByPath = new Map<string, Set<string>>()
  for (const inst of instances) {
    for (const [path, record] of Object.entries(inst.answers)) {
      if (isEmpty(record.value)) continue
      if (!valuesByPath.has(path)) {
        valuesByPath.set(path, new Set())
      }
      valuesByPath.get(path)!.add(JSON.stringify(record.value))
    }
  }

  // A conflict exists if there are 2+ distinct values for a path and
  // the current instance's answer is not verified
  for (const [path, distinctValues] of valuesByPath) {
    if (distinctValues.size > 1) {
      const currentRecord = answers[path]
      if (!currentRecord?.verified) {
        unresolved_conflicts.push(path)
      }
    }
  }

  // 4. Evaluate composite rules separately for the readiness result
  const compositeRules = await dataAccess.getCompositeRules(formId, tenantId)
  const activeRules = compositeRules.filter((r) => r.is_active)
  const composite_failures = (
    await evaluateCompositeRules(
      activeRules,
      instanceId,
      answers,
      dataAccess,
      matterId,
      personId
    )
  ).filter((cr) => !cr.passed)

  // 5. Build combined blockers list
  const blockers: ValidationIssue[] = [...validation.blocking_issues]

  // Add unresolved conflict blockers (not already in validation)
  for (const conflictPath of unresolved_conflicts) {
    const existingConflict = blockers.find(
      (b) =>
        b.profile_path === conflictPath && b.code === 'unresolved_conflict'
    )
    if (!existingConflict) {
      const field = (await dataAccess.getFormFields(formId)).find(
        (f) => f.profile_path === conflictPath
      )
      blockers.push({
        code: 'unresolved_conflict',
        profile_path: conflictPath,
        field_id: field?.id,
        label: field?.label ?? conflictPath,
        message: `${field?.label ?? conflictPath} has conflicting values across forms  -  please verify the correct value`,
        message_client: `${field?.label ?? conflictPath} has conflicting information`,
        blocking: true,
      })
    }
  }

  // 6. Determine overall readiness
  const ready =
    blockers.length === 0 &&
    stale_count === 0 &&
    unresolved_conflicts.length === 0

  return {
    ready,
    validation,
    stale_count,
    unresolved_conflicts,
    composite_failures,
    blockers,
  }
}
