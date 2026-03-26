/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Form Validator  -  per-form validation rules for IRCC XFA field data
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Pure synchronous module  -  no I/O, no DB access.
 *
 * Usage:
 *   const result = validateFormData('IMM5257E', scalarFields, { forFinalPack: true })
 *   if (result.blockingErrors.length > 0) { ... block generation ... }
 *
 * Rule types:
 *   required      -  field must have a non-empty value
 *   min_length    -  value must be at least N characters
 *   max_length    -  value must not exceed N characters
 *   date_range    -  date string must fall within [min, max]
 *   pattern       -  value must match a regex
 *   cross_field   -  one field's value constrains another
 *
 * Draft vs Final:
 *   - Draft packs: all errors collected but none are blocking
 *   - Final packs: blocking=true errors prevent generation
 */

import type { FormValidationError } from '@/lib/types/form-packs'

// ── Rule definitions ────────────────────────────────────────────────────────

type RuleType = 'required' | 'min_length' | 'max_length' | 'date_range' | 'pattern' | 'cross_field'

interface BaseRule {
  type: RuleType
  xfa_path: string
  profile_path: string
  label: string
  blocking: boolean
}

interface RequiredRule extends BaseRule {
  type: 'required'
}

interface MinLengthRule extends BaseRule {
  type: 'min_length'
  min: number
}

interface MaxLengthRule extends BaseRule {
  type: 'max_length'
  max: number
}

interface DateRangeRule extends BaseRule {
  type: 'date_range'
  /** ISO date string  -  field value must be on or after this date */
  min?: string
  /** ISO date string  -  field value must be on or before this date */
  max?: string
}

interface PatternRule extends BaseRule {
  type: 'pattern'
  pattern: RegExp
  hint: string
}

interface CrossFieldRule extends BaseRule {
  type: 'cross_field'
  /** XFA path of the field whose value conditionally triggers this rule */
  depends_on_xfa_path: string
  /** Values of depends_on field that trigger the requirement */
  trigger_values: string[]
  /** Inner rule applied when trigger fires */
  inner_rule:
    | { type: 'required' }
    | { type: 'min_length'; min: number }
    | { type: 'pattern'; pattern: RegExp; hint: string }
}

type ValidationRule =
  | RequiredRule
  | MinLengthRule
  | MaxLengthRule
  | DateRangeRule
  | PatternRule
  | CrossFieldRule

// ── Result type ─────────────────────────────────────────────────────────────

export interface FormValidationResult {
  /** All errors found (blocking + non-blocking) */
  allErrors: FormValidationError[]
  /** Errors that block final pack generation */
  blockingErrors: FormValidationError[]
  /** Whether this form can produce a final pack */
  canGenerateFinal: boolean
}

// ── IRCC-specific field labels (shared across forms) ─────────────────────────

const FAMILY_NAME_PATH = 'Page1.PersonalDetails.Name.FamilyName'
const GIVEN_NAME_PATH = 'Page1.PersonalDetails.Name.GivenName'
const DOB_YEAR_PATH = 'Page1.PersonalDetails.DOBYr'
const DOB_MO_PATH = 'Page1.PersonalDetails.DOBMo'
const DOB_DAY_PATH = 'Page1.PersonalDetails.DOBDay'
const SEX_PATH = 'Page1.PersonalDetails.Sex'
const CITIZENSHIP_PATH = 'Page1.PersonalDetails.CitizenshipCountry'
const MARITAL_PATH = 'Page1.PersonalDetails.MaritalStatus'

// ── Per-form rule registries ─────────────────────────────────────────────────

/**
 * Base rules shared by all IRCC temporary resident / visitor forms.
 * Applied regardless of form code when no specific override exists.
 */
