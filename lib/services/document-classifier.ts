/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Document Classifier — AI-Powered OCR Auto-Tagging (Directive 5.4)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * When files cross the Clio-to-Norva bridge (or any import), the classifier
 * reads the first page and auto-tags them with category + type.
 *
 * Two-tier classification:
 *   Tier 1: Filename heuristics (instant, no API call)
 *   Tier 2: AI classification via Claude (for ambiguous filenames like "Doc123.pdf")
 *
 * Categories: identity, financial, legal, correspondence, medical, immigration, other
 * Types: passport, drivers_licence, birth_certificate, bank_statement, tax_return,
 *        retainer_agreement, court_order, letter, invoice, photo, form, other
 */

import { log } from '@/lib/utils/logger'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ClassificationResult {
  category: DocumentCategory
  type: DocumentType
  confidence: number // 0-1
  method: 'filename' | 'ai' | 'fallback'
  suggestedName?: string
}

export type DocumentCategory =
  | 'identity'
  | 'financial'
  | 'legal'
  | 'correspondence'
  | 'medical'
  | 'immigration'
  | 'other'

export type DocumentType =
  | 'passport'
  | 'drivers_licence'
  | 'birth_certificate'
  | 'national_id'
  | 'bank_statement'
  | 'tax_return'
  | 'pay_stub'
  | 'retainer_agreement'
  | 'court_order'
  | 'affidavit'
  | 'power_of_attorney'
  | 'letter'
  | 'invoice'
  | 'receipt'
  | 'photo'
  | 'form'
  | 'medical_report'
  | 'immigration_form'
  | 'travel_history'
  | 'employment_letter'
  | 'education_credential'
  | 'marriage_certificate'
  | 'police_clearance'
  | 'other'

// ─── Filename Pattern Rules (Tier 1) ─────────────────────────────────────────

interface PatternRule {
  patterns: RegExp[]
  category: DocumentCategory
  type: DocumentType
  confidence: number
}

const FILENAME_RULES: PatternRule[] = [
  // Identity documents
  { patterns: [/passport/i, /ppt\b/i], category: 'identity', type: 'passport', confidence: 0.9 },
  { patterns: [/driver.?s?.?li[cs]en[cs]e/i, /\bdl\b/i], category: 'identity', type: 'drivers_licence', confidence: 0.85 },
  { patterns: [/birth.?cert/i, /\bbc\b.*cert/i], category: 'identity', type: 'birth_certificate', confidence: 0.9 },
  { patterns: [/national.?id/i, /\bnic\b/i, /\bcnic\b/i, /\baadhar/i], category: 'identity', type: 'national_id', confidence: 0.85 },
  { patterns: [/marriage.?cert/i], category: 'identity', type: 'marriage_certificate', confidence: 0.9 },

  // Financial
  { patterns: [/bank.?state/i, /\baccount.?state/i], category: 'financial', type: 'bank_statement', confidence: 0.9 },
  { patterns: [/tax.?return/i, /\bt[14]\b/i, /noa\b/i, /notice.?of.?assess/i], category: 'financial', type: 'tax_return', confidence: 0.85 },
  { patterns: [/pay.?stub/i, /pay.?slip/i, /salary.?slip/i], category: 'financial', type: 'pay_stub', confidence: 0.9 },
  { patterns: [/invoice/i, /\binv\b/i], category: 'financial', type: 'invoice', confidence: 0.8 },
  { patterns: [/receipt/i], category: 'financial', type: 'receipt', confidence: 0.8 },

  // Legal
  { patterns: [/retainer/i, /engagement.?letter/i, /fee.?agree/i], category: 'legal', type: 'retainer_agreement', confidence: 0.9 },
  { patterns: [/court.?order/i], category: 'legal', type: 'court_order', confidence: 0.9 },
  { patterns: [/affidavit/i, /sworn.?state/i, /statutory.?decl/i], category: 'legal', type: 'affidavit', confidence: 0.9 },
  { patterns: [/power.?of.?attorney/i, /\bpoa\b/i], category: 'legal', type: 'power_of_attorney', confidence: 0.9 },

  // Immigration
  { patterns: [/imm\s*\d{4}/i, /ircc/i, /immigration.?form/i], category: 'immigration', type: 'immigration_form', confidence: 0.9 },
  { patterns: [/travel.?hist/i, /entry.?stamp/i, /visa.?stamp/i], category: 'immigration', type: 'travel_history', confidence: 0.85 },
  { patterns: [/police.?clear/i, /criminal.?record/i, /\bpcc\b/i], category: 'immigration', type: 'police_clearance', confidence: 0.9 },

  // Correspondence
  { patterns: [/letter/i, /correspondence/i], category: 'correspondence', type: 'letter', confidence: 0.7 },

  // Employment / Education
  { patterns: [/employ.?letter/i, /job.?letter/i, /reference.?letter/i, /\broe\b/i], category: 'financial', type: 'employment_letter', confidence: 0.85 },
  { patterns: [/diploma/i, /transcript/i, /degree/i, /\bwes\b/i, /credential/i, /\beca\b/i], category: 'immigration', type: 'education_credential', confidence: 0.85 },

  // Medical
  { patterns: [/medical/i, /\bime\b/i, /health.?exam/i, /upfront.?medical/i], category: 'medical', type: 'medical_report', confidence: 0.85 },

  // Photos
  { patterns: [/photo/i, /headshot/i, /portrait/i, /\bpic\b/i], category: 'identity', type: 'photo', confidence: 0.75 },
]

