/**
 * refusal-engine.ts
 *
 * Pure-function engine for IRCC refusal workflow logic.
 * No DB calls — all functions are synchronous and side-effect-free.
 * Sprint 6, Week 2.
 */

// ─── Types ─────────────────────────────────────────────────────────────────

export interface RefusalInput {
  /** Decision date as ISO date string (YYYY-MM-DD or full ISO timestamp) */
  item_date: string
  /** Basis for Judicial Review: inland (15 days) or outside Canada (60 days) */
  jr_basis: 'inland' | 'outside_canada'
  notes?: string
}

export interface ValidationResult {
  valid: boolean
  errors: string[]
}

// ─── JR Deadline Computation ───────────────────────────────────────────────

/**
 * Compute the Judicial Review application deadline from a decision date.
 *
 * Inland:          15 days from decision_date (Federal Courts Act s.18.1(2))
 * Outside Canada:  60 days from decision_date (Federal Courts Act s.18.1(2))
 *
 * @param decisionDate - ISO date string (YYYY-MM-DD) of the IRCC decision
 * @param basis        - 'inland' | 'outside_canada'
 * @returns ISO date string (YYYY-MM-DD)
 */
export function computeJRDeadline(
  decisionDate: string,
  basis: 'inland' | 'outside_canada'
): string {
  const daysToAdd = basis === 'inland' ? 15 : 60

  // Parse YYYY-MM-DD as UTC to avoid timezone-shift bugs.
  // Take only the date portion in case a full ISO timestamp is passed.
  const datePart = decisionDate.substring(0, 10)
  const [year, month, day] = datePart.split('-').map(Number)

  // Construct as UTC date to avoid DST/timezone offsets shifting the day.
  const base = new Date(Date.UTC(year, month - 1, day))
  base.setUTCDate(base.getUTCDate() + daysToAdd)

  // Return as YYYY-MM-DD
  return base.toISOString().substring(0, 10)
}

// ─── Input Validation ──────────────────────────────────────────────────────

/**
 * Validate the body of a handle-refusal request.
 *
 * Rules:
 *  - item_date must be present and parse as a valid date
 *  - jr_basis must be 'inland' or 'outside_canada'
 */
export function validateRefusalInput(input: RefusalInput): ValidationResult {
  const errors: string[] = []

  // Validate item_date
  if (!input.item_date) {
    errors.push('item_date is required')
  } else {
    const datePart = String(input.item_date).substring(0, 10)
    const parsed = new Date(datePart)
    if (isNaN(parsed.getTime())) {
      errors.push('item_date is not a valid date')
    }
  }

  // Validate jr_basis
  if (!input.jr_basis) {
    errors.push('jr_basis is required')
  } else if (!['inland', 'outside_canada'].includes(input.jr_basis)) {
    errors.push('jr_basis must be "inland" or "outside_canada"')
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}
