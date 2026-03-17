/**
 * Deficiency Engine — Pure-function business logic for the deficiency workflow.
 *
 * No direct DB calls. Takes typed inputs, returns typed outputs.
 * Called from API routes in app/api/matters/[id]/deficiencies/.
 *
 * Sprint 6, Week 1 — 2026-03-17
 */

import type { MatterDeficiencyRow } from '@/lib/types/database'

// ─── Input / Output Types ────────────────────────────────────────────────────

export interface DeficiencyCreateInput {
  matter_id: string
  stage_id?: string
  severity: 'minor' | 'major' | 'critical'
  category: string
  description: string  // min 50 chars
  assigned_to_user_id?: string
}

export interface ValidationResult {
  valid: boolean
  errors: { field: string; message: string }[]
}

export interface DeficiencyStatusResult {
  newStatus: MatterDeficiencyRow['status']
  resolvedAt: string  // ISO
}

export interface DeficiencyReopenResult {
  newStatus: 'reopened'
  newReopenCount: number
  chronicFlag: boolean
  reopenedAt: string  // ISO
}

export interface ResolveInput {
  resolution_notes: string
  resolution_evidence_path?: string
}

// ─── Valid values ─────────────────────────────────────────────────────────────

const VALID_SEVERITIES = ['minor', 'major', 'critical'] as const
const VALID_CATEGORIES = [
  'document_quality',
  'questionnaire_inconsistency',
  'missing_information',
  'legal_review_issue',
  'compliance_failure',
  'other',
] as const

const BLOCKING_STATUSES: ReadonlyArray<MatterDeficiencyRow['status']> = [
  'open',
  'in_progress',
  'reopened',
]

// ─── validateDeficiencyCreate ─────────────────────────────────────────────────

/**
 * Validate a deficiency creation request.
 * Returns { valid: true, errors: [] } on success.
 */
export function validateDeficiencyCreate(input: DeficiencyCreateInput): ValidationResult {
  const errors: { field: string; message: string }[] = []

  if (!input.matter_id || typeof input.matter_id !== 'string') {
    errors.push({ field: 'matter_id', message: 'matter_id is required' })
  }

  if (!input.severity || !(VALID_SEVERITIES as readonly string[]).includes(input.severity)) {
    errors.push({
      field: 'severity',
      message: `severity must be one of: ${VALID_SEVERITIES.join(', ')}`,
    })
  }

  if (!input.category || input.category.trim().length === 0) {
    errors.push({ field: 'category', message: 'category is required' })
  }

  if (!input.description || input.description.trim().length < 50) {
    errors.push({
      field: 'description',
      message: 'description must be at least 50 characters',
    })
  }

  return { valid: errors.length === 0, errors }
}

// ─── shouldSetChronicFlag ─────────────────────────────────────────────────────

/**
 * Returns true when reopenCount >= 3.
 * The chronic threshold signals a systemic problem requiring escalation.
 */
export function shouldSetChronicFlag(reopenCount: number): boolean {
  return reopenCount >= 3
}

// ─── computeResolveTransition ─────────────────────────────────────────────────

/**
 * Compute deficiency state after a resolve action.
 * Returns the new status and the ISO timestamp for resolved_at.
 */
export function computeResolveTransition(
  _current: MatterDeficiencyRow,
  _input: ResolveInput,
): DeficiencyStatusResult {
  return {
    newStatus: 'resolved',
    resolvedAt: new Date().toISOString(),
  }
}

// ─── computeReopenTransition ──────────────────────────────────────────────────

/**
 * Compute deficiency state after a reopen action.
 * Increments reopen_count; sets chronic_flag when new count reaches 3.
 */
export function computeReopenTransition(
  current: MatterDeficiencyRow,
  _reopenedBy: string,
): DeficiencyReopenResult {
  const newReopenCount = current.reopen_count + 1
  return {
    newStatus: 'reopened',
    newReopenCount,
    chronicFlag: shouldSetChronicFlag(newReopenCount),
    reopenedAt: new Date().toISOString(),
  }
}

// ─── hasBlockingDeficiencies ──────────────────────────────────────────────────

/**
 * Returns true if any deficiency in the array has a status that blocks stage advancement.
 * Blocking statuses: 'open', 'in_progress', 'reopened'.
 */
export function hasBlockingDeficiencies(deficiencies: MatterDeficiencyRow[]): boolean {
  return deficiencies.some((d) => (BLOCKING_STATUSES as readonly string[]).includes(d.status))
}
