/**
 * IRCC Forms Engine  -  Cross-Matter Reuse Service
 *
 * Imports answers from a contact's canonical profile into a new matter's
 * form instances. Uses REUSE_CATEGORY_MAP to classify each field:
 *
 *   - stable:          auto-import without review (e.g. DOB, place of birth)
 *   - semi_stable:     import but flag for review (e.g. marital status, passport)
 *   - matter_specific: skip entirely  -  user must enter manually
 *
 * Pure logic module  -  all database operations are injected via the combined
 * PrefillDataAccess & AnswerEngineDataAccess interface.
 */

import type { AnswerMap, AnswerRecord } from './types/answers'
import type { ReuseCategory } from './types/reuse'
import { getFieldReuseCategory } from './types/reuse'
import type { PrefillDataAccess } from './prefill-resolver'
import type { AnswerEngineDataAccess } from './answer-engine'
import { createAnswerRecord, computeCompletionState } from './answer-engine'

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface CrossMatterImportResult {
  fieldsImported: number
  fieldsSkipped: number
  fieldsNeedingReview: Array<{
    profilePath: string
    category: 'stable' | 'semi_stable' | 'matter_specific'
    canonicalValue: unknown
  }>
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Check whether a value is non-null and non-undefined. */
function hasValue(v: unknown): boolean {
  return v !== null && v !== undefined
}

/** Build a profile_path from a canonical field's domain and field_key. */
function canonicalToProfilePath(domain: string, fieldKey: string): string {
  return `${domain}.${fieldKey}`
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Import canonical profile data into a form instance.
 * Uses the REUSE_CATEGORY_MAP to determine review requirements:
 *   - stable fields:          auto-import without review
 *   - semi_stable fields:     import but flag for review
 *   - matter_specific fields: skip (user must enter manually)
 *
 * @param instanceId - The target form instance to populate
 * @param contactId  - The contact whose canonical profile to import from
 * @param dataAccess - Combined data access (needs both prefill and answer engine methods)
 * @param tenantId   - Tenant identifier for logging
 * @returns Summary of imported, skipped, and review-needed fields
 */
export async function importFromCanonical(
  instanceId: string,
  contactId: string,
  dataAccess: PrefillDataAccess & AnswerEngineDataAccess,
  tenantId: string,
): Promise<CrossMatterImportResult> {
  // 1. Get the form field definitions for this instance
  const formId = await dataAccess.getInstanceFormId(instanceId)
  const formFields = await dataAccess.getFormFields(formId)

  // Build a set of profile_paths this form cares about
  const formProfilePaths = new Set<string>()
  for (const field of formFields) {
    if (field.profile_path && field.is_mapped) {
      formProfilePaths.add(field.profile_path)
    }
  }

  // 2. Get canonical profile fields for the contact
  const canonicalFields = await dataAccess.getCanonicalFields(contactId)

  // 3. Get current instance answers (so we don't overwrite existing data)
  const currentAnswers = await dataAccess.getInstanceAnswers(instanceId)

  // 4. Categorise and process each canonical field
  const result: CrossMatterImportResult = {
    fieldsImported: 0,
    fieldsSkipped: 0,
    fieldsNeedingReview: [],
  }

  // Deduplicate canonical fields: keep the most recent per profile_path
  // (they're already sorted by effective_from DESC from the data access layer)
  const bestCanonical = new Map<
    string,
    {
      id: string
      value: unknown
      verification_status: string
      effective_from: string
      source: string
    }
  >()

  for (const cf of canonicalFields) {
    const profilePath = canonicalToProfilePath(cf.domain, cf.field_key)
    if (!hasValue(cf.value)) continue
    // Keep only the first (most recent) for each path
    if (!bestCanonical.has(profilePath)) {
      bestCanonical.set(profilePath, cf)
    }
  }

  const updatesToApply: Record<string, unknown> = {}
  const importEvents: Array<{
    profilePath: string
    category: ReuseCategory
    value: unknown
    canonicalFieldId: string
  }> = []

  for (const [profilePath, cf] of bestCanonical) {
    // Only import fields that this form actually has
    if (!formProfilePaths.has(profilePath)) continue

    const category = getFieldReuseCategory(profilePath)

    // 4a. Skip matter_specific fields entirely
    if (category === 'matter_specific') {
      result.fieldsSkipped++
      result.fieldsNeedingReview.push({
        profilePath,
        category,
        canonicalValue: cf.value,
      })
      continue
    }

    // Skip if existing instance already has a non-empty value from staff_entry
    // (don't overwrite staff work with canonical data)
    const existing = currentAnswers[profilePath]
    if (existing && hasValue(existing.value) && existing.source === 'staff_entry') {
      result.fieldsSkipped++
      continue
    }

    // 4b. Auto-import stable fields
    if (category === 'stable') {
      updatesToApply[profilePath] = cf.value
      importEvents.push({
        profilePath,
        category,
        value: cf.value,
        canonicalFieldId: cf.id,
      })
      result.fieldsImported++
    }

    // 4c. Import semi_stable fields but flag for review
    if (category === 'semi_stable') {
      updatesToApply[profilePath] = cf.value
      importEvents.push({
        profilePath,
        category,
        value: cf.value,
        canonicalFieldId: cf.id,
      })
      result.fieldsImported++
      result.fieldsNeedingReview.push({
        profilePath,
        category,
        canonicalValue: cf.value,
      })
    }
  }

  // 5. Save imported answers via the answer engine
  if (Object.keys(updatesToApply).length > 0) {
    const mergedAnswers: AnswerMap = { ...currentAnswers }

    for (const [profilePath, value] of Object.entries(updatesToApply)) {
      mergedAnswers[profilePath] = createAnswerRecord(
        value,
        'cross_matter_import',
        contactId,
      )
    }

    // Recalculate completion state
    const completionState = computeCompletionState(mergedAnswers, formFields)

    // Count blockers/stale/missing for persistence
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

    // Persist updated answers
    await dataAccess.updateInstanceAnswers(instanceId, mergedAnswers, completionState, {
      blocker_count: blockerCount,
      stale_count: staleCount,
      missing_required_count: missingRequiredCount,
    })

    // 6. Log each import event
    for (const event of importEvents) {
      await dataAccess.logAnswerChange({
        tenant_id: tenantId,
        form_instance_id: instanceId,
        profile_path: event.profilePath,
        old_value: currentAnswers[event.profilePath]?.value ?? null,
        new_value: event.value,
        source: 'cross_matter_import',
        source_origin: contactId,
        stale_triggered: false,
      })
    }
  }

  return result
}
