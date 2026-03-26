/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Scan-to-Intake Field Mapper — Directive 40.0 §1
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Maps OCR-extracted field keys from /api/documents/scan to the canonical
 * profile_path keys used by the QuestionnaireRenderer and answer engine.
 *
 * The scan API returns keys like `family_name`, `date_of_birth`, `passport_number`.
 * Intake forms use profile paths like `personal.family_name`, `personal.dob`.
 * This mapper bridges the two namespaces so scanned data can auto-fill forms.
 *
 * Priority: when multiple documents provide the same field, the document with
 * the highest confidence score wins. Within equal confidence, newer scans win.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ScanExtraction {
  documentId: string
  documentType: string
  confidence: number
  extractedFields: Record<string, string | number | null>
  scannedAt: string
}

export interface MappedPrefillField {
  /** The profile_path key used by QuestionnaireRenderer */
  profilePath: string
  /** The resolved value */
  value: string | number
  /** Where it came from */
  sourceDocumentId: string
  sourceDocumentType: string
  /** Confidence from the scan (0-100) */
  confidence: number
  /** When the scan was performed */
  scannedAt: string
}

export interface ScanPrefillResult {
  /** Map of profile_path → prefill field */
  fields: Record<string, MappedPrefillField>
  /** Number of unique fields resolved */
  fieldCount: number
  /** Average confidence across all fields */
  averageConfidence: number
  /** Source document IDs that contributed */
  sourceDocumentIds: string[]
}

// ── Field Mapping Tables ──────────────────────────────────────────────────────

/**
 * Maps OCR scan extraction keys to canonical profile_path keys.
 * Format: scanKey → profilePath
 *
 * The profile_path namespace follows the pattern:
 *   personal.*    — Personal identity fields
 *   contact.*     — Contact/address fields
 *   immigration.* — Immigration-specific fields
 *   financial.*   — Financial fields
 *   family.*      — Family relationship fields
 *   employment.*  — Employment fields
 */
const GLOBAL_FIELD_MAP: Record<string, string> = {
  // ── Personal Identity ──
  full_name: 'personal.full_name',
  given_name: 'personal.given_name',
  family_name: 'personal.family_name',
  applicant_name: 'personal.full_name',
  employee_name: 'personal.full_name',
  taxpayer_name: 'personal.full_name',
  account_holder_name: 'personal.full_name',
  date_of_birth: 'personal.date_of_birth',
  sex: 'personal.sex',
  nationality: 'personal.nationality',
  place_of_birth: 'personal.place_of_birth',

  // ── Identity Documents ──
  passport_number: 'personal.passport_number',
  licence_number: 'personal.licence_number',
  registration_number: 'personal.registration_number',

  // ── Contact / Address ──
  address: 'contact.address',

  // ── Immigration (IRCC) ──
  uci_number: 'immigration.uci_number',
  application_number: 'immigration.application_number',
  application_type: 'immigration.application_type',
  office: 'immigration.processing_office',
  biometrics_deadline: 'immigration.biometrics_deadline',
  biometrics_location: 'immigration.biometrics_location',
  medical_deadline: 'immigration.medical_deadline',
  designated_medical_practitioner: 'immigration.designated_medical_practitioner',
  decision: 'immigration.decision',
  decision_details: 'immigration.decision_details',
  portal_deadline: 'immigration.portal_deadline',
  documents_requested: 'immigration.documents_requested',
  response_deadline: 'immigration.response_deadline',
  concerns: 'immigration.concerns',

  // ── Passport-specific dates ──
  date_of_issue: 'personal.passport_issue_date',
  date_of_expiry: 'personal.passport_expiry_date',
  issuing_authority: 'personal.passport_issuing_authority',

  // ── Financial ──
  bank_name: 'financial.bank_name',
  account_number: 'financial.account_number_last4',
  statement_period_start: 'financial.statement_period_start',
  statement_period_end: 'financial.statement_period_end',
  opening_balance: 'financial.opening_balance',
  closing_balance: 'financial.closing_balance',
  currency: 'financial.currency',
  total_income: 'financial.total_income',
  tax_paid: 'financial.tax_paid',
  tax_year: 'financial.tax_year',
  social_insurance_number: 'financial.sin_last3',
  salary: 'financial.salary',

  // ── Employment ──
  employer_name: 'employment.employer_name',
  job_title: 'employment.job_title',
  employment_start_date: 'employment.start_date',
  employment_type: 'employment.employment_type',
  noc_code: 'employment.noc_code',

  // ── Family ──
  mother_name: 'family.mother_name',
  father_name: 'family.father_name',
  spouse_1_name: 'family.spouse_1_name',
  spouse_2_name: 'family.spouse_2_name',
  date_of_marriage: 'family.date_of_marriage',
  place_of_marriage: 'family.place_of_marriage',
  officiant_name: 'family.officiant_name',

  // ── Legal ──
  case_number: 'legal.case_number',
  court_name: 'legal.court_name',
  judge_name: 'legal.judge_name',
  parties: 'legal.parties',
  order_type: 'legal.order_type',

  // ── Police Clearance ──
  result: 'legal.police_clearance_result',
  certificate_number: 'legal.certificate_number',

  // ── Generic dates ──
  date_received: 'immigration.date_received',
  date_issued: 'document.date_issued',
}

