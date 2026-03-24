import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import { withTiming } from '@/lib/middleware/request-timing'

// ─── OCR.space API ──────────────────────────────────────────────────────────

interface OcrSpaceResult {
  ParsedResults?: Array<{
    ParsedText: string
    ErrorMessage?: string
    FileParseExitCode: number
  }>
  IsErroredOnProcessing: boolean
  ErrorMessage?: string[]
  OCRExitCode: number
}

async function ocrExtractText(apiKey: string, fileBase64: string, fileType: string): Promise<string> {
  const formData = new FormData()
  formData.append('base64Image', `data:${fileType};base64,${fileBase64}`)
  formData.append('language', 'eng')
  formData.append('isOverlayRequired', 'false')
  formData.append('OCREngine', '2') // Engine 2 is better for documents
  formData.append('scale', 'true')
  formData.append('isTable', 'true')

  if (fileType === 'application/pdf') {
    formData.append('filetype', 'PDF')
  }

  const response = await fetch('https://api.ocr.space/parse/image', {
    method: 'POST',
    headers: { apikey: apiKey },
    body: formData,
  })

  if (!response.ok) {
    throw new Error(`OCR.space API error: ${response.status} ${response.statusText}`)
  }

  const data = (await response.json()) as OcrSpaceResult

  if (data.IsErroredOnProcessing || data.OCRExitCode !== 1) {
    const errMsg = data.ErrorMessage?.join(', ') || data.ParsedResults?.[0]?.ErrorMessage || 'OCR processing failed'
    throw new Error(errMsg)
  }

  const text = data.ParsedResults?.map((r) => r.ParsedText).join('\n') ?? ''
  if (!text.trim()) {
    throw new Error('No text could be extracted from this document. Please ensure the image is clear and readable.')
  }

  return text
}

// ─── Document Type Detection ────────────────────────────────────────────────

type DocumentType =
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

function detectDocumentType(text: string, hint?: string): DocumentType {
  const t = text.toLowerCase()

  // If a valid hint is provided and matches a known type, use it
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

  // ── IRCC Documents ──
  if (t.includes('acknowledgement of receipt') || t.includes('acknowledgment of receipt') || (t.includes('ircc') && t.includes('aor'))) {
    return 'ircc_acknowledgement'
  }
  if (t.includes('biometric') && (t.includes('ircc') || t.includes('immigration') || t.includes('instruction letter'))) {
    return 'ircc_biometrics'
  }
  if ((t.includes('medical') || t.includes('upfront medical')) && (t.includes('ircc') || t.includes('immigration'))) {
    return 'ircc_medical'
  }
  if (t.includes('procedural fairness') && (t.includes('ircc') || t.includes('immigration'))) {
    return 'ircc_procedural_fairness'
  }
  if ((t.includes('approved') || t.includes('refused') || t.includes('decision')) && (t.includes('ircc') || t.includes('immigration, refugees and citizenship'))) {
    return 'ircc_decision'
  }
  if (t.includes('portal') && (t.includes('ircc') || t.includes('immigration')) && t.includes('submit')) {
    return 'ircc_portal_letter'
  }

  // ── Identity Documents ──
  if (t.includes('passport') && (t.includes('nationality') || t.includes('date of birth') || t.includes('surname') || t.includes('given name'))) {
    return 'passport'
  }
  if (t.includes('driver') && (t.includes('licence') || t.includes('license'))) {
    return 'drivers_licence'
  }
  if (t.includes('birth') && (t.includes('certificate') || t.includes('registration'))) {
    return 'birth_certificate'
  }
  if (t.includes('marriage') && (t.includes('certificate') || t.includes('registration'))) {
    return 'marriage_certificate'
  }

  // ── Financial Documents ──
  if (t.includes('bank') && (t.includes('statement') || t.includes('account'))) {
    return 'bank_statement'
  }
  if (t.includes('employment') && (t.includes('letter') || t.includes('offer')) || (t.includes('job') && t.includes('offer'))) {
    return 'employment_letter'
  }
  if (t.includes('t4') || t.includes('notice of assessment') || t.includes('tax return') || t.includes('t1 general')) {
    return 'tax_document'
  }

  // ── Legal Documents ──
  if (t.includes('court') && (t.includes('order') || t.includes('judgment') || t.includes('judgement'))) {
    return 'court_order'
  }
  if (t.includes('police') && (t.includes('clearance') || t.includes('certificate') || t.includes('criminal record'))) {
    return 'police_clearance'
  }

  return 'general'
}

