/**
 * IRCC Forms Engine  -  Generation Resolver (Module L)
 *
 * Bridges the per-instance answer engine to the existing generation pipeline.
 * Resolves per-instance answers into the flat resolved_fields map that the
 * XFA filler expects, then runs the generation readiness gate.
 *
 * Flow:
 *   1. Load instance answers from matter_form_instances
 *   2. Load form field definitions (ircc_form_fields) for the form
 *   3. For each mapped field with an xfa_path:
 *      a. Get the resolved value from answers (by profile_path)
 *      b. Apply value_format transformations (boolean true/false mapping)
 *      c. Apply date_split extraction (year/month/day from date value)
 *      d. Handle max_length truncation
 *      e. Map to xfa_path in the output
 *   4. Resolve array fields via ircc_form_array_maps
 *   5. Build input_snapshot from all resolved profile_path -> value pairs
 *   6. Run generation readiness check
 *   7. Return the complete resolver result
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { AnswerMap } from './types/answers'

// ── Result Types ─────────────────────────────────────────────────────────────

export interface GenerationResolverResult {
  /** XFA path -> string value map for PDF filling */
  resolvedFields: Record<string, string>
  /** Profile path -> resolved value (for input_snapshot) */
  inputSnapshot: Record<string, unknown>
  /** Fields that had conflicts during resolution */
  conflicts: Array<{ profilePath: string; reason: string }>
  /** Fields that were skipped (empty/null) */
  skippedPaths: string[]
  /** Validation gate result  -  must be canGenerate=true to proceed */
  readinessCheck: {
    canGenerate: boolean
    blockerCount: number
    staleCount: number
    missingCount: number
    errors: string[]
  }
}

// ── Internal types for DB rows ───────────────────────────────────────────────

interface FormFieldRow {
  id: string
  profile_path: string | null
  xfa_path: string | null
  field_type: string | null
  is_mapped: boolean
  is_meta_field: boolean
  is_array_field: boolean
  is_required: boolean
  is_blocking: boolean
  value_format: { boolean_true?: string; boolean_false?: string } | null
  date_split: 'year' | 'month' | 'day' | null
  max_length: number | null
  label: string | null
}

interface ArrayMapRow {
  profile_path: string
  xfa_base_path: string
  xfa_entry_name: string
  max_entries: number
  sub_fields: Record<string, string>
}

// ── Value Transformation ─────────────────────────────────────────────────────

/**
 * Transform a raw answer value into the string format expected by the XFA field.
 * Handles: boolean -> '1'/'2' (or custom format), date -> split parts, truncation.
 *
 * @param value - The raw answer value to transform
 * @param field - Field metadata controlling the transformation
 * @returns The string value ready for XFA insertion
 */
export function transformValueForXfa(
  value: unknown,
  field: {
    field_type: string | null
    value_format: { boolean_true?: string; boolean_false?: string } | null
    date_split: 'year' | 'month' | 'day' | null
    max_length: number | null
  }
): string {
  if (value === null || value === undefined) return ''

  // Boolean -> custom true/false strings (IRCC uses '1'/'2' by convention)
  if (typeof value === 'boolean') {
    const trueVal = field.value_format?.boolean_true ?? '1'
    const falseVal = field.value_format?.boolean_false ?? '2'
    return value ? trueVal : falseVal
  }

  // Date split  -  extract year/month/day component from YYYY-MM-DD string
  if (field.date_split && typeof value === 'string') {
    const parts = value.split('-')
    if (parts.length === 3) {
      switch (field.date_split) {
        case 'year':
          return parts[0]
        case 'month':
          return parts[1]
        case 'day':
          return parts[2]
      }
    }
    // Malformed date  -  return as-is
  }

  // Number -> string
  if (typeof value === 'number') {
    return String(value)
  }

  // Object (address, etc.) -> join non-empty values
  if (typeof value === 'object' && !Array.isArray(value)) {
    return Object.values(value as Record<string, unknown>)
      .filter((v) => v !== undefined && v !== null && v !== '')
      .map(String)
      .join(', ')
  }

  // String -> apply max_length truncation
  let str = String(value)
  if (field.max_length && str.length > field.max_length) {
    str = str.substring(0, field.max_length)
  }

  return str
}

// ── Array Field Resolution ───────────────────────────────────────────────────

