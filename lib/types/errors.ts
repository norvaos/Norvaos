/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * NorvaOS Gate Failure & Error Types
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Structured error types for stage gate enforcement.
 * Used by the advance-stage route and consumed by the ZoneB stage rail
 * to surface blocked states and actionable messaging.
 */

// ── Gate Condition Result ─────────────────────────────────────────────────────

/**
 * The pass/fail result of evaluating a single gate condition.
 */
export interface GateConditionResult {
  /** Machine-readable condition identifier (e.g. 'require_checklist_complete') */
  conditionId: string
  /** Human-readable condition name shown in UI */
  conditionName: string
  /** Whether this condition passed */
  passed: boolean
  /** Details about why the condition failed (only meaningful when passed = false) */
  details?: string
}

// ── Gate Snapshot ─────────────────────────────────────────────────────────────

/**
 * Immutable snapshot of all gate conditions evaluated at the time of a
 * stage transition. Written to stage_transition_log.gate_snapshot.
 */
export interface GateSnapshot {
  evaluatedAt: string
  conditions: GateConditionResult[]
  allPassed: boolean
}

// ── NorvaOS Gate Failure ──────────────────────────────────────────────────────

/**
 * Structured response returned by the advance-stage route (HTTP 422)
 * when one or more gate conditions are not met.
 *
 * Designed to be consumed by ZoneB and any toast/notification system
 * to show exactly what is blocking the transition and who must act.
 */
export interface NorvaOSGateFailure {
  /** Machine-readable error code (e.g. 'GATE_DOCUMENTS_INCOMPLETE') */
  code: string
  /** Short title for toast/banner display */
  title: string
  /** Full human-readable explanation */
  message: string
  /** Instruction telling the user what to do next */
  action: string
  /** Who is responsible for resolving the blocker */
  owner: 'lawyer' | 'client' | 'system' | 'billing' | 'legal_assistant'
  /** Full list of conditions with individual pass/fail results */
  failedConditions: GateConditionResult[]
}
