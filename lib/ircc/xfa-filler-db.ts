/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * DB-Driven XFA Field Data Builder & Filler
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Reads field mappings from the database (ircc_form_fields) instead of
 * hardcoded XFA_MAP constants. Produces scalar field data and array data,
 * then fills XFA PDFs via the Python pikepdf/lxml/PyMuPDF pipeline.
 *
 * This is the primary generation path  -  all form filling goes through here.
 */

import type { IrccFormField, IrccFormArrayMap } from '@/lib/types/ircc-forms'
import { profilePathGet } from '@/lib/ircc/questionnaire-engine'

// ── Types ─────────────────────────────────────────────────────────────────────

/** Scalar field data: { xfa_path: value } */
export type XfaScalarData = Record<string, string>

/** Array field data: { xfa_base_path: { entry_name, rows: [{ sub_field: value }] } } */
export interface XfaArrayEntry {
  entry_name: string
  max_entries: number
  rows: Array<Record<string, string>>
}
export type XfaArrayData = Record<string, XfaArrayEntry>

/** Complete XFA field data for filling a form */
export interface XfaFieldData {
  root_element: string
  scalar_fields: XfaScalarData
  array_data: XfaArrayData
}

// ── Main Builder ──────────────────────────────────────────────────────────────

/**
 * Build XFA field data from DB mappings and a client profile.
 *
 * @param formId - The ircc_forms.id to build data for
 * @param profile - The client's immigration_data profile
 * @param supabase - Supabase client (admin or authenticated)
 * @returns XfaFieldData ready to pass to fillXFAForm()
 */
export async function buildXfaFieldDataFromDB(
  formId: string,
  profile: Record<string, unknown>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
): Promise<XfaFieldData | null> {
  // 1. Fetch form metadata
  const { data: form, error: formError } = await supabase
    .from('ircc_forms')
    .select('id, form_code, xfa_root_element, is_xfa')
    .eq('id', formId)
    .single()

  if (formError || !form || !form.is_xfa) {
    console.error('[xfa-filler-db] Form not found or not XFA:', formId)
    return null
  }

  if (!form.xfa_root_element) {
    console.error('[xfa-filler-db] No XFA root element for form:', formId)
    return null
  }

  // 2. Fetch all mapped fields
  const { data: fields, error: fieldsError } = await supabase
    .from('ircc_form_fields')
    .select('*')
    .eq('form_id', formId)
    .eq('is_mapped', true)
    .eq('is_array_field', false)
    .order('sort_order', { ascending: true })

  if (fieldsError) {
    console.error('[xfa-filler-db] Failed to fetch fields:', fieldsError)
    return null
  }

  // 3. Fetch array maps
  const { data: arrayMaps } = await supabase
    .from('ircc_form_array_maps')
    .select('*')
    .eq('form_id', formId)

  // 4. Build scalar field data
  const scalarFields: XfaScalarData = {}

  for (const field of (fields ?? []) as IrccFormField[]) {
    if (!field.profile_path || !field.xfa_path) continue

    // Skip meta fields (handled separately in the Python filler)
    if (field.is_meta_field) continue

    const rawValue = profilePathGet(profile, field.profile_path)
    if (rawValue === undefined || rawValue === null) continue

    // Apply value transformation
    const stringValue = formatFieldValue(rawValue, field)
    if (stringValue === null) continue

    // Handle date split fields
    if (field.date_split && typeof rawValue === 'string') {
      const dateParts = rawValue.split('-')
      if (dateParts.length === 3) {
        switch (field.date_split) {
          case 'year':
            scalarFields[field.xfa_path] = dateParts[0]
            break
          case 'month':
            scalarFields[field.xfa_path] = dateParts[1]
            break
          case 'day':
            scalarFields[field.xfa_path] = dateParts[2]
            break
        }
        continue
      }
    }

    scalarFields[field.xfa_path] = stringValue
  }

  // 5. Build array data
  const arrayData: XfaArrayData = {}

  for (const arrayMap of ((arrayMaps ?? []) as IrccFormArrayMap[])) {
    const arrayValue = profilePathGet(profile, arrayMap.profile_path)
    if (!Array.isArray(arrayValue) || arrayValue.length === 0) continue

    const rows: Array<Record<string, string>> = []

    for (let i = 0; i < Math.min(arrayValue.length, arrayMap.max_entries); i++) {
      const item = arrayValue[i]
      if (!item || typeof item !== 'object') continue

      const row: Record<string, string> = {}
      for (const [subKey, xfaSubPath] of Object.entries(arrayMap.sub_fields)) {
        const subValue = (item as Record<string, unknown>)[subKey]
        if (subValue !== undefined && subValue !== null) {
          row[xfaSubPath] = String(subValue)
        }
      }
      rows.push(row)
    }

    if (rows.length > 0) {
      arrayData[arrayMap.xfa_base_path] = {
        entry_name: arrayMap.xfa_entry_name,
        max_entries: arrayMap.max_entries,
        rows,
      }
    }
  }

  return {
    root_element: form.xfa_root_element,
    scalar_fields: scalarFields,
    array_data: arrayData,
  }
}

