/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Directive 040: Sovereign Auto-Filer  -  SovereignStorageEngine
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Intercepts every file upload and applies the firm's filing convention:
 *   - professional: /{MatterNumber}/{Category}/{DocType}_v{N}.{ext}
 *   - chronological: /{MatterNumber}/{YYYY-MM-DD}_{DocType}.{ext}
 *   - flat:          /{MatterNumber}_{ClientName}_{DocType}.{ext}
 *
 * The engine:
 *   1. Classifies the document (via document-classifier)
 *   2. Builds a forensic filename from matter + doc type
 *   3. Computes the structured directory path
 *   4. Returns the auto-filed path for storage
 *
 * Slot-based uploads already have their own naming via buildAutoRenamedPath().
 * This engine handles ALL other uploads (non-slot, ad-hoc drops).
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { classifyByFilename, type ClassificationResult, type DocumentCategory } from '@/lib/services/document-classifier'

// ── Types ────────────────────────────────────────────────────────────────────

export type FilingConvention = 'professional' | 'chronological' | 'flat'

export interface AutoFileResult {
  /** The new forensic filename (e.g. 2026-WASEER-001_Birth-Certificate_v1.pdf) */
  fileName: string

  /** The structured directory path (e.g. 2026-WASEER-001/Identity_Docs/) */
  directoryPath: string

  /** Full storage path: {tenantId}/{directoryPath}{fileName} */
  storagePath: string

  /** The document classification used */
  classification: ClassificationResult | null

  /** Original filename preserved for audit trail */
  originalFileName: string

  /** Human-readable label for the toast notification */
  filingLabel: string
}

export interface AutoFileParams {
  tenantId: string
  originalFileName: string
  matterNumber: string | null
  clientName?: string | null
  filingConvention: FilingConvention
  existingVersion?: number
}

// ── Category Display Names ───────────────────────────────────────────────────

const CATEGORY_FOLDER_MAP: Record<DocumentCategory | string, string> = {
  identity: 'Identity_Docs',
  financial: 'Financial',
  legal: 'Legal',
  correspondence: 'Correspondence',
  medical: 'Medical',
  immigration: 'Immigration',
  other: 'General',
}

const DOC_TYPE_LABEL_MAP: Record<string, string> = {
  passport: 'Passport',
  drivers_licence: 'Drivers-Licence',
  birth_certificate: 'Birth-Certificate',
  national_id: 'National-ID',
  marriage_certificate: 'Marriage-Certificate',
  photo: 'Photo',
  bank_statement: 'Bank-Statement',
  tax_return: 'Tax-Return',
  pay_stub: 'Pay-Stub',
  invoice: 'Invoice',
  receipt: 'Receipt',
  employment_letter: 'Employment-Letter',
  retainer_agreement: 'Retainer-Agreement',
  court_order: 'Court-Order',
  affidavit: 'Affidavit',
  power_of_attorney: 'Power-of-Attorney',
  immigration_form: 'Immigration-Form',
  travel_history: 'Travel-History',
  police_clearance: 'Police-Clearance',
  education_credential: 'Education-Credential',
  letter: 'Letter',
  form: 'Form',
  medical_report: 'Medical-Report',
  other: 'Document',
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function sanitizeForPath(text: string): string {
  return text
    .replace(/[^a-zA-Z0-9\s\-_]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .substring(0, 60)
}

function getExtension(fileName: string): string {
  const lastDot = fileName.lastIndexOf('.')
  return lastDot > 0 ? fileName.substring(lastDot + 1).toLowerCase() : 'pdf'
}

function getDateStamp(): string {
  const now = new Date()
  const yyyy = now.getFullYear()
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const dd = String(now.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function getDocTypeLabel(classification: ClassificationResult | null): string {
  if (!classification) return 'Document'
  return DOC_TYPE_LABEL_MAP[classification.type] || 'Document'
}

function getCategoryFolder(classification: ClassificationResult | null): string {
  if (!classification) return 'General'
  return CATEGORY_FOLDER_MAP[classification.category] || 'General'
}

// ── Main Engine ──────────────────────────────────────────────────────────────

/**
 * Auto-files a document upload by classifying, renaming, and assigning
 * a structured directory path based on the firm's filing convention.
 */
export function autoFileDocument(params: AutoFileParams): AutoFileResult {
  const {
    tenantId,
    originalFileName,
    matterNumber,
    clientName,
    filingConvention,
    existingVersion,
  } = params

  // 1. Classify the document from filename
  const classification = classifyByFilename(originalFileName)
  const docLabel = getDocTypeLabel(classification)
  const categoryFolder = getCategoryFolder(classification)
  const ext = getExtension(originalFileName)
  const version = existingVersion ?? 1
  const matterRef = matterNumber ?? 'UNASSIGNED'
  const dateStamp = getDateStamp()

  // 2. Build filename and directory based on convention
  let fileName: string
  let directoryPath: string
  let filingLabel: string

  switch (filingConvention) {
    case 'professional': {
      // /{MatterNumber}/{Category}/{DocType}_v{N}.{ext}
      directoryPath = `${matterRef}/${categoryFolder}/`
      fileName = `${docLabel}_v${version}.${ext}`
      filingLabel = `Filed in ${categoryFolder}`
      break
    }

    case 'chronological': {
      // /{MatterNumber}/{YYYY-MM-DD}_{DocType}.{ext}
      directoryPath = `${matterRef}/`
      fileName = `${dateStamp}_${docLabel}_v${version}.${ext}`
      filingLabel = `Filed by date (${dateStamp})`
      break
    }

    case 'flat': {
      // /{MatterNumber}_{ClientName}_{DocType}.{ext}
      const clientPart = clientName ? `_${sanitizeForPath(clientName)}` : ''
      directoryPath = ''
      fileName = `${matterRef}${clientPart}_${docLabel}_v${version}.${ext}`
      filingLabel = 'Filed (flat archive)'
      break
    }

    default: {
      // Fallback to professional
      directoryPath = `${matterRef}/${categoryFolder}/`
      fileName = `${docLabel}_v${version}.${ext}`
      filingLabel = `Filed in ${categoryFolder}`
    }
  }

  const storagePath = `${tenantId}/${directoryPath}${fileName}`

  return {
    fileName,
    directoryPath,
    storagePath,
    classification,
    originalFileName,
    filingLabel,
  }
}

// ── Preview Generator (for Settings UI) ──────────────────────────────────────

export interface FilingPreviewItem {
  originalName: string
  filedPath: string
  category: string
  docType: string
}

/**
 * Generates a preview of how files would be named/filed under each convention.
 * Used by the Filing Preview card in the Brand Wizard.
 */
export function generateFilingPreview(
  matterNumber: string,
  clientName: string,
  convention: FilingConvention,
): FilingPreviewItem[] {
  const sampleFiles = [
    'passport_scan.pdf',
    'bank-statement-march.pdf',
    'police_clearance_canada.pdf',
    'retainer_agreement_signed.pdf',
    'photo_id.jpg',
    'employment-letter-company.pdf',
  ]

  return sampleFiles.map((originalName) => {
    const result = autoFileDocument({
      tenantId: 'preview',
      originalFileName: originalName,
      matterNumber,
      clientName,
      filingConvention: convention,
    })

    return {
      originalName,
      filedPath: `${result.directoryPath}${result.fileName}`,
      category: getCategoryFolder(result.classification),
      docType: getDocTypeLabel(result.classification),
    }
  })
}
