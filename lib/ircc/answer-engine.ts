/**
 * IRCC Forms Engine — Answer Engine
 *
 * Handles answer read/write with source tracking, cross-form propagation,
 * and stale dependency invalidation. Pure logic module — all database
 * operations are injected via the DataAccess interface.
 */

import type {
  AnswerRecord,
  AnswerMap,
  AnswerSource,
  SaveAnswersParams,
  SaveAnswersResult,
  CompletionState,
  SectionCompletionState,
  PropagationMode,
  OnParentChange,
} from './types/answers'
import { SOURCE_TRUST_LEVEL } from './types/answers'
import type { FieldCondition } from './types/conditions'
import {
  evaluateCondition,
  buildDependencyGraph,
  getDependentFields,
  normalizeLegacyCondition,
} from './condition-engine'

/* ------------------------------------------------------------------ */
/*  DataAccess Interface                                               */
/* ------------------------------------------------------------------ */

export interface AnswerEngineDataAccess {
  /** Get the current answers for a form instance */
  getInstanceAnswers(instanceId: string): Promise<AnswerMap>

  /** Update answers on a form instance (partial merge) */
  updateInstanceAnswers(
    instanceId: string,
    answers: AnswerMap,
    completionState: CompletionState,
    counts: { blocker_count: number; stale_count: number; missing_required_count: number }
  ): Promise<void>

  /** Get all active form instances in the same matter (for cross-form propagation) */
  getSiblingInstances(instanceId: string): Promise<
    Array<{
      id: string
      form_id: string
      status: string
      answers: AnswerMap
      person_id: string | null
    }>
  >

  /** Get form field definitions for a form (for conditions, propagation mode, validation) */
  getFormFields(formId: string): Promise<
    Array<{
      id: string
      profile_path: string | null
      field_type: string | null
      is_required: boolean
      is_client_visible: boolean
      is_mapped: boolean
      is_meta_field: boolean
      show_when: unknown
      required_condition: unknown
      on_parent_change: OnParentChange
      propagation_mode: PropagationMode
      section_id: string | null
      min_length: number | null
      max_length: number | null
      validation_pattern: string | null
      is_blocking: boolean
      options: Array<{ label: string; value: string }> | null
    }>
  >

  /** Get the form_id for a given instance */
  getInstanceFormId(instanceId: string): Promise<string>

  /** Log answer change to history */
  logAnswerChange(entry: {
    tenant_id: string
    form_instance_id: string
    profile_path: string
    old_value: unknown
    new_value: unknown
    source: AnswerSource
    source_origin?: string
    changed_by?: string
    stale_triggered: boolean
  }): Promise<void>

  /** Log a reuse event */
  logReuseEvent(entry: {
    tenant_id: string
    reuse_type: 'cross_form'
    target_instance_id: string
    target_profile_path: string
    source_instance_id: string
    value: unknown
  }): Promise<void>
}

/* ------------------------------------------------------------------ */
/*  Locked statuses — instances in these statuses are not writable     */
/* ------------------------------------------------------------------ */

const LOCKED_STATUSES = new Set(['approved', 'generated', 'submitted'])

/* ------------------------------------------------------------------ */
/*  Helper: deep equality for answer values                           */
/* ------------------------------------------------------------------ */

function valuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (a == null && b == null) return true
  if (a == null || b == null) return false
  if (typeof a !== typeof b) return false
  if (typeof a === 'object') {
    return JSON.stringify(a) === JSON.stringify(b)
  }
  return false
}

/* ------------------------------------------------------------------ */
/*  Helper: check if a value is considered "filled"                   */
/* ------------------------------------------------------------------ */

function isFilled(record: AnswerRecord | undefined): boolean {
  if (!record) return false
  if (record.stale) return false
  const v = record.value
  if (v === null || v === undefined || v === '') return false
  return true
}

/* ------------------------------------------------------------------ */
/*  Helper: extract answer values map for condition evaluation        */
/* ------------------------------------------------------------------ */

function answerValuesMap(answers: AnswerMap): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [path, rec] of Object.entries(answers)) {
    out[path] = rec.value
  }
  return out
}

/* ------------------------------------------------------------------ */
/*  Helper: check field visibility given current answers              */
/* ------------------------------------------------------------------ */

