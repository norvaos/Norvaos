/**
 * History-Diff Engine
 *
 * Compares the current matter/contact data against the frozen input_snapshot
 * from the last submitted form pack version. Detects field-level mismatches
 * and flags them as DATA_MISMATCH_WARNING events in the sentinel audit log.
 *
 * Key fields tracked:
 *   - Personal: name, DOB, citizenship, country of residence
 *   - Passport: number, expiry
 *   - Contact: address, email, phone
 *   - Immigration: UCI, visa status, employer, job title
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface FieldMismatch {
  field: string        // dot-path e.g. 'personal.family_name'
  label: string        // human-readable e.g. 'Family Name'
  snapshotValue: string
  currentValue: string
}

export interface DiffResult {
  matterId: string
  formCode: string
  versionId: string
  versionNumber: number
  generatedAt: string
  mismatches: FieldMismatch[]
  hasMismatches: boolean
}

// ── Field definitions to compare ──────────────────────────────────────────────

interface TrackedField {
  path: string
  label: string
}

const TRACKED_FIELDS: TrackedField[] = [
  // Personal
  { path: 'personal.family_name', label: 'Family Name' },
  { path: 'personal.given_name', label: 'Given Name' },
  { path: 'personal.date_of_birth', label: 'Date of Birth' },
  { path: 'personal.citizenship', label: 'Citizenship' },
  { path: 'personal.current_country_of_residence', label: 'Country of Residence' },
  { path: 'personal.place_of_birth_city', label: 'Place of Birth (City)' },
  { path: 'personal.place_of_birth_country', label: 'Place of Birth (Country)' },
  { path: 'personal.uci_number', label: 'UCI Number' },

  // Passport
  { path: 'passport.passport_number', label: 'Passport Number' },
  { path: 'passport.expiry_date', label: 'Passport Expiry' },
  { path: 'passport.issue_date', label: 'Passport Issue Date' },
  { path: 'passport.country_of_issue', label: 'Passport Country' },

  // Contact info
  { path: 'contact_info.current_address.street', label: 'Street Address' },
  { path: 'contact_info.current_address.city', label: 'City' },
  { path: 'contact_info.current_address.province', label: 'Province/State' },
  { path: 'contact_info.current_address.postal_code', label: 'Postal Code' },
  { path: 'contact_info.current_address.country', label: 'Address Country' },
  { path: 'contact_info.email', label: 'Email Address' },
  { path: 'contact_info.phone', label: 'Phone Number' },

  // Marital
  { path: 'marital.marital_status', label: 'Marital Status' },
  { path: 'marital.spouse_family_name', label: 'Spouse Family Name' },
  { path: 'marital.spouse_given_name', label: 'Spouse Given Name' },

  // Employment
  { path: 'employment.0.employer', label: 'Current Employer' },
  { path: 'employment.0.title', label: 'Job Title' },
  { path: 'employment.0.city', label: 'Employment City' },
  { path: 'employment.0.country', label: 'Employment Country' },

  // Education
  { path: 'education.0.institution', label: 'Education Institution' },
  { path: 'education.0.field_of_study', label: 'Field of Study' },
]

// ── Utility: deep get by dot path ─────────────────────────────────────────────

function getByPath(obj: Record<string, unknown>, path: string): string {
  const parts = path.split('.')
  let current: unknown = obj
  for (const part of parts) {
    if (current == null || typeof current !== 'object') return ''
    current = (current as Record<string, unknown>)[part]
  }
  if (current == null) return ''
  if (typeof current === 'object') return JSON.stringify(current)
  return String(current)
}

// ── Core Diff Function ────────────────────────────────────────────────────────

/**
 * Compare current profile data against the last form pack's frozen snapshot.
 * Returns field-level mismatches for display in the UI.
 */
export async function computeFormDataDiff(
  supabase: SupabaseClient<Database>,
  matterId: string,
  tenantId: string,
  formCode?: string,
): Promise<DiffResult | null> {
  // ── 1. Find the last approved or draft version for this matter ──────────

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (supabase as any)
    .from('form_pack_versions')
    .select('id, pack_type, version_number, input_snapshot, created_at, status')
    .eq('matter_id', matterId)
    .eq('tenant_id', tenantId)
    .order('version_number', { ascending: false })
    .limit(1)

  if (formCode) {
    query = query.eq('pack_type', formCode)
  }

  const { data: versions, error: versionError } = await query

  if (versionError || !versions || versions.length === 0) {
    return null // No previous form  -  nothing to diff
  }

  const lastVersion = versions[0]
  const snapshot = lastVersion.input_snapshot as Record<string, unknown> | null

  if (!snapshot) return null

  // ── 2. Fetch current profile data ──────────────────────────────────────

  // Get the primary contact's immigration_data via matter_people
  const { data: primaryApplicant } = await supabase
    .from('matter_people')
    .select('contact_id')
    .eq('matter_id', matterId)
    .eq('person_role', 'principal_applicant')
    .eq('is_active', true)
    .maybeSingle()

  if (!primaryApplicant?.contact_id) return null

  const { data: contact } = await supabase
    .from('contacts')
    .select('immigration_data')
    .eq('id', primaryApplicant.contact_id)
    .maybeSingle()

  const currentProfile = (contact?.immigration_data ?? {}) as Record<string, unknown>

  // Also check form instance answers (new engine path)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: formInstance } = await (supabase as any)
    .from('matter_form_instances')
    .select('answers')
    .eq('matter_id', matterId)
    .eq('is_active', true)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  // Prefer instance answers if available (they're more recent)
  const profile = (formInstance?.answers && Object.keys(formInstance.answers as object).length > 0)
    ? formInstance.answers as Record<string, unknown>
    : currentProfile

  // ── 3. Compare field by field ──────────────────────────────────────────

  const mismatches: FieldMismatch[] = []

  for (const field of TRACKED_FIELDS) {
    const snapshotVal = getByPath(snapshot, field.path)
    const currentVal = getByPath(profile, field.path)

    // Skip if both empty
    if (!snapshotVal && !currentVal) continue

    // Normalize for comparison (trim whitespace, lowercase)
    const normalizedSnapshot = snapshotVal.trim().toLowerCase()
    const normalizedCurrent = currentVal.trim().toLowerCase()

    if (normalizedSnapshot !== normalizedCurrent) {
      mismatches.push({
        field: field.path,
        label: field.label,
        snapshotValue: snapshotVal || '(empty)',
        currentValue: currentVal || '(empty)',
      })
    }
  }

  return {
    matterId,
    formCode: lastVersion.pack_type,
    versionId: lastVersion.id,
    versionNumber: lastVersion.version_number,
    generatedAt: lastVersion.created_at,
    mismatches,
    hasMismatches: mismatches.length > 0,
  }
}