const BASE_RULES: ValidationRule[] = [
  {
    type: 'required',
    xfa_path: FAMILY_NAME_PATH,
    profile_path: 'personal.family_name',
    label: 'Family Name',
    blocking: true,
  },
  {
    type: 'required',
    xfa_path: GIVEN_NAME_PATH,
    profile_path: 'personal.given_name',
    label: 'Given Name',
    blocking: true,
  },
  {
    type: 'required',
    xfa_path: DOB_YEAR_PATH,
    profile_path: 'personal.date_of_birth',
    label: 'Date of Birth (Year)',
    blocking: true,
  },
  {
    type: 'required',
    xfa_path: DOB_MO_PATH,
    profile_path: 'personal.date_of_birth',
    label: 'Date of Birth (Month)',
    blocking: true,
  },
  {
    type: 'required',
    xfa_path: DOB_DAY_PATH,
    profile_path: 'personal.date_of_birth',
    label: 'Date of Birth (Day)',
    blocking: true,
  },
  {
    type: 'required',
    xfa_path: SEX_PATH,
    profile_path: 'personal.sex',
    label: 'Sex',
    blocking: true,
  },
  {
    type: 'required',
    xfa_path: CITIZENSHIP_PATH,
    profile_path: 'personal.citizenship',
    label: 'Citizenship Country',
    blocking: true,
  },
]

/** IMM5257E  -  Application for Temporary Resident Visa */
const IMM5257E_RULES: ValidationRule[] = [
  ...BASE_RULES,
  {
    type: 'required',
    xfa_path: 'Page1.PersonalDetails.MaritalStatus',
    profile_path: 'marital.status',
    label: 'Marital Status',
    blocking: true,
  },
  {
    type: 'required',
    xfa_path: 'Page1.TripDetails.PurposeOfVisit',
    profile_path: 'visit.purpose',
    label: 'Purpose of Visit',
    blocking: true,
  },
  {
    type: 'max_length',
    xfa_path: 'Page1.PersonalDetails.Name.FamilyName',
    profile_path: 'personal.family_name',
    label: 'Family Name',
    max: 100,
    blocking: false,
  },
  {
    type: 'cross_field',
    xfa_path: 'Page1.PersonalDetails.SpouseFamilyName',
    profile_path: 'marital.spouse_family_name',
    label: "Spouse's Family Name",
    blocking: true,
    depends_on_xfa_path: MARITAL_PATH,
    trigger_values: ['Married', 'Common-Law', '1', '2'],
    inner_rule: { type: 'required' },
  },
]

/** IMM5406  -  Additional Family Information */
const IMM5406_RULES: ValidationRule[] = [
  {
    type: 'required',
    xfa_path: 'Page1.ApplicantInfo.FamilyName',
    profile_path: 'personal.family_name',
    label: 'Family Name',
    blocking: true,
  },
  {
    type: 'required',
    xfa_path: 'Page1.ApplicantInfo.GivenName',
    profile_path: 'personal.given_name',
    label: 'Given Name',
    blocking: true,
  },
  {
    type: 'required',
    xfa_path: 'Page1.ApplicantInfo.DOBYr',
    profile_path: 'personal.date_of_birth',
    label: 'Date of Birth (Year)',
    blocking: true,
  },
]

/** IMM5476E  -  Use of a Representative */
const IMM5476E_RULES: ValidationRule[] = [
  {
    type: 'required',
    xfa_path: 'Page1.ApplicantInfo.FamilyName',
    profile_path: 'personal.family_name',
    label: 'Applicant Family Name',
    blocking: true,
  },
  {
    type: 'required',
    xfa_path: 'Page1.ApplicantInfo.GivenName',
    profile_path: 'personal.given_name',
    label: 'Applicant Given Name',
    blocking: true,
  },
]

/** Rule registry: form_code → rules */
const FORM_RULES: Record<string, ValidationRule[]> = {
  IMM5257E: IMM5257E_RULES,
  IMM5406: IMM5406_RULES,
  IMM5476E: IMM5476E_RULES,
}

// ── Rule evaluation ─────────────────────────────────────────────────────────

