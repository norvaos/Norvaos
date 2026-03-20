import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import { withTiming } from '@/lib/middleware/request-timing'
import Anthropic from '@anthropic-ai/sdk'

// ─── Document Type Definitions ─────────────────────────────────────────────
// Each document type maps to expected fields that Claude will extract.

const DOCUMENT_TYPE_PROMPTS: Record<string, string> = {
  // IRCC documents
  ircc_acknowledgement: `This is an IRCC Acknowledgement of Receipt (AOR) letter. Extract:
- application_number (the IRCC application number, e.g. "B000123456")
- uci_number (Unique Client Identifier, 8-10 digits)
- applicant_name (full name of the principal applicant)
- date_received (the date IRCC received the application)
- date_issued (the date this acknowledgement letter was issued)
- application_type (e.g. "Permanent Residence", "Work Permit", "Study Permit", "Visitor Visa", "Sponsorship")
- office (processing office, if shown)`,

  ircc_biometrics: `This is an IRCC Biometrics Instruction Letter (BIL). Extract:
- applicant_name (full name)
- uci_number (Unique Client Identifier)
- application_number
- date_issued
- biometrics_deadline (deadline to provide biometrics)
- biometrics_location (suggested collection location, if shown)`,

  ircc_medical: `This is an IRCC Medical Request or Upfront Medical letter. Extract:
- applicant_name (full name)
- uci_number
- application_number
- date_issued
- medical_deadline (deadline for medical exam)
- designated_medical_practitioner (if specified)`,

  ircc_decision: `This is an IRCC decision letter (approval, refusal, or GCMS notes). Extract:
- applicant_name (full name)
- uci_number
- application_number
- date_issued
- decision (approved / refused / withdrawn / other)
- decision_details (key reasons or conditions)
- office (processing office)`,

  ircc_portal_letter: `This is an IRCC Portal Letter (request to submit documents via the IRCC portal). Extract:
- applicant_name
- uci_number
- application_number
- date_issued
- portal_deadline (deadline to submit documents)
- documents_requested (list of documents requested)`,

  // Identity documents
  passport: `This is a passport. Extract:
- full_name (as printed on passport)
- given_name
- family_name
- date_of_birth (YYYY-MM-DD format)
- passport_number
- nationality
- sex (M/F/X)
- date_of_issue (YYYY-MM-DD)
- date_of_expiry (YYYY-MM-DD)
- place_of_birth
- issuing_authority`,

  drivers_licence: `This is a driver's licence. Extract:
- full_name
- date_of_birth (YYYY-MM-DD)
- licence_number
- address
- date_of_issue (YYYY-MM-DD)
- date_of_expiry (YYYY-MM-DD)
- licence_class
- province_state`,

  birth_certificate: `This is a birth certificate. Extract:
- full_name (name on certificate)
- date_of_birth (YYYY-MM-DD)
- place_of_birth (city, province/state, country)
- mother_name
- father_name
- registration_number
- date_of_registration`,

  marriage_certificate: `This is a marriage certificate. Extract:
- spouse_1_name (full name)
- spouse_2_name (full name)
- date_of_marriage (YYYY-MM-DD)
- place_of_marriage
- registration_number
- officiant_name`,

  // Financial documents
  bank_statement: `This is a bank statement. Extract:
- account_holder_name
- bank_name
- account_number (last 4 digits only for security)
- statement_period_start (YYYY-MM-DD)
- statement_period_end (YYYY-MM-DD)
- opening_balance
- closing_balance
- currency`,

  employment_letter: `This is an employment letter / job offer letter. Extract:
- employee_name
- employer_name
- job_title
- employment_start_date (YYYY-MM-DD)
- salary (amount and frequency, e.g. "$75,000/year")
- employment_type (full-time / part-time / contract)
- date_issued (YYYY-MM-DD)
- noc_code (if mentioned)`,

  tax_document: `This is a tax document (T4, NOA, tax return, etc.). Extract:
- taxpayer_name
- tax_year
- document_type (T4, Notice of Assessment, T1 General, etc.)
- total_income
- tax_paid
- social_insurance_number (last 3 digits only for security)`,

  // Legal documents
  court_order: `This is a court order. Extract:
- case_number / court file number
- court_name
- judge_name
- parties (applicant and respondent names)
- date_issued (YYYY-MM-DD)
- order_type (custody, support, restraining, etc.)
- key_terms (brief summary of the order)`,

  police_clearance: `This is a police clearance / criminal record check certificate. Extract:
- applicant_name
- date_of_birth (YYYY-MM-DD)
- date_issued (YYYY-MM-DD)
- issuing_authority
- result (clear / record found)
- certificate_number`,

  // General / catch-all
  general: `This is a document. Extract any key information visible:
- document_type (what kind of document is this?)
- names (any person names mentioned)
- dates (any important dates)
- reference_numbers (any reference, file, or case numbers)
- key_information (other important data points)`,
}

