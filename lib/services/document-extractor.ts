/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Document Extractor  -  Shared OCR field extraction logic (Directive 40.0)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Extracted from /api/documents/scan so both the authenticated scan endpoint
 * and the vault-drop auto-scanner can reuse the same detection + extraction
 * logic without circular imports.
 */

// ── Document Type Detection ────────────────────────────────────────────────

export type DocumentType =
  | 'ircc_acknowledgement'
  | 'ircc_biometrics'
  | 'ircc_medical'
  | 'ircc_decision'
  | 'ircc_portal_letter'
  | 'ircc_procedural_fairness'
  | 'passport'
  | 'drivers_licence'
  | 'birth_certificate'
  | 'marriage_certificate'
  | 'bank_statement'
  | 'employment_letter'
  | 'tax_document'
  | 'court_order'
  | 'police_clearance'
  | 'general'

export function detectDocumentType(text: string, hint?: string): DocumentType {
  const t = text.toLowerCase()

  if (hint) {
    const h = hint.toLowerCase().replace(/[\s-]+/g, '_')
    const knownTypes: DocumentType[] = [
      'ircc_acknowledgement', 'ircc_biometrics', 'ircc_medical', 'ircc_decision',
      'ircc_portal_letter', 'ircc_procedural_fairness', 'passport', 'drivers_licence',
      'birth_certificate', 'marriage_certificate', 'bank_statement', 'employment_letter',
      'tax_document', 'court_order', 'police_clearance',
    ]
    if (knownTypes.includes(h as DocumentType)) return h as DocumentType
  }

  // IRCC Documents
  if (t.includes('acknowledgement of receipt') || t.includes('acknowledgment of receipt') || (t.includes('ircc') && t.includes('aor'))) return 'ircc_acknowledgement'
  if (t.includes('biometric') && (t.includes('ircc') || t.includes('immigration') || t.includes('instruction letter'))) return 'ircc_biometrics'
  if ((t.includes('medical') || t.includes('upfront medical')) && (t.includes('ircc') || t.includes('immigration'))) return 'ircc_medical'
  if (t.includes('procedural fairness') && (t.includes('ircc') || t.includes('immigration'))) return 'ircc_procedural_fairness'
  if ((t.includes('approved') || t.includes('refused') || t.includes('decision')) && (t.includes('ircc') || t.includes('immigration, refugees and citizenship'))) return 'ircc_decision'
  if (t.includes('portal') && (t.includes('ircc') || t.includes('immigration')) && t.includes('submit')) return 'ircc_portal_letter'

  // Identity Documents
  if (t.includes('passport') && (t.includes('nationality') || t.includes('date of birth') || t.includes('surname') || t.includes('given name'))) return 'passport'
  if (t.includes('driver') && (t.includes('licence') || t.includes('license'))) return 'drivers_licence'
  if (t.includes('birth') && (t.includes('certificate') || t.includes('registration'))) return 'birth_certificate'
  if (t.includes('marriage') && (t.includes('certificate') || t.includes('registration'))) return 'marriage_certificate'

  // Financial Documents
  if (t.includes('bank') && (t.includes('statement') || t.includes('account'))) return 'bank_statement'
  if (t.includes('employment') && (t.includes('letter') || t.includes('offer')) || (t.includes('job') && t.includes('offer'))) return 'employment_letter'
  if (t.includes('t4') || t.includes('notice of assessment') || t.includes('tax return') || t.includes('t1 general')) return 'tax_document'

  // Legal Documents
  if (t.includes('court') && (t.includes('order') || t.includes('judgment') || t.includes('judgement'))) return 'court_order'
  if (t.includes('police') && (t.includes('clearance') || t.includes('certificate') || t.includes('criminal record'))) return 'police_clearance'

  return 'general'
}

// ── Field Extraction Helpers ──────────────────────────────────────────────

function extractAfterLabel(text: string, ...labels: string[]): string | null {
  for (const label of labels) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const re = new RegExp(`${escaped}[:\\s]*([^\\n]{2,80})`, 'i')
    const m = text.match(re)
    if (m?.[1]) return m[1].trim().replace(/^[:\s]+/, '').trim()
  }
  return null
}

