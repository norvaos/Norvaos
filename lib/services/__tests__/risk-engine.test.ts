/**
 * Tests for lib/services/risk-engine.ts
 *
 * Covers:
 *   mapScoreToLevel  -  all four level thresholds + boundary values
 *   calculateRisk  -  unsupported jurisdiction, criminal charges, inadmissibility,
 *     PA status expired/unknown, PA in Canada with no valid status,
 *     complexity modifiers (dependents, previous marriage, additional people,
 *     high-complexity programs), red flag score aggregation, score cap at 100
 */

import { describe, it, expect, vi } from 'vitest'
import type { PersonData, ValidationResult } from '../validation-engine'
import type { RiskInput } from '../risk-engine'

// ─── Mock jurisdictions before importing the module under test ────────────────

vi.mock('@/lib/config/jurisdictions', () => ({
  ENABLED_JURISDICTIONS: ['CA'],
}))

// Import after mock is established
const { mapScoreToLevel, calculateRisk } = await import('../risk-engine')

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makePerson(overrides?: Partial<PersonData>): PersonData {
  return {
    person_role: 'principal_applicant',
    first_name: 'Jane',
    last_name: 'Doe',
    immigration_status: 'valid',
    status_expiry_date: '2027-01-01',
    marital_status: 'single',
    currently_in_canada: false,
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

function makeValidationResult(overrides?: Partial<ValidationResult>): ValidationResult {
  return {
    hardStops: [],
    redFlags: [],
    isValid: true,
    ...overrides,
  }
}

function makeInput(overrides?: Partial<RiskInput>): RiskInput {
  return {
    intake: {
      processing_stream: 'economic',
      program_category: 'express_entry',
      jurisdiction: 'CA',
    },
    people: [makePerson()],
    validationResult: makeValidationResult(),
    ...overrides,
  }
}

// ─── mapScoreToLevel ──────────────────────────────────────────────────────────

describe('mapScoreToLevel', () => {
  it('returns "low" for scores 0–25', () => {
    expect(mapScoreToLevel(0)).toBe('low')
    expect(mapScoreToLevel(10)).toBe('low')
    expect(mapScoreToLevel(25)).toBe('low')
  })

  it('returns "medium" for scores 26–50', () => {
    expect(mapScoreToLevel(26)).toBe('medium')
    expect(mapScoreToLevel(38)).toBe('medium')
    expect(mapScoreToLevel(50)).toBe('medium')
  })

  it('returns "high" for scores 51–75', () => {
    expect(mapScoreToLevel(51)).toBe('high')
    expect(mapScoreToLevel(63)).toBe('high')
    expect(mapScoreToLevel(75)).toBe('high')
  })

  it('returns "critical" for scores 76–100', () => {
    expect(mapScoreToLevel(76)).toBe('critical')
    expect(mapScoreToLevel(88)).toBe('critical')
    expect(mapScoreToLevel(100)).toBe('critical')
  })

  it('handles negative scores as "low"', () => {
    expect(mapScoreToLevel(-5)).toBe('low')
  })

  it('handles scores above 100 as "critical"', () => {
    expect(mapScoreToLevel(150)).toBe('critical')
  })
})

// ─── calculateRisk  -  Unsupported Jurisdiction ─────────────────────────────────

describe('calculateRisk  -  unsupported jurisdiction', () => {
  it('returns max risk (100 / critical) for unsupported jurisdiction', () => {
    const input = makeInput({
      intake: { processing_stream: null, program_category: null, jurisdiction: 'US' },
    })
    const result = calculateRisk(input)
    expect(result.score).toBe(100)
    expect(result.level).toBe('critical')
    expect(result.breakdown).toEqual({
      baseScore: 100,
      complexityScore: 0,
      redFlagScore: 0,
      totalBeforeCap: 100,
    })
  })

  it('returns max risk for completely unknown jurisdiction', () => {
    const input = makeInput({
      intake: { processing_stream: null, program_category: null, jurisdiction: 'XX' },
    })
    expect(calculateRisk(input).score).toBe(100)
  })

  it('does NOT trigger unsupported-jurisdiction path when jurisdiction is undefined', () => {
    const input = makeInput({
      intake: { processing_stream: null, program_category: null },
    })
    const result = calculateRisk(input)
    expect(result.score).toBeLessThan(100)
  })
})

// ─── calculateRisk  -  Base Score ───────────────────────────────────────────────

describe('calculateRisk  -  base score', () => {
  it('returns 0 base score for clean PA with no flags', () => {
    const result = calculateRisk(makeInput())
    expect(result.breakdown.baseScore).toBe(0)
    expect(result.score).toBe(0)
    expect(result.level).toBe('low')
  })

  it('adds 25 when any person has criminal charges', () => {
    const input = makeInput({
      people: [
        makePerson(),
        makePerson({ person_role: 'spouse', criminal_charges: true }),
      ],
    })
    const result = calculateRisk(input)
    expect(result.breakdown.baseScore).toBe(25)
  })

  it('adds 20 when any person has inadmissibility flag', () => {
    const input = makeInput({
      people: [makePerson({ inadmissibility_flag: true })],
    })
    const result = calculateRisk(input)
    expect(result.breakdown.baseScore).toBe(20)
  })

  it('adds 15 when PA immigration_status is "expired"', () => {
    const input = makeInput({
      people: [makePerson({ immigration_status: 'expired', currently_in_canada: false })],
    })
    const result = calculateRisk(input)
    // 15 for expired status only (not in Canada)
    expect(result.breakdown.baseScore).toBe(15)
  })

  it('adds 15 when PA immigration_status is "unknown"', () => {
    const input = makeInput({
      people: [makePerson({ immigration_status: 'unknown', currently_in_canada: false })],
    })
    expect(calculateRisk(input).breakdown.baseScore).toBe(15)
  })

  it('adds 20 when PA is in Canada with "no_status"', () => {
    const input = makeInput({
      people: [makePerson({ currently_in_canada: true, immigration_status: 'no_status' })],
    })
    // Only the "in Canada with no valid status" branch applies (no_status is not in expired/unknown for +15)
    expect(calculateRisk(input).breakdown.baseScore).toBe(20)
  })

  it('adds 15 + 20 = 35 when PA is in Canada with "expired" status', () => {
    const input = makeInput({
      people: [makePerson({ currently_in_canada: true, immigration_status: 'expired' })],
    })
    // +15 for expired status + +20 for in Canada with invalid status
    expect(calculateRisk(input).breakdown.baseScore).toBe(35)
  })

  it('stacks criminal + inadmissibility = 45', () => {
    const input = makeInput({
      people: [makePerson({ criminal_charges: true, inadmissibility_flag: true })],
    })
    expect(calculateRisk(input).breakdown.baseScore).toBe(45)
  })

  it('stacks all base score flags to maximum', () => {
    const input = makeInput({
      people: [
        makePerson({
          criminal_charges: true,
          inadmissibility_flag: true,
          immigration_status: 'expired',
          currently_in_canada: true,
        }),
      ],
    })
    // 25 + 20 + 15 + 20 = 80
    expect(calculateRisk(input).breakdown.baseScore).toBe(80)
  })

  it('does not add PA status penalty when PA is missing', () => {
    const input = makeInput({
      people: [makePerson({ person_role: 'spouse', immigration_status: 'expired' })],
    })
    // No PA found, so +15 for expired and +20 for in-Canada rules do not apply
    expect(calculateRisk(input).breakdown.baseScore).toBe(0)
  })
})

// ─── calculateRisk  -  Complexity Score ─────────────────────────────────────────

describe('calculateRisk  -  complexity score', () => {
  it('adds 5 for 3+ dependents', () => {
    const input = makeInput({
      people: [
        makePerson(),
        makePerson({ person_role: 'dependent' }),
        makePerson({ person_role: 'dependent' }),
        makePerson({ person_role: 'dependent' }),
      ],
    })
    const result = calculateRisk(input)
    // +5 for 3 dependents + 3 additional people * 2 = 11
    expect(result.breakdown.complexityScore).toBe(11)
  })

  it('does NOT add dependent bonus for 2 dependents', () => {
    const input = makeInput({
      people: [
        makePerson(),
        makePerson({ person_role: 'dependent' }),
        makePerson({ person_role: 'dependent' }),
      ],
    })
    const result = calculateRisk(input)
    // 0 for dependents (<3) + 2 additional * 2 = 4
    expect(result.breakdown.complexityScore).toBe(4)
  })

  it('adds 5 for PA previous marriage', () => {
    const input = makeInput({
      people: [makePerson({ previous_marriage: true })],
    })
    const result = calculateRisk(input)
    // +5 for previous marriage, 0 additional people
    expect(result.breakdown.complexityScore).toBe(5)
  })

  it('adds +2 per additional person, capped at +10', () => {
    const input = makeInput({
      people: [
        makePerson(),
        makePerson({ person_role: 'spouse' }),
        makePerson({ person_role: 'dependent' }),
        makePerson({ person_role: 'dependent' }),
        makePerson({ person_role: 'dependent' }),
        makePerson({ person_role: 'dependent' }),
        makePerson({ person_role: 'dependent' }),
        makePerson({ person_role: 'dependent' }),
      ],
    })
    const result = calculateRisk(input)
    // additional = min(7, 5) = 5 => 5*2 = 10
    // dependents = 6 >= 3 => +5
    expect(result.breakdown.complexityScore).toBe(15)
  })

  it('adds 10 for refugee program category', () => {
    const input = makeInput({
      intake: { processing_stream: null, program_category: 'refugee', jurisdiction: 'CA' },
    })
    expect(calculateRisk(input).breakdown.complexityScore).toBe(10)
  })

  it('adds 10 for humanitarian program category', () => {
    const input = makeInput({
      intake: { processing_stream: null, program_category: 'humanitarian', jurisdiction: 'CA' },
    })
    expect(calculateRisk(input).breakdown.complexityScore).toBe(10)
  })

  it('adds 10 for judicial_review program category', () => {
    const input = makeInput({
      intake: { processing_stream: null, program_category: 'judicial_review', jurisdiction: 'CA' },
    })
    expect(calculateRisk(input).breakdown.complexityScore).toBe(10)
  })

  it('does NOT add program bonus for non-high-complexity program', () => {
    const input = makeInput({
      intake: { processing_stream: null, program_category: 'express_entry', jurisdiction: 'CA' },
    })
    expect(calculateRisk(input).breakdown.complexityScore).toBe(0)
  })

  it('does NOT add program bonus when program_category is null', () => {
    const input = makeInput({
      intake: { processing_stream: null, program_category: null, jurisdiction: 'CA' },
    })
    expect(calculateRisk(input).breakdown.complexityScore).toBe(0)
  })
})

// ─── calculateRisk  -  Red Flag Score ───────────────────────────────────────────

describe('calculateRisk  -  red flag score', () => {
  it('sums scoreImpact from all red flags', () => {
    const input = makeInput({
      validationResult: makeValidationResult({
        redFlags: [
          { code: 'RF1', message: 'Flag 1', severity: 'red_flag', field: 'f1', scoreImpact: 10 },
          { code: 'RF2', message: 'Flag 2', severity: 'red_flag', field: 'f2', scoreImpact: 15 },
        ],
      }),
    })
    expect(calculateRisk(input).breakdown.redFlagScore).toBe(25)
  })

  it('treats undefined scoreImpact as 0', () => {
    const input = makeInput({
      validationResult: makeValidationResult({
        redFlags: [
          { code: 'RF1', message: 'Flag 1', severity: 'red_flag', field: 'f1' },
          { code: 'RF2', message: 'Flag 2', severity: 'red_flag', field: 'f2', scoreImpact: 7 },
        ],
      }),
    })
    expect(calculateRisk(input).breakdown.redFlagScore).toBe(7)
  })

  it('returns 0 red flag score when there are no red flags', () => {
    const input = makeInput()
    expect(calculateRisk(input).breakdown.redFlagScore).toBe(0)
  })
})

// ─── calculateRisk  -  Score Cap ────────────────────────────────────────────────

describe('calculateRisk  -  score cap', () => {
  it('caps total score at 100', () => {
    const input = makeInput({
      people: [
        makePerson({
          criminal_charges: true,
          inadmissibility_flag: true,
          immigration_status: 'expired',
          currently_in_canada: true,
          previous_marriage: true,
        }),
      ],
      intake: { processing_stream: null, program_category: 'refugee', jurisdiction: 'CA' },
      validationResult: makeValidationResult({
        redFlags: [
          { code: 'RF1', message: 'Big flag', severity: 'red_flag', field: 'f1', scoreImpact: 50 },
        ],
      }),
    })
    const result = calculateRisk(input)
    // base: 25+20+15+20 = 80, complexity: 5+10 = 15, redFlag: 50 => total = 145
    expect(result.breakdown.totalBeforeCap).toBe(145)
    expect(result.score).toBe(100)
    expect(result.level).toBe('critical')
  })

  it('does not cap when total is exactly 100', () => {
    // Construct input that totals exactly 100
    // base: 25 (criminal) + 20 (inadmissibility) = 45
    // complexity: 5 (prev marriage) = 5
    // redFlag: 50
    const input = makeInput({
      people: [
        makePerson({ criminal_charges: true, inadmissibility_flag: true, previous_marriage: true }),
      ],
      validationResult: makeValidationResult({
        redFlags: [
          { code: 'RF1', message: 'Flag', severity: 'red_flag', field: 'f', scoreImpact: 50 },
        ],
      }),
    })
    const result = calculateRisk(input)
    expect(result.breakdown.totalBeforeCap).toBe(100)
    expect(result.score).toBe(100)
  })
})

// ─── calculateRisk  -  Level Integration ────────────────────────────────────────

describe('calculateRisk  -  level integration', () => {
  it('returns "low" level for clean input', () => {
    expect(calculateRisk(makeInput()).level).toBe('low')
  })

  it('returns "medium" level for moderate risk', () => {
    const input = makeInput({
      people: [makePerson({ criminal_charges: true })],
    })
    // base: 25, complexity: 0, redFlag: 0 => score 25 => "low"
    // Need score 26+ for medium
    const inputWithExtra = makeInput({
      people: [makePerson({ criminal_charges: true })],
      validationResult: makeValidationResult({
        redFlags: [
          { code: 'RF1', message: 'Tiny', severity: 'red_flag', field: 'f', scoreImpact: 5 },
        ],
      }),
    })
    expect(calculateRisk(inputWithExtra).level).toBe('medium')
  })

  it('returns "high" level for elevated risk', () => {
    const input = makeInput({
      people: [makePerson({ criminal_charges: true, inadmissibility_flag: true })],
      validationResult: makeValidationResult({
        redFlags: [
          { code: 'RF1', message: 'Flag', severity: 'red_flag', field: 'f', scoreImpact: 10 },
        ],
      }),
    })
    // base: 45, complexity: 0, redFlag: 10 => 55 => "high"
    expect(calculateRisk(input).level).toBe('high')
  })

  it('returns "critical" level for high-risk input', () => {
    const input = makeInput({
      people: [
        makePerson({
          criminal_charges: true,
          inadmissibility_flag: true,
          immigration_status: 'expired',
          currently_in_canada: true,
        }),
      ],
    })
    // base: 80, complexity: 0, redFlag: 0 => 80 => "critical"
    expect(calculateRisk(input).level).toBe('critical')
  })
})

// ─── calculateRisk  -  Edge Cases ───────────────────────────────────────────────

describe('calculateRisk  -  edge cases', () => {
  it('handles empty people array', () => {
    const input = makeInput({ people: [] })
    const result = calculateRisk(input)
    // No PA, no people => base 0, complexity: min(-1,5)*2 but -1 clamped
    // additionalPeople = min(0 - 1, 5) = -1 => -1 * 2 = -2
    // This is a quirk  -  the engine does not guard against empty people
    expect(result.breakdown.baseScore).toBe(0)
    expect(result.breakdown.complexityScore).toBe(-2)
  })

  it('handles single PA only (no additional people)', () => {
    const input = makeInput({
      people: [makePerson()],
    })
    const result = calculateRisk(input)
    // additionalPeople = min(1 - 1, 5) = 0 => 0
    expect(result.breakdown.complexityScore).toBe(0)
  })

  it('correctly identifies PA among multiple people', () => {
    const input = makeInput({
      people: [
        makePerson({ person_role: 'spouse', immigration_status: 'expired', currently_in_canada: true }),
        makePerson({ person_role: 'principal_applicant', immigration_status: 'valid', currently_in_canada: false }),
      ],
    })
    const result = calculateRisk(input)
    // PA has valid status and is not in Canada, so no PA-specific base flags
    expect(result.breakdown.baseScore).toBe(0)
  })

  it('returns full breakdown structure', () => {
    const result = calculateRisk(makeInput())
    expect(result).toHaveProperty('score')
    expect(result).toHaveProperty('level')
    expect(result).toHaveProperty('breakdown')
    expect(result.breakdown).toHaveProperty('baseScore')
    expect(result.breakdown).toHaveProperty('complexityScore')
    expect(result.breakdown).toHaveProperty('redFlagScore')
    expect(result.breakdown).toHaveProperty('totalBeforeCap')
  })

  it('enabled jurisdiction (CA) does NOT trigger max-risk path', () => {
    const input = makeInput({
      intake: { processing_stream: null, program_category: null, jurisdiction: 'CA' },
    })
    const result = calculateRisk(input)
    expect(result.score).not.toBe(100)
    expect(result.breakdown.baseScore).not.toBe(100)
  })
})
