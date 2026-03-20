/**
 * IRCC Forms Engine — Stale Dependency Tracker
 *
 * Pure function module (no I/O, no database). Detects stale dependencies
 * and computes invalidation updates when parent field values change.
 */

import type { AnswerRecord, AnswerMap, OnParentChange } from './types/answers'
import type { FieldCondition } from './types/conditions'
import {
  evaluateCondition,
  normalizeLegacyCondition,
  buildDependencyGraph,
  getDependentFields,
  extractDependencyPaths,
} from './condition-engine'

/** Describes a single stale update to apply to a field */
export interface StaleUpdate {
  field_id: string
  profile_path: string
  action: 'mark_stale' | 'auto_clear'
  reason: string
  parent_path: string
}

/** Field definition shape expected by the stale tracker */
interface StaleTrackerField {
  id: string
  profile_path: string | null
  show_when: unknown
  required_condition: unknown
  on_parent_change: OnParentChange
}

/**
 * Given a set of changed field paths and the current answer map,
 * compute which dependent fields should be marked stale.
 *
 * Uses the dependency graph derived from show_when and required_condition
 * on each field to determine which fields reference any of the changed paths.
 * For each affected field, produces a StaleUpdate with the appropriate action
 * based on the field's on_parent_change setting.
 *
 * @param changedPaths - profile_paths that just changed
 * @param answers - current answer map for the form instance
 * @param fields - field definitions with conditions and stale config
 * @returns StaleUpdate[] - list of fields to mark stale with reasons
 */
export function computeStaleUpdates(
  changedPaths: string[],
  answers: AnswerMap,
  fields: StaleTrackerField[]
): StaleUpdate[] {
  if (changedPaths.length === 0 || fields.length === 0) {
    return []
  }

  // Build a map of profile_path → field for quick lookup
  const fieldsByPath = new Map<string, StaleTrackerField>()
  for (const field of fields) {
    if (field.profile_path) {
      fieldsByPath.set(field.profile_path, field)
    }
  }

  // Build dependency graph using profile_path as id so dependents are profile_paths
  const depFields = fields
    .filter((f) => f.profile_path != null)
    .map((f) => ({
      id: f.profile_path!,
      show_when: f.show_when as FieldCondition | null,
      required_condition: f.required_condition as FieldCondition | null,
    }))

  const depGraph = buildDependencyGraph(depFields)

  // Collect all affected fields across all changed paths
  const updates: StaleUpdate[] = []
  const seen = new Set<string>() // avoid duplicate updates for the same field

  for (const changedPath of changedPaths) {
    const dependents = getDependentFields(changedPath, depGraph)

    for (const dependentPath of dependents) {
      // Don't mark a field stale due to its own change
      if (dependentPath === changedPath) continue
      // Skip duplicates (a field might depend on multiple changed paths)
      if (seen.has(dependentPath)) continue
      seen.add(dependentPath)

      const field = fieldsByPath.get(dependentPath)
      if (!field) continue

      // Only produce an update if the field has an answer
      const answer = answers[dependentPath]
      if (!answer) continue

      const action: 'mark_stale' | 'auto_clear' =
        field.on_parent_change === 'auto_clear' ? 'auto_clear' : 'mark_stale'

      updates.push({
        field_id: field.id,
        profile_path: dependentPath,
        action,
        reason: `Parent field '${changedPath}' changed`,
        parent_path: changedPath,
      })
    }
  }

  return updates
}

/**
 * Apply stale updates to an answer map, returning a new modified map.
 * Does NOT mutate the input.
 *
 * For 'mark_stale': sets answer.stale = true and answer.stale_reason = reason,
 * preserving the existing value.
 *
 * For 'auto_clear': sets answer.value = null, answer.stale = true, and
 * answer.stale_reason = reason.
 *
 * @param answers - the current answer map (will not be mutated)
 * @param updates - stale updates to apply
 * @returns a new AnswerMap with the updates applied
 */