// ─── Field Extraction (Regex-based per document type) ───────────────────────

/** Helper: find a value after a label in the text */
function extractAfterLabel(text: string, ...labels: string[]): string | null {
  for (const label of labels) {
    // Match label followed by : or whitespace, then capture the value
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const re = new RegExp(`${escaped}[:\\s]*([^\\n]{2,80})`, 'i')
    const m = text.match(re)
    if (m?.[1]) {
      return m[1].trim().replace(/^[:\s]+/, '').trim()
    }
  }
  return null
}

/** Helper: find a date in various formats and normalise to YYYY-MM-DD */
function extractDate(text: string, ...labels: string[]): string | null {
  const raw = extractAfterLabel(text, ...labels)
  if (!raw) return null
  return normaliseDate(raw)
}

function normaliseDate(raw: string): string | null {
  // Try YYYY-MM-DD already
  const iso = raw.match(/(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`

  // DD/MM/YYYY or DD-MM-YYYY
  const dmy = raw.match(/(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})/)
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`

  // Month DD, YYYY (e.g. "January 15, 2024")
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

  // DD Month YYYY (e.g. "15 January 2024")
  const dmy2 = raw.match(/(\d{1,2})\s+([a-z]+)\s+(\d{4})/i)
  if (dmy2) {
    const mon = months[dmy2[2].toLowerCase()]
    if (mon) return `${dmy2[3]}-${mon}-${dmy2[1].padStart(2, '0')}`
  }

  return null
}

/** Helper: extract UCI number (8-10 digit number) */
function extractUCI(text: string): string | null {
  const m = text.match(/(?:uci|unique client identifier|client id)[:\s#]*(\d{8,10})/i)
  if (m) return m[1]
  // Fallback: standalone 8-10 digit number near UCI keyword
  const uciBlock = text.match(/uci[^]*?(\d{8,10})/i)
  return uciBlock?.[1] ?? null
}

/** Helper: extract IRCC application number (e.g. B000123456, V123456789, E123456789) */
function extractApplicationNumber(text: string): string | null {
  const m = text.match(/(?:application\s*(?:number|no|#)|file\s*(?:number|no|#))[:\s]*([A-Z]\d{6,12})/i)
  if (m) return m[1].toUpperCase()
  // Fallback: look for pattern like B000123456 anywhere
  const fallback = text.match(/\b([BVEFT]\d{8,12})\b/i)
  return fallback?.[1]?.toUpperCase() ?? null
}

/** Extract name — looks for common patterns in IRCC/ID documents */
function extractName(text: string): string | null {
  return extractAfterLabel(text,
    'applicant name', 'name of applicant', 'principal applicant', 'full name',
    'name', 'surname/given name', 'client name',
  )
}

// ── Per-type extraction functions ──

function extractIrccAcknowledgement(text: string): Record<string, string | number | null> {
  return {
    applicant_name: extractName(text),
    application_number: extractApplicationNumber(text),
    uci_number: extractUCI(text),
    date_received: extractDate(text, 'date received', 'received on', 'date of receipt'),
    date_issued: extractDate(text, 'date issued', 'date', 'dated'),
    application_type: extractAfterLabel(text, 'application type', 'type of application', 'category', 'program'),
    office: extractAfterLabel(text, 'processing office', 'office', 'processing centre', 'processing center'),
  }
}

function extractIrccBiometrics(text: string): Record<string, string | number | null> {
  return {
    applicant_name: extractName(text),
    application_number: extractApplicationNumber(text),
    uci_number: extractUCI(text),
    date_issued: extractDate(text, 'date issued', 'date', 'dated'),
    biometrics_deadline: extractDate(text, 'deadline', 'must provide', 'biometrics by', 'before', 'no later than', 'expiry date'),
    biometrics_location: extractAfterLabel(text, 'collection point', 'collection location', 'service point', 'application support center'),
  }
}

function extractIrccMedical(text: string): Record<string, string | number | null> {
  return {
    applicant_name: extractName(text),
    application_number: extractApplicationNumber(text),
    uci_number: extractUCI(text),
    date_issued: extractDate(text, 'date issued', 'date', 'dated'),
    medical_deadline: extractDate(text, 'deadline', 'medical exam by', 'must complete', 'no later than', 'expiry'),
    designated_medical_practitioner: extractAfterLabel(text, 'designated medical practitioner', 'panel physician', 'doctor', 'physician'),
  }
}

function extractIrccDecision(text: string): Record<string, string | number | null> {
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
}

function extractIrccPortalLetter(text: string): Record<string, string | number | null> {
  return {
    applicant_name: extractName(text),
    application_number: extractApplicationNumber(text),
    uci_number: extractUCI(text),
    date_issued: extractDate(text, 'date issued', 'date', 'dated'),
    portal_deadline: extractDate(text, 'deadline', 'submit by', 'must submit', 'no later than', 'due date'),
    documents_requested: extractAfterLabel(text, 'documents requested', 'requested documents', 'submit the following', 'required documents'),
  }
}

function extractIrccProceduralFairness(text: string): Record<string, string | number | null> {
  return {
    applicant_name: extractName(text),
    application_number: extractApplicationNumber(text),
    uci_number: extractUCI(text),
    date_issued: extractDate(text, 'date issued', 'date', 'dated'),
    response_deadline: extractDate(text, 'deadline', 'respond by', 'must respond', 'no later than'),
    concerns: extractAfterLabel(text, 'concerns', 'issue', 'reason', 'the following concerns'),
  }
}

function extractPassport(text: string): Record<string, string | number | null> {
  const givenName = extractAfterLabel(text, 'given name', 'given names', 'first name', 'prénoms')
  const familyName = extractAfterLabel(text, 'surname', 'family name', 'last name', 'nom')
  const fullName = givenName && familyName
    ? `${familyName}, ${givenName}`
    : extractAfterLabel(text, 'full name', 'name') ?? (givenName || familyName)

  // Try to extract from MRZ (Machine Readable Zone) — bottom of passport
  const mrzMatch = text.match(/P[<A-Z]{1,3}([A-Z]+)<<([A-Z]+)/i)
  const mrzSurname = mrzMatch?.[1]?.replace(/</g, ' ').trim() ?? null
  const mrzGiven = mrzMatch?.[2]?.replace(/</g, ' ').trim() ?? null

  // Passport number from MRZ or field
  const passportNum = extractAfterLabel(text, 'passport no', 'passport number', 'document no', 'document number')
    ?? text.match(/\b([A-Z]{1,2}\d{6,8})\b/)?.[1]
    ?? null

  return {
    full_name: fullName ?? (mrzSurname && mrzGiven ? `${mrzSurname}, ${mrzGiven}` : null),
    given_name: givenName ?? mrzGiven,
    family_name: familyName ?? mrzSurname,
    date_of_birth: extractDate(text, 'date of birth', 'birth date', 'dob', 'date de naissance'),
    passport_number: passportNum,
    nationality: extractAfterLabel(text, 'nationality', 'citizenship', 'nationalité'),
    sex: extractAfterLabel(text, 'sex', 'gender', 'sexe')?.charAt(0)?.toUpperCase() ?? null,
    date_of_issue: extractDate(text, 'date of issue', 'issue date', 'date de délivrance'),
    date_of_expiry: extractDate(text, 'date of expiry', 'expiry date', 'expiration', 'date d\'expiration'),
    place_of_birth: extractAfterLabel(text, 'place of birth', 'birthplace', 'lieu de naissance'),
    issuing_authority: extractAfterLabel(text, 'authority', 'issuing authority', 'issued by', 'autorité'),
  }
}

function extractDriversLicence(text: string): Record<string, string | number | null> {
  return {
    full_name: extractAfterLabel(text, 'name', 'full name', 'driver name'),
    date_of_birth: extractDate(text, 'date of birth', 'dob', 'birth date', 'ddn'),
    licence_number: extractAfterLabel(text, 'licence no', 'license no', 'licence number', 'license number', 'dl no', 'permis no')
      ?? text.match(/\b([A-Z]\d{4}[-\s]?\d{5}[-\s]?\d{5})\b/)?.[1] ?? null,
    address: extractAfterLabel(text, 'address', 'addr'),
    date_of_issue: extractDate(text, 'issued', 'issue date', 'date of issue', 'iss'),
    date_of_expiry: extractDate(text, 'expiry', 'expiration', 'exp', 'expires'),
    licence_class: extractAfterLabel(text, 'class', 'licence class', 'license class'),
    province_state: extractAfterLabel(text, 'province', 'state', 'jurisdiction'),
  }
}

function extractBirthCertificate(text: string): Record<string, string | number | null> {
  return {
    full_name: extractAfterLabel(text, 'name of child', 'child name', 'full name', 'name'),
    date_of_birth: extractDate(text, 'date of birth', 'born on', 'birth date'),
    place_of_birth: extractAfterLabel(text, 'place of birth', 'birthplace', 'born at', 'city'),
    mother_name: extractAfterLabel(text, 'mother', 'mother name', 'mother\'s name', 'parent 1'),
    father_name: extractAfterLabel(text, 'father', 'father name', 'father\'s name', 'parent 2'),
    registration_number: extractAfterLabel(text, 'registration no', 'registration number', 'reg no', 'certificate no'),
    date_of_registration: extractDate(text, 'date of registration', 'registered on', 'registration date'),
  }
}

function extractMarriageCertificate(text: string): Record<string, string | number | null> {
  return {
    spouse_1_name: extractAfterLabel(text, 'spouse 1', 'bride', 'party 1', 'groom'),
    spouse_2_name: extractAfterLabel(text, 'spouse 2', 'bride', 'party 2', 'groom'),
    date_of_marriage: extractDate(text, 'date of marriage', 'married on', 'marriage date', 'date of ceremony'),
    place_of_marriage: extractAfterLabel(text, 'place of marriage', 'place of ceremony', 'married at', 'location'),
    registration_number: extractAfterLabel(text, 'registration no', 'registration number', 'certificate no', 'reg no'),
    officiant_name: extractAfterLabel(text, 'officiant', 'solemnized by', 'performed by', 'minister', 'justice'),
  }
}

function extractBankStatement(text: string): Record<string, string | number | null> {
  // Only last 4 digits for security
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
}

function extractEmploymentLetter(text: string): Record<string, string | number | null> {
  return {
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
  }
}

function extractTaxDocument(text: string): Record<string, string | number | null> {
  // Only last 3 digits of SIN for security
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
}

function extractCourtOrder(text: string): Record<string, string | number | null> {
  return {
    case_number: extractAfterLabel(text, 'court file no', 'case no', 'file number', 'case number', 'docket no'),
    court_name: extractAfterLabel(text, 'court', 'in the', 'superior court', 'court of'),
    judge_name: extractAfterLabel(text, 'justice', 'judge', 'the honourable', 'the honorable', 'presiding'),
    parties: extractAfterLabel(text, 'between', 'applicant', 'plaintiff', 'and respondent'),
    date_issued: extractDate(text, 'dated', 'date', 'ordered on', 'this'),
    order_type: extractAfterLabel(text, 'order type', 'type of order')
      ?? (text.toLowerCase().includes('custody') ? 'custody'
        : text.toLowerCase().includes('support') ? 'support'
        : text.toLowerCase().includes('restraining') ? 'restraining order' : null),
    key_terms: null, // Too complex for regex — leave for manual review
  }
}

function extractPoliceClearance(text: string): Record<string, string | number | null> {
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
}

function extractGeneral(text: string): Record<string, string | number | null> {
  // Try to pull any names, dates, reference numbers from arbitrary documents
  const namePatterns = ['name', 'applicant', 'client', 'recipient', 'to', 'attention']
  const datePatterns = ['date', 'dated', 'issued', 'effective']
  const refPatterns = ['reference', 'ref no', 'file no', 'case no', 'number']

  return {
    document_type: 'Unknown — please review',
    names: extractAfterLabel(text, ...namePatterns),
    dates: extractDate(text, ...datePatterns),
    reference_numbers: extractAfterLabel(text, ...refPatterns),
    key_information: null,
  }
}

// ── Extraction dispatcher ──

const EXTRACTORS: Record<DocumentType, (text: string) => Record<string, string | number | null>> = {
  ircc_acknowledgement: extractIrccAcknowledgement,
  ircc_biometrics: extractIrccBiometrics,
  ircc_medical: extractIrccMedical,
  ircc_decision: extractIrccDecision,
  ircc_portal_letter: extractIrccPortalLetter,
  ircc_procedural_fairness: extractIrccProceduralFairness,
  passport: extractPassport,
  drivers_licence: extractDriversLicence,
  birth_certificate: extractBirthCertificate,
  marriage_certificate: extractMarriageCertificate,
  bank_statement: extractBankStatement,
  employment_letter: extractEmploymentLetter,
  tax_document: extractTaxDocument,
  court_order: extractCourtOrder,
  police_clearance: extractPoliceClearance,
  general: extractGeneral,
}

// ── Confidence scoring ──

function computeConfidence(fields: Record<string, string | number | null>, docType: DocumentType): number {
  const entries = Object.entries(fields)
  const total = entries.length
  if (total === 0) return 0
  const filled = entries.filter(([, v]) => v !== null).length
  const ratio = filled / total

  // Base confidence from field fill rate
  let confidence = Math.round(ratio * 100)

  // Boost if document type was detected (not general)
  if (docType !== 'general') confidence = Math.min(100, confidence + 10)

  return confidence
}

// ── Summary generator ──

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

  const label = typeLabels[docType] || 'Document'
  return `${label}. ${firstLines.trim()}...`.slice(0, 250)
}

// ─── Route Handler ──────────────────────────────────────────────────────────

async function handlePost(request: NextRequest) {
  try {
    const auth = await authenticateRequest()
    requirePermission(auth, 'documents', 'read')

    const apiKey = process.env.OCR_SPACE_API_KEY
    if (!apiKey) {
      return NextResponse.json(
        { error: 'Document scanning is not configured. Please add OCR_SPACE_API_KEY to your environment.' },
        { status: 503 }
      )
    }

    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const documentTypeHint = (formData.get('document_type_hint') as string | null) ?? ''

    if (!file) {
      return NextResponse.json({ error: 'File is required' }, { status: 400 })
    }

    // OCR.space free tier: 1 MB max file size
    if (file.size > 1024 * 1024) {
      return NextResponse.json(
        { error: 'File must be under 1 MB for scanning (OCR.space free tier limit). Compress or resize the image and try again.' },
        { status: 400 }
      )
    }

    // Convert file to base64
    const arrayBuffer = await file.arrayBuffer()
    const base64 = Buffer.from(arrayBuffer).toString('base64')

    // Validate file type
    const supportedTypes = [
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/gif',
      'application/pdf',
    ]

    if (!supportedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: 'Only images (JPEG, PNG, WebP) and PDFs can be scanned. For Word documents, please convert to PDF first.' },
        { status: 400 }
      )
    }

    // Step 1: OCR — extract raw text
    const rawText = await ocrExtractText(apiKey, base64, file.type)

    // Step 2: Detect document type
    const docType = detectDocumentType(rawText, documentTypeHint)

    // Step 3: Extract fields using regex patterns
    const extractor = EXTRACTORS[docType]
    const extractedFields = extractor(rawText)

    // Step 4: Compute confidence
    const confidence = computeConfidence(extractedFields, docType)

    // Step 5: Generate summary
    const summary = generateSummary(rawText, docType)

    return NextResponse.json({
      success: true,
      data: {
        detected_document_type: docType,
        confidence,
        extracted_fields: extractedFields,
        raw_text_summary: summary,
      },
    })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error('Document scan error:', error)
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json(
      { error: message },
      { status: 500 }
    )
  }
}

export const POST = withTiming(handlePost, 'POST /api/documents/scan')