function isFieldVisible(
  showWhen: unknown,
  answers: AnswerMap
): boolean {
  if (showWhen == null) return true
  const condition = normalizeLegacyCondition(showWhen as FieldCondition)
  if (!condition) return true
  const values = answerValuesMap(answers)
  return evaluateCondition(condition, values)
}

/* ------------------------------------------------------------------ */
/*  Helper: check if a field is required given current answers        */
/* ------------------------------------------------------------------ */

function isFieldRequired(
  isRequired: boolean,
  requiredCondition: unknown,
  answers: AnswerMap
): boolean {
  if (!isRequired) return false
  if (requiredCondition == null) return true
  const condition = normalizeLegacyCondition(requiredCondition as FieldCondition)
  if (!condition) return true
  const values = answerValuesMap(answers)
  return evaluateCondition(condition, values)
}

/* ------------------------------------------------------------------ */
/*  Helper: validate a single field value against its constraints     */
/* ------------------------------------------------------------------ */

function hasBlockingError(
  field: {
    is_blocking: boolean
    min_length: number | null
    max_length: number | null
    validation_pattern: string | null
    options: Array<{ label: string; value: string }> | null
  },
  value: unknown
): boolean {
  if (!field.is_blocking) return false
  if (value === null || value === undefined || value === '') return false

  const str = typeof value === 'string' ? value : String(value)

  if (field.min_length != null && str.length < field.min_length) return true
  if (field.max_length != null && str.length > field.max_length) return true

  if (field.validation_pattern != null) {
    try {
      const regex = new RegExp(field.validation_pattern)
      if (!regex.test(str)) return true
    } catch {
      // Invalid regex pattern — don't block
    }
  }

  if (field.options != null && field.options.length > 0) {
    const validValues = field.options.map((o) => o.value)
    if (!validValues.includes(str)) return true
  }

  return false
}

/* ------------------------------------------------------------------ */
/*  createAnswerRecord                                                 */
/* ------------------------------------------------------------------ */

export function createAnswerRecord(
  value: unknown,
  source: AnswerSource,
  sourceOrigin?: string
): AnswerRecord {
  return {
    value,
    source,
    source_origin: sourceOrigin,
    verified: false,
    stale: false,
    updated_at: new Date().toISOString(),
  }
}

/* ------------------------------------------------------------------ */
/*  checkTrustConflict                                                 */
/* ------------------------------------------------------------------ */

export function checkTrustConflict(
  existing: AnswerRecord | undefined,
  newValue: unknown,
  newSource: AnswerSource
): { hasConflict: boolean; reason?: string } {
  if (!existing) return { hasConflict: false }

  // No conflict if values are the same
  if (valuesEqual(existing.value, newValue)) return { hasConflict: false }

  // Only flag conflict if existing is verified AND existing trust >= new trust
  if (!existing.verified) return { hasConflict: false }

  const existingTrust = SOURCE_TRUST_LEVEL[existing.source]
  const newTrust = SOURCE_TRUST_LEVEL[newSource]

  if (existingTrust >= newTrust) {
    return {
      hasConflict: true,
      reason: `Verified ${existing.source} answer (trust ${existingTrust}) would be overwritten by ${newSource} (trust ${newTrust}) with a different value`,
    }
  }

  return { hasConflict: false }
}

/* ------------------------------------------------------------------ */
/*  findPropagationTargets                                             */
/* ------------------------------------------------------------------ */

export function findPropagationTargets(
  sourceInstanceId: string,
  sourcePersonId: string | null,
  profilePath: string,
  siblings: Array<{
    id: string
    form_id: string
    status: string
    answers: AnswerMap
    person_id: string | null
  }>,
  fieldsByFormId: Map<
    string,
    Array<{
      profile_path: string | null
      propagation_mode: PropagationMode
    }>
  >
): string[] {
  const targets: string[] = []

  for (const sibling of siblings) {
    // Skip self
    if (sibling.id === sourceInstanceId) continue

    // Skip locked instances
    if (LOCKED_STATUSES.has(sibling.status)) continue

    // Skip different person_id (don't propagate between different people)
    if (sourcePersonId !== sibling.person_id) continue

    // Check if this sibling's form has a field with the same profile_path
    const fields = fieldsByFormId.get(sibling.form_id)
    if (!fields) continue

    const matchingField = fields.find((f) => f.profile_path === profilePath)
    if (!matchingField) continue

    // Skip if the field opts out of propagation
    if (matchingField.propagation_mode === 'no_propagate') continue

    targets.push(sibling.id)
  }

  return targets
}

