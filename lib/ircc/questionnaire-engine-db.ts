/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * DB-Driven IRCC Questionnaire Engine
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Builds questionnaires from DB field mappings instead of the hardcoded
 * form-field-registry.ts. Produces the same Questionnaire interface used by
 * the IRCCQuestionnaire component.
 *
 * Usage:
 *   const questionnaire = await buildQuestionnaireFromDB(formIds, profile, supabase)
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { IrccFormField, IrccFormSection } from '@/lib/types/ircc-forms'
import type { IRCCProfile } from '@/lib/types/ircc-profile'
import {
  profilePathGet,
  type Questionnaire,
  type QuestionnaireField,
  type QuestionnaireSection,
} from '@/lib/ircc/questionnaire-engine'
import { deriveClientLabel } from '@/lib/ircc/xfa-label-utils'
import { isSystemField, deriveSectionKey, deriveSectionTitle } from '@/lib/ircc/field-auto-classify'

// ── Types ─────────────────────────────────────────────────────────────────────

/** DB field mapped to the IRCCFieldMapping shape expected by the UI */
interface DbMappedField {
  profile_path: string
  label: string
  field_type: string
  is_required: boolean
  options?: Array<{ label: string; value: string }> | null
  placeholder?: string | null
  description?: string | null
  sort_order: number
  max_length?: number | null
  show_when?: {
    profile_path: string
    operator: string
    value?: string | number | boolean
  } | null
}

// ── Default Options for Known Select Fields ─────────────────────────────────
// When the DB has no `options` for a select-type field, infer defaults from the
// XFA path or profile_path pattern so the dropdown isn't empty.

const IRCC_LANGUAGE_OPTIONS = [
  { label: 'English', value: 'English' },
  { label: 'French', value: 'French' },
]

const IRCC_RELATIONSHIP_OPTIONS = [
  { label: 'Spouse', value: 'Spouse' },
  { label: 'Common-law Partner', value: 'Common-law Partner' },
  { label: 'Conjugal Partner', value: 'Conjugal Partner' },
]

const IRCC_CANADA_US_OPTIONS = [
  { label: 'Canada', value: 'Canada' },
  { label: 'US', value: 'US' },
  { label: 'Other', value: 'Other' },
]

const IRCC_COUNTRY_OPTIONS = (() => {
  const countries = [
    'Afghanistan', 'Albania', 'Algeria', 'Argentina', 'Armenia', 'Australia',
    'Austria', 'Azerbaijan', 'Bahamas', 'Bangladesh', 'Barbados', 'Belarus',
    'Belgium', 'Belize', 'Benin', 'Bhutan', 'Bolivia', 'Bosnia and Herzegovina',
    'Botswana', 'Brazil', 'Brunei', 'Bulgaria', 'Burkina Faso', 'Burundi',
    'Cambodia', 'Cameroon', 'Canada', 'Chad', 'Chile', 'China', 'Colombia',
    'Congo', 'Costa Rica', 'Croatia', 'Cuba', 'Cyprus', 'Czech Republic',
    'Denmark', 'Dominican Republic', 'Ecuador', 'Egypt', 'El Salvador',
    'Estonia', 'Ethiopia', 'Fiji', 'Finland', 'France', 'Gabon', 'Georgia',
    'Germany', 'Ghana', 'Greece', 'Guatemala', 'Guinea', 'Guyana', 'Haiti',
    'Honduras', 'Hong Kong', 'Hungary', 'Iceland', 'India', 'Indonesia',
    'Iran', 'Iraq', 'Ireland', 'Israel', 'Italy', 'Ivory Coast', 'Jamaica',
    'Japan', 'Jordan', 'Kazakhstan', 'Kenya', 'Kuwait', 'Kyrgyzstan', 'Laos',
    'Latvia', 'Lebanon', 'Libya', 'Lithuania', 'Luxembourg', 'Madagascar',
    'Malawi', 'Malaysia', 'Mali', 'Malta', 'Mauritius', 'Mexico', 'Moldova',
    'Mongolia', 'Montenegro', 'Morocco', 'Mozambique', 'Myanmar', 'Namibia',
    'Nepal', 'Netherlands', 'New Zealand', 'Nicaragua', 'Niger', 'Nigeria',
    'North Korea', 'North Macedonia', 'Norway', 'Oman', 'Pakistan', 'Palestine',
    'Panama', 'Papua New Guinea', 'Paraguay', 'Peru', 'Philippines', 'Poland',
    'Portugal', 'Qatar', 'Romania', 'Russia', 'Rwanda', 'Saudi Arabia',
    'Senegal', 'Serbia', 'Sierra Leone', 'Singapore', 'Slovakia', 'Slovenia',
    'Somalia', 'South Africa', 'South Korea', 'South Sudan', 'Spain',
    'Sri Lanka', 'Sudan', 'Sweden', 'Switzerland', 'Syria', 'Taiwan',
    'Tajikistan', 'Tanzania', 'Thailand', 'Togo', 'Trinidad and Tobago',
    'Tunisia', 'Turkey', 'Turkmenistan', 'Uganda', 'Ukraine',
    'United Arab Emirates', 'United Kingdom', 'United States', 'Uruguay',
    'Uzbekistan', 'Venezuela', 'Vietnam', 'Yemen', 'Zambia', 'Zimbabwe',
  ]
  return countries.map((c) => ({ label: c, value: c }))
})()

