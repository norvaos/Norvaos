/**
 * IRCC Forms Engine  -  Answer Types
 *
 * Per-form-instance answer storage with source tracking, verification,
 * and stale dependency marking.
 */

/** All possible sources for an answer value */
export type AnswerSource =
  | 'client_portal'
  | 'staff_entry'
  | 'canonical_prefill'
  | 'cross_form_reuse'
  | 'cross_matter_import'
  | 'extraction'
  | 'migration'

/** Trust level for precedence evaluation (higher number = higher trust) */
export const SOURCE_TRUST_LEVEL: Record<AnswerSource, number> = {
  extraction: 1,
  migration: 1,
  canonical_prefill: 2,
  cross_matter_import: 3,
  cross_form_reuse: 4,
  client_portal: 5,
  staff_entry: 6,
}

/** A single answer value with full provenance metadata */
export interface AnswerRecord {
  /** The actual answer value */
  value: unknown
  /** How this value was obtained */
  source: AnswerSource
  /** Originating entity (matter ID, form instance ID, document ID, etc.) */
  source_origin?: string
  /** Whether staff has verified this value */
  verified: boolean
  /** User ID of verifier */
  verified_by?: string
  /** When verification occurred */
  verified_at?: string
  /** Whether a parent dependency has changed, making this answer potentially invalid */
  stale: boolean
  /** Human-readable reason for stale status */
  stale_reason?: string
  /** When this answer was last updated */
  updated_at: string
}

/** Map of profile_path → AnswerRecord for a form instance */
export type AnswerMap = Record<string, AnswerRecord>

/** The six-level precedence hierarchy for field value resolution */
export enum PrecedenceLevel {
  /** Staff verified this value specifically for this matter */
  VERIFIED_MATTER_OVERRIDE = 1,
  /** Current matter answer (staff or client entry) */
  CURRENT_MATTER_ANSWER = 2,
  /** Propagated from another form in the same matter */
  CROSS_FORM_REUSE = 3,
  /** Canonical profile field with verified status */
  VERIFIED_CANONICAL = 4,
  /** Canonical profile field without verification */
  UNVERIFIED_CANONICAL = 5,
  /** Raw contact table field (name, email, phone, DOB) */
  CONTACT_FALLBACK = 6,
}

/** Result of resolving a field value through the precedence chain */
export interface ResolvedValue {
  /** The winning value */
  value: unknown
  /** Which precedence level provided the value */
  precedence: PrecedenceLevel
  /** Source type of the winning value */
  source: AnswerSource | 'contact_field'
  /** Whether this value is verified */
  verified: boolean
  /** All alternative values from lower precedence levels */
  alternatives: AlternativeValue[]
  /** Whether there's a conflict (multiple levels have different values) */
  has_conflict: boolean
}

export interface AlternativeValue {
  value: unknown
  precedence: PrecedenceLevel
  source: AnswerSource | 'contact_field'
  verified: boolean
}

/** Per-section completion tracking stored on form instance */
export interface SectionCompletionState {
  /** Section ID */
  section_id: string
  /** Total relevant (visible) fields in this section */
  total_relevant: number
  /** Filled relevant fields */
  filled: number
  /** Fields with stale answers */
  stale: number
  /** Fields with blocking validation errors */
  blocked: number
  /** Whether all relevant required fields are filled and not stale */
  complete: boolean
}

/** Overall completion state for a form instance */
export interface CompletionState {
  sections: Record<string, SectionCompletionState>
  /** Overall counts */
  total_relevant: number
  total_filled: number
  total_stale: number
  total_blocked: number
  /** Completion percentage (0-100) based on relevant fields only */
  completion_pct: number
}

/** Propagation mode for cross-form reuse */
export type PropagationMode = 'auto' | 'no_propagate'

/** Stale handling mode when parent value changes */
export type OnParentChange = 'mark_stale' | 'auto_clear'

/** Parameters for saving answers */
export interface SaveAnswersParams {
  instance_id: string
  updates: Record<string, unknown>  // profile_path → new value
  source: AnswerSource
  source_origin?: string
  changed_by?: string
}

/** Result of saving answers */
export interface SaveAnswersResult {
  /** Updated answer records */
  updated: Record<string, AnswerRecord>
  /** Fields in other instances that were auto-propagated */
  propagated: { instance_id: string; profile_path: string }[]
  /** Fields that became stale due to dependency changes */
  stale_triggered: { instance_id: string; profile_path: string; reason: string }[]
  /** New completion state */
  completion_state: CompletionState
}