/* ------------------------------------------------------------------ */
/*  computeCompletionState                                             */
/* ------------------------------------------------------------------ */

export function computeCompletionState(
  answers: AnswerMap,
  fields: Array<{
    id: string
    profile_path: string | null
    is_required: boolean
    is_mapped: boolean
    is_meta_field: boolean
    show_when: unknown
    required_condition: unknown
    section_id: string | null
  }>
): CompletionState {
  const sections: Record<string, SectionCompletionState> = {}

  // Track overall totals
  let totalRelevant = 0
  let totalFilled = 0
  let totalStale = 0
  let totalBlocked = 0

  for (const field of fields) {
    // Only count mapped, non-meta fields
    if (!field.is_mapped) continue
    if (field.is_meta_field) continue
    if (!field.profile_path) continue

    // Only count visible fields
    if (!isFieldVisible(field.show_when, answers)) continue

    const sectionId = field.section_id ?? '__unsectioned__'

    if (!sections[sectionId]) {
      sections[sectionId] = {
        section_id: sectionId,
        total_relevant: 0,
        filled: 0,
        stale: 0,
        blocked: 0,
        complete: false,
      }
    }

    const section = sections[sectionId]
    section.total_relevant++
    totalRelevant++

    const record = answers[field.profile_path]
    const filled = isFilled(record)

    if (filled) {
      section.filled++
      totalFilled++
    }

    if (record?.stale) {
      section.stale++
      totalStale++
    }

    // Note: blocked count is tracked here as 0 because we don't have the
    // full field definition with validation constraints in this function signature.
    // The saveAnswers function handles blocking validation separately.
  }

  // Determine section completeness: all required+visible fields are filled and not stale
  for (const field of fields) {
    if (!field.is_mapped || field.is_meta_field || !field.profile_path) continue
    if (!isFieldVisible(field.show_when, answers)) continue

    const sectionId = field.section_id ?? '__unsectioned__'
    const section = sections[sectionId]
    if (!section) continue

    const required = isFieldRequired(field.is_required, field.required_condition, answers)
    if (!required) continue

    const record = answers[field.profile_path]
    if (!isFilled(record)) {
      section.complete = false
    }
  }

  // Mark sections as complete if not already disqualified
  for (const section of Object.values(sections)) {
    if (section.complete !== false) {
      // No required field was unfilled — mark complete if there's no stale/blocked
      section.complete = section.stale === 0 && section.blocked === 0
    }
  }

  const completionPct =
    totalRelevant > 0 ? Math.round((totalFilled / totalRelevant) * 100) : 100

  return {
    sections,
    total_relevant: totalRelevant,
    total_filled: totalFilled,
    total_stale: totalStale,
    total_blocked: totalBlocked,
    completion_pct: completionPct,
  }
}

/* ------------------------------------------------------------------ */
/*  saveAnswers                                                        */
/* ------------------------------------------------------------------ */