/**
 * Provide default options for a select field when the DB has none.
 * Matches common IRCC field patterns by XFA path or profile_path.
 */
function getDefaultSelectOptions(
  xfaPath: string,
  profilePath: string | null | undefined,
  fieldType: string,
): Array<{ label: string; value: string }> | undefined {
  if (fieldType !== 'select' && fieldType !== 'country') return undefined

  const lower = (xfaPath || '').toLowerCase()
  const pLower = (profilePath || '').toLowerCase()

  // Country fields
  if (fieldType === 'country') return IRCC_COUNTRY_OPTIONS
  if (/country/i.test(lower) && !/canadaus/i.test(lower)) return IRCC_COUNTRY_OPTIONS
  if (/placebirthcountry|countryofbirth|countryofissue|citizenship|nationality/i.test(lower)) {
    return IRCC_COUNTRY_OPTIONS
  }

  // Language preference
  if (/langpref|languagepref|preferredlang/i.test(lower) || /lang_pref|language_pref/i.test(pLower)) {
    return IRCC_LANGUAGE_OPTIONS
  }

  // Relationship
  if (/relationship/i.test(lower) && !/marital/i.test(lower)) {
    return IRCC_RELATIONSHIP_OPTIONS
  }

  // Canada / US phone question
  if (/canadaus/i.test(lower)) {
    return IRCC_CANADA_US_OPTIONS
  }

  // Phone/fax country selector (usually a country code)
  if (/numbercountry|phonecountry|faxcountry/i.test(lower)) {
    return IRCC_COUNTRY_OPTIONS
  }

  return undefined
}

// ── Field Value Checking ────────────────────────────────────────────────────

function isFieldFilled(value: unknown, fieldType: string): boolean {
  if (value === undefined || value === null) return false

  if (fieldType === 'boolean') return value === true || value === false
  if (fieldType === 'number') return typeof value === 'number' && !isNaN(value)
  if (fieldType === 'repeater') return Array.isArray(value) && value.length > 0
  if (typeof value === 'string') return value.trim().length > 0
  if (typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).some(
      (v) => v !== undefined && v !== null && v !== '',
    )
  }
  return false
}

// ── Questionnaire Builder ─────────────────────────────────────────────────

/**
 * Build a questionnaire from DB field mappings for the given form IDs.
 *
 * @param formIds - Array of ircc_forms.id UUIDs
 * @param existingProfile - Existing client profile data
 * @param supabase - Supabase client (admin or authenticated)
 */
