/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Bulk Lead Import — Shared Types
 * ═══════════════════════════════════════════════════════════════════════════════
 */

// ─── Column Mapping ─────────────────────────────────────────────────────────

export interface BulkLeadFieldDef {
  key: string
  label: string
  required: boolean
  aliases: string[]
}

/** Standard lead import field definitions for auto-mapping. */
export const BULK_LEAD_FIELDS: BulkLeadFieldDef[] = [
  { key: 'first_name',        label: 'First Name',         required: true,  aliases: ['firstname', 'first', 'given name', 'given_name', 'prenom'] },
  { key: 'last_name',         label: 'Last Name',          required: true,  aliases: ['lastname', 'last', 'surname', 'family name', 'family_name', 'nom'] },
  { key: 'email',             label: 'Email',              required: true,  aliases: ['email address', 'email_address', 'e-mail', 'courriel'] },
  { key: 'phone',             label: 'Phone',              required: false, aliases: ['phone number', 'phone_number', 'telephone', 'cell', 'mobile', 'tel'] },
  { key: 'date_of_birth',     label: 'Date of Birth',      required: false, aliases: ['dob', 'birthdate', 'birth_date', 'birthday'] },
  { key: 'nationality',       label: 'Nationality',        required: false, aliases: ['citizenship', 'citizen'] },
  { key: 'country_of_birth',  label: 'Country of Birth',   required: false, aliases: ['birth country', 'birth_country', 'country birth'] },
  { key: 'passport_number',   label: 'Passport Number',    required: false, aliases: ['passport', 'passport_no', 'passport #', 'travel document'] },
  { key: 'raw_jurisdiction',  label: 'Jurisdiction',       required: false, aliases: ['country', 'jurisdiction', 'destination', 'province'] },
  { key: 'matter_type_name',  label: 'Matter Type',        required: false, aliases: ['matter type', 'case type', 'visa type', 'program'] },
  { key: 'temperature',       label: 'Temperature',        required: false, aliases: ['lead temperature', 'priority', 'urgency'] },
  { key: 'estimated_value',   label: 'Estimated Value',    required: false, aliases: ['value', 'deal value', 'fee estimate'] },
  { key: 'notes',             label: 'Notes',              required: false, aliases: ['note', 'comment', 'comments', 'description'] },
  { key: 'source_tag',        label: 'Source',             required: false, aliases: ['source', 'lead source', 'lead_source', 'referral'] },
  { key: 'campaign_tag',      label: 'Campaign',           required: false, aliases: ['campaign', 'campaign name', 'ad campaign'] },
  { key: 'utm_source',        label: 'UTM Source',         required: false, aliases: ['utm source'] },
  { key: 'utm_medium',        label: 'UTM Medium',         required: false, aliases: ['utm medium'] },
  { key: 'utm_campaign',      label: 'UTM Campaign',       required: false, aliases: ['utm campaign'] },
]

// ─── Parsed Row ─────────────────────────────────────────────────────────────

export interface ParsedLeadRow {
  rowNumber: number
  first_name?: string
  last_name?: string
  email?: string
  phone?: string
  date_of_birth?: string
  nationality?: string
  country_of_birth?: string
  passport_number?: string
  raw_jurisdiction?: string
  matter_type_name?: string
  temperature?: string
  estimated_value?: number
  notes?: string
  source_tag?: string
  campaign_tag?: string
  utm_source?: string
  utm_medium?: string
  utm_campaign?: string
  /** Original CSV row data */
  source_data: Record<string, string>
}

// ─── Sandbox Summary ────────────────────────────────────────────────────────

export interface ImportSandboxSummary {
  batchId: string
  totalRows: number
  processed: number
  clear: number
  conflicts: number
  needsReview: number
  invalid: number
  pending: number
  phase: 'uploading' | 'validating' | 'ready' | 'committing' | 'committed' | 'discarded'
}

// ─── Staging Row (UI representation) ────────────────────────────────────────

export interface StagingRow {
  id: string
  row_number: number
  first_name: string | null
  last_name: string | null
  email: string | null
  phone: string | null
  raw_jurisdiction: string | null
  validation_status: 'pending' | 'valid' | 'invalid' | 'conflict' | 'needs_review'
  conflict_status: string
  conflict_details: Array<{ contact_id: string; contact_name: string; match_field: string; match_value?: string }>
  jurisdiction_match_type: string | null
  jurisdiction_match_confidence: number | null
  matched_jurisdiction_id: string | null
  jurisdiction_needs_review: boolean
  user_jurisdiction_override: string | null
  user_conflict_override: string | null
  validation_errors: string[]
  committed: boolean
}