export async function saveAnswers(
  params: SaveAnswersParams,
  dataAccess: AnswerEngineDataAccess,
  tenantId: string
): Promise<SaveAnswersResult> {
  const { instance_id, updates, source, source_origin, changed_by } = params

  // 1. Load current state
  const [existingAnswers, formId] = await Promise.all([
    dataAccess.getInstanceAnswers(instance_id),
    dataAccess.getInstanceFormId(instance_id),
  ])

  const formFields = await dataAccess.getFormFields(formId)

  // Build a profile_path → field lookup
  const fieldByPath = new Map(
    formFields
      .filter((f) => f.profile_path != null)
      .map((f) => [f.profile_path!, f])
  )

  // Merge answers: start from existing
  const mergedAnswers: AnswerMap = { ...existingAnswers }
  const updatedRecords: Record<string, AnswerRecord> = {}
  const changedPaths: string[] = []
  const conflicts: Array<{ path: string; reason: string }> = []

  // 2. Process each update
  const now = new Date().toISOString()

  for (const [profilePath, newValue] of Object.entries(updates)) {
    const existingRecord = mergedAnswers[profilePath]

    // 2a. Trust conflict check
    const conflict = checkTrustConflict(existingRecord, newValue, source)
    if (conflict.hasConflict) {
      conflicts.push({ path: profilePath, reason: conflict.reason! })
      // Skip this field — don't overwrite verified higher-trust data
      continue
    }

    // 2b. Check if value actually changed
    const materiallyChanged = !existingRecord || !valuesEqual(existingRecord.value, newValue)

    // 2c. Create the new answer record
    const newRecord: AnswerRecord = {
      value: newValue,
      source,
      source_origin: source_origin,
      verified: existingRecord?.verified ?? false,
      verified_by: existingRecord?.verified_by,
      verified_at: existingRecord?.verified_at,
      stale: false, // Writing a new value clears stale
      updated_at: now,
    }

    mergedAnswers[profilePath] = newRecord
    updatedRecords[profilePath] = newRecord

    if (materiallyChanged) {
      changedPaths.push(profilePath)
    }

    // 2d. Log the change
    await dataAccess.logAnswerChange({
      tenant_id: tenantId,
      form_instance_id: instance_id,
      profile_path: profilePath,
      old_value: existingRecord?.value ?? null,
      new_value: newValue,
      source,
      source_origin,
      changed_by,
      stale_triggered: false, // updated below if dependents go stale
    })
  }

  // 3. Stale dependency invalidation (ADR-4)
  const staleTriggered: { instance_id: string; profile_path: string; reason: string }[] = []

  if (changedPaths.length > 0) {
    // Build dependency graph from all fields' show_when and required_condition
    // buildDependencyGraph expects Array<{ id, show_when, required_condition }>
    // We use profile_path as the id so getDependentFields returns profile_paths
    const depFields = formFields
      .filter((f) => f.profile_path != null)
      .map((f) => ({
        id: f.profile_path!,
        show_when: f.show_when as FieldCondition | null,
        required_condition: f.required_condition as FieldCondition | null,
      }))

    const depGraph = buildDependencyGraph(depFields)

    for (const changedPath of changedPaths) {
      const dependentKeys = getDependentFields(changedPath, depGraph)

      for (const depKey of dependentKeys) {
        const depPath = depKey
        const depField = fieldByPath.get(depPath)
        if (!depField) continue

        const depRecord = mergedAnswers[depPath]
        if (!depRecord) continue
        if (depRecord.stale) continue // Already stale

        if (depField.on_parent_change === 'auto_clear') {
          // Auto-clear: set value to null and mark not stale
          mergedAnswers[depPath] = {
            ...depRecord,
            value: null,
            stale: false,
            updated_at: now,
          }
        } else {
          // Default: mark_stale
          mergedAnswers[depPath] = {
            ...depRecord,
            stale: true,
            stale_reason: `Dependency "${changedPath}" changed`,
            updated_at: now,
          }
        }

        staleTriggered.push({
          instance_id: instance_id,
          profile_path: depPath,
          reason: `Dependency "${changedPath}" changed`,
        })
      }
    }
  }

  // 4. Cross-form propagation (ADR-5)
  const propagated: { instance_id: string; profile_path: string }[] = []

  if (changedPaths.length > 0) {
    // Find profile paths that are propagatable
    const propagatablePaths = changedPaths.filter((path) => {
      const field = fieldByPath.get(path)
      return field && field.propagation_mode !== 'no_propagate'
    })

    if (propagatablePaths.length > 0) {
      const siblings = await dataAccess.getSiblingInstances(instance_id)

      // Collect form IDs from siblings and load their field definitions
      const siblingFormIds = [...new Set(siblings.map((s) => s.form_id))]
      const fieldsByFormId = new Map<
        string,
        Array<{ profile_path: string | null; propagation_mode: PropagationMode }>
      >()

      // Load fields for all sibling forms
      await Promise.all(
        siblingFormIds.map(async (sibFormId) => {
          const sibFields = await dataAccess.getFormFields(sibFormId)
          fieldsByFormId.set(
            sibFormId,
            sibFields.map((f) => ({
              profile_path: f.profile_path,
              propagation_mode: f.propagation_mode,
            }))
          )
        })
      )

      // Determine the source person_id
      const selfSibling = siblings.find((s) => s.id === instance_id)
      const sourcePersonId = selfSibling?.person_id ?? null

      for (const profilePath of propagatablePaths) {
        const targetInstanceIds = findPropagationTargets(
          instance_id,
          sourcePersonId,
          profilePath,
          siblings,
          fieldsByFormId
        )

        for (const targetId of targetInstanceIds) {
          const targetSibling = siblings.find((s) => s.id === targetId)
          if (!targetSibling) continue

          const existingTargetRecord = targetSibling.answers[profilePath]
          const newValue = mergedAnswers[profilePath].value

          // Trust conflict check on target
          const targetConflict = checkTrustConflict(
            existingTargetRecord,
            newValue,
            'cross_form_reuse'
          )
          if (targetConflict.hasConflict) continue

          // Write propagated value to target
          const propagatedRecord: AnswerRecord = {
            value: newValue,
            source: 'cross_form_reuse',
            source_origin: instance_id,
            verified: false,
            stale: false,
            updated_at: now,
          }

          // Update target's answers in memory (for completion calc)
          targetSibling.answers[profilePath] = propagatedRecord

          // Load target form fields for completion recalculation
          const targetFormId = targetSibling.form_id
          let targetFields = fieldsByFormId.get(targetFormId)
          if (!targetFields) {
            const fullFields = await dataAccess.getFormFields(targetFormId)
            targetFields = fullFields.map((f) => ({
              profile_path: f.profile_path,
              propagation_mode: f.propagation_mode,
            }))
            fieldsByFormId.set(targetFormId, targetFields)
          }

          // Recalculate target completion
          const targetFormFieldsFull = await dataAccess.getFormFields(targetFormId)
          const targetCompletion = computeCompletionState(
            targetSibling.answers,
            targetFormFieldsFull
          )

          const targetCounts = computeCounts(targetSibling.answers, targetFormFieldsFull)

          // Persist to target instance
          await dataAccess.updateInstanceAnswers(
            targetId,
            targetSibling.answers,
            targetCompletion,
            targetCounts
          )

          // Log the reuse event
          await dataAccess.logReuseEvent({
            tenant_id: tenantId,
            reuse_type: 'cross_form',
            target_instance_id: targetId,
            target_profile_path: profilePath,
            source_instance_id: instance_id,
            value: newValue,
          })

          // Log the change on the target
          await dataAccess.logAnswerChange({
            tenant_id: tenantId,
            form_instance_id: targetId,
            profile_path: profilePath,
            old_value: existingTargetRecord?.value ?? null,
            new_value: newValue,
            source: 'cross_form_reuse',
            source_origin: instance_id,
            stale_triggered: false,
          })

          propagated.push({ instance_id: targetId, profile_path: profilePath })
        }
      }
    }
  }

  // 5. Recalculate completion state for the source instance
  const completionState = computeCompletionState(mergedAnswers, formFields)
  const counts = computeCounts(mergedAnswers, formFields)

  // 6. Persist source instance
  await dataAccess.updateInstanceAnswers(instance_id, mergedAnswers, completionState, counts)

  return {
    updated: updatedRecords,
    propagated,
    stale_triggered: staleTriggered,
    completion_state: completionState,
  }
}