// ─── Tier 1: Filename Classification ─────────────────────────────────────────

export function classifyByFilename(fileName: string): ClassificationResult | null {
  const cleaned = fileName.replace(/[_\-\.]+/g, ' ').trim()

  for (const rule of FILENAME_RULES) {
    for (const pattern of rule.patterns) {
      if (pattern.test(cleaned) || pattern.test(fileName)) {
        return {
          category: rule.category,
          type: rule.type,
          confidence: rule.confidence,
          method: 'filename',
        }
      }
    }
  }

  return null
}

// ─── Tier 2: AI Classification ───────────────────────────────────────────────

const CLASSIFICATION_PROMPT = `You are a document classifier for a Canadian immigration law firm.
Given the filename and optionally the first page text of a document, classify it.

Respond ONLY with a JSON object (no markdown, no explanation):
{"category": "...", "type": "...", "confidence": 0.0-1.0, "suggestedName": "..."}

Categories: identity, financial, legal, correspondence, medical, immigration, other
Types: passport, drivers_licence, birth_certificate, national_id, bank_statement, tax_return, pay_stub, retainer_agreement, court_order, affidavit, power_of_attorney, letter, invoice, receipt, photo, form, medical_report, immigration_form, travel_history, employment_letter, education_credential, marriage_certificate, police_clearance, other

Rules:
- For immigration forms (IMM 5257, IMM 1294, etc.), use category=immigration, type=immigration_form
- suggestedName should be a clean, descriptive name like "Passport - John Smith" or "Bank Statement - TD - Jan 2026"
- If uncertain, use category=other, type=other with low confidence`

/**
 * Classify a document using AI (Claude).
 * Falls back gracefully if the API key is not configured.
 */
export async function classifyWithAI(
  fileName: string,
  firstPageText?: string,
): Promise<ClassificationResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    log.warn('document_classifier.no_api_key', { file_name: fileName })
    return fallbackClassification(fileName)
  }

  try {
    const userMessage = firstPageText
      ? `Filename: "${fileName}"\n\nFirst page text:\n${firstPageText.slice(0, 2000)}`
      : `Filename: "${fileName}"`

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 256,
        messages: [
          { role: 'user', content: userMessage },
        ],
        system: CLASSIFICATION_PROMPT,
      }),
    })

    if (!response.ok) {
      throw new Error(`Anthropic API error: ${response.status}`)
    }

    const data = await response.json()
    const text = data.content?.[0]?.text ?? ''

    // Parse the JSON response
    const parsed = JSON.parse(text)

    return {
      category: parsed.category ?? 'other',
      type: parsed.type ?? 'other',
      confidence: Math.min(1, Math.max(0, parsed.confidence ?? 0.5)),
      method: 'ai',
      suggestedName: parsed.suggestedName,
    }
  } catch (err) {
    log.warn('document_classifier.ai_failed', {
      file_name: fileName,
      error: err instanceof Error ? err.message : 'Unknown',
    })
    return fallbackClassification(fileName)
  }
}

// ─── Combined Classifier ─────────────────────────────────────────────────────

/**
 * Classify a document using the two-tier approach:
 *   1. Try filename heuristics (instant)
 *   2. If no match or low confidence, use AI (Claude Haiku)
 */
export async function classifyDocument(
  fileName: string,
  firstPageText?: string,
): Promise<ClassificationResult> {
  // Tier 1: Filename heuristics
  const filenameResult = classifyByFilename(fileName)

  if (filenameResult && filenameResult.confidence >= 0.8) {
    return filenameResult
  }

  // Tier 2: AI classification (for ambiguous filenames like "Doc123.pdf")
  const aiResult = await classifyWithAI(fileName, firstPageText)

  // If filename had a low-confidence match, compare with AI result
  if (filenameResult && filenameResult.confidence > aiResult.confidence) {
    return filenameResult
  }

  return aiResult
}

// ─── Fallback ────────────────────────────────────────────────────────────────

function fallbackClassification(fileName: string): ClassificationResult {
  // Basic MIME-type inference from extension
  const ext = fileName.split('.').pop()?.toLowerCase() ?? ''

  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic'].includes(ext)) {
    return { category: 'identity', type: 'photo', confidence: 0.3, method: 'fallback' }
  }
  if (['pdf', 'doc', 'docx'].includes(ext)) {
    return { category: 'other', type: 'other', confidence: 0.1, method: 'fallback' }
  }
  if (['xls', 'xlsx', 'csv'].includes(ext)) {
    return { category: 'financial', type: 'other', confidence: 0.2, method: 'fallback' }
  }

  return { category: 'other', type: 'other', confidence: 0.1, method: 'fallback' }
}