export function applyStaleUpdates(
  answers: AnswerMap,
  updates: StaleUpdate[]
): AnswerMap {
  if (updates.length === 0) {
    return { ...answers }
  }

  const result: AnswerMap = { ...answers }

  for (const update of updates) {
    const existing = result[update.profile_path]
    if (!existing) continue

    if (update.action === 'auto_clear') {
      result[update.profile_path] = {
        ...existing,
        value: null,
        stale: true,
        stale_reason: update.reason,
      }
    } else {
      // mark_stale — preserve value
      result[update.profile_path] = {
        ...existing,
        stale: true,
        stale_reason: update.reason,
      }
    }
  }

  return result
}

/**
 * Check whether a field's condition has transitioned from visible to hidden
 * (or vice versa) given old and new answer states.
 *
 * @param field - field with a show_when condition
 * @param oldValues - flat value map before the change
 * @param newValues - flat value map after the change
 * @returns 'became_hidden' | 'became_visible' | null if no transition occurred
 */
export function detectVisibilityTransition(
  field: { show_when: unknown },
  oldValues: Record<string, unknown>,
  newValues: Record<string, unknown>
): 'became_hidden' | 'became_visible' | null {
  const condition = normalizeLegacyCondition(
    field.show_when as Parameters<typeof normalizeLegacyCondition>[0]
  )

  // No condition means always visible — no transition possible
  if (!condition) return null

  const wasVisible = evaluateCondition(condition, oldValues)
  const isVisible = evaluateCondition(condition, newValues)

  if (wasVisible && !isVisible) return 'became_hidden'
  if (!wasVisible && isVisible) return 'became_visible'
  return null
}

/**
 * Count the number of stale answers in an answer map.
 *
 * @param answers - the answer map to inspect
 * @returns the count of answers where stale === true
 */
export function countStaleAnswers(answers: AnswerMap): number {
  let count = 0
  for (const key of Object.keys(answers)) {
    if (answers[key].stale) {
      count++
    }
  }
  return count
}

/**
 * Get all stale answers from an answer map with their profile paths,
 * values, and stale reasons.
 *
 * @param answers - the answer map to inspect
 * @returns an array of stale answer details
 */
export function getStaleAnswers(
  answers: AnswerMap
): Array<{ profile_path: string; value: unknown; stale_reason: string | null }> {
  const result: Array<{ profile_path: string; value: unknown; stale_reason: string | null }> = []

  for (const [profilePath, record] of Object.entries(answers)) {
    if (record.stale) {
      result.push({
        profile_path: profilePath,
        value: record.value,
        stale_reason: record.stale_reason ?? null,
      })
    }
  }

  return result
}

/**
 * Clear stale flags on specific answers (e.g., when a user re-confirms them).
 * Returns a new answer map. Does NOT mutate the input.
 *
 * @param answers - the current answer map (will not be mutated)
 * @param profilePaths - the profile_paths whose stale flags should be cleared
 * @returns a new AnswerMap with the specified stale flags removed
 */
export function clearStaleFlags(
  answers: AnswerMap,
  profilePaths: string[]
): AnswerMap {
  if (profilePaths.length === 0) {
    return { ...answers }
  }

  const pathSet = new Set(profilePaths)
  const result: AnswerMap = { ...answers }

  for (const path of pathSet) {
    const existing = result[path]
    if (!existing) continue

    result[path] = {
      ...existing,
      stale: false,
      stale_reason: undefined,
    }
  }

  return result
}

/**
 * Flatten an answer map to a simple profile_path to value map,
 * suitable for condition evaluation. Optionally excludes stale answers.
 *
 * @param answers - the answer map to flatten
 * @param options - optional settings; if excludeStale is true, stale answers are omitted
 * @returns a flat map of profile_path to value
 */
export function flattenAnswers(
  answers: AnswerMap,
  options?: { excludeStale?: boolean }
): Record<string, unknown> {
  const excludeStale = options?.excludeStale ?? false
  const result: Record<string, unknown> = {}

  for (const [profilePath, record] of Object.entries(answers)) {
    if (excludeStale && record.stale) continue
    result[profilePath] = record.value
  }

  return result
}
