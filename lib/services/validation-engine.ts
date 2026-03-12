// ============================================================================
// Universal Enforcement Engine — Validation Engine
// Pure TypeScript module. No database dependency.
// Takes structured data as input, returns hard-stops + red-flags.
// ============================================================================

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PersonData {
  id?: string
  person_role: string
  first_name: string
  last_name: string
  immigration_status: string | null
  status_expiry_date: string | null
  marital_status: string | null
  currently_in_canada: boolean | null
  country_of_residence: string | null
  criminal_charges: boolean
  criminal_details: string | null
  inadmissibility_flag: boolean
  inadmissibility_details: string | null
  number_of_dependents: number
  travel_history_flag: boolean
  employer_name: string | null
  work_permit_type: string | null
  previous_marriage: boolean
  relationship_to_pa: string | null
}

export interface ValidationInput {
  intake: {
    processing_stream: string | null
    program_category: string | null
    jurisdiction: string
  }
  people: PersonData[]
}

export interface ValidationIssue {
  code: string
  message: string
  severity: 'hard_stop' | 'red_flag'
  field: string
  personId?: string
  scoreImpact?: number
}

export interface ValidationResult {
  hardStops: ValidationIssue[]
  redFlags: ValidationIssue[]
  isValid: boolean
}

// ─── Constants ───────────────────────────────────────────────────────────────

const INVALID_IN_CANADA_STATUSES = ['expired', 'unknown', 'no_status']
const MARRIED_STATUSES = ['married', 'common_law']

// Jurisdiction enforcement — fail loud for unsupported jurisdictions
import { ENABLED_JURISDICTIONS } from '@/lib/config/jurisdictions'

// ─── Hard-Stop Rules ─────────────────────────────────────────────────────────

function checkHardStops(input: ValidationInput): ValidationIssue[] {
  const issues: ValidationIssue[] = []

  // Jurisdiction gate — unsupported jurisdictions produce a hard stop
  if (input.intake.jurisdiction && !ENABLED_JURISDICTIONS.includes(input.intake.jurisdiction)) {
    issues.push({
      code: 'UNSUPPORTED_JURISDICTION',
      message: `Jurisdiction "${input.intake.jurisdiction}" is not currently supported. Only ${ENABLED_JURISDICTIONS.join(', ')} is available.`,
      severity: 'hard_stop',
      field: 'jurisdiction',
    })
    return issues // No point validating further
  }

  const pa = input.people.find((p) => p.person_role === 'principal_applicant')

  if (!pa) return issues

  // 1. IN_CANADA_LOCATION_MISMATCH
  if (
    pa.currently_in_canada === true &&
    pa.country_of_residence &&
    pa.country_of_residence.toUpperCase() !== 'CA' &&
    pa.country_of_residence.toUpperCase() !== 'CANADA'
  ) {
    issues.push({
      code: 'IN_CANADA_LOCATION_MISMATCH',
      message: `${pa.first_name} is marked as currently in Canada but country of residence is "${pa.country_of_residence}". Please correct.`,
      severity: 'hard_stop',
      field: 'pa.country_of_residence',
      personId: pa.id,
    })
  }

  // 2. IN_CANADA_STATUS_INVALID
  if (
    pa.currently_in_canada === true &&
    pa.immigration_status &&
    INVALID_IN_CANADA_STATUSES.includes(pa.immigration_status)
  ) {
    issues.push({
      code: 'IN_CANADA_STATUS_INVALID',
      message: `${pa.first_name} is in Canada but immigration status is "${pa.immigration_status}". A valid status is required to proceed.`,
      severity: 'hard_stop',
      field: 'pa.immigration_status',
      personId: pa.id,
    })
  }

  // 3. MARITAL_SPOUSE_MISMATCH
  if (
    pa.marital_status &&
    MARRIED_STATUSES.includes(pa.marital_status) &&
    !input.people.some((p) => p.person_role === 'spouse')
  ) {
    issues.push({
      code: 'MARITAL_SPOUSE_MISMATCH',
      message: `${pa.first_name} is listed as "${pa.marital_status}" but no spouse/partner has been added to this file.`,
      severity: 'hard_stop',
      field: 'pa.marital_status',
      personId: pa.id,
    })
  }

  // 4. DEPENDENTS_COUNT_MISMATCH
  if (pa.number_of_dependents > 0) {
    const actualDependents = input.people.filter((p) => p.person_role === 'dependent').length
    if (actualDependents !== pa.number_of_dependents) {
      issues.push({
        code: 'DEPENDENTS_COUNT_MISMATCH',
        message: `${pa.first_name} declared ${pa.number_of_dependents} dependent(s) but ${actualDependents} dependent(s) are on file.`,
        severity: 'hard_stop',
        field: 'pa.number_of_dependents',
        personId: pa.id,
      })
    }
  }

  // 5. CRIMINAL_NO_DETAILS — applies to ALL people
  for (const person of input.people) {
    if (person.criminal_charges && (!person.criminal_details || person.criminal_details.trim() === '')) {
      issues.push({
        code: 'CRIMINAL_NO_DETAILS',
        message: `${person.first_name} ${person.last_name} has criminal charges flagged but no details provided.`,
        severity: 'hard_stop',
        field: `${person.person_role}.criminal_details`,
        personId: person.id,
      })
    }
  }

  return issues
}