// ── Value Formatting ────────────────────────────────────────────────────────

/**
 * Format a profile value for XFA insertion based on field configuration.
 */
function formatFieldValue(
  value: unknown,
  field: IrccFormField,
): string | null {
  if (value === undefined || value === null) return null

  // Boolean → custom true/false values
  if (typeof value === 'boolean') {
    const trueVal = field.value_format?.boolean_true ?? 'Yes'
    const falseVal = field.value_format?.boolean_false ?? 'No'
    return value ? trueVal : falseVal
  }

  // Number → string
  if (typeof value === 'number') {
    return String(value)
  }

  // String → possibly truncated
  if (typeof value === 'string') {
    if (field.max_length && value.length > field.max_length) {
      return value.substring(0, field.max_length)
    }
    return value
  }

  // Object (address etc.) → join non-empty values
  if (typeof value === 'object' && !Array.isArray(value)) {
    return Object.values(value as Record<string, unknown>)
      .filter((v) => v !== undefined && v !== null && v !== '')
      .map(String)
      .join(', ')
  }

  return String(value)
}

// ── Readiness Engine ────────────────────────────────────────────────────────

/**
 * Compute form pack readiness from DB field mappings.
 * Returns which required fields are missing.
 */
export async function computePackReadinessFromDB(
  profile: Record<string, unknown>,
  formIds: string[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
): Promise<{
  isReady: boolean
  missingFields: Array<{ profile_path: string; label: string }>
  totalRequired: number
  filledRequired: number
}> {
  if (formIds.length === 0) {
    return { isReady: true, missingFields: [], totalRequired: 0, filledRequired: 0 }
  }

  // Fetch required fields across all forms
  const { data: fields } = await supabase
    .from('ircc_form_fields')
    .select('profile_path, label, suggested_label, xfa_path, is_required, field_type')
    .in('form_id', formIds)
    .eq('is_mapped', true)
    .eq('is_required', true)

  if (!fields || fields.length === 0) {
    return { isReady: true, missingFields: [], totalRequired: 0, filledRequired: 0 }
  }

  // Deduplicate by profile_path
  const seen = new Set<string>()
  const uniqueFields: Array<{ profile_path: string; label: string; field_type: string }> = []

  for (const f of fields as IrccFormField[]) {
    if (!f.profile_path || seen.has(f.profile_path)) continue
    seen.add(f.profile_path)
    uniqueFields.push({
      profile_path: f.profile_path,
      label: f.label ?? f.suggested_label ?? f.xfa_path,
      field_type: f.field_type ?? 'text',
    })
  }

  const missingFields: Array<{ profile_path: string; label: string }> = []
  let filledRequired = 0

  for (const field of uniqueFields) {
    const value = profilePathGet(profile, field.profile_path)
    const isFilled = isValuePresent(value, field.field_type)

    if (isFilled) {
      filledRequired++
    } else {
      missingFields.push({
        profile_path: field.profile_path,
        label: field.label,
      })
    }
  }

  return {
    isReady: missingFields.length === 0,
    missingFields,
    totalRequired: uniqueFields.length,
    filledRequired,
  }
}

function isValuePresent(value: unknown, fieldType: string): boolean {
  if (value === undefined || value === null) return false
  if (fieldType === 'boolean') return value === true || value === false
  if (fieldType === 'number') return typeof value === 'number'
  if (fieldType === 'repeater') return Array.isArray(value) && value.length > 0
  if (typeof value === 'string') return value.trim().length > 0
  return true
}