// ─── Route Handler ──────────────────────────────────────────────────────────

async function handlePost(request: NextRequest) {
  try {
    const auth = await authenticateRequest()
    requirePermission(auth, 'documents', 'read')

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      return NextResponse.json(
        { error: 'Document scanning is not configured. Please add ANTHROPIC_API_KEY to your environment.' },
        { status: 503 }
      )
    }

    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const documentTypeHint = (formData.get('document_type_hint') as string | null) ?? ''

    if (!file) {
      return NextResponse.json({ error: 'File is required' }, { status: 400 })
    }

    // Validate file size (10 MB max for scanning)
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json(
        { error: 'File must be under 10 MB for scanning' },
        { status: 400 }
      )
    }

    // Convert file to base64 for Claude Vision
    const arrayBuffer = await file.arrayBuffer()
    const base64 = Buffer.from(arrayBuffer).toString('base64')

    // Determine media type for Claude
    const supportedImageTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const
    const supportedDocTypes = ['application/pdf'] as const
    type SupportedImageType = typeof supportedImageTypes[number]
    type SupportedDocType = typeof supportedDocTypes[number]

    const isImage = supportedImageTypes.includes(file.type as SupportedImageType)
    const isPdf = supportedDocTypes.includes(file.type as SupportedDocType)

    if (!isImage && !isPdf) {
      return NextResponse.json(
        { error: 'Only images (JPEG, PNG, WebP) and PDFs can be scanned. For Word documents, please convert to PDF first.' },
        { status: 400 }
      )
    }

    // Build the extraction prompt
    const typeKey = documentTypeHint.toLowerCase().replace(/[\s-]+/g, '_')
    const typePrompt = DOCUMENT_TYPE_PROMPTS[typeKey] || DOCUMENT_TYPE_PROMPTS.general

    const systemPrompt = `You are a document data extraction assistant for a Canadian law firm. Your job is to:
1. Identify the document type
2. Extract structured data from the document
3. Return ONLY valid JSON — no markdown, no explanation

Rules:
- Dates must be in YYYY-MM-DD format
- Names should be in their original case as printed
- If a field is not visible or not applicable, set it to null
- For security, only extract the last 4 digits of account numbers and last 3 digits of SIN/SSN
- Extract text exactly as written (do not correct spelling in names)
- If you can identify the document type, set "detected_document_type" accordingly`

    const userPrompt = `Analyse this document and extract structured information.

${typePrompt}

Return a JSON object with exactly this structure:
{
  "detected_document_type": "<string: the type of document you identified>",
  "confidence": <number: 0-100, how confident you are in the extraction>,
  "extracted_fields": {
    <field_name>: <value or null>
  },
  "raw_text_summary": "<string: brief 1-2 sentence summary of the document>"
}`

    // Call Claude API
    const anthropic = new Anthropic({ apiKey })

    const content: Anthropic.ContentBlockParam[] = []

    if (isPdf) {
      content.push({
        type: 'document',
        source: {
          type: 'base64',
          media_type: 'application/pdf',
          data: base64,
        },
      })
    } else {
      content.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: file.type as SupportedImageType,
          data: base64,
        },
      })
    }

    content.push({ type: 'text', text: userPrompt })

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content,
        },
      ],
    })

    // Parse Claude's response
    const textBlock = response.content.find((block) => block.type === 'text')
    if (!textBlock || textBlock.type !== 'text') {
      return NextResponse.json(
        { error: 'Failed to extract data from document' },
        { status: 500 }
      )
    }

    // Clean up JSON (remove markdown fences if present)
    let jsonText = textBlock.text.trim()
    if (jsonText.startsWith('```json')) {
      jsonText = jsonText.slice(7)
    } else if (jsonText.startsWith('```')) {
      jsonText = jsonText.slice(3)
    }
    if (jsonText.endsWith('```')) {
      jsonText = jsonText.slice(0, -3)
    }
    jsonText = jsonText.trim()

    let extractedData: {
      detected_document_type: string
      confidence: number
      extracted_fields: Record<string, string | number | null>
      raw_text_summary: string
    }

    try {
      extractedData = JSON.parse(jsonText)
    } catch {
      return NextResponse.json(
        { error: 'Failed to parse extracted data', raw_response: jsonText },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data: extractedData,
    })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error('Document scan error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export const POST = withTiming(handlePost, 'POST /api/documents/scan')
