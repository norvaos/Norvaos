/**
 * @deprecated  -  LEGACY Questionnaire Engine.
 *
 * Replaced by questionnaire-engine-db.ts which reads form structure from the
 * DB (ircc_forms / ircc_form_sections / ircc_form_fields).
 *
 * This file still imports from the deprecated form-field-registry.ts.
 * Do not add new call-sites  -  migrate existing consumers to the DB path.
 *
 * Original description:
 * Pure functions for building, merging, and processing IRCC questionnaires.
 * Used by both the dashboard and portal questionnaire components.
 */

import type { IRCCProfile, IRCCFieldMapping, IRCCFormSection } from '@/lib/types/ircc-profile'
import { createEmptyProfile } from '@/lib/types/ircc-profile'
import { mergeFormFields } from '@/lib/ircc/form-field-registry'

// ── Profile Path Accessors ──────────────────────────────────────────────────

/**
 * Get a value from a nested object using dot-notation path.
 * e.g. profilePathGet(profile, "personal.family_name") → "Smith"
 */
export function profilePathGet(obj: Record<string, unknown>, path: string): unknown {
  const keys = path.split('.')
  let current: unknown = obj
  for (const key of keys) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined
    }
    current = (current as Record<string, unknown>)[key]
  }
  return current
}

/**
 * Set a value in a nested object using dot-notation path.
 * Creates intermediate objects as needed.
 * Returns a new object (immutable).
 */
export function profilePathSet(
  obj: Record<string, unknown>,
  path: string,
  value: unknown,
): Record<string, unknown> {
  const keys = path.split('.')
  const result = structuredClone(obj)
  let current: Record<string, unknown> = result

  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i]
    if (current[key] === undefined || current[key] === null || typeof current[key] !== 'object') {
      current[key] = {}
    }
    current = current[key] as Record<string, unknown>
  }

  current[keys[keys.length - 1]] = value
  return result
}

// ── Questionnaire Building ──────────────────────────────────────────────────

export interface QuestionnaireField extends IRCCFieldMapping {
  /** Current value from existing profile (or undefined if not yet filled) */
  current_value: unknown
  /** Whether this field already has a value */
  is_prefilled: boolean
}

export interface QuestionnaireSection {
  id: string
  title: string
  description?: string
  sort_order: number
  fields: QuestionnaireField[]
  /** Number of fields that have values */
  filled_count: number
  /** Total number of required fields */
  required_count: number
  /** Whether all required fields in this section are filled */
  is_complete: boolean
}

export interface Questionnaire {
  sections: QuestionnaireSection[]
  /** Overall progress 0-100 */
  progress_percent: number
  /** Total fields */
  total_fields: number
  /** Filled fields */
  filled_fields: number
  /** Form codes included */
  form_codes: string[]
}

/**
 * Build a questionnaire from form codes and existing profile data.
 * Merges fields across forms, deduplicates, and pre-fills from profile.
 */
export function buildQuestionnaire(
  formCodes: string[],
  existingProfile?: Partial<IRCCProfile>,
): Questionnaire {
  const profile = existingProfile ?? createEmptyProfile()
  const mergedSections = mergeFormFields(formCodes)

  let totalFields = 0
  let filledFields = 0

  const sections: QuestionnaireSection[] = mergedSections.map((section) => {
    let filledCount = 0
    let requiredCount = 0

    const fields: QuestionnaireField[] = section.fields.map((field) => {
      const currentValue = profilePathGet(
        profile as unknown as Record<string, unknown>,
        field.profile_path,
      )
      const isPrefilled = isFieldFilled(currentValue, field.field_type)

      totalFields++
      if (isPrefilled) {
        filledFields++
        filledCount++
      }
      if (field.is_required) requiredCount++

      return {
        ...field,
        current_value: currentValue,
        is_prefilled: isPrefilled,
      }
    })

    // Section is "complete" when all required fields are filled.
    // If no required fields exist, at least one field must be filled to count.
    const reqFields = fields.filter((f) => f.is_required)
    const isComplete = reqFields.length > 0
      ? reqFields.every((f) => f.is_prefilled)
      : fields.length > 0
        ? fields.some((f) => f.is_prefilled)
        : true

    return {
      id: section.id,
      title: section.title,
      description: section.description,
      sort_order: section.sort_order,
      fields,
      filled_count: filledCount,
      required_count: requiredCount,
      is_complete: isComplete,
    }
  })

  const progressPercent = totalFields > 0
    ? Math.round((filledFields / totalFields) * 100)
    : 0

  return {
    sections,
    progress_percent: progressPercent,
    total_fields: totalFields,
    filled_fields: filledFields,
    form_codes: formCodes,
  }
}

// ── Field Value Checking ────────────────────────────────────────────────────

/**
 * Check if a field has a meaningful value.
 */
function isFieldFilled(value: unknown, fieldType: string): boolean {
  if (value === undefined || value === null) return false

  if (fieldType === 'boolean') {
    return value === true || value === false
  }

  if (fieldType === 'number') {
    return typeof value === 'number' && !isNaN(value)
  }

  if (fieldType === 'repeater') {
    return Array.isArray(value) && value.length > 0
  }

  if (typeof value === 'string') {
    return value.trim().length > 0
  }

  if (typeof value === 'object') {
    // For address objects etc., check if at least one field is filled
    return Object.values(value as Record<string, unknown>).some(
      (v) => v !== undefined && v !== null && v !== '',
    )
  }

  return false
}

// ── Response Conversion ─────────────────────────────────────────────────────

/**
 * Convert flat form responses (keyed by profile_path) into a structured IRCCProfile.
 */
