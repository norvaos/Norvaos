/**
 * IRCC Forms Engine  -  Cross-Form Reuse Service
 *
 * Coordinates the reuse of answers across form instances within the same matter.
 * When a user triggers "Pre-fill from Other Forms", this module scans all sibling
 * form instances for matching profile_path fields, checks trust conflicts and
 * propagation_mode constraints, and applies non-conflicting values as
 * 'cross_form_reuse' source.
 *
 * Pure logic module  -  all database operations are injected via AnswerEngineDataAccess.
 */

import type { AnswerMap, AnswerRecord, PropagationMode } from './types/answers'
import { SOURCE_TRUST_LEVEL } from './types/answers'
import type { AnswerEngineDataAccess } from './answer-engine'
import { checkTrustConflict, createAnswerRecord, computeCompletionState } from './answer-engine'

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface CrossFormReuseResult {
  fieldsReused: number
  fieldsSkipped: number
  conflicts: Array<{ profilePath: string; reason: string }>
  details: Array<{ profilePath: string; sourceInstanceId: string; value: unknown }>
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Check whether a value is non-null and non-undefined. */
function hasValue(v: unknown): boolean {
  return v !== null && v !== undefined
}

/**
 * From all sibling answers, pick the best candidate for each profile_path.
 * "Best" = most recently updated, highest trust source.
 */
function pickBestSiblingAnswer(
  profilePath: string,
  siblings: Array<{
    id: string
    form_id: string
    status: string
    answers: AnswerMap
    person_id: string | null
  }>,
  sourcePersonId: string | null,
): { record: AnswerRecord; sourceInstanceId: string } | null {
  let best: { record: AnswerRecord; sourceInstanceId: string } | null = null

  for (const sibling of siblings) {
    // Skip different person_id (don't cross-pollinate between different people)
    if (sourcePersonId !== sibling.person_id) continue

    const record = sibling.answers[profilePath]
    if (!record || !hasValue(record.value)) continue

    if (!best) {
      best = { record, sourceInstanceId: sibling.id }
      continue
    }

    // Prefer higher trust level, then more recent
    const bestTrust = SOURCE_TRUST_LEVEL[best.record.source] ?? 0
    const candidateTrust = SOURCE_TRUST_LEVEL[record.source] ?? 0

    if (candidateTrust > bestTrust) {
      best = { record, sourceInstanceId: sibling.id }
    } else if (
      candidateTrust === bestTrust &&
      new Date(record.updated_at) > new Date(best.record.updated_at)
    ) {
      best = { record, sourceInstanceId: sibling.id }
    }
  }

  return best
}

// ---------------------------------------------------------------------------
// Locked statuses  -  instances in these statuses are not writable
// ---------------------------------------------------------------------------

const LOCKED_STATUSES = new Set(['approved', 'generated', 'submitted'])

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Pre-fill a form instance with answers from sibling instances.
 * Only reuses fields with matching profile_paths that have propagation_mode = 'auto'.
 * Respects trust hierarchy and does not overwrite verified answers.
 *
 * @param instanceId - The target form instance to pre-fill
 * @param dataAccess - Injected data access implementation
 * @param tenantId - Tenant identifier for logging
 * @returns Summary of what was reused, skipped, and any conflicts
 */
export async function prefillFromSiblings(
  instanceId: string,
  dataAccess: AnswerEngineDataAccess,
  tenantId: string,
): Promise<CrossFormReuseResult> {
  // 1. Get the target instance's form_id and current answers
  const [formId, currentAnswers] = await Promise.all([
    dataAccess.getInstanceFormId(instanceId),
    dataAccess.getInstanceAnswers(instanceId),
  ])

  // 2. Get the form field definitions (to check propagation_mode and profile_paths)
  const formFields = await dataAccess.getFormFields(formId)

  // Build a set of profile_paths that accept propagation
  const propagatableFields = new Map<
    string,
    { propagation_mode: PropagationMode }
  >()
  for (const field of formFields) {
    if (!field.profile_path) continue
    if (!field.is_mapped) continue
    if (field.propagation_mode === 'no_propagate') continue
    propagatableFields.set(field.profile_path, {
      propagation_mode: field.propagation_mode,
    })
  }

  // 3. Get all sibling instances in the same matter
  const siblings = await dataAccess.getSiblingInstances(instanceId)

  // Find self to determine person_id
  const self = siblings.find((s) => s.id === instanceId)
  const sourcePersonId = self?.person_id ?? null

  // Filter out self and locked siblings
  const eligibleSiblings = siblings.filter(
    (s) => s.id !== instanceId && !LOCKED_STATUSES.has(s.status),
  )

  // 4. For each propagatable field, find the best sibling answer
  const result: CrossFormReuseResult = {
    fieldsReused: 0,
    fieldsSkipped: 0,
    conflicts: [],
    details: [],
  }

  const updatesToApply: Record<string, unknown> = {}
  const reuseEvents: Array<{
    profilePath: string
    sourceInstanceId: string
    value: unknown
  }> = []

  for (const [profilePath] of propagatableFields) {
    // Skip if the target instance already has a verified answer
    const existingRecord = currentAnswers[profilePath]

    // Find the best candidate from siblings
    const candidate = pickBestSiblingAnswer(
      profilePath,
      eligibleSiblings,
      sourcePersonId,
    )

    if (!candidate) {
      // No sibling has a value for this path  -  skip silently
      continue
    }

    // Check trust conflict: don't overwrite verified higher-trust values
    const conflict = checkTrustConflict(
      existingRecord,
      candidate.record.value,
      'cross_form_reuse',
    )

    if (conflict.hasConflict) {
      result.conflicts.push({
        profilePath,
        reason: conflict.reason!,
      })
      result.fieldsSkipped++
      continue
    }

    // Skip if the existing value is identical (no need to overwrite)
    if (
      existingRecord &&
      hasValue(existingRecord.value) &&
      JSON.stringify(existingRecord.value) ===
        JSON.stringify(candidate.record.value)
    ) {
      result.fieldsSkipped++
      continue
    }

    // Queue this field for update
    updatesToApply[profilePath] = candidate.record.value
    reuseEvents.push({
      profilePath,
      sourceInstanceId: candidate.sourceInstanceId,
      value: candidate.record.value,
    })
  }

  // 5. Apply non-conflicting values
  if (Object.keys(updatesToApply).length > 0) {
    const now = new Date().toISOString()
    const mergedAnswers: AnswerMap = { ...currentAnswers }

    for (const [profilePath, value] of Object.entries(updatesToApply)) {
      const newRecord = createAnswerRecord(value, 'cross_form_reuse', instanceId)
      mergedAnswers[profilePath] = newRecord
    }

    // Recalculate completion state
    const completionState = computeCompletionState(mergedAnswers, formFields)

    // Count blockers/stale/missing
    let blockerCount = 0
    let staleCount = 0
    let missingRequiredCount = 0
    for (const field of formFields) {
      if (!field.is_mapped || field.is_meta_field || !field.profile_path) continue
      const rec = mergedAnswers[field.profile_path]
      if (rec?.stale) staleCount++
      if (field.is_required && (!rec || !hasValue(rec.value) || rec.value === '')) {
        missingRequiredCount++
      }
    }

    // Persist
    await dataAccess.updateInstanceAnswers(instanceId, mergedAnswers, completionState, {
      blocker_count: blockerCount,
      stale_count: staleCount,
      missing_required_count: missingRequiredCount,
    })
  }

  // 6. Log each reuse event
  for (const event of reuseEvents) {
    await dataAccess.logReuseEvent({
      tenant_id: tenantId,
      reuse_type: 'cross_form',
      target_instance_id: instanceId,
      target_profile_path: event.profilePath,
      source_instance_id: event.sourceInstanceId,
      value: event.value,
    })

    // Log the answer change as well
    await dataAccess.logAnswerChange({
      tenant_id: tenantId,
      form_instance_id: instanceId,
      profile_path: event.profilePath,
      old_value: currentAnswers[event.profilePath]?.value ?? null,
      new_value: event.value,
      source: 'cross_form_reuse',
      source_origin: event.sourceInstanceId,
      stale_triggered: false,
    })

    result.fieldsReused++
    result.details.push({
      profilePath: event.profilePath,
      sourceInstanceId: event.sourceInstanceId,
      value: event.value,
    })
  }

  return result
}