/**
 * Build the array field mappings for repeater sections.
 * Maps array answers (e.g., children[0].given_name) to XFA array paths.
 *
 * Array answers in the AnswerMap follow the pattern:
 *   `{profile_path}[{index}].{sub_field}` -> value
 *
 * This resolves them to XFA paths like:
 *   `{xfa_base_path}[{index}].{xfa_sub_field}` -> value
 *
 * @param answers - The full answer map for the instance
 * @param arrayMaps - Array mapping definitions from ircc_form_array_maps
 * @returns Flat XFA path -> string value map for array entries
 */
export function resolveArrayFields(
  answers: AnswerMap,
  arrayMaps: Array<{
    profile_path: string
    xfa_base_path: string
    xfa_entry_name: string
    max_entries: number
    sub_fields: Record<string, string>
  }>
): Record<string, string> {
  const result: Record<string, string> = {}

  for (const arrayMap of arrayMaps) {
    // Scan answers for entries matching this array's profile_path pattern
    // Pattern: `{profile_path}[{index}].{sub_field}`
    const prefix = `${arrayMap.profile_path}[`

    // Collect all matching indices
    const indexedEntries = new Map<number, Record<string, unknown>>()

    for (const [answerPath, record] of Object.entries(answers)) {
      if (!answerPath.startsWith(prefix)) continue
      if (record.value === null || record.value === undefined) continue

      // Parse index and sub-field from path like "children[0].given_name"
      const afterPrefix = answerPath.substring(prefix.length)
      const bracketClose = afterPrefix.indexOf(']')
      if (bracketClose === -1) continue

      const indexStr = afterPrefix.substring(0, bracketClose)
      const index = parseInt(indexStr, 10)
      if (isNaN(index) || index < 0 || index >= arrayMap.max_entries) continue

      // Extract sub-field name (skip the "]." separator)
      const subField = afterPrefix.substring(bracketClose + 2)
      if (!subField) continue

      if (!indexedEntries.has(index)) {
        indexedEntries.set(index, {})
      }
      indexedEntries.get(index)![subField] = record.value
    }

    // Map collected entries to XFA paths
    for (const [index, fields] of Array.from(indexedEntries.entries())) {
      for (const [subFieldKey, xfaSubPath] of Object.entries(arrayMap.sub_fields)) {
        const rawValue = fields[subFieldKey]
        if (rawValue === undefined || rawValue === null) continue

        // XFA array path: {xfa_base_path}.{xfa_entry_name}[{index}].{xfa_sub_field}
        const xfaPath = `${arrayMap.xfa_base_path}.${arrayMap.xfa_entry_name}[${index}].${xfaSubPath}`
        result[xfaPath] = String(rawValue)
      }
    }
  }

  return result
}

// ── Main Resolver ────────────────────────────────────────────────────────────

/**
 * Resolve a form instance's answers into the XFA field map for generation.
 *
 * Steps:
 * 1. Load instance answers from matter_form_instances
 * 2. Load form field definitions (ircc_form_fields) for the form
 * 3. For each mapped field with an xfa_path:
 *    a. Get the resolved value from answers (by profile_path)
 *    b. Apply value_format transformations (boolean_true/false mapping)
 *    c. Apply date_split extraction (year/month/day from date value)
 *    d. Handle max_length truncation
 *    e. Map to xfa_path in the output
 * 4. Build input_snapshot from all resolved profile_path -> value pairs
 * 5. Run generation readiness check
 * 6. Return the complete resolver result
 *
 * @param instanceId - The form instance to resolve
 * @param formId - The form definition ID
 * @param supabase - Supabase client for data access
 */