export function responsesToProfile(
  responses: Record<string, unknown>,
  existingProfile?: Partial<IRCCProfile>,
): Partial<IRCCProfile> {
  let profile = structuredClone(
    (existingProfile ?? createEmptyProfile()) as unknown as Record<string, unknown>,
  )

  for (const [path, value] of Object.entries(responses)) {
    if (value !== undefined) {
      profile = profilePathSet(profile, path, value)
    }
  }

  return profile as unknown as Partial<IRCCProfile>
}

/**
 * Convert a structured IRCCProfile into flat responses keyed by profile_path.
 * Used for pre-filling form values.
 */
export function profileToResponses(
  profile: Partial<IRCCProfile>,
  fields: IRCCFieldMapping[],
): Record<string, unknown> {
  const responses: Record<string, unknown> = {}
  const obj = profile as unknown as Record<string, unknown>

  for (const field of fields) {
    const value = profilePathGet(obj, field.profile_path)
    if (value !== undefined) {
      responses[field.profile_path] = value
    }
  }

  return responses
}

// ── Conditional Visibility ──────────────────────────────────────────────────

/**
 * Evaluate whether a field should be visible based on its show_when condition
 * and the current profile/responses state.
 */
export function evaluateFieldCondition(
  field: IRCCFieldMapping,
  currentValues: Record<string, unknown>,
): boolean {
  if (!field.show_when) return true

  const { profile_path, operator, value: expectedValue } = field.show_when
  const actualValue = currentValues[profile_path] ?? profilePathGet(
    currentValues as Record<string, unknown>,
    profile_path,
  )

  switch (operator) {
    case 'equals':
      return String(actualValue) === String(expectedValue)
    case 'not_equals':
      return String(actualValue) !== String(expectedValue)
    case 'is_truthy':
      return actualValue === true || (typeof actualValue === 'string' && actualValue.trim() !== '')
    case 'is_falsy':
      return !actualValue || actualValue === '' || actualValue === false
    default:
      return true
  }
}

// ── Section Completeness ────────────────────────────────────────────────────

/**
 * Calculate completion stats for a section given current values.
 */
export function calculateSectionProgress(
  section: IRCCFormSection,
  currentValues: Record<string, unknown>,
): { filled: number; required: number; total: number; isComplete: boolean } {
  let filled = 0
  let required = 0
  const visibleFields = section.fields.filter((f) =>
    evaluateFieldCondition(f, currentValues),
  )

  for (const field of visibleFields) {
    const value = currentValues[field.profile_path]
    const isFilled = isFieldFilled(value, field.field_type)
    if (isFilled) filled++
    if (field.is_required) required++
  }

  const requiredFilled = visibleFields
    .filter((f) => f.is_required)
    .filter((f) => isFieldFilled(currentValues[f.profile_path], f.field_type))
    .length

  // When no required fields exist, "complete" means at least one field is filled
  const isComplete = required > 0
    ? requiredFilled >= required
    : visibleFields.length > 0
      ? filled > 0
      : true

  return {
    filled,
    required,
    total: visibleFields.length,
    isComplete,
  }
}

// ── Validation ──────────────────────────────────────────────────────────────

export interface ValidationError {
  profile_path: string
  label: string
  message: string
}

/**
 * Validate a section's responses against field requirements.
 * Returns an array of validation errors (empty if valid).
 */
export function validateSection(
  section: IRCCFormSection,
  currentValues: Record<string, unknown>,
): ValidationError[] {
  const errors: ValidationError[] = []

  for (const field of section.fields) {
    // Skip hidden fields
    if (!evaluateFieldCondition(field, currentValues)) continue

    const value = currentValues[field.profile_path]

    // Required check
    if (field.is_required && !isFieldFilled(value, field.field_type)) {
      errors.push({
        profile_path: field.profile_path,
        label: field.label,
        message: 'This field is required',
      })
      continue
    }

    // Type-specific validation (only when field has a non-empty value)
    if (value !== undefined && value !== null && value !== '') {
      const strVal = typeof value === 'string' ? value.trim() : String(value)

      // Email
      if (field.field_type === 'email' && strVal) {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(strVal)) {
          errors.push({
            profile_path: field.profile_path,
            label: field.label,
            message: 'Please enter a valid email address (e.g. name@example.com)',
          })
        }
      }

      // Date
      if (field.field_type === 'date' && strVal) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(strVal)) {
          errors.push({
            profile_path: field.profile_path,
            label: field.label,
            message: 'Please select a valid date',
          })
        }
      }

      // Number
      if (field.field_type === 'number') {
        const numVal = typeof value === 'number' ? value : Number(value)
        if (isNaN(numVal)) {
          errors.push({
            profile_path: field.profile_path,
            label: field.label,
            message: 'Please enter a valid number',
          })
        }
      }

      // Phone
      if (field.field_type === 'phone' && strVal) {
        const digitsOnly = strVal.replace(/[\s\-().+]/g, '')
        if (digitsOnly.length > 0 && !/^\d{3,15}$/.test(digitsOnly)) {
          errors.push({
            profile_path: field.profile_path,
            label: field.label,
            message: 'Please enter a valid phone number',
          })
        }
      }

      // Max length
      if (field.max_length && typeof value === 'string' && value.length > field.max_length) {
        errors.push({
          profile_path: field.profile_path,
          label: field.label,
          message: `Cannot exceed ${field.max_length} characters`,
        })
      }
    }
  }

  return errors
}

/**
 * Validate the entire questionnaire.
 */
export function validateQuestionnaire(
  sections: IRCCFormSection[],
  currentValues: Record<string, unknown>,
): ValidationError[] {
  return sections.flatMap((section) => validateSection(section, currentValues))
}