export async function buildQuestionnaireFromDB(
  formIds: string[],
  existingProfile: Partial<IRCCProfile>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
): Promise<Questionnaire> {
  if (formIds.length === 0) {
    return {
      sections: [],
      progress_percent: 0,
      total_fields: 0,
      filled_fields: 0,
      form_codes: [],
    }
  }

  // 1. Fetch sections and mapped fields for all forms
  const [sectionsResult, fieldsResult, formsResult] = await Promise.all([
    supabase
      .from('ircc_form_sections')
      .select('*')
      .in('form_id', formIds)
      .order('sort_order', { ascending: true }),
    supabase
      .from('ircc_form_fields')
      .select('*')
      .in('form_id', formIds)
      .eq('is_mapped', true)
      .order('sort_order', { ascending: true }),
    supabase
      .from('ircc_forms')
      .select('id, form_code')
      .in('id', formIds),
  ])

  const dbSections = (sectionsResult.data ?? []) as IrccFormSection[]
  const dbFields = (fieldsResult.data ?? []) as IrccFormField[]
  const dbForms = (formsResult.data ?? []) as Array<{ id: string; form_code: string }>

  const formCodes = dbForms.map((f) => f.form_code)

  // 2. Group fields by section, with merge-deduplication by profile_path
  const profileObj = existingProfile as unknown as Record<string, unknown>

  // Track seen profile_paths for deduplication (when forms share fields)
  const seenPaths = new Set<string>()

  // Group fields by section_id. Fields with no section go to "Other"
  const fieldsBySection = new Map<string | null, IrccFormField[]>()
  for (const field of dbFields) {
    if (!field.profile_path) continue
    if (seenPaths.has(field.profile_path)) continue
    seenPaths.add(field.profile_path)

    const sectionId = field.section_id
    if (!fieldsBySection.has(sectionId)) {
      fieldsBySection.set(sectionId, [])
    }
    fieldsBySection.get(sectionId)!.push(field)
  }

  // 3. Build sections
  let totalFields = 0
  let filledFields = 0

  const sections: QuestionnaireSection[] = []

  // Process each DB section in order
  for (const dbSection of dbSections) {
    const sectionFields = fieldsBySection.get(dbSection.id) ?? []
    if (sectionFields.length === 0) continue

    const { section, filled, total } = buildSection(
      dbSection.id,
      dbSection.title,
      dbSection.description ?? undefined,
      dbSection.sort_order,
      sectionFields,
      profileObj,
    )
    totalFields += total
    filledFields += filled
    sections.push(section)
    fieldsBySection.delete(dbSection.id) // Remove processed
  }

  // Fields without a section → "Other" section
  const unsectionedFields = fieldsBySection.get(null) ?? []
  if (unsectionedFields.length > 0) {
    const { section, filled, total } = buildSection(
      'other',
      'Other Fields',
      undefined,
      999,
      unsectionedFields,
      profileObj,
    )
    totalFields += total
    filledFields += filled
    sections.push(section)
  }

  // Sort sections by sort_order
  sections.sort((a, b) => a.sort_order - b.sort_order)

  const progressPercent = totalFields > 0
    ? Math.round((filledFields / totalFields) * 100)
    : 0

  return {
    sections,
    progress_percent: progressPercent,
    total_fields: totalFields,
    filled_fields: filledFields,
    form_codes: formCodes,
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function buildSection(
  id: string,
  title: string,
  description: string | undefined,
  sortOrder: number,
  fields: IrccFormField[],
  profileObj: Record<string, unknown>,
): { section: QuestionnaireSection; filled: number; total: number } {
  let filledCount = 0
  let requiredCount = 0

  const questionFields: QuestionnaireField[] = fields.map((field) => {
    const currentValue = field.profile_path
      ? profilePathGet(profileObj, field.profile_path)
      : undefined
    const isPrefilled = isFieldFilled(currentValue, field.field_type ?? 'text')

    if (isPrefilled) filledCount++
    if (field.is_required) requiredCount++

    const ft = field.field_type ?? 'text'
    // Use DB options, or fall back to inferred defaults for known select patterns
    const resolvedOptions =
      (field.options && field.options.length > 0)
        ? field.options
        : getDefaultSelectOptions(field.xfa_path, field.profile_path, ft)

    return {
      profile_path: field.profile_path!,
      ircc_field_name: field.xfa_path, // XFA path serves as field identifier
      form_source: field.form_id,       // DB form ID as source
      label: deriveClientLabel(field.xfa_path, field.label, field.suggested_label, field.profile_path),
      field_type: ft,
      is_required: field.is_required,
      options: resolvedOptions,
      placeholder: field.placeholder ?? undefined,
      description: field.description ?? undefined,
      sort_order: field.sort_order,
      max_length: field.max_length ?? undefined,
      show_when: field.show_when
        ? {
            profile_path: field.show_when.profile_path,
            operator: field.show_when.operator as 'equals' | 'not_equals' | 'is_truthy' | 'is_falsy',
            value: field.show_when.value !== undefined ? String(field.show_when.value) : undefined,
          }
        : undefined,
      current_value: currentValue,
      is_prefilled: isPrefilled,
    }
  })

  // Section is "complete" when all required fields are filled.
  // If no required fields exist, at least one field must be filled to count.
  const reqFields = questionFields.filter((f) => f.is_required)
  const isComplete = reqFields.length > 0
    ? reqFields.every((f) => f.is_prefilled)
    : questionFields.length > 0
      ? questionFields.some((f) => f.is_prefilled)
      : true

  return {
    section: {
      id,
      title,
      description,
      sort_order: sortOrder,
      fields: questionFields,
      filled_count: filledCount,
      required_count: requiredCount,
      is_complete: isComplete,
    },
    filled: filledCount,
    total: fields.length,
  }
}

// ── Client-Side Junk Field Detection ─────────────────────────────────────────
// Runtime filter for fields that slip through DB-level classification.
// These are form structure artifacts that should never appear to clients.

/** XFA path patterns for structural junk (buttons, links, signatures, controls) */
const CLIENT_JUNK_XFA_PATTERNS = [
  /\.ValidateButton\d*$/i,           // Validate buttons
  /\.formNum$/i,                      // Form number display
  /\.link$/i,                         // Info/instruction links
  /Section[A-Z]signature$/i,          // Section signature fields
  /Section[A-Z]date$/i,               // Section signature dates
  /\.hideChildren$/i,                 // UI toggle controls
  /\.buttons\./i,                     // addRow/removeRow button containers
  /\.addRow$/i,                       // Row add button
  /\.removeRow$/i,                    // Row remove button
  /^SignatureField\d*$/i,             // Standalone signature fields
]

/** Check if a field is client-side junk that should never appear in the portal */
function isClientJunkField(xfaPath: string, suggestedLabel: string | null): boolean {
  // Use the main system-field detector from field-auto-classify
  if (isSystemField(xfaPath, suggestedLabel)) return true

  // Additional client-portal junk patterns
  for (const pattern of CLIENT_JUNK_XFA_PATTERNS) {
    if (pattern.test(xfaPath)) return true
  }

  return false
}

// ── Yes/No Radio Pair Detection ──────────────────────────────────────────────
// IRCC forms use two XFA conventions for Yes/No questions:
//   1. IMM 5707 style: ...QuestionName.yesno.yes / ...QuestionName.yesno.no
//   2. IMM 1344 style: ...IndicatorName.Yes / ...IndicatorName.No
// We show only the "yes" half as a boolean question and skip the "no" half.

/**
 * Detect if a field is part of a yes/no radio pair.
 * Returns 'show_as_boolean' for the .yes half, 'skip' for the .no half.
 */
function detectRadioRole(xfaPath: string): 'show_as_boolean' | 'skip' | null {
  const parts = xfaPath.split('.')
  const last = parts[parts.length - 1]?.toLowerCase()
  const secondLast = parts.length >= 2 ? parts[parts.length - 2]?.toLowerCase() : ''

  // Pattern 1: ...yesno.yes / ...yesno.no (IMM 5707 style)
  if (secondLast === 'yesno') {
    return last === 'yes' ? 'show_as_boolean' : 'skip'
  }

  // Pattern 2: ...{Question}.Yes / ...{Question}.No (IMM 1344 style)
  // Only trigger for exact "Yes"/"No" as last segment (case-insensitive)
  if ((last === 'yes' || last === 'no') && parts.length >= 3) {
    return last === 'yes' ? 'show_as_boolean' : 'skip'
  }

  return null
}

/**
 * Get the question-parent XFA path by stripping the radio pair suffix.
 * "...MarriageInPerson.yesno.yes" → "...MarriageInPerson"
 * "...CoSignerInd.Yes" → "...CoSignerInd"
 */
function getRadioQuestionPath(xfaPath: string): string {
  const parts = xfaPath.split('.')
  const secondLast = parts.length >= 2 ? parts[parts.length - 2]?.toLowerCase() : ''

  if (secondLast === 'yesno') {
    return parts.slice(0, -2).join('.') // Strip .yesno.yes
  }

  return parts.slice(0, -1).join('.') // Strip .Yes
}

// ── Section Name & Structure Improvements ────────────────────────────────────

/** Section titles that are structural PDF layout (not content sections) */
const JUNK_SECTION_NAMES = /^(Front Page|Overflow Pages?|Instructions|Paper Forms Barcode\d*)$/i

/** Map generic section names to human-readable ones */
const IMPROVED_SECTION_NAMES: Record<string, string> = {
  'Section A': 'Family Information',
  'Section B': 'Children',
  'Section C': 'Declaration',
}

/** Person-entity labels for sub-sectioning within large sections */
const PERSON_ENTITY_LABELS: Record<string, string> = {
  Applicant: 'Your Information',
  Spouse: 'Spouse / Partner',
  Parent1: 'Parent 1',
  Parent2: 'Parent 2',
  Child: 'Children',
}

/** Extract person entity from an XFA path (Applicant, Spouse, Parent1, etc.) */
function getPersonEntity(xfaPath: string): string | null {
  const parts = xfaPath.split('.')
  for (const part of parts) {
    if (PERSON_ENTITY_LABELS[part]) return part
  }
  return null
}

/**
 * Split a section's fields by person entity (Applicant, Spouse, Parent1, etc.)
 * to create clearer sub-sections. Only splits if multiple entities are found.
 */
function splitByPersonEntity(
  sectionId: string,
  sectionTitle: string,
  sortOrder: number,
  fields: IrccFormField[],
): Array<{ id: string; title: string; sortOrder: number; fields: IrccFormField[] }> {
  const byEntity = new Map<string, IrccFormField[]>()
  const noEntity: IrccFormField[] = []

  for (const field of fields) {
    const entity = getPersonEntity(field.xfa_path)
    if (entity) {
      if (!byEntity.has(entity)) byEntity.set(entity, [])
      byEntity.get(entity)!.push(field)
    } else {
      noEntity.push(field)
    }
  }

  // Don't split if only one or zero entities detected
  if (byEntity.size <= 1 && noEntity.length === 0) {
    const singleEntity = byEntity.size === 1 ? Array.from(byEntity.keys())[0] : null
    const title = singleEntity
      ? PERSON_ENTITY_LABELS[singleEntity] ?? sectionTitle
      : sectionTitle
    // Multiply by 10 for consistent ordering with split sections
    return [{ id: sectionId, title, sortOrder: sortOrder * 10, fields }]
  }

  const result: Array<{ id: string; title: string; sortOrder: number; fields: IrccFormField[] }> = []
  let idx = 0

  for (const [entity, entityFields] of byEntity) {
    result.push({
      id: `${sectionId}-${entity.toLowerCase()}`,
      title: PERSON_ENTITY_LABELS[entity] ?? entity,
      sortOrder: sortOrder * 10 + idx,
      fields: entityFields,
    })
    idx++
  }

  if (noEntity.length > 0) {
    result.push({
      id: `${sectionId}-other`,
      title: sectionTitle,
      sortOrder: sortOrder * 10 + idx,
      fields: noEntity,
    })
  }

  return result
}

/** Improve a section title if it's a generic name (Section A, Section B, etc.) */
function improveSectionTitle(title: string): string {
  return IMPROVED_SECTION_NAMES[title] ?? title
}

/**
 * Build a client-facing questionnaire from DB fields where is_client_visible = true.
 * This is the dynamic questionnaire path — no hardcoded FORM_REGISTRY needed.
 *
 * Includes runtime filtering for:
 * - System/junk fields (buttons, links, signatures, UI controls)
 * - Yes/No radio pair consolidation (shows one boolean question instead of two)
 * - Structural PDF sections (Front Page, Overflow, Instructions)
 * - Person-entity sub-sectioning for family information forms
 *
 * @param formIds - Array of ircc_forms.id UUIDs
 * @param existingProfile - Existing client profile data
 * @param supabase - Supabase client (admin or authenticated)
 */
export async function buildClientQuestionnaireFromDB(
  formIds: string[],
  existingProfile: Partial<IRCCProfile>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
): Promise<Questionnaire> {
  if (formIds.length === 0) {
    return {
      sections: [],
      progress_percent: 0,
      total_fields: 0,
      filled_fields: 0,
      form_codes: [],
    }
  }

  // 1. Fetch client-visible fields and form codes
  const [fieldsResult, formsResult, sectionsResult] = await Promise.all([
    supabase
      .from('ircc_form_fields')
      .select('*')
      .in('form_id', formIds)
      .eq('is_client_visible', true)
      .eq('is_meta_field', false)
      .order('sort_order', { ascending: true }),
    supabase
      .from('ircc_forms')
      .select('id, form_code, form_name')
      .in('id', formIds),
    supabase
      .from('ircc_form_sections')
      .select('*')
      .in('form_id', formIds)
      .order('sort_order', { ascending: true }),
  ])

  const rawFields = (fieldsResult.data ?? []) as IrccFormField[]
  const dbForms = (formsResult.data ?? []) as Array<{ id: string; form_code: string; form_name: string }>
  const dbSections = (sectionsResult.data ?? []) as IrccFormSection[]
  const formCodes = dbForms.map((f) => f.form_code)

  if (rawFields.length === 0) {
    return {
      sections: [],
      progress_percent: 0,
      total_fields: 0,
      filled_fields: 0,
      form_codes: formCodes,
    }
  }

  // ── 2. Filter junk fields and handle radio pairs ─────────────────────────
  const dbFields: IrccFormField[] = []
  for (const field of rawFields) {
    // Curated fields (with label or profile_path from seed script) bypass junk filtering
    const isCurated = !!field.label || !!field.profile_path
    // Skip junk fields (buttons, links, signatures, UI controls) — only for raw XFA imports
    if (!isCurated && isClientJunkField(field.xfa_path, field.suggested_label)) continue

    // Handle yes/no radio pairs
    const radioRole = detectRadioRole(field.xfa_path)
    if (radioRole === 'skip') continue // Skip .no radio half

    if (radioRole === 'show_as_boolean') {
      // Convert radio .yes to boolean question
      const questionPath = getRadioQuestionPath(field.xfa_path)
      dbFields.push({
        ...field,
        xfa_path: questionPath, // Use parent path for label derivation
        field_type: 'boolean',
        suggested_label: null,  // Force re-derivation from path
      } as IrccFormField)
    } else {
      dbFields.push(field)
    }
  }

  if (dbFields.length === 0) {
    return {
      sections: [],
      progress_percent: 0,
      total_fields: 0,
      filled_fields: 0,
      form_codes: formCodes,
    }
  }

  // ── 3. Auto-generate profile_paths and group by section ──────────────────
  const profileObj = existingProfile as unknown as Record<string, unknown>
  const seenPaths = new Set<string>()

  // Group fields by section_id
  const fieldsBySection = new Map<string | null, IrccFormField[]>()
  for (const field of dbFields) {
    // Auto-generate profile_path if missing
    const profilePath = field.profile_path || `dynamic.${sanitizeXfaPath(field.xfa_path)}`
    const fieldWithPath = { ...field, profile_path: profilePath }

    if (seenPaths.has(profilePath)) continue
    seenPaths.add(profilePath)

    const sectionId = field.section_id
    if (!fieldsBySection.has(sectionId)) {
      fieldsBySection.set(sectionId, [])
    }
    fieldsBySection.get(sectionId)!.push(fieldWithPath)
  }

  // ── 4. Build sections with filtering and person-entity splitting ─────────
  let totalFields = 0
  let filledFields = 0
  const sections: QuestionnaireSection[] = []

  // Process DB sections in order
  for (const dbSection of dbSections) {
    // Skip structural PDF sections (Front Page, Overflow, Instructions, etc.)
    if (JUNK_SECTION_NAMES.test(dbSection.title)) {
      fieldsBySection.delete(dbSection.id)
      continue
    }

    const sectionFields = fieldsBySection.get(dbSection.id) ?? []
    if (sectionFields.length === 0) {
      fieldsBySection.delete(dbSection.id)
      continue
    }

    // Improve generic section title
    const improvedTitle = improveSectionTitle(dbSection.title)

    // Split by person entity if the section has fields from multiple people
    const subSections = splitByPersonEntity(
      dbSection.id,
      improvedTitle,
      dbSection.sort_order,
      sectionFields,
    )

    for (const sub of subSections) {
      const { section, filled, total } = buildClientSection(
        sub.id,
        sub.title,
        dbSection.description ?? undefined,
        sub.sortOrder,
        sub.fields,
        profileObj,
      )
      totalFields += total
      filledFields += filled
      sections.push(section)
    }

    fieldsBySection.delete(dbSection.id)
  }

  // ── 5. Remaining fields without a DB section → derive sections from XFA paths
  const unsectionedFields = fieldsBySection.get(null) ?? []
  // Also gather any fields from sections not in DB
  for (const [key, fields] of fieldsBySection) {
    if (key !== null) unsectionedFields.push(...fields)
  }

  if (unsectionedFields.length > 0) {
    // Group by XFA-derived section key
    const byDerivedSection = new Map<string, IrccFormField[]>()
    const orphans: IrccFormField[] = []

    for (const f of unsectionedFields) {
      const sectionKey = deriveSectionKey(f.xfa_path)
      if (sectionKey) {
        if (!byDerivedSection.has(sectionKey)) byDerivedSection.set(sectionKey, [])
        byDerivedSection.get(sectionKey)!.push(f)
      } else {
        orphans.push(f)
      }
    }

    // Create sections from derived keys
    let sortIdx = 100
    for (const [sectionKey, fields] of byDerivedSection) {
      const title = deriveSectionTitle(sectionKey)
      const { section, filled, total } = buildClientSection(
        `derived-${sectionKey}`,
        title,
        undefined,
        sortIdx++,
        fields,
        profileObj,
      )
      totalFields += total
      filledFields += filled
      sections.push(section)
    }

    // True orphans (no derivable section) → fall back to form-name grouping
    if (orphans.length > 0) {
      const byForm = new Map<string, IrccFormField[]>()
      for (const f of orphans) {
        if (!byForm.has(f.form_id)) byForm.set(f.form_id, [])
        byForm.get(f.form_id)!.push(f)
      }

      for (const [fId, fields] of byForm) {
        const formInfo = dbForms.find((f) => f.id === fId)
        const title = formInfo?.form_name ?? formInfo?.form_code ?? 'Form Questions'

        const { section, filled, total } = buildClientSection(
          `form-${fId}`,
          title,
          undefined,
          sortIdx++,
          fields,
          profileObj,
        )
        totalFields += total
        filledFields += filled
        sections.push(section)
      }
    }
  }

  sections.sort((a, b) => a.sort_order - b.sort_order)

  const progressPercent = totalFields > 0
    ? Math.round((filledFields / totalFields) * 100)
    : 0

  return {
    sections,
    progress_percent: progressPercent,
    total_fields: totalFields,
    filled_fields: filledFields,
    form_codes: formCodes,
  }
}

/** Sanitize XFA path into a valid profile key */
function sanitizeXfaPath(xfaPath: string): string {
  return xfaPath
    .replace(/[^a-zA-Z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .toLowerCase()
}

/** Build a section using is_client_required for required flag */
function buildClientSection(
  id: string,
  title: string,
  description: string | undefined,
  sortOrder: number,
  fields: IrccFormField[],
  profileObj: Record<string, unknown>,
): { section: QuestionnaireSection; filled: number; total: number } {
  let filledCount = 0
  let requiredCount = 0

  const questionFields: QuestionnaireField[] = fields.map((field) => {
    const currentValue = field.profile_path
      ? profilePathGet(profileObj, field.profile_path)
      : undefined
    const isPrefilled = isFieldFilled(currentValue, field.field_type ?? 'text')

    if (isPrefilled) filledCount++
    if (field.is_client_required) requiredCount++

    const ft = field.field_type ?? 'text'
    // Use DB options, or fall back to inferred defaults for known select patterns
    const resolvedOptions =
      (field.options && field.options.length > 0)
        ? field.options
        : getDefaultSelectOptions(field.xfa_path, field.profile_path, ft)

    return {
      profile_path: field.profile_path!,
      ircc_field_name: field.xfa_path,
      form_source: field.form_id,
      label: deriveClientLabel(field.xfa_path, field.label, field.suggested_label, field.profile_path),
      field_type: ft,
      is_required: field.is_client_required, // Use client-required flag
      options: resolvedOptions,
      placeholder: field.placeholder ?? undefined,
      description: field.description ?? undefined,
      sort_order: field.sort_order,
      max_length: field.max_length ?? undefined,
      show_when: field.show_when
        ? {
            profile_path: field.show_when.profile_path,
            operator: field.show_when.operator as 'equals' | 'not_equals' | 'is_truthy' | 'is_falsy',
            value: field.show_when.value !== undefined ? String(field.show_when.value) : undefined,
          }
        : undefined,
      current_value: currentValue,
      is_prefilled: isPrefilled,
    }
  })

  // Section is "complete" when all required fields are filled.
  // If no required fields exist, at least one field must be filled to count.
  const reqFields = questionFields.filter((f) => f.is_required)
  const isComplete = reqFields.length > 0
    ? reqFields.every((f) => f.is_prefilled)
    : questionFields.length > 0
      ? questionFields.some((f) => f.is_prefilled)
      : true

  return {
    section: {
      id,
      title,
      description,
      sort_order: sortOrder,
      fields: questionFields,
      filled_count: filledCount,
      required_count: requiredCount,
      is_complete: isComplete,
    },
    filled: filledCount,
    total: fields.length,
  }
}

/**
 * Check if any forms in the given IDs have client-visible fields configured.
 * Returns the count of client-visible fields.
 */
export async function countClientVisibleFields(
  formIds: string[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
): Promise<number> {
  if (formIds.length === 0) return 0

  const { count, error } = await supabase
    .from('ircc_form_fields')
    .select('id', { count: 'exact', head: true })
    .in('form_id', formIds)
    .eq('is_client_visible', true)
    .eq('is_meta_field', false)

  if (error) {
    console.error('[questionnaire-engine-db] countClientVisibleFields error:', error)
    return 0
  }

  return count ?? 0
}

/**
 * Fetch form IDs for a case type (immigration stream) from the DB.
 * Used when the matter has a case type with DB-configured forms.
 */
export async function getStreamFormIds(
  caseTypeId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
): Promise<string[]> {
  const { data, error } = await supabase
    .from('ircc_stream_forms')
    .select('form_id')
    .eq('case_type_id', caseTypeId)
    .order('sort_order', { ascending: true })

  if (error) {
    console.error('[questionnaire-engine-db] Failed to fetch stream forms:', error)
    return []
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data as any[]).map((row: any) => row.form_id as string)
}

/**
 * Fetch form IDs for a matter type from the DB.
 * Used when the matter has a matter type with DB-configured forms.
 */
export async function getMatterTypeFormIds(
  matterTypeId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
): Promise<string[]> {
  const { data, error } = await supabase
    .from('ircc_stream_forms')
    .select('form_id')
    .eq('matter_type_id', matterTypeId)
    .order('sort_order', { ascending: true })

  if (error) {
    console.error('[questionnaire-engine-db] Failed to fetch matter type forms:', error)
    return []
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data as any[]).map((row: any) => row.form_id as string)
}

// ── Per-Form Progress Computation ─────────────────────────────────────────────

export interface FormProgress {
  filled: number
  total: number
  percent: number
}

/**
 * Efficiently compute per-form progress across multiple forms in a single DB query.
 * Returns a Map keyed by form_id with filled/total/percent for each form.
 *
 * This is more efficient than calling buildClientQuestionnaireFromDB for each form
 * since it fetches all fields once, applies junk filtering, then groups by form.
 *
 * @param formIds - Array of ircc_forms.id UUIDs
 * @param existingProfile - Existing client profile data
 * @param supabase - Supabase client (admin or authenticated)
 */
export async function computePerFormProgress(
  formIds: string[],
  existingProfile: Partial<IRCCProfile>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
): Promise<Map<string, FormProgress>> {
  const result = new Map<string, FormProgress>()

  if (formIds.length === 0) return result

  // Initialize all forms with zero progress
  for (const fId of formIds) {
    result.set(fId, { filled: 0, total: 0, percent: 0 })
  }

  // Fetch ALL client-visible non-meta fields across all forms in one query
  const { data: rawFields, error } = await supabase
    .from('ircc_form_fields')
    .select('form_id, xfa_path, suggested_label, profile_path, field_type')
    .in('form_id', formIds)
    .eq('is_client_visible', true)
    .eq('is_meta_field', false)
    .order('sort_order', { ascending: true })

  if (error) {
    console.error('[questionnaire-engine-db] computePerFormProgress error:', error)
    return result
  }

  const fields = (rawFields ?? []) as Array<{
    form_id: string
    xfa_path: string
    suggested_label: string | null
    profile_path: string | null
    field_type: string | null
  }>

  const profileObj = existingProfile as unknown as Record<string, unknown>

  // Track seen profile paths to deduplicate within each form
  const seenPathsByForm = new Map<string, Set<string>>()

  // Group valid fields by form_id, applying junk + radio filters
  const fieldsByForm = new Map<string, Array<{ profilePath: string; fieldType: string }>>()

  for (const field of fields) {
    // Curated fields (with profile_path from seed script) bypass junk filtering
    const isCurated = !!field.profile_path
    // Skip junk fields — only for raw XFA imports
    if (!isCurated && isClientJunkField(field.xfa_path, field.suggested_label)) continue

    // Handle radio pairs: skip .no, include .yes (but use parent path)
    const radioRole = detectRadioRole(field.xfa_path)
    if (radioRole === 'skip') continue

    let xfaPath = field.xfa_path
    let fieldType = field.field_type ?? 'text'

    if (radioRole === 'show_as_boolean') {
      xfaPath = getRadioQuestionPath(field.xfa_path)
      fieldType = 'boolean'
    }

    // Auto-generate profile_path if missing
    const profilePath = field.profile_path || `dynamic.${sanitizeXfaPath(xfaPath)}`

    // Deduplicate within this form
    if (!seenPathsByForm.has(field.form_id)) {
      seenPathsByForm.set(field.form_id, new Set())
    }
    const seenPaths = seenPathsByForm.get(field.form_id)!
    if (seenPaths.has(profilePath)) continue
    seenPaths.add(profilePath)

    if (!fieldsByForm.has(field.form_id)) {
      fieldsByForm.set(field.form_id, [])
    }
    fieldsByForm.get(field.form_id)!.push({ profilePath, fieldType })
  }

  // Compute filled vs total per form
  for (const [formId, formFields] of fieldsByForm) {
    let filled = 0
    const total = formFields.length

    for (const { profilePath, fieldType } of formFields) {
      const value = profilePathGet(profileObj, profilePath)
      if (isFieldFilled(value, fieldType)) {
        filled++
      }
    }

    const percent = total > 0 ? Math.round((filled / total) * 100) : 0
    result.set(formId, { filled, total, percent })
  }

  return result
}