export async function resolveForGeneration(
  instanceId: string,
  formId: string,
  supabase: SupabaseClient
): Promise<GenerationResolverResult> {
  // ── 1. Load instance answers ───────────────────────────────────────────────

  const { data: instance, error: instanceError } = await supabase
    .from('matter_form_instances')
    .select('id, answers, matter_id, person_id, tenant_id')
    .eq('id', instanceId)
    .single()

  if (instanceError || !instance) {
    throw new Error(
      `[generation-resolver] Failed to load form instance ${instanceId}: ${instanceError?.message ?? 'not found'}`
    )
  }

  const answers: AnswerMap = (instance.answers as AnswerMap) ?? {}

  // ── 2. Load form field definitions ─────────────────────────────────────────

  const { data: fields, error: fieldsError } = await supabase
    .from('ircc_form_fields')
    .select(
      'id, profile_path, xfa_path, field_type, is_mapped, is_meta_field, ' +
      'is_array_field, is_required, is_blocking, value_format, date_split, ' +
      'max_length, label'
    )
    .eq('form_id', formId)
    .eq('is_mapped', true)
    .order('sort_order', { ascending: true })

  if (fieldsError) {
    throw new Error(
      `[generation-resolver] Failed to load form fields for ${formId}: ${fieldsError.message}`
    )
  }

  const formFields = (fields ?? []) as unknown as FormFieldRow[]

  // ── 3. Load array maps ─────────────────────────────────────────────────────

  const { data: arrayMaps } = await supabase
    .from('ircc_form_array_maps')
    .select('profile_path, xfa_base_path, xfa_entry_name, max_entries, sub_fields')
    .eq('form_id', formId)

  const arrayMapRows = (arrayMaps ?? []) as unknown as ArrayMapRow[]

  // ── 4. Resolve scalar fields ───────────────────────────────────────────────

  const resolvedFields: Record<string, string> = {}
  const inputSnapshot: Record<string, unknown> = {}
  const conflicts: Array<{ profilePath: string; reason: string }> = []
  const skippedPaths: string[] = []

  for (const field of formFields) {
    // Skip meta fields and array fields (handled separately)
    if (field.is_meta_field) continue
    if (field.is_array_field) continue
    if (!field.profile_path || !field.xfa_path) continue

    const answerRecord = answers[field.profile_path]
    const rawValue = answerRecord?.value

    // Track in input snapshot regardless of whether we can map it
    if (rawValue !== null && rawValue !== undefined) {
      inputSnapshot[field.profile_path] = rawValue
    }

    // Check for conflicts (stale or has_conflict via answer metadata)
    if (answerRecord?.stale) {
      conflicts.push({
        profilePath: field.profile_path,
        reason: answerRecord.stale_reason ?? 'Answer is marked stale',
      })
    }

    // Skip empty/null values
    if (rawValue === null || rawValue === undefined) {
      skippedPaths.push(field.profile_path)
      continue
    }

    // Empty string check
    if (typeof rawValue === 'string' && rawValue.trim() === '') {
      skippedPaths.push(field.profile_path)
      continue
    }

    // Transform and map to XFA path
    const xfaValue = transformValueForXfa(rawValue, {
      field_type: field.field_type,
      value_format: field.value_format,
      date_split: field.date_split,
      max_length: field.max_length,
    })

    if (xfaValue !== '') {
      resolvedFields[field.xfa_path] = xfaValue
    }
  }

  // ── 5. Resolve array fields ────────────────────────────────────────────────

  if (arrayMapRows.length > 0) {
    const arrayFields = resolveArrayFields(answers, arrayMapRows)
    Object.assign(resolvedFields, arrayFields)

    // Add array values to input snapshot
    for (const arrayMap of arrayMapRows) {
      const prefix = `${arrayMap.profile_path}[`
      for (const [path, record] of Object.entries(answers)) {
        if (path.startsWith(prefix) && record.value !== null && record.value !== undefined) {
          inputSnapshot[path] = record.value
        }
      }
    }
  }

  // ── 6. Run generation readiness check ──────────────────────────────────────

  const readinessCheck = computeReadiness(formFields, answers, conflicts)

  return {
    resolvedFields,
    inputSnapshot,
    conflicts,
    skippedPaths,
    readinessCheck,
  }
}

// ── Readiness Computation ────────────────────────────────────────────────────

/**
 * Compute generation readiness from resolved field state.
 * This is a lightweight check based on the fields and answers already loaded,
 * avoiding a second round-trip to the database.
 */
function computeReadiness(
  fields: FormFieldRow[],
  answers: AnswerMap,
  conflicts: Array<{ profilePath: string; reason: string }>
): GenerationResolverResult['readinessCheck'] {
  const errors: string[] = []
  let missingCount = 0
  let staleCount = 0

  // Check required fields
  for (const field of fields) {
    if (field.is_meta_field || field.is_array_field) continue
    if (!field.profile_path) continue
    if (!field.is_required) continue

    const record = answers[field.profile_path]
    const value = record?.value

    // Missing required field
    if (value === null || value === undefined || (typeof value === 'string' && value.trim() === '')) {
      missingCount++
      errors.push(`Required field "${field.label ?? field.profile_path}" is missing`)
    }
  }

  // Count stale answers
  for (const [path, record] of Object.entries(answers)) {
    if (record.stale) {
      staleCount++
    }
  }

  // Conflicts block generation
  if (conflicts.length > 0) {
    for (const c of conflicts) {
      errors.push(`Conflict on "${c.profilePath}": ${c.reason}`)
    }
  }

  const blockerCount = missingCount + staleCount + conflicts.length
  const canGenerate = blockerCount === 0

  return {
    canGenerate,
    blockerCount,
    staleCount,
    missingCount,
    errors,
  }
}
