/**
 * ===========================================================================
 * Validation Engine — Comprehensive Tests
 * ===========================================================================
 *
 * Covers every exported function and branch:
 *   - validateIntake  (hard stops + red flags combined)
 *   - getHardStopRules
 *   - getRedFlagRules
 *
 * Hard-stop rules tested:
 *   UNSUPPORTED_JURISDICTION, IN_CANADA_LOCATION_MISMATCH,
 *   IN_CANADA_STATUS_INVALID, MARITAL_SPOUSE_MISMATCH,
 *   DEPENDENTS_COUNT_MISMATCH, CRIMINAL_NO_DETAILS
 *
 * Red-flag rules tested:
 *   RELATIONSHIP_HISTORY_CONTRADICTION, TRAVEL_CONTRADICTION,
 *   EMPLOYER_WP_CONTRADICTION, PRIOR_RELATIONSHIP_INCONSISTENCY,
 *   INADMISSIBILITY_NO_DETAILS, STATUS_EXPIRED, STATUS_EXPIRY_APPROACHING
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { PersonData, ValidationInput } from '../validation-engine'

// ─── Mock jurisdiction config ────────────────────────────────────────────────

vi.mock('@/lib/config/jurisdictions', () => ({
  ENABLED_JURISDICTIONS: ['CA'],
}))

// Import after mock is registered
import { validateIntake, getHardStopRules, getRedFlagRules } from '../validation-engine'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makePerson(overrides: Partial<PersonData> = {}): PersonData {
  return {
    id: 'person-1',
    person_role: 'principal_applicant',
    first_name: 'Zia',
    last_name: 'Waseer',
    immigration_status: 'work_permit',
    status_expiry_date: null,
    marital_status: 'single',
    currently_in_canada: true,
    country_of_residence: 'CA',
    criminal_charges: false,
    criminal_details: null,
    inadmissibility_flag: false,
    inadmissibility_details: null,
    number_of_dependents: 0,
    travel_history_flag: false,
    employer_name: null,
    work_permit_type: null,
    previous_marriage: false,
    relationship_to_pa: null,
    ...overrides,
  }
}

function makeInput(overrides: Partial<ValidationInput> = {}): ValidationInput {
  return {
    intake: {
      processing_stream: 'express_entry',
      program_category: 'federal_skilled_worker',
      jurisdiction: 'CA',
    },
    people: [makePerson()],
    ...overrides,
  }
}

// ─── Catalogue functions ────────────────────────────────────────────────────

describe('getHardStopRules', () => {
  it('returns all 5 hard-stop rule definitions', () => {
    const rules = getHardStopRules()
    expect(rules).toHaveLength(5)
    const codes = rules.map((r) => r.code)
    expect(codes).toEqual([
      'IN_CANADA_LOCATION_MISMATCH',
      'IN_CANADA_STATUS_INVALID',
      'MARITAL_SPOUSE_MISMATCH',
      'DEPENDENTS_COUNT_MISMATCH',
      'CRIMINAL_NO_DETAILS',
    ])
    rules.forEach((r) => {
      expect(r.description).toBeTruthy()
    })
  })
})

describe('getRedFlagRules', () => {
  it('returns all 7 red-flag rule definitions with scoreImpact', () => {
    const rules = getRedFlagRules()
    expect(rules).toHaveLength(7)
    const codes = rules.map((r) => r.code)
    expect(codes).toEqual([
      'RELATIONSHIP_HISTORY_CONTRADICTION',
      'TRAVEL_CONTRADICTION',
      'EMPLOYER_WP_CONTRADICTION',
      'PRIOR_RELATIONSHIP_INCONSISTENCY',
      'INADMISSIBILITY_NO_DETAILS',
      'STATUS_EXPIRED',
      'STATUS_EXPIRY_APPROACHING',
    ])
    rules.forEach((r) => {
      expect(typeof r.scoreImpact).toBe('number')
      expect(r.scoreImpact).toBeGreaterThan(0)
    })
  })
})

// ─── validateIntake — clean input ───────────────────────────────────────────

describe('validateIntake', () => {
  describe('clean input', () => {
    it('returns no issues and isValid = true for valid data', () => {
      const result = validateIntake(makeInput())
      expect(result.hardStops).toHaveLength(0)
      expect(result.redFlags).toHaveLength(0)
      expect(result.isValid).toBe(true)
    })

    it('returns isValid = true when there are red flags but no hard stops', () => {
      const input = makeInput({
        people: [
          makePerson({ marital_status: 'single', previous_marriage: true }),
        ],
      })
      const result = validateIntake(input)
      expect(result.hardStops).toHaveLength(0)
      expect(result.redFlags.length).toBeGreaterThan(0)
      expect(result.isValid).toBe(true)
    })
  })

  // ─── No principal applicant ───────────────────────────────────────────────

  describe('no principal applicant', () => {
    it('returns no hard stops and no red flags when PA is missing', () => {
      const input = makeInput({
        people: [makePerson({ person_role: 'spouse' })],
      })
      const result = validateIntake(input)
      expect(result.hardStops).toHaveLength(0)
      expect(result.redFlags).toHaveLength(0)
      expect(result.isValid).toBe(true)
    })
  })

  // ─── Hard-stop: UNSUPPORTED_JURISDICTION ──────────────────────────────────

  describe('UNSUPPORTED_JURISDICTION', () => {
    it('fires for a jurisdiction not in ENABLED_JURISDICTIONS', () => {
      const input = makeInput()
      input.intake.jurisdiction = 'US'
      const result = validateIntake(input)
      expect(result.hardStops).toHaveLength(1)
      expect(result.hardStops[0].code).toBe('UNSUPPORTED_JURISDICTION')
      expect(result.hardStops[0].severity).toBe('hard_stop')
      expect(result.hardStops[0].field).toBe('jurisdiction')
      expect(result.isValid).toBe(false)
    })

    it('short-circuits — no other hard stops are checked', () => {
      // Add data that would trigger other hard stops if jurisdiction passed
      const input = makeInput({
        people: [
          makePerson({
            currently_in_canada: true,
            country_of_residence: 'IN',
            criminal_charges: true,
            criminal_details: null,
          }),
        ],
      })
      input.intake.jurisdiction = 'GB'
      const result = validateIntake(input)
      // Only the jurisdiction hard stop should appear
      expect(result.hardStops).toHaveLength(1)
      expect(result.hardStops[0].code).toBe('UNSUPPORTED_JURISDICTION')
    })

    it('does not fire for a supported jurisdiction', () => {
      const input = makeInput()
      input.intake.jurisdiction = 'CA'
      const result = validateIntake(input)
      const codes = result.hardStops.map((h) => h.code)
      expect(codes).not.toContain('UNSUPPORTED_JURISDICTION')
    })
  })

  // ─── Hard-stop: IN_CANADA_LOCATION_MISMATCH ──────────────────────────────

  describe('IN_CANADA_LOCATION_MISMATCH', () => {
    it('fires when PA is in Canada but country_of_residence is not CA/CANADA', () => {
      const input = makeInput({
        people: [
          makePerson({
            currently_in_canada: true,
            country_of_residence: 'IN',
          }),
        ],
      })
      const result = validateIntake(input)
      const issue = result.hardStops.find((h) => h.code === 'IN_CANADA_LOCATION_MISMATCH')
      expect(issue).toBeDefined()
      expect(issue!.severity).toBe('hard_stop')
      expect(issue!.field).toBe('pa.country_of_residence')
      expect(issue!.personId).toBe('person-1')
    })

    it('does NOT fire when country_of_residence is "CA" (uppercase)', () => {
      const input = makeInput({
        people: [
          makePerson({ currently_in_canada: true, country_of_residence: 'CA' }),
        ],
      })
      const result = validateIntake(input)
      const codes = result.hardStops.map((h) => h.code)
      expect(codes).not.toContain('IN_CANADA_LOCATION_MISMATCH')
    })

    it('does NOT fire when country_of_residence is "Canada" (case-insensitive)', () => {
      const input = makeInput({
        people: [
          makePerson({ currently_in_canada: true, country_of_residence: 'canada' }),
        ],
      })
      const result = validateIntake(input)
      const codes = result.hardStops.map((h) => h.code)
      expect(codes).not.toContain('IN_CANADA_LOCATION_MISMATCH')
    })

    it('does NOT fire when currently_in_canada is false', () => {
      const input = makeInput({
        people: [
          makePerson({ currently_in_canada: false, country_of_residence: 'IN' }),
        ],
      })
      const result = validateIntake(input)
      const codes = result.hardStops.map((h) => h.code)
      expect(codes).not.toContain('IN_CANADA_LOCATION_MISMATCH')
    })

    it('does NOT fire when currently_in_canada is null', () => {
      const input = makeInput({
        people: [
          makePerson({ currently_in_canada: null, country_of_residence: 'IN' }),
        ],
      })
      const result = validateIntake(input)
      const codes = result.hardStops.map((h) => h.code)
      expect(codes).not.toContain('IN_CANADA_LOCATION_MISMATCH')
    })

    it('does NOT fire when country_of_residence is null', () => {
      const input = makeInput({
        people: [
          makePerson({ currently_in_canada: true, country_of_residence: null }),
        ],
      })
      const result = validateIntake(input)
      const codes = result.hardStops.map((h) => h.code)
      expect(codes).not.toContain('IN_CANADA_LOCATION_MISMATCH')
    })
  })

  // ─── Hard-stop: IN_CANADA_STATUS_INVALID ──────────────────────────────────

  describe('IN_CANADA_STATUS_INVALID', () => {
    it.each(['expired', 'unknown', 'no_status'])(
      'fires when PA is in Canada with status "%s"',
      (status) => {
        const input = makeInput({
          people: [
            makePerson({
              currently_in_canada: true,
              immigration_status: status,
            }),
          ],
        })
        const result = validateIntake(input)
        const issue = result.hardStops.find((h) => h.code === 'IN_CANADA_STATUS_INVALID')
        expect(issue).toBeDefined()
        expect(issue!.message).toContain(status)
      }
    )

    it('does NOT fire for valid status "work_permit"', () => {
      const input = makeInput({
        people: [
          makePerson({ currently_in_canada: true, immigration_status: 'work_permit' }),
        ],
      })
      const result = validateIntake(input)
      const codes = result.hardStops.map((h) => h.code)
      expect(codes).not.toContain('IN_CANADA_STATUS_INVALID')
    })

    it('does NOT fire when currently_in_canada is false', () => {
      const input = makeInput({
        people: [
          makePerson({ currently_in_canada: false, immigration_status: 'expired' }),
        ],
      })
      const result = validateIntake(input)
      const codes = result.hardStops.map((h) => h.code)
      expect(codes).not.toContain('IN_CANADA_STATUS_INVALID')
    })

    it('does NOT fire when immigration_status is null', () => {
      const input = makeInput({
        people: [
          makePerson({ currently_in_canada: true, immigration_status: null }),
        ],
      })
      const result = validateIntake(input)
      const codes = result.hardStops.map((h) => h.code)
      expect(codes).not.toContain('IN_CANADA_STATUS_INVALID')
    })
  })

  // ─── Hard-stop: MARITAL_SPOUSE_MISMATCH ───────────────────────────────────

  describe('MARITAL_SPOUSE_MISMATCH', () => {
    it.each(['married', 'common_law'])(
      'fires when PA marital_status is "%s" but no spouse on file',
      (status) => {
        const input = makeInput({
          people: [makePerson({ marital_status: status })],
        })
        const result = validateIntake(input)
        const issue = result.hardStops.find((h) => h.code === 'MARITAL_SPOUSE_MISMATCH')
        expect(issue).toBeDefined()
        expect(issue!.message).toContain(status)
      }
    )

    it('does NOT fire when a spouse person exists', () => {
      const input = makeInput({
        people: [
          makePerson({ marital_status: 'married' }),
          makePerson({ person_role: 'spouse', id: 'person-2' }),
        ],
      })
      const result = validateIntake(input)
      const codes = result.hardStops.map((h) => h.code)
      expect(codes).not.toContain('MARITAL_SPOUSE_MISMATCH')
    })

    it('does NOT fire when marital_status is "single"', () => {
      const input = makeInput({
        people: [makePerson({ marital_status: 'single' })],
      })
      const result = validateIntake(input)
      const codes = result.hardStops.map((h) => h.code)
      expect(codes).not.toContain('MARITAL_SPOUSE_MISMATCH')
    })

    it('does NOT fire when marital_status is null', () => {
      const input = makeInput({
        people: [makePerson({ marital_status: null })],
      })
      const result = validateIntake(input)
      const codes = result.hardStops.map((h) => h.code)
      expect(codes).not.toContain('MARITAL_SPOUSE_MISMATCH')
    })
  })

  // ─── Hard-stop: DEPENDENTS_COUNT_MISMATCH ─────────────────────────────────

  describe('DEPENDENTS_COUNT_MISMATCH', () => {
    it('fires when declared dependents != actual dependent count', () => {
      const input = makeInput({
        people: [
          makePerson({ number_of_dependents: 2 }),
          makePerson({ person_role: 'dependent', id: 'dep-1' }),
        ],
      })
      const result = validateIntake(input)
      const issue = result.hardStops.find((h) => h.code === 'DEPENDENTS_COUNT_MISMATCH')
      expect(issue).toBeDefined()
      expect(issue!.message).toContain('2')
      expect(issue!.message).toContain('1')
    })

    it('does NOT fire when counts match', () => {
      const input = makeInput({
        people: [
          makePerson({ number_of_dependents: 1 }),
          makePerson({ person_role: 'dependent', id: 'dep-1' }),
        ],
      })
      const result = validateIntake(input)
      const codes = result.hardStops.map((h) => h.code)
      expect(codes).not.toContain('DEPENDENTS_COUNT_MISMATCH')
    })

    it('does NOT fire when number_of_dependents is 0', () => {
      const input = makeInput({
        people: [makePerson({ number_of_dependents: 0 })],
      })
      const result = validateIntake(input)
      const codes = result.hardStops.map((h) => h.code)
      expect(codes).not.toContain('DEPENDENTS_COUNT_MISMATCH')
    })

    it('fires when declared 0 dependents but actually 0 — no issue (guard: > 0)', () => {
      // Confirms the > 0 guard: if PA says 0 dependents but there are 2 dependents,
      // no hard stop fires because the check only runs when number_of_dependents > 0
      const input = makeInput({
        people: [
          makePerson({ number_of_dependents: 0 }),
          makePerson({ person_role: 'dependent', id: 'dep-1' }),
          makePerson({ person_role: 'dependent', id: 'dep-2' }),
        ],
      })
      const result = validateIntake(input)
      const codes = result.hardStops.map((h) => h.code)
      expect(codes).not.toContain('DEPENDENTS_COUNT_MISMATCH')
    })
  })

  // ─── Hard-stop: CRIMINAL_NO_DETAILS ───────────────────────────────────────

  describe('CRIMINAL_NO_DETAILS', () => {
    it('fires when criminal_charges is true but criminal_details is null', () => {
      const input = makeInput({
        people: [
          makePerson({ criminal_charges: true, criminal_details: null }),
        ],
      })
      const result = validateIntake(input)
      const issue = result.hardStops.find((h) => h.code === 'CRIMINAL_NO_DETAILS')
      expect(issue).toBeDefined()
      expect(issue!.field).toBe('principal_applicant.criminal_details')
    })

    it('fires when criminal_details is empty string', () => {
      const input = makeInput({
        people: [
          makePerson({ criminal_charges: true, criminal_details: '' }),
        ],
      })
      const result = validateIntake(input)
      expect(result.hardStops.some((h) => h.code === 'CRIMINAL_NO_DETAILS')).toBe(true)
    })

    it('fires when criminal_details is whitespace only', () => {
      const input = makeInput({
        people: [
          makePerson({ criminal_charges: true, criminal_details: '   ' }),
        ],
      })
      const result = validateIntake(input)
      expect(result.hardStops.some((h) => h.code === 'CRIMINAL_NO_DETAILS')).toBe(true)
    })

    it('does NOT fire when criminal_charges is false', () => {
      const input = makeInput({
        people: [
          makePerson({ criminal_charges: false, criminal_details: null }),
        ],
      })
      const result = validateIntake(input)
      const codes = result.hardStops.map((h) => h.code)
      expect(codes).not.toContain('CRIMINAL_NO_DETAILS')
    })

    it('does NOT fire when criminal_details has content', () => {
      const input = makeInput({
        people: [
          makePerson({ criminal_charges: true, criminal_details: 'DUI 2020' }),
        ],
      })
      const result = validateIntake(input)
      const codes = result.hardStops.map((h) => h.code)
      expect(codes).not.toContain('CRIMINAL_NO_DETAILS')
    })

    it('checks ALL people, not just PA', () => {
      const input = makeInput({
        people: [
          makePerson(),
          makePerson({
            person_role: 'spouse',
            id: 'person-2',
            first_name: 'Jane',
            criminal_charges: true,
            criminal_details: null,
          }),
        ],
      })
      const result = validateIntake(input)
      const issue = result.hardStops.find(
        (h) => h.code === 'CRIMINAL_NO_DETAILS' && h.personId === 'person-2'
      )
      expect(issue).toBeDefined()
      expect(issue!.field).toBe('spouse.criminal_details')
    })
  })

  // ─── Red-flag: RELATIONSHIP_HISTORY_CONTRADICTION ─────────────────────────

  describe('RELATIONSHIP_HISTORY_CONTRADICTION', () => {
    it('fires when PA is single but has previous_marriage = true', () => {
      const input = makeInput({
        people: [
          makePerson({ marital_status: 'single', previous_marriage: true }),
        ],
      })
      const result = validateIntake(input)
      const issue = result.redFlags.find((r) => r.code === 'RELATIONSHIP_HISTORY_CONTRADICTION')
      expect(issue).toBeDefined()
      expect(issue!.severity).toBe('red_flag')
      expect(issue!.scoreImpact).toBe(15)
    })

    it('does NOT fire when PA is married with previous_marriage', () => {
      const input = makeInput({
        people: [
          makePerson({ marital_status: 'married', previous_marriage: true }),
          makePerson({ person_role: 'spouse', id: 'sp' }),
        ],
      })
      const result = validateIntake(input)
      const codes = result.redFlags.map((r) => r.code)
      expect(codes).not.toContain('RELATIONSHIP_HISTORY_CONTRADICTION')
    })

    it('does NOT fire when PA is single with previous_marriage = false', () => {
      const input = makeInput({
        people: [
          makePerson({ marital_status: 'single', previous_marriage: false }),
        ],
      })
      const result = validateIntake(input)
      const codes = result.redFlags.map((r) => r.code)
      expect(codes).not.toContain('RELATIONSHIP_HISTORY_CONTRADICTION')
    })
  })

  // ─── Red-flag: TRAVEL_CONTRADICTION ───────────────────────────────────────

  describe('TRAVEL_CONTRADICTION', () => {
    it('fires when PA is outside Canada but country_of_residence is CA', () => {
      const input = makeInput({
        people: [
          makePerson({ currently_in_canada: false, country_of_residence: 'CA' }),
        ],
      })
      const result = validateIntake(input)
      const issue = result.redFlags.find((r) => r.code === 'TRAVEL_CONTRADICTION')
      expect(issue).toBeDefined()
      expect(issue!.scoreImpact).toBe(10)
    })

    it('fires when country_of_residence is "CANADA" (case-insensitive)', () => {
      const input = makeInput({
        people: [
          makePerson({ currently_in_canada: false, country_of_residence: 'Canada' }),
        ],
      })
      const result = validateIntake(input)
      expect(result.redFlags.some((r) => r.code === 'TRAVEL_CONTRADICTION')).toBe(true)
    })

    it('does NOT fire when PA is outside Canada and residence is non-CA', () => {
      const input = makeInput({
        people: [
          makePerson({ currently_in_canada: false, country_of_residence: 'US' }),
        ],
      })
      const result = validateIntake(input)
      const codes = result.redFlags.map((r) => r.code)
      expect(codes).not.toContain('TRAVEL_CONTRADICTION')
    })

    it('does NOT fire when currently_in_canada is true', () => {
      const input = makeInput({
        people: [
          makePerson({ currently_in_canada: true, country_of_residence: 'CA' }),
        ],
      })
      const result = validateIntake(input)
      const codes = result.redFlags.map((r) => r.code)
      expect(codes).not.toContain('TRAVEL_CONTRADICTION')
    })

    it('does NOT fire when currently_in_canada is null', () => {
      const input = makeInput({
        people: [
          makePerson({ currently_in_canada: null, country_of_residence: 'CA' }),
        ],
      })
      const result = validateIntake(input)
      const codes = result.redFlags.map((r) => r.code)
      expect(codes).not.toContain('TRAVEL_CONTRADICTION')
    })

    it('does NOT fire when country_of_residence is null', () => {
      const input = makeInput({
        people: [
          makePerson({ currently_in_canada: false, country_of_residence: null }),
        ],
      })
      const result = validateIntake(input)
      const codes = result.redFlags.map((r) => r.code)
      expect(codes).not.toContain('TRAVEL_CONTRADICTION')
    })
  })

  // ─── Red-flag: EMPLOYER_WP_CONTRADICTION ──────────────────────────────────

  describe('EMPLOYER_WP_CONTRADICTION', () => {
    it('fires when person has employer but no valid work authorisation', () => {
      const input = makeInput({
        people: [
          makePerson({
            employer_name: 'Acme Corp',
            immigration_status: 'visitor',
            work_permit_type: null,
          }),
        ],
      })
      const result = validateIntake(input)
      const issue = result.redFlags.find((r) => r.code === 'EMPLOYER_WP_CONTRADICTION')
      expect(issue).toBeDefined()
      expect(issue!.scoreImpact).toBe(10)
      expect(issue!.message).toContain('visitor')
    })

    it('fires when immigration_status is null (displayed as "not set")', () => {
      const input = makeInput({
        people: [
          makePerson({
            employer_name: 'Acme Corp',
            immigration_status: null,
            work_permit_type: null,
          }),
        ],
      })
      const result = validateIntake(input)
      const issue = result.redFlags.find((r) => r.code === 'EMPLOYER_WP_CONTRADICTION')
      expect(issue).toBeDefined()
      expect(issue!.message).toContain('not set')
    })

    it.each(['work_permit', 'permanent_resident', 'citizen'])(
      'does NOT fire when immigration_status is "%s"',
      (status) => {
        const input = makeInput({
          people: [
            makePerson({
              employer_name: 'Acme Corp',
              immigration_status: status,
              work_permit_type: null,
            }),
          ],
        })
        const result = validateIntake(input)
        const codes = result.redFlags.map((r) => r.code)
        expect(codes).not.toContain('EMPLOYER_WP_CONTRADICTION')
      }
    )

    it('does NOT fire when work_permit_type is set', () => {
      const input = makeInput({
        people: [
          makePerson({
            employer_name: 'Acme Corp',
            immigration_status: 'visitor',
            work_permit_type: 'open_work_permit',
          }),
        ],
      })
      const result = validateIntake(input)
      const codes = result.redFlags.map((r) => r.code)
      expect(codes).not.toContain('EMPLOYER_WP_CONTRADICTION')
    })

    it('does NOT fire when employer_name is null', () => {
      const input = makeInput({
        people: [
          makePerson({ employer_name: null, immigration_status: 'visitor' }),
        ],
      })
      const result = validateIntake(input)
      const codes = result.redFlags.map((r) => r.code)
      expect(codes).not.toContain('EMPLOYER_WP_CONTRADICTION')
    })

    it('does NOT fire when employer_name is empty/whitespace', () => {
      const input = makeInput({
        people: [
          makePerson({ employer_name: '  ', immigration_status: 'visitor' }),
        ],
      })
      const result = validateIntake(input)
      const codes = result.redFlags.map((r) => r.code)
      expect(codes).not.toContain('EMPLOYER_WP_CONTRADICTION')
    })

    it('checks ALL people, not just PA', () => {
      const input = makeInput({
        people: [
          makePerson(),
          makePerson({
            person_role: 'spouse',
            id: 'sp-1',
            first_name: 'Jane',
            employer_name: 'WidgetCo',
            immigration_status: 'visitor',
            work_permit_type: null,
          }),
        ],
      })
      const result = validateIntake(input)
      const issue = result.redFlags.find(
        (r) => r.code === 'EMPLOYER_WP_CONTRADICTION' && r.personId === 'sp-1'
      )
      expect(issue).toBeDefined()
      expect(issue!.field).toBe('spouse.employer_name')
    })
  })

  // ─── Red-flag: PRIOR_RELATIONSHIP_INCONSISTENCY ───────────────────────────

  describe('PRIOR_RELATIONSHIP_INCONSISTENCY', () => {
    it('fires when spouse has previous_marriage but PA does not', () => {
      const input = makeInput({
        people: [
          makePerson({ marital_status: 'married', previous_marriage: false }),
          makePerson({
            person_role: 'spouse',
            id: 'sp-1',
            previous_marriage: true,
          }),
        ],
      })
      const result = validateIntake(input)
      const issue = result.redFlags.find((r) => r.code === 'PRIOR_RELATIONSHIP_INCONSISTENCY')
      expect(issue).toBeDefined()
      expect(issue!.scoreImpact).toBe(5)
    })

    it('does NOT fire when both have previous_marriage = true', () => {
      const input = makeInput({
        people: [
          makePerson({ marital_status: 'married', previous_marriage: true }),
          makePerson({
            person_role: 'spouse',
            id: 'sp-1',
            previous_marriage: true,
          }),
        ],
      })
      const result = validateIntake(input)
      const codes = result.redFlags.map((r) => r.code)
      expect(codes).not.toContain('PRIOR_RELATIONSHIP_INCONSISTENCY')
    })

    it('does NOT fire when no spouse exists', () => {
      const input = makeInput({
        people: [makePerson({ previous_marriage: false })],
      })
      const result = validateIntake(input)
      const codes = result.redFlags.map((r) => r.code)
      expect(codes).not.toContain('PRIOR_RELATIONSHIP_INCONSISTENCY')
    })

    it('does NOT fire when spouse has previous_marriage = false', () => {
      const input = makeInput({
        people: [
          makePerson({ marital_status: 'married', previous_marriage: false }),
          makePerson({
            person_role: 'spouse',
            id: 'sp-1',
            previous_marriage: false,
          }),
        ],
      })
      const result = validateIntake(input)
      const codes = result.redFlags.map((r) => r.code)
      expect(codes).not.toContain('PRIOR_RELATIONSHIP_INCONSISTENCY')
    })
  })

  // ─── Red-flag: INADMISSIBILITY_NO_DETAILS ─────────────────────────────────

  describe('INADMISSIBILITY_NO_DETAILS', () => {
    it('fires when inadmissibility_flag is true but details are null', () => {
      const input = makeInput({
        people: [
          makePerson({ inadmissibility_flag: true, inadmissibility_details: null }),
        ],
      })
      const result = validateIntake(input)
      const issue = result.redFlags.find((r) => r.code === 'INADMISSIBILITY_NO_DETAILS')
      expect(issue).toBeDefined()
      expect(issue!.scoreImpact).toBe(10)
    })

    it('fires when details are empty string', () => {
      const input = makeInput({
        people: [
          makePerson({ inadmissibility_flag: true, inadmissibility_details: '' }),
        ],
      })
      const result = validateIntake(input)
      expect(result.redFlags.some((r) => r.code === 'INADMISSIBILITY_NO_DETAILS')).toBe(true)
    })

    it('fires when details are whitespace only', () => {
      const input = makeInput({
        people: [
          makePerson({ inadmissibility_flag: true, inadmissibility_details: '   ' }),
        ],
      })
      const result = validateIntake(input)
      expect(result.redFlags.some((r) => r.code === 'INADMISSIBILITY_NO_DETAILS')).toBe(true)
    })

    it('does NOT fire when flag is false', () => {
      const input = makeInput({
        people: [
          makePerson({ inadmissibility_flag: false }),
        ],
      })
      const result = validateIntake(input)
      const codes = result.redFlags.map((r) => r.code)
      expect(codes).not.toContain('INADMISSIBILITY_NO_DETAILS')
    })

    it('does NOT fire when details have content', () => {
      const input = makeInput({
        people: [
          makePerson({ inadmissibility_flag: true, inadmissibility_details: 'Section 36(1)' }),
        ],
      })
      const result = validateIntake(input)
      const codes = result.redFlags.map((r) => r.code)
      expect(codes).not.toContain('INADMISSIBILITY_NO_DETAILS')
    })

    it('checks ALL people', () => {
      const input = makeInput({
        people: [
          makePerson(),
          makePerson({
            person_role: 'dependent',
            id: 'dep-1',
            first_name: 'Child',
            inadmissibility_flag: true,
            inadmissibility_details: null,
          }),
        ],
      })
      const result = validateIntake(input)
      const issue = result.redFlags.find(
        (r) => r.code === 'INADMISSIBILITY_NO_DETAILS' && r.personId === 'dep-1'
      )
      expect(issue).toBeDefined()
      expect(issue!.field).toBe('dependent.inadmissibility_details')
    })
  })

  // ─── Red-flag: STATUS_EXPIRED / STATUS_EXPIRY_APPROACHING ────────────────

  describe('STATUS_EXPIRED and STATUS_EXPIRY_APPROACHING', () => {
    let realDateNow: () => number

    beforeEach(() => {
      realDateNow = Date.now
    })

    afterEach(() => {
      Date.now = realDateNow
      vi.useRealTimers()
    })

    it('fires STATUS_EXPIRED when expiry is in the past', () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-06-15'))

      const input = makeInput({
        people: [
          makePerson({ status_expiry_date: '2026-01-01' }),
        ],
      })
      const result = validateIntake(input)
      const issue = result.redFlags.find((r) => r.code === 'STATUS_EXPIRED')
      expect(issue).toBeDefined()
      expect(issue!.scoreImpact).toBe(15)
      expect(issue!.message).toContain('2026-01-01')
    })

    it('fires STATUS_EXPIRY_APPROACHING when expiry is within 90 days', () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-06-01'))

      const input = makeInput({
        people: [
          makePerson({ status_expiry_date: '2026-08-01' }),
        ],
      })
      const result = validateIntake(input)
      const issue = result.redFlags.find((r) => r.code === 'STATUS_EXPIRY_APPROACHING')
      expect(issue).toBeDefined()
      expect(issue!.scoreImpact).toBe(10)
      expect(issue!.message).toContain('within 90 days')
    })

    it('does NOT fire either when expiry is more than 90 days away', () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-01-01'))

      const input = makeInput({
        people: [
          makePerson({ status_expiry_date: '2027-06-01' }),
        ],
      })
      const result = validateIntake(input)
      const codes = result.redFlags.map((r) => r.code)
      expect(codes).not.toContain('STATUS_EXPIRED')
      expect(codes).not.toContain('STATUS_EXPIRY_APPROACHING')
    })

    it('does NOT fire when status_expiry_date is null', () => {
      const input = makeInput({
        people: [makePerson({ status_expiry_date: null })],
      })
      const result = validateIntake(input)
      const codes = result.redFlags.map((r) => r.code)
      expect(codes).not.toContain('STATUS_EXPIRED')
      expect(codes).not.toContain('STATUS_EXPIRY_APPROACHING')
    })

    it('fires STATUS_EXPIRED when expiry equals today (already expired)', () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-06-15T12:00:00Z'))

      // Date string parsed as midnight UTC — which is <= now
      const input = makeInput({
        people: [
          makePerson({ status_expiry_date: '2026-06-15' }),
        ],
      })
      const result = validateIntake(input)
      const issue = result.redFlags.find((r) => r.code === 'STATUS_EXPIRED')
      expect(issue).toBeDefined()
    })

    it('checks ALL people for expiry', () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-06-15'))

      const input = makeInput({
        people: [
          makePerson({ status_expiry_date: null }),
          makePerson({
            person_role: 'spouse',
            id: 'sp-1',
            first_name: 'Jane',
            status_expiry_date: '2026-01-01',
          }),
        ],
      })
      const result = validateIntake(input)
      const issue = result.redFlags.find(
        (r) => r.code === 'STATUS_EXPIRED' && r.personId === 'sp-1'
      )
      expect(issue).toBeDefined()
      expect(issue!.field).toBe('spouse.status_expiry_date')
    })
  })

  // ─── Combined scenarios ───────────────────────────────────────────────────

  describe('combined scenarios', () => {
    it('returns multiple hard stops and red flags simultaneously', () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-06-15'))

      const input = makeInput({
        people: [
          makePerson({
            marital_status: 'married',
            previous_marriage: false,
            criminal_charges: true,
            criminal_details: null,
            number_of_dependents: 1,
            status_expiry_date: '2026-01-01',
          }),
          makePerson({
            person_role: 'spouse',
            id: 'sp-1',
            previous_marriage: true,
            inadmissibility_flag: true,
            inadmissibility_details: null,
          }),
        ],
      })

      const result = validateIntake(input)

      // Hard stops: MARITAL_SPOUSE_MISMATCH won't fire (spouse exists),
      // DEPENDENTS_COUNT_MISMATCH (1 declared, 0 dependent roles),
      // CRIMINAL_NO_DETAILS
      expect(result.hardStops.some((h) => h.code === 'DEPENDENTS_COUNT_MISMATCH')).toBe(true)
      expect(result.hardStops.some((h) => h.code === 'CRIMINAL_NO_DETAILS')).toBe(true)

      // Red flags: PRIOR_RELATIONSHIP_INCONSISTENCY, INADMISSIBILITY_NO_DETAILS, STATUS_EXPIRED
      expect(result.redFlags.some((r) => r.code === 'PRIOR_RELATIONSHIP_INCONSISTENCY')).toBe(true)
      expect(result.redFlags.some((r) => r.code === 'INADMISSIBILITY_NO_DETAILS')).toBe(true)
      expect(result.redFlags.some((r) => r.code === 'STATUS_EXPIRED')).toBe(true)

      expect(result.isValid).toBe(false)

      vi.useRealTimers()
    })

    it('isValid is based only on hardStops, not redFlags', () => {
      const input = makeInput({
        people: [
          makePerson({
            marital_status: 'single',
            previous_marriage: true,
            inadmissibility_flag: true,
            inadmissibility_details: null,
          }),
        ],
      })
      const result = validateIntake(input)
      expect(result.redFlags.length).toBeGreaterThan(0)
      expect(result.hardStops).toHaveLength(0)
      expect(result.isValid).toBe(true)
    })
  })
})