// ─── Red-Flag Rules ──────────────────────────────────────────────────────────

function checkRedFlags(input: ValidationInput): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const pa = input.people.find((p) => p.person_role === 'principal_applicant')

  if (!pa) return issues

  // 1. RELATIONSHIP_HISTORY_CONTRADICTION
  if (pa.marital_status === 'single' && pa.previous_marriage) {
    issues.push({
      code: 'RELATIONSHIP_HISTORY_CONTRADICTION',
      message: `${pa.first_name} is listed as single but has a previous marriage/relationship flagged. Verify relationship history.`,
      severity: 'red_flag',
      field: 'pa.previous_marriage',
      personId: pa.id,
      scoreImpact: 15,
    })
  }

  // 2. TRAVEL_CONTRADICTION
  if (pa.currently_in_canada === false && pa.country_of_residence) {
    const isCA = ['CA', 'CANADA'].includes(pa.country_of_residence.toUpperCase())
    if (isCA) {
      issues.push({
        code: 'TRAVEL_CONTRADICTION',
        message: `${pa.first_name} is marked as outside Canada but country of residence is Canada. Verify current location.`,
        severity: 'red_flag',
        field: 'pa.currently_in_canada',
        personId: pa.id,
        scoreImpact: 10,
      })
    }
  }

  // 3. EMPLOYER_WP_CONTRADICTION
  for (const person of input.people) {
    if (
      person.employer_name &&
      person.employer_name.trim() !== '' &&
      person.immigration_status !== 'work_permit' &&
      person.immigration_status !== 'permanent_resident' &&
      person.immigration_status !== 'citizen' &&
      !person.work_permit_type
    ) {
      issues.push({
        code: 'EMPLOYER_WP_CONTRADICTION',
        message: `${person.first_name} ${person.last_name} has an employer listed but status is "${person.immigration_status ?? 'not set'}" with no work permit type.`,
        severity: 'red_flag',
        field: `${person.person_role}.employer_name`,
        personId: person.id,
        scoreImpact: 10,
      })
    }
  }

  // 4. PRIOR_RELATIONSHIP_INCONSISTENCY
  const spouse = input.people.find((p) => p.person_role === 'spouse')
  if (spouse && pa.previous_marriage === false && spouse.previous_marriage === true) {
    issues.push({
      code: 'PRIOR_RELATIONSHIP_INCONSISTENCY',
      message: `Spouse has a previous marriage flagged but principal applicant does not. Verify consistency.`,
      severity: 'red_flag',
      field: 'pa.previous_marriage',
      personId: pa.id,
      scoreImpact: 5,
    })
  }

  // 5. INADMISSIBILITY_NO_DETAILS — check all people
  for (const person of input.people) {
    if (person.inadmissibility_flag && (!person.inadmissibility_details || person.inadmissibility_details.trim() === '')) {
      issues.push({
        code: 'INADMISSIBILITY_NO_DETAILS',
        message: `${person.first_name} ${person.last_name} has inadmissibility flagged but no details provided.`,
        severity: 'red_flag',
        field: `${person.person_role}.inadmissibility_details`,
        personId: person.id,
        scoreImpact: 10,
      })
    }
  }

  // 6. STATUS_EXPIRY_APPROACHING — check if status expires within 90 days
  const now = new Date()
  const ninetyDaysFromNow = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000)
  for (const person of input.people) {
    if (person.status_expiry_date) {
      const expiry = new Date(person.status_expiry_date)
      if (expiry <= now) {
        issues.push({
          code: 'STATUS_EXPIRED',
          message: `${person.first_name} ${person.last_name}'s immigration status expired on ${person.status_expiry_date}.`,
          severity: 'red_flag',
          field: `${person.person_role}.status_expiry_date`,
          personId: person.id,
          scoreImpact: 15,
        })
      } else if (expiry <= ninetyDaysFromNow) {
        issues.push({
          code: 'STATUS_EXPIRY_APPROACHING',
          message: `${person.first_name} ${person.last_name}'s immigration status expires on ${person.status_expiry_date} (within 90 days).`,
          severity: 'red_flag',
          field: `${person.person_role}.status_expiry_date`,
          personId: person.id,
          scoreImpact: 10,
        })
      }
    }
  }

  return issues
}