function extractDate(text: string, ...labels: string[]): string | null {
  const raw = extractAfterLabel(text, ...labels)
  if (!raw) return null
  return normaliseDate(raw)
}

function normaliseDate(raw: string): string | null {
  const iso = raw.match(/(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`

  const dmy = raw.match(/(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})/)
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`

  const months: Record<string, string> = {
    january: '01', february: '02', march: '03', april: '04', may: '05', june: '06',
    july: '07', august: '08', september: '09', october: '10', november: '11', december: '12',
    jan: '01', feb: '02', mar: '03', apr: '04', jun: '06', jul: '07',
    aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
  }

  const mdy = raw.match(/([a-z]+)\s+(\d{1,2}),?\s*(\d{4})/i)
  if (mdy) {
    const mon = months[mdy[1].toLowerCase()]
    if (mon) return `${mdy[3]}-${mon}-${mdy[2].padStart(2, '0')}`
  }

  const dmy2 = raw.match(/(\d{1,2})\s+([a-z]+)\s+(\d{4})/i)
  if (dmy2) {
    const mon = months[dmy2[2].toLowerCase()]
    if (mon) return `${dmy2[3]}-${mon}-${dmy2[1].padStart(2, '0')}`
  }

  return null
}

function extractUCI(text: string): string | null {
  const m = text.match(/(?:uci|unique client identifier|client id)[:\s#]*(\d{8,10})/i)
  if (m) return m[1]
  const uciBlock = text.match(/uci[^]*?(\d{8,10})/i)
  return uciBlock?.[1] ?? null
}

function extractApplicationNumber(text: string): string | null {
  const m = text.match(/(?:application\s*(?:number|no|#)|file\s*(?:number|no|#))[:\s]*([A-Z]\d{6,12})/i)
  if (m) return m[1].toUpperCase()
  const fallback = text.match(/\b([BVEFT]\d{8,12})\b/i)
  return fallback?.[1]?.toUpperCase() ?? null
}

function extractName(text: string): string | null {
  return extractAfterLabel(text,
    'applicant name', 'name of applicant', 'principal applicant', 'full name',
    'name', 'surname/given name', 'client name',
  )
}

// ── Per-Type Extractors ─────────────────────────────────────────────────

const EXTRACTORS: Record<DocumentType, (text: string) => Record<string, string | number | null>> = {
  ircc_acknowledgement: (text) => ({
    applicant_name: extractName(text),
    application_number: extractApplicationNumber(text),
    uci_number: extractUCI(text),
    date_received: extractDate(text, 'date received', 'received on', 'date of receipt'),
    date_issued: extractDate(text, 'date issued', 'date', 'dated'),
    application_type: extractAfterLabel(text, 'application type', 'type of application', 'category', 'program'),
    office: extractAfterLabel(text, 'processing office', 'office', 'processing centre', 'processing center'),
  }),

  ircc_biometrics: (text) => ({
    applicant_name: extractName(text),
    application_number: extractApplicationNumber(text),
    uci_number: extractUCI(text),
    date_issued: extractDate(text, 'date issued', 'date', 'dated'),
    biometrics_deadline: extractDate(text, 'deadline', 'must provide', 'biometrics by', 'before', 'no later than', 'expiry date'),
    biometrics_location: extractAfterLabel(text, 'collection point', 'collection location', 'service point', 'application support center'),
  }),

  ircc_medical: (text) => ({
    applicant_name: extractName(text),
    application_number: extractApplicationNumber(text),
    uci_number: extractUCI(text),
    date_issued: extractDate(text, 'date issued', 'date', 'dated'),
    medical_deadline: extractDate(text, 'deadline', 'medical exam by', 'must complete', 'no later than', 'expiry'),
    designated_medical_practitioner: extractAfterLabel(text, 'designated medical practitioner', 'panel physician', 'doctor', 'physician'),
  }),

  ircc_decision: (text) => {
    const t = text.toLowerCase()
    let decision: string | null = null
    if (t.includes('approved') || t.includes('granted')) decision = 'approved'
    else if (t.includes('refused') || t.includes('denied') || t.includes('rejected')) decision = 'refused'
    else if (t.includes('withdrawn')) decision = 'withdrawn'
    return {
      applicant_name: extractName(text),
      application_number: extractApplicationNumber(text),
      uci_number: extractUCI(text),
      date_issued: extractDate(text, 'date issued', 'date', 'dated', 'decision date'),
      decision,
      decision_details: extractAfterLabel(text, 'reason', 'reasons for', 'grounds', 'basis'),
      office: extractAfterLabel(text, 'processing office', 'office', 'processing centre'),
    }
  },

  ircc_portal_letter: (text) => ({
    applicant_name: extractName(text),
    application_number: extractApplicationNumber(text),
    uci_number: extractUCI(text),
    date_issued: extractDate(text, 'date issued', 'date', 'dated'),
    portal_deadline: extractDate(text, 'deadline', 'submit by', 'must submit', 'no later than', 'due date'),
    documents_requested: extractAfterLabel(text, 'documents requested', 'requested documents', 'submit the following', 'required documents'),
  }),

  ircc_procedural_fairness: (text) => ({
    applicant_name: extractName(text),
    application_number: extractApplicationNumber(text),
    uci_number: extractUCI(text),
    date_issued: extractDate(text, 'date issued', 'date', 'dated'),
    response_deadline: extractDate(text, 'deadline', 'respond by', 'must respond', 'no later than'),
    concerns: extractAfterLabel(text, 'concerns', 'issue', 'reason', 'the following concerns'),
  }),

  passport: (text) => {
    const givenName = extractAfterLabel(text, 'given name', 'given names', 'first name', 'prénoms')
    const familyName = extractAfterLabel(text, 'surname', 'family name', 'last name', 'nom')
    const fullName = givenName && familyName
      ? `${familyName}, ${givenName}`
      : extractAfterLabel(text, 'full name', 'name') ?? (givenName || familyName)
    const mrzMatch = text.match(/P[<A-Z]{1,3}([A-Z]+)<<([A-Z]+)/i)
    const mrzSurname = mrzMatch?.[1]?.replace(/</g, ' ').trim() ?? null
    const mrzGiven = mrzMatch?.[2]?.replace(/</g, ' ').trim() ?? null
    const passportNum = extractAfterLabel(text, 'passport no', 'passport number', 'document no', 'document number')
      ?? text.match(/\b([A-Z]{1,2}\d{6,8})\b/)?.[1] ?? null
    return {
      full_name: fullName ?? (mrzSurname && mrzGiven ? `${mrzSurname}, ${mrzGiven}` : null),
      given_name: givenName ?? mrzGiven,
      family_name: familyName ?? mrzSurname,
      date_of_birth: extractDate(text, 'date of birth', 'birth date', 'dob', 'date de naissance'),
      passport_number: passportNum,
      nationality: extractAfterLabel(text, 'nationality', 'citizenship', 'nationalité'),
      sex: extractAfterLabel(text, 'sex', 'gender', 'sexe')?.charAt(0)?.toUpperCase() ?? null,
      date_of_issue: extractDate(text, 'date of issue', 'issue date', 'date de délivrance'),
      date_of_expiry: extractDate(text, 'date of expiry', 'expiry date', 'expiration', "date d'expiration"),
      place_of_birth: extractAfterLabel(text, 'place of birth', 'birthplace', 'lieu de naissance'),
      issuing_authority: extractAfterLabel(text, 'authority', 'issuing authority', 'issued by', 'autorité'),
    }
  },

  drivers_licence: (text) => ({
    full_name: extractAfterLabel(text, 'name', 'full name', 'driver name'),
    date_of_birth: extractDate(text, 'date of birth', 'dob', 'birth date', 'ddn'),
    licence_number: extractAfterLabel(text, 'licence no', 'license no', 'licence number', 'license number', 'dl no', 'permis no')
      ?? text.match(/\b([A-Z]\d{4}[-\s]?\d{5}[-\s]?\d{5})\b/)?.[1] ?? null,
    address: extractAfterLabel(text, 'address', 'addr'),
    date_of_issue: extractDate(text, 'issued', 'issue date', 'date of issue', 'iss'),
    date_of_expiry: extractDate(text, 'expiry', 'expiration', 'exp', 'expires'),
    licence_class: extractAfterLabel(text, 'class', 'licence class', 'license class'),
    province_state: extractAfterLabel(text, 'province', 'state', 'jurisdiction'),
  }),

  birth_certificate: (text) => ({
    full_name: extractAfterLabel(text, 'name of child', 'child name', 'full name', 'name'),
    date_of_birth: extractDate(text, 'date of birth', 'born on', 'birth date'),
    place_of_birth: extractAfterLabel(text, 'place of birth', 'birthplace', 'born at', 'city'),
    mother_name: extractAfterLabel(text, 'mother', 'mother name', "mother's name", 'parent 1'),
    father_name: extractAfterLabel(text, 'father', 'father name', "father's name", 'parent 2'),
    registration_number: extractAfterLabel(text, 'registration no', 'registration number', 'reg no', 'certificate no'),
    date_of_registration: extractDate(text, 'date of registration', 'registered on', 'registration date'),
  }),

  marriage_certificate: (text) => ({
    spouse_1_name: extractAfterLabel(text, 'spouse 1', 'bride', 'party 1', 'groom'),
    spouse_2_name: extractAfterLabel(text, 'spouse 2', 'bride', 'party 2', 'groom'),
    date_of_marriage: extractDate(text, 'date of marriage', 'married on', 'marriage date', 'date of ceremony'),
    place_of_marriage: extractAfterLabel(text, 'place of marriage', 'place of ceremony', 'married at', 'location'),
    registration_number: extractAfterLabel(text, 'registration no', 'registration number', 'certificate no', 'reg no'),
    officiant_name: extractAfterLabel(text, 'officiant', 'solemnized by', 'performed by', 'minister', 'justice'),
  }),

  bank_statement: (text) => {
    const fullAcct = extractAfterLabel(text, 'account number', 'account no', 'acct no')
    const last4 = fullAcct ? '****' + fullAcct.replace(/\D/g, '').slice(-4) : null
    return {
      account_holder_name: extractAfterLabel(text, 'account holder', 'name', 'customer name', 'client name'),
      bank_name: extractAfterLabel(text, 'bank', 'financial institution', 'bank name')
        ?? (text.match(/\b(TD|RBC|BMO|CIBC|Scotiabank|National Bank|Desjardins|HSBC|Tangerine|Simplii)\b/i)?.[1] ?? null),
      account_number: last4,
      statement_period_start: extractDate(text, 'from', 'period from', 'statement from', 'start date'),
      statement_period_end: extractDate(text, 'to', 'period to', 'statement to', 'end date'),
      opening_balance: extractAfterLabel(text, 'opening balance', 'beginning balance', 'balance forward'),
      closing_balance: extractAfterLabel(text, 'closing balance', 'ending balance', 'current balance'),
      currency: extractAfterLabel(text, 'currency') ?? (text.includes('CAD') ? 'CAD' : text.includes('USD') ? 'USD' : null),
    }
  },

  employment_letter: (text) => ({
    employee_name: extractAfterLabel(text, 'employee name', 'this is to confirm', 'hereby confirm', 'dear'),
    employer_name: extractAfterLabel(text, 'employer', 'company', 'organisation', 'organization'),
    job_title: extractAfterLabel(text, 'position', 'title', 'job title', 'role', 'designation'),
    employment_start_date: extractDate(text, 'start date', 'commenced', 'date of hire', 'joining date', 'employed since'),
    salary: extractAfterLabel(text, 'salary', 'compensation', 'annual salary', 'wages', 'pay'),
    employment_type: extractAfterLabel(text, 'employment type', 'type of employment', 'status')
      ?? (text.toLowerCase().includes('full-time') ? 'full-time'
        : text.toLowerCase().includes('part-time') ? 'part-time'
          : text.toLowerCase().includes('contract') ? 'contract' : null),
    date_issued: extractDate(text, 'date', 'dated', 'date issued'),
    noc_code: text.match(/\b(?:NOC|TEER)\s*(?:code\s*)?[:\s]*(\d{4,5})\b/i)?.[1] ?? null,
  }),

  tax_document: (text) => {
    const sinMatch = text.match(/(?:social insurance|sin)[:\s#]*(\d{3}[\s-]?\d{3}[\s-]?\d{3})/i)
    const sinLast3 = sinMatch ? '***-***-' + sinMatch[1].replace(/\D/g, '').slice(-3) : null
    const t = text.toLowerCase()
    let docType: string | null = null
    if (t.includes('t4')) docType = 'T4'
    else if (t.includes('notice of assessment') || t.includes('noa')) docType = 'Notice of Assessment'
    else if (t.includes('t1 general') || t.includes('t1general')) docType = 'T1 General'
    else if (t.includes('t4a')) docType = 'T4A'
    else if (t.includes('t5')) docType = 'T5'
    return {
      taxpayer_name: extractAfterLabel(text, 'name', 'taxpayer', 'employee name'),
      tax_year: text.match(/(?:tax year|taxation year|for the year)[:\s]*(\d{4})/i)?.[1]
        ?? text.match(/\b(20\d{2})\b/)?.[1] ?? null,
      document_type: docType,
      total_income: extractAfterLabel(text, 'total income', 'gross income', 'employment income', 'line 150'),
      tax_paid: extractAfterLabel(text, 'total tax deducted', 'income tax deducted', 'tax paid', 'total deductions'),
      social_insurance_number: sinLast3,
    }
  },

  court_order: (text) => ({
    case_number: extractAfterLabel(text, 'court file no', 'case no', 'file number', 'case number', 'docket no'),
    court_name: extractAfterLabel(text, 'court', 'in the', 'superior court', 'court of'),
    judge_name: extractAfterLabel(text, 'justice', 'judge', 'the honourable', 'the honorable', 'presiding'),
    parties: extractAfterLabel(text, 'between', 'applicant', 'plaintiff', 'and respondent'),
    date_issued: extractDate(text, 'dated', 'date', 'ordered on', 'this'),
    order_type: extractAfterLabel(text, 'order type', 'type of order')
      ?? (text.toLowerCase().includes('custody') ? 'custody'
        : text.toLowerCase().includes('support') ? 'support'
          : text.toLowerCase().includes('restraining') ? 'restraining order' : null),
    key_terms: null,
  }),

  police_clearance: (text) => {
    const t = text.toLowerCase()
    let result: string | null = null
    if (t.includes('no criminal record') || t.includes('clear') || t.includes('no record found')) result = 'clear'
    else if (t.includes('record found') || t.includes('conviction')) result = 'record found'
    return {
      applicant_name: extractName(text),
      date_of_birth: extractDate(text, 'date of birth', 'dob', 'birth date'),
      date_issued: extractDate(text, 'date issued', 'date', 'dated', 'valid as of'),
      issuing_authority: extractAfterLabel(text, 'issued by', 'issuing authority', 'police service', 'police force', 'authority'),
      result,
      certificate_number: extractAfterLabel(text, 'certificate no', 'certificate number', 'reference no', 'ref no'),
    }
  },

  general: (text) => ({
    document_type: 'Unknown  -  please review',
    names: extractAfterLabel(text, 'name', 'applicant', 'client', 'recipient', 'to', 'attention'),
    dates: extractDate(text, 'date', 'dated', 'issued', 'effective'),
    reference_numbers: extractAfterLabel(text, 'reference', 'ref no', 'file no', 'case no', 'number'),
    key_information: null,
  }),
}

// ── Confidence Scoring ──────────────────────────────────────────────────

function computeConfidence(fields: Record<string, string | number | null>, docType: DocumentType): number {
  const entries = Object.entries(fields)
  const total = entries.length
  if (total === 0) return 0
  const filled = entries.filter(([, v]) => v !== null).length
  let confidence = Math.round((filled / total) * 100)
  if (docType !== 'general') confidence = Math.min(100, confidence + 10)
  return confidence
}

// ── Summary Generator ───────────────────────────────────────────────────

function generateSummary(text: string, docType: DocumentType): string {
  const firstLines = text.split('\n').filter(Boolean).slice(0, 3).join(' ').slice(0, 200)
  const typeLabels: Record<DocumentType, string> = {
    ircc_acknowledgement: 'IRCC Acknowledgement of Receipt',
    ircc_biometrics: 'IRCC Biometrics Instruction Letter',
    ircc_medical: 'IRCC Medical Request',
    ircc_decision: 'IRCC Decision Letter',
    ircc_portal_letter: 'IRCC Portal Letter',
    ircc_procedural_fairness: 'IRCC Procedural Fairness Letter',
    passport: 'Passport',
    drivers_licence: "Driver's Licence",
    birth_certificate: 'Birth Certificate',
    marriage_certificate: 'Marriage Certificate',
    bank_statement: 'Bank Statement',
    employment_letter: 'Employment Letter',
    tax_document: 'Tax Document',
    court_order: 'Court Order',
    police_clearance: 'Police Clearance Certificate',
    general: 'Document',
  }
  return `${typeLabels[docType] || 'Document'}. ${firstLines.trim()}...`.slice(0, 250)
}

// ── Public API ──────────────────────────────────────────────────────────

export interface ExtractResult {
  documentType: DocumentType
  fields: Record<string, string | number | null>
  confidence: number
  summary: string
  extractionMethod: 'regex' | 'regex+ai'
}

// ── AI Extraction Field Schemas ─────────────────────────────────────────
const AI_FIELD_SCHEMAS: Partial<Record<DocumentType, string>> = {
  passport: 'full_name, given_name, family_name, date_of_birth (YYYY-MM-DD), passport_number, nationality, sex (M/F), date_of_issue (YYYY-MM-DD), date_of_expiry (YYYY-MM-DD), place_of_birth, issuing_authority',
  drivers_licence: 'full_name, date_of_birth (YYYY-MM-DD), licence_number, address, date_of_issue (YYYY-MM-DD), date_of_expiry (YYYY-MM-DD), licence_class, province_state',
  birth_certificate: 'full_name, date_of_birth (YYYY-MM-DD), place_of_birth, mother_name, father_name, registration_number, date_of_registration (YYYY-MM-DD)',
  marriage_certificate: 'spouse_1_name, spouse_2_name, date_of_marriage (YYYY-MM-DD), place_of_marriage, registration_number, officiant_name',
  ircc_acknowledgement: 'applicant_name, application_number, uci_number, date_received (YYYY-MM-DD), date_issued (YYYY-MM-DD), application_type, office',
  ircc_biometrics: 'applicant_name, application_number, uci_number, date_issued (YYYY-MM-DD), biometrics_deadline (YYYY-MM-DD), biometrics_location',
  ircc_medical: 'applicant_name, application_number, uci_number, date_issued (YYYY-MM-DD), medical_deadline (YYYY-MM-DD), designated_medical_practitioner',
  ircc_decision: 'applicant_name, application_number, uci_number, date_issued (YYYY-MM-DD), decision (approved/refused/withdrawn), decision_details, office',
  ircc_portal_letter: 'applicant_name, application_number, uci_number, date_issued (YYYY-MM-DD), portal_deadline (YYYY-MM-DD), documents_requested',
  ircc_procedural_fairness: 'applicant_name, application_number, uci_number, date_issued (YYYY-MM-DD), response_deadline (YYYY-MM-DD), concerns',
  employment_letter: 'employee_name, employer_name, job_title, employment_start_date (YYYY-MM-DD), salary, employment_type, date_issued (YYYY-MM-DD), noc_code',
  tax_document: 'taxpayer_name, tax_year, document_type, total_income, tax_paid, social_insurance_number (MASK: ***-***-XXX)',
  bank_statement: 'account_holder_name, bank_name, account_number (MASK: ****XXXX), statement_period_start (YYYY-MM-DD), statement_period_end (YYYY-MM-DD), opening_balance, closing_balance, currency',
  court_order: 'case_number, court_name, judge_name, parties, date_issued (YYYY-MM-DD), order_type, key_terms',
  police_clearance: 'applicant_name, date_of_birth (YYYY-MM-DD), date_issued (YYYY-MM-DD), issuing_authority, result (clear/record found), certificate_number',
  general: 'document_type, names, dates, reference_numbers, key_information',
}

/**
 * AI-powered extraction using Claude Haiku.
 * Only called when regex confidence is below threshold.
 * Fills in null fields without overwriting regex-extracted values.
 */
async function aiEnhanceExtraction(
  rawText: string,
  docType: DocumentType,
  regexFields: Record<string, string | number | null>,
): Promise<{ fields: Record<string, string | number | null>; enhanced: boolean }> {
  try {
    // Dynamic import to avoid bundling Anthropic in client code
    const { default: Anthropic } = await import('@anthropic-ai/sdk')
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) return { fields: regexFields, enhanced: false }

    const fieldSchema = AI_FIELD_SCHEMAS[docType] || AI_FIELD_SCHEMAS.general!
    const nullFields = Object.entries(regexFields)
      .filter(([, v]) => v === null)
      .map(([k]) => k)

    if (nullFields.length === 0) return { fields: regexFields, enhanced: false }

    const client = new Anthropic({ apiKey })
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      system: 'You are a document field extractor for a Canadian immigration law firm. Extract structured data from OCR text. Return ONLY valid JSON. For dates use YYYY-MM-DD. If uncertain, use null. NEVER fabricate. Mask SIN → ***-***-XXX, bank account → ****XXXX.',
      messages: [
        {
          role: 'user',
          content: `Document type: ${docType}\nRequired fields: ${fieldSchema}\n\nAlready extracted:\n${JSON.stringify(Object.fromEntries(Object.entries(regexFields).filter(([, v]) => v !== null)), null, 2)}\n\nMissing fields: ${nullFields.join(', ')}\n\n--- OCR TEXT ---\n${rawText.slice(0, 3000)}\n--- END ---\n\nReturn JSON with ALL fields (keep existing, fill missing):`,
        },
      ],
    })

    const textContent = response.content.find((c) => c.type === 'text')
    if (!textContent || textContent.type !== 'text') return { fields: regexFields, enhanced: false }

    let jsonStr = textContent.text.trim()
    const codeBlock = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (codeBlock) jsonStr = codeBlock[1].trim()

    const aiFields = JSON.parse(jsonStr) as Record<string, string | number | null>

    const merged = { ...regexFields }
    let filledCount = 0
    for (const key of nullFields) {
      if (aiFields[key] !== undefined && aiFields[key] !== null) {
        merged[key] = aiFields[key]
        filledCount++
      }
    }

    return { fields: merged, enhanced: filledCount > 0 }
  } catch (err) {
    console.error('[document-extractor] AI enhancement failed (non-fatal):', err)
    return { fields: regexFields, enhanced: false }
  }
}

/**
 * Detect document type and extract structured fields from raw OCR text.
 * This is the main entry point used by both the scan API and vault-drop auto-scanner.
 *
 * Pipeline: regex extraction → confidence check → Claude AI fill (if < 70%)
 */
export function detectAndExtract(rawText: string, typeHint?: string): ExtractResult {
  const documentType = detectDocumentType(rawText, typeHint)
  const extractor = EXTRACTORS[documentType]
  const fields = extractor(rawText)
  const confidence = computeConfidence(fields, documentType)
  const summary = generateSummary(rawText, documentType)

  return { documentType, fields, confidence, summary, extractionMethod: 'regex' }
}

/**
 * Async version with AI enhancement. Use this when you can await.
 * Falls back to regex-only if AI is unavailable or fails.
 */
export async function detectAndExtractWithAI(rawText: string, typeHint?: string): Promise<ExtractResult> {
  const documentType = detectDocumentType(rawText, typeHint)
  const extractor = EXTRACTORS[documentType]
  const regexFields = extractor(rawText)
  const regexConfidence = computeConfidence(regexFields, documentType)

  let fields = regexFields
  let extractionMethod: 'regex' | 'regex+ai' = 'regex'

  // If regex missed too many fields, ask Claude to fill the gaps
  if (regexConfidence < 70 && process.env.ANTHROPIC_API_KEY) {
    const result = await aiEnhanceExtraction(rawText, documentType, regexFields)
    fields = result.fields
    if (result.enhanced) extractionMethod = 'regex+ai'
  }

  const confidence = computeConfidence(fields, documentType)
  const summary = generateSummary(rawText, documentType)

  return { documentType, fields, confidence, summary, extractionMethod }
}
