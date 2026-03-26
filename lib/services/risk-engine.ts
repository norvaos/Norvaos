// ============================================================================
// Universal Enforcement Engine  -  Risk Scoring Engine
// Pure TypeScript module. No database dependency.
// Takes intake data + validation result, returns numeric risk score + level.
// ============================================================================

import type { PersonData, ValidationResult } from './validation-engine'
import { ENABLED_JURISDICTIONS } from '@/lib/config/jurisdictions'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface RiskInput {
  intake: {
    processing_stream: string | null
    program_category: string | null
    jurisdiction?: string
  }
  people: PersonData[]
  validationResult: ValidationResult
}

export interface RiskBreakdown {
  baseScore: number
  complexityScore: number
  redFlagScore: number
  totalBeforeCap: number
}

export interface RiskOutput {
  score: number
  level: 'low' | 'medium' | 'high' | 'critical'
  breakdown: RiskBreakdown
}

// ─── Level Mapping ───────────────────────────────────────────────────────────

export function mapScoreToLevel(score: number): 'low' | 'medium' | 'high' | 'critical' {
  if (score >= 76) return 'critical'
  if (score >= 51) return 'high'
  if (score >= 26) return 'medium'
  return 'low'
}

// ─── Scoring Algorithm ───────────────────────────────────────────────────────

export function calculateRisk(input: RiskInput): RiskOutput {
  // Fail loud for unsupported jurisdictions  -  return max risk
  if (input.intake.jurisdiction && !ENABLED_JURISDICTIONS.includes(input.intake.jurisdiction)) {
    return {
      score: 100,
      level: 'critical',
      breakdown: { baseScore: 100, complexityScore: 0, redFlagScore: 0, totalBeforeCap: 100 },
    }
  }

  const pa = input.people.find((p) => p.person_role === 'principal_applicant')

  // ── Base Score ──
  let baseScore = 0

  // Criminal charges on any person
  if (input.people.some((p) => p.criminal_charges)) {
    baseScore += 25
  }

  // Inadmissibility flag on any person
  if (input.people.some((p) => p.inadmissibility_flag)) {
    baseScore += 20
  }

  // PA status expired or unknown
  if (pa?.immigration_status && ['expired', 'unknown'].includes(pa.immigration_status)) {
    baseScore += 15
  }

  // PA in Canada with no valid status
  if (
    pa?.currently_in_canada === true &&
    pa?.immigration_status &&
    ['no_status', 'expired', 'unknown'].includes(pa.immigration_status)
  ) {
    baseScore += 20
  }

  // ── Complexity Modifiers ──
  let complexityScore = 0

  // Multiple dependents (3+)
  const dependentCount = input.people.filter((p) => p.person_role === 'dependent').length
  if (dependentCount >= 3) {
    complexityScore += 5
  }

  // PA previous marriage
  if (pa?.previous_marriage) {
    complexityScore += 5
  }

  // Each additional person beyond PA (+2, max +10)
  const additionalPeople = Math.min(input.people.length - 1, 5)
  complexityScore += additionalPeople * 2

  // High-complexity program categories
  const highComplexityPrograms = ['refugee', 'humanitarian', 'judicial_review']
  if (input.intake.program_category && highComplexityPrograms.includes(input.intake.program_category)) {
    complexityScore += 10
  }

  // ── Red Flag Contributions ──
  let redFlagScore = 0
  for (const flag of input.validationResult.redFlags) {
    redFlagScore += flag.scoreImpact ?? 0
  }

  // ── Total ──
  const totalBeforeCap = baseScore + complexityScore + redFlagScore
  const score = Math.min(totalBeforeCap, 100)

  return {
    score,
    level: mapScoreToLevel(score),
    breakdown: {
      baseScore,
      complexityScore,
      redFlagScore,
      totalBeforeCap,
    },
  }
}