// ─── Public API ──────────────────────────────────────────────────────────────

export function validateIntake(input: ValidationInput): ValidationResult {
  const hardStops = checkHardStops(input)
  const redFlags = checkRedFlags(input)

  return {
    hardStops,
    redFlags,
    isValid: hardStops.length === 0,
  }
}

export function getHardStopRules(): Array<{ code: string; description: string }> {
  return [
    { code: 'IN_CANADA_LOCATION_MISMATCH', description: 'Currently in Canada but country of residence is not Canada' },
    { code: 'IN_CANADA_STATUS_INVALID', description: 'In Canada but immigration status is expired, unknown, or no status' },
    { code: 'MARITAL_SPOUSE_MISMATCH', description: 'Married/common-law but no spouse person on file' },
    { code: 'DEPENDENTS_COUNT_MISMATCH', description: 'Declared dependents count does not match actual dependents on file' },
    { code: 'CRIMINAL_NO_DETAILS', description: 'Criminal charges flagged but no details provided' },
  ]
}

export function getRedFlagRules(): Array<{ code: string; description: string; scoreImpact: number }> {
  return [
    { code: 'RELATIONSHIP_HISTORY_CONTRADICTION', description: 'Single but previous marriage flagged', scoreImpact: 15 },
    { code: 'TRAVEL_CONTRADICTION', description: 'In Canada flag contradicts country of residence', scoreImpact: 10 },
    { code: 'EMPLOYER_WP_CONTRADICTION', description: 'Has employer but no work authorisation', scoreImpact: 10 },
    { code: 'PRIOR_RELATIONSHIP_INCONSISTENCY', description: 'Spouse previous marriage inconsistent with PA', scoreImpact: 5 },
    { code: 'INADMISSIBILITY_NO_DETAILS', description: 'Inadmissibility flagged but no details', scoreImpact: 10 },
    { code: 'STATUS_EXPIRED', description: 'Immigration status has expired', scoreImpact: 15 },
    { code: 'STATUS_EXPIRY_APPROACHING', description: 'Immigration status expires within 90 days', scoreImpact: 10 },
  ]
}