function evalRule(
  rule: ValidationRule,
  scalarFields: Record<string, string>,
): FormValidationError | null {
  const val = (scalarFields[rule.xfa_path] ?? '').trim()

  switch (rule.type) {
    case 'required': {
      if (!val) {
        return {
          code: 'missing_required',
          profile_path: rule.profile_path,
          message: `${rule.label} is required`,
          blocking: rule.blocking,
        }
      }
      return null
    }

    case 'min_length': {
      if (val && val.length < rule.min) {
        return {
          code: 'value_too_short',
          profile_path: rule.profile_path,
          message: `${rule.label} must be at least ${rule.min} characters`,
          blocking: rule.blocking,
        }
      }
      return null
    }

    case 'max_length': {
      if (val && val.length > rule.max) {
        return {
          code: 'value_too_long',
          profile_path: rule.profile_path,
          message: `${rule.label} must not exceed ${rule.max} characters (currently ${val.length})`,
          blocking: rule.blocking,
        }
      }
      return null
    }

    case 'date_range': {
      if (!val) return null
      const dateVal = new Date(val)
      if (isNaN(dateVal.getTime())) return null
      if (rule.min && dateVal < new Date(rule.min)) {
        return {
          code: 'date_out_of_range',
          profile_path: rule.profile_path,
          message: `${rule.label} must be on or after ${rule.min}`,
          blocking: rule.blocking,
        }
      }
      if (rule.max && dateVal > new Date(rule.max)) {
        return {
          code: 'date_out_of_range',
          profile_path: rule.profile_path,
          message: `${rule.label} must be on or before ${rule.max}`,
          blocking: rule.blocking,
        }
      }
      return null
    }

    case 'pattern': {
      if (val && !rule.pattern.test(val)) {
        return {
          code: 'pattern_mismatch',
          profile_path: rule.profile_path,
          message: `${rule.label}: ${rule.hint}`,
          blocking: rule.blocking,
        }
      }
      return null
    }

    case 'cross_field': {
      const triggerVal = (scalarFields[rule.depends_on_xfa_path] ?? '').trim()
      if (!rule.trigger_values.includes(triggerVal)) return null
      // Trigger fired  -  evaluate inner rule
      const innerVal = val
      const innerRule = rule.inner_rule
      if (innerRule.type === 'required' && !innerVal) {
        return {
          code: 'missing_required',
          profile_path: rule.profile_path,
          message: `${rule.label} is required when marital status is set`,
          blocking: rule.blocking,
        }
      }
      if (innerRule.type === 'min_length' && innerVal && innerVal.length < innerRule.min) {
        return {
          code: 'value_too_short',
          profile_path: rule.profile_path,
          message: `${rule.label} must be at least ${innerRule.min} characters`,
          blocking: rule.blocking,
        }
      }
      if (innerRule.type === 'pattern' && innerVal && !innerRule.pattern.test(innerVal)) {
        return {
          code: 'pattern_mismatch',
          profile_path: rule.profile_path,
          message: `${rule.label}: ${innerRule.hint}`,
          blocking: rule.blocking,
        }
      }
      return null
    }

    default:
      return null
  }
}

// ── Main export ─────────────────────────────────────────────────────────────

/**
 * Validate resolved XFA scalar fields against form-specific rules.
 *
 * @param formCode     - IRCC form code (e.g. 'IMM5257E')
 * @param scalarFields - Map of xfa_path → resolved string value (same object sent to Python filler)
 * @param options.forFinalPack - When true, blocking errors prevent generation
 * @returns FormValidationResult
 */
export function validateFormData(
  formCode: string,
  scalarFields: Record<string, string>,
  options: { forFinalPack: boolean } = { forFinalPack: false },
): FormValidationResult {
  const rules = FORM_RULES[formCode] ?? BASE_RULES

  const allErrors: FormValidationError[] = []

  for (const rule of rules) {
    const err = evalRule(rule, scalarFields)
    if (err) {
      // In draft mode, downgrade all errors to non-blocking
      allErrors.push(options.forFinalPack ? err : { ...err, blocking: false })
    }
  }

  const blockingErrors = allErrors.filter((e) => e.blocking)

  return {
    allErrors,
    blockingErrors,
    canGenerateFinal: blockingErrors.length === 0,
  }
}