/* ------------------------------------------------------------------ */
/*  Helper: compute blocker/stale/missing counts for persistence      */
/* ------------------------------------------------------------------ */

function computeCounts(
  answers: AnswerMap,
  fields: Array<{
    id: string
    profile_path: string | null
    is_required: boolean
    is_mapped: boolean
    is_meta_field: boolean
    show_when: unknown
    required_condition: unknown
    section_id: string | null
    is_blocking: boolean
    min_length: number | null
    max_length: number | null
    validation_pattern: string | null
    options: Array<{ label: string; value: string }> | null
  }>
): { blocker_count: number; stale_count: number; missing_required_count: number } {
  let blockerCount = 0
  let staleCount = 0
  let missingRequiredCount = 0

  for (const field of fields) {
    if (!field.is_mapped || field.is_meta_field || !field.profile_path) continue
    if (!isFieldVisible(field.show_when, answers)) continue

    const record = answers[field.profile_path]

    // Stale count
    if (record?.stale) {
      staleCount++
    }

    // Missing required count
    const required = isFieldRequired(field.is_required, field.required_condition, answers)
    if (required && !isFilled(record)) {
      missingRequiredCount++
    }

    // Blocker count
    if (record && isFilled(record) && hasBlockingError(field, record.value)) {
      blockerCount++
    }
  }

  return {
    blocker_count: blockerCount,
    stale_count: staleCount,
    missing_required_count: missingRequiredCount,
  }
}