/**
 * Document-type-specific overrides. When a field appears in both
 * the global map and a type-specific map, the type-specific mapping wins.
 * This handles cases where the same key (e.g. "date_of_issue") means
 * different things depending on document type.
 */
const TYPE_SPECIFIC_OVERRIDES: Record<string, Record<string, string>> = {
  passport: {
    date_of_issue: 'personal.passport_issue_date',
    date_of_expiry: 'personal.passport_expiry_date',
  },
  drivers_licence: {
    date_of_issue: 'personal.licence_issue_date',
    date_of_expiry: 'personal.licence_expiry_date',
    licence_class: 'personal.licence_class',
    province_state: 'contact.province_state',
  },
  birth_certificate: {
    date_of_registration: 'personal.birth_registration_date',
  },
  employment_letter: {
    date_issued: 'employment.letter_date',
  },
  ircc_acknowledgement: {
    date_issued: 'immigration.aor_date',
  },
  ircc_decision: {
    date_issued: 'immigration.decision_date',
  },
}

// ── Mapper Functions ──────────────────────────────────────────────────────────

/**
 * Resolve the profile_path for a scan extraction key, considering
 * the document type for type-specific overrides.
 */
function resolveProfilePath(
  scanKey: string,
  documentType: string,
): string | null {
  // Check type-specific overrides first
  const overrides = TYPE_SPECIFIC_OVERRIDES[documentType]
  if (overrides?.[scanKey]) {
    return overrides[scanKey]
  }

  // Fall back to global map
  return GLOBAL_FIELD_MAP[scanKey] ?? null
}

/**
 * Map a single scan extraction into prefill fields.
 */
export function mapScanToIntakeFields(
  extraction: ScanExtraction,
): MappedPrefillField[] {
  const results: MappedPrefillField[] = []

  for (const [scanKey, value] of Object.entries(extraction.extractedFields)) {
    // Skip null/empty values
    if (value === null || value === '') continue

    const profilePath = resolveProfilePath(scanKey, extraction.documentType)
    if (!profilePath) continue

    results.push({
      profilePath,
      value,
      sourceDocumentId: extraction.documentId,
      sourceDocumentType: extraction.documentType,
      confidence: extraction.confidence,
      scannedAt: extraction.scannedAt,
    })
  }

  return results
}

/**
 * Merge multiple scan extractions into a single prefill result.
 * When multiple scans provide the same field, highest confidence wins.
 * On equal confidence, the most recent scan wins.
 */
export function mergeScanExtractions(
  extractions: ScanExtraction[],
): ScanPrefillResult {
  const fields: Record<string, MappedPrefillField> = {}
  const sourceDocIds = new Set<string>()

  // Sort by confidence desc, then by scannedAt desc
  const sorted = [...extractions].sort((a, b) => {
    if (b.confidence !== a.confidence) return b.confidence - a.confidence
    return new Date(b.scannedAt).getTime() - new Date(a.scannedAt).getTime()
  })

  for (const extraction of sorted) {
    const mapped = mapScanToIntakeFields(extraction)
    for (const field of mapped) {
      // Only overwrite if this field hasn't been set yet
      // (sorted by confidence desc, so first write wins)
      if (!fields[field.profilePath]) {
        fields[field.profilePath] = field
        sourceDocIds.add(field.sourceDocumentId)
      }
    }
  }

  const fieldValues = Object.values(fields)
  const avgConfidence = fieldValues.length > 0
    ? Math.round(fieldValues.reduce((sum, f) => sum + f.confidence, 0) / fieldValues.length)
    : 0

  return {
    fields,
    fieldCount: fieldValues.length,
    averageConfidence: avgConfidence,
    sourceDocumentIds: Array.from(sourceDocIds),
  }
}

/**
 * Convert a ScanPrefillResult into a flat Record<string, unknown>
 * compatible with the answer engine's save format.
 * Only includes fields with confidence >= minConfidence.
 */
export function toPrefillAnswerMap(
  result: ScanPrefillResult,
  minConfidence: number = 40,
): Record<string, unknown> {
  const answers: Record<string, unknown> = {}

  for (const [profilePath, field] of Object.entries(result.fields)) {
    if (field.confidence >= minConfidence) {
      answers[profilePath] = field.value
    }
  }

  return answers
}
