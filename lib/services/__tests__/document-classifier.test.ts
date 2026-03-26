/**
 * Tests for Document Classifier — AI-Powered OCR Auto-Tagging (Directive 5.4)
 *
 * Covers:
 *   - classifyByFilename (Tier 1): all pattern rules, cleaned vs raw matching, null return
 *   - classifyWithAI (Tier 2): success path, missing API key, API error, malformed JSON
 *   - classifyDocument (combined): tier escalation logic, confidence comparison
 *   - fallbackClassification: image/doc/spreadsheet/unknown extensions
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  classifyByFilename,
  classifyWithAI,
  classifyDocument,
  type ClassificationResult,
} from '../document-classifier'

// ─── Mocks ──────────────────────────────────────────────────────────────────

vi.mock('@/lib/utils/logger', () => ({
  log: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

// Helper to mock fetch for AI classification tests
function mockFetchSuccess(body: Record<string, unknown>) {
  const response = {
    ok: true,
    json: () => Promise.resolve({
      content: [{ text: JSON.stringify(body) }],
    }),
  }
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response))
}

function mockFetchFailure(status: number) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status }))
}

function mockFetchMalformedJSON() {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({
      content: [{ text: 'this is not json {{{' }],
    }),
  }))
}

function mockFetchNetworkError() {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network failure')))
}

// ─── classifyByFilename ─────────────────────────────────────────────────────

describe('classifyByFilename', () => {
  // --- Identity documents ---

  it('classifies passport filenames', () => {
    const r = classifyByFilename('passport_john.pdf')!
    expect(r.category).toBe('identity')
    expect(r.type).toBe('passport')
    expect(r.method).toBe('filename')
    expect(r.confidence).toBe(0.9)
  })

  it('classifies passport via ppt abbreviation', () => {
    const r = classifyByFilename('ppt scan.pdf')!
    expect(r.type).toBe('passport')
  })

  it('classifies drivers licence (various spellings)', () => {
    expect(classifyByFilename('drivers_licence.pdf')!.type).toBe('drivers_licence')
    expect(classifyByFilename('driver-license.jpg')!.type).toBe('drivers_licence')
    expect(classifyByFilename('drivers-license-scan.pdf')!.type).toBe('drivers_licence')
  })

  it('classifies dl abbreviation', () => {
    const r = classifyByFilename('dl front.jpg')!
    expect(r.type).toBe('drivers_licence')
    expect(r.confidence).toBe(0.85)
  })

  it('classifies birth certificate', () => {
    const r = classifyByFilename('birth-cert-john.pdf')!
    expect(r.type).toBe('birth_certificate')
    expect(r.confidence).toBe(0.9)
  })

  it('classifies national ID / CNIC / NIC / Aadhar', () => {
    expect(classifyByFilename('national_id.pdf')!.type).toBe('national_id')
    expect(classifyByFilename('cnic_front.jpg')!.type).toBe('national_id')
    expect(classifyByFilename('nic_scan.pdf')!.type).toBe('national_id')
    expect(classifyByFilename('aadhar_card.pdf')!.type).toBe('national_id')
  })

  it('classifies marriage certificate', () => {
    const r = classifyByFilename('marriage-cert-2024.pdf')!
    expect(r.type).toBe('marriage_certificate')
    expect(r.category).toBe('identity')
  })

  // --- Financial documents ---

  it('classifies bank statement', () => {
    const r = classifyByFilename('bank_statement_jan2026.pdf')!
    expect(r.category).toBe('financial')
    expect(r.type).toBe('bank_statement')
    expect(r.confidence).toBe(0.9)
  })

  it('classifies account statement', () => {
    expect(classifyByFilename('account-statement-td.pdf')!.type).toBe('bank_statement')
  })

  it('classifies tax return (various patterns)', () => {
    expect(classifyByFilename('tax_return_2025.pdf')!.type).toBe('tax_return')
    expect(classifyByFilename('T4 2024.pdf')!.type).toBe('tax_return')
    expect(classifyByFilename('T1 general.pdf')!.type).toBe('tax_return')
    expect(classifyByFilename('NOA 2024.pdf')!.type).toBe('tax_return')
    expect(classifyByFilename('notice_of_assessment.pdf')!.type).toBe('tax_return')
  })

  it('classifies pay stub / slip', () => {
    expect(classifyByFilename('pay_stub_march.pdf')!.type).toBe('pay_stub')
    expect(classifyByFilename('pay-slip-feb.pdf')!.type).toBe('pay_stub')
    expect(classifyByFilename('salary_slip.pdf')!.type).toBe('pay_stub')
  })

  it('classifies invoice', () => {
    const r = classifyByFilename('invoice_12345.pdf')!
    expect(r.type).toBe('invoice')
    expect(r.category).toBe('financial')
    expect(r.confidence).toBe(0.8)
  })

  it('classifies inv abbreviation', () => {
    expect(classifyByFilename('inv 2026-001.pdf')!.type).toBe('invoice')
  })

  it('classifies receipt', () => {
    const r = classifyByFilename('receipt_amazon.pdf')!
    expect(r.type).toBe('receipt')
    expect(r.category).toBe('financial')
  })

  // --- Legal documents ---

  it('classifies retainer agreement', () => {
    expect(classifyByFilename('retainer-agreement.pdf')!.type).toBe('retainer_agreement')
    expect(classifyByFilename('engagement-letter.pdf')!.type).toBe('retainer_agreement')
    expect(classifyByFilename('fee_agreement.pdf')!.type).toBe('retainer_agreement')
  })

  it('classifies court order', () => {
    const r = classifyByFilename('court_order_2026.pdf')!
    expect(r.type).toBe('court_order')
    expect(r.category).toBe('legal')
  })

  it('classifies affidavit / sworn statement / statutory declaration', () => {
    expect(classifyByFilename('affidavit_of_support.pdf')!.type).toBe('affidavit')
    expect(classifyByFilename('sworn_statement.pdf')!.type).toBe('affidavit')
    expect(classifyByFilename('statutory-declaration.pdf')!.type).toBe('affidavit')
  })

  it('classifies power of attorney / POA', () => {
    expect(classifyByFilename('power_of_attorney.pdf')!.type).toBe('power_of_attorney')
    expect(classifyByFilename('poa signed.pdf')!.type).toBe('power_of_attorney')
  })

  // --- Immigration documents ---

  it('classifies immigration forms (IMM ####)', () => {
    expect(classifyByFilename('IMM5257.pdf')!.type).toBe('immigration_form')
    expect(classifyByFilename('imm 1294 filled.pdf')!.type).toBe('immigration_form')
    expect(classifyByFilename('IRCC submission.pdf')!.type).toBe('immigration_form')
  })

  it('classifies travel history', () => {
    expect(classifyByFilename('travel_history.pdf')!.type).toBe('travel_history')
    expect(classifyByFilename('entry-stamps-scan.jpg')!.type).toBe('travel_history')
    expect(classifyByFilename('visa_stamp.jpg')!.type).toBe('travel_history')
  })

  it('classifies police clearance / PCC', () => {
    expect(classifyByFilename('police_clearance_india.pdf')!.type).toBe('police_clearance')
    expect(classifyByFilename('criminal_record_check.pdf')!.type).toBe('police_clearance')
    expect(classifyByFilename('pcc_usa.pdf')!.type).toBe('police_clearance')
  })

  // --- Correspondence ---

  it('classifies letter / correspondence', () => {
    const r = classifyByFilename('letter_to_client.pdf')!
    expect(r.type).toBe('letter')
    expect(r.category).toBe('correspondence')
    expect(r.confidence).toBe(0.7)
  })

  it('classifies correspondence', () => {
    expect(classifyByFilename('correspondence_ircc.pdf')!.type).toBe('letter')
  })

  // --- Employment / Education ---

  it('classifies employment letter / ROE', () => {
    expect(classifyByFilename('employment-letter.pdf')!.type).toBe('employment_letter')
    expect(classifyByFilename('job_letter.pdf')!.type).toBe('employment_letter')
    expect(classifyByFilename('reference-letter.pdf')!.type).toBe('employment_letter')
    expect(classifyByFilename('roe 2025.pdf')!.type).toBe('employment_letter')
  })

  it('classifies education credentials', () => {
    expect(classifyByFilename('diploma_scan.pdf')!.type).toBe('education_credential')
    expect(classifyByFilename('transcript.pdf')!.type).toBe('education_credential')
    expect(classifyByFilename('degree_certificate.pdf')!.type).toBe('education_credential')
    expect(classifyByFilename('WES evaluation.pdf')!.type).toBe('education_credential')
    expect(classifyByFilename('credential-report.pdf')!.type).toBe('education_credential')
    expect(classifyByFilename('ECA report.pdf')!.type).toBe('education_credential')
  })

  // --- Medical ---

  it('classifies medical report / IME / health exam', () => {
    expect(classifyByFilename('medical_report.pdf')!.type).toBe('medical_report')
    expect(classifyByFilename('IME results.pdf')!.type).toBe('medical_report')
    expect(classifyByFilename('health_exam.pdf')!.type).toBe('medical_report')
    expect(classifyByFilename('upfront_medical.pdf')!.type).toBe('medical_report')
  })

  // --- Photos ---

  it('classifies photo / headshot / portrait', () => {
    expect(classifyByFilename('photo_id.jpg')!.type).toBe('photo')
    expect(classifyByFilename('headshot.png')!.type).toBe('photo')
    expect(classifyByFilename('portrait.jpg')!.type).toBe('photo')
    expect(classifyByFilename('pic front.jpg')!.type).toBe('photo')
  })

  // --- Edge cases ---

  it('returns null for unrecognizable filenames', () => {
    expect(classifyByFilename('Doc123.pdf')).toBeNull()
    expect(classifyByFilename('scan_001.tiff')).toBeNull()
    expect(classifyByFilename('untitled.docx')).toBeNull()
  })

  it('handles filenames with underscores, dashes, and dots by cleaning', () => {
    // "birth.cert" becomes "birth cert" after cleaning, matching birth_certificate
    const r = classifyByFilename('birth.cert.scan.pdf')!
    expect(r.type).toBe('birth_certificate')
  })

  it('handles empty string', () => {
    expect(classifyByFilename('')).toBeNull()
  })

  it('matches raw filename when cleaned version does not match', () => {
    // The raw filename itself is also tested against patterns
    const r = classifyByFilename('passport.pdf')!
    expect(r.type).toBe('passport')
  })
})

// ─── classifyWithAI ─────────────────────────────────────────────────────────

describe('classifyWithAI', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    process.env = originalEnv
    vi.restoreAllMocks()
  })

  it('falls back when ANTHROPIC_API_KEY is not set', async () => {
    delete process.env.ANTHROPIC_API_KEY
    const r = await classifyWithAI('some_doc.pdf')
    expect(r.method).toBe('fallback')
    expect(r.category).toBe('other')
  })

  it('calls Anthropic API and returns parsed classification', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key-123'
    mockFetchSuccess({
      category: 'identity',
      type: 'passport',
      confidence: 0.95,
      suggestedName: 'Passport - John Smith',
    })

    const r = await classifyWithAI('scan001.pdf', 'PASSPORT CANADA...')
    expect(r.category).toBe('identity')
    expect(r.type).toBe('passport')
    expect(r.confidence).toBe(0.95)
    expect(r.method).toBe('ai')
    expect(r.suggestedName).toBe('Passport - John Smith')
  })

  it('sends correct headers and body to Anthropic API', async () => {
    process.env.ANTHROPIC_API_KEY = 'my-api-key'
    mockFetchSuccess({ category: 'other', type: 'other', confidence: 0.5 })

    await classifyWithAI('test.pdf', 'Some text content here')

    const fetchMock = vi.mocked(globalThis.fetch)
    expect(fetchMock).toHaveBeenCalledOnce()

    const [url, options] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.anthropic.com/v1/messages')
    expect(options!.method).toBe('POST')

    const headers = options!.headers as Record<string, string>
    expect(headers['x-api-key']).toBe('my-api-key')
    expect(headers['anthropic-version']).toBe('2023-06-01')

    const body = JSON.parse(options!.body as string)
    expect(body.model).toBe('claude-haiku-4-5-20251001')
    expect(body.max_tokens).toBe(256)
    expect(body.messages[0].content).toContain('test.pdf')
    expect(body.messages[0].content).toContain('Some text content here')
  })

  it('sends only filename when no firstPageText is provided', async () => {
    process.env.ANTHROPIC_API_KEY = 'key'
    mockFetchSuccess({ category: 'other', type: 'other', confidence: 0.5 })

    await classifyWithAI('mystery.pdf')

    const body = JSON.parse(vi.mocked(globalThis.fetch).mock.calls[0][1]!.body as string)
    expect(body.messages[0].content).toBe('Filename: "mystery.pdf"')
  })

  it('truncates firstPageText to 2000 characters', async () => {
    process.env.ANTHROPIC_API_KEY = 'key'
    mockFetchSuccess({ category: 'other', type: 'other', confidence: 0.5 })

    const longText = 'A'.repeat(5000)
    await classifyWithAI('doc.pdf', longText)

    const body = JSON.parse(vi.mocked(globalThis.fetch).mock.calls[0][1]!.body as string)
    const content = body.messages[0].content as string
    // "Filename: "doc.pdf"\n\nFirst page text:\n" + 2000 chars
    expect(content.length).toBeLessThan(2100)
  })

  it('falls back on API HTTP error', async () => {
    process.env.ANTHROPIC_API_KEY = 'key'
    mockFetchFailure(500)

    const r = await classifyWithAI('doc.pdf')
    expect(r.method).toBe('fallback')
  })

  it('falls back on malformed JSON response', async () => {
    process.env.ANTHROPIC_API_KEY = 'key'
    mockFetchMalformedJSON()

    const r = await classifyWithAI('doc.pdf')
    expect(r.method).toBe('fallback')
  })

  it('falls back on network error', async () => {
    process.env.ANTHROPIC_API_KEY = 'key'
    mockFetchNetworkError()

    const r = await classifyWithAI('doc.pdf')
    expect(r.method).toBe('fallback')
  })

  it('clamps confidence to 0-1 range', async () => {
    process.env.ANTHROPIC_API_KEY = 'key'
    mockFetchSuccess({ category: 'legal', type: 'affidavit', confidence: 5.0 })

    const r = await classifyWithAI('doc.pdf')
    expect(r.confidence).toBe(1)
  })

  it('clamps negative confidence to 0', async () => {
    process.env.ANTHROPIC_API_KEY = 'key'
    mockFetchSuccess({ category: 'legal', type: 'affidavit', confidence: -0.5 })

    const r = await classifyWithAI('doc.pdf')
    expect(r.confidence).toBe(0)
  })

  it('defaults missing fields to other/0.5', async () => {
    process.env.ANTHROPIC_API_KEY = 'key'
    mockFetchSuccess({})

    const r = await classifyWithAI('doc.pdf')
    expect(r.category).toBe('other')
    expect(r.type).toBe('other')
    expect(r.confidence).toBe(0.5)
    expect(r.method).toBe('ai')
  })
})

// ─── classifyDocument (combined) ────────────────────────────────────────────

describe('classifyDocument', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    process.env = originalEnv
    vi.restoreAllMocks()
  })

  it('returns Tier 1 result when filename confidence >= 0.8', async () => {
    // passport matches at 0.9 confidence
    const r = await classifyDocument('passport_scan.pdf')
    expect(r.method).toBe('filename')
    expect(r.type).toBe('passport')
    expect(r.confidence).toBe(0.9)
  })

  it('escalates to AI when filename confidence < 0.8', async () => {
    // "letter" matches at 0.7 confidence, so it should try AI
    process.env.ANTHROPIC_API_KEY = 'key'
    mockFetchSuccess({
      category: 'correspondence',
      type: 'letter',
      confidence: 0.85,
      suggestedName: 'Letter - Client',
    })

    const r = await classifyDocument('letter_draft.pdf')
    // AI confidence 0.85 > filename confidence 0.7, so AI wins
    expect(r.method).toBe('ai')
    expect(r.confidence).toBe(0.85)
  })

  it('prefers filename result when filename confidence > AI confidence (both below 0.8)', async () => {
    // "letter" matches at 0.7 confidence. If AI returns lower, filename wins.
    process.env.ANTHROPIC_API_KEY = 'key'
    mockFetchSuccess({
      category: 'other',
      type: 'other',
      confidence: 0.3,
    })

    const r = await classifyDocument('letter_draft.pdf')
    expect(r.method).toBe('filename')
    expect(r.type).toBe('letter')
    expect(r.confidence).toBe(0.7)
  })

  it('escalates to AI for unrecognizable filenames', async () => {
    process.env.ANTHROPIC_API_KEY = 'key'
    mockFetchSuccess({
      category: 'identity',
      type: 'passport',
      confidence: 0.92,
    })

    const r = await classifyDocument('DOC_0001.pdf', 'PASSPORT CANADA...')
    expect(r.method).toBe('ai')
    expect(r.type).toBe('passport')
  })

  it('returns fallback for unrecognizable filename with no API key', async () => {
    delete process.env.ANTHROPIC_API_KEY
    const r = await classifyDocument('xyz123.pdf')
    expect(r.method).toBe('fallback')
  })

  it('passes firstPageText to AI tier', async () => {
    process.env.ANTHROPIC_API_KEY = 'key'
    mockFetchSuccess({ category: 'financial', type: 'bank_statement', confidence: 0.9 })

    await classifyDocument('scan.pdf', 'TD Canada Trust Statement...')

    const body = JSON.parse(vi.mocked(globalThis.fetch).mock.calls[0][1]!.body as string)
    expect(body.messages[0].content).toContain('TD Canada Trust Statement')
  })
})

// ─── Fallback classification (via classifyWithAI fallback path) ─────────────

describe('fallback classification', () => {
  beforeEach(() => {
    delete process.env.ANTHROPIC_API_KEY
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('classifies image extensions as photo', async () => {
    for (const ext of ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic']) {
      const r = await classifyWithAI(`file.${ext}`)
      expect(r).toMatchObject({
        category: 'identity',
        type: 'photo',
        confidence: 0.3,
        method: 'fallback',
      })
    }
  })

  it('classifies document extensions as other/other', async () => {
    for (const ext of ['pdf', 'doc', 'docx']) {
      const r = await classifyWithAI(`file.${ext}`)
      expect(r).toMatchObject({
        category: 'other',
        type: 'other',
        confidence: 0.1,
        method: 'fallback',
      })
    }
  })

  it('classifies spreadsheet extensions as financial/other', async () => {
    for (const ext of ['xls', 'xlsx', 'csv']) {
      const r = await classifyWithAI(`file.${ext}`)
      expect(r).toMatchObject({
        category: 'financial',
        type: 'other',
        confidence: 0.2,
        method: 'fallback',
      })
    }
  })

  it('classifies unknown extensions as other/other', async () => {
    const r = await classifyWithAI('file.xyz')
    expect(r).toMatchObject({
      category: 'other',
      type: 'other',
      confidence: 0.1,
      method: 'fallback',
    })
  })

  it('handles filename with no extension', async () => {
    const r = await classifyWithAI('README')
    expect(r.method).toBe('fallback')
    expect(r.category).toBe('other')
  })
})

// ─── Type exports ───────────────────────────────────────────────────────────

describe('type exports', () => {
  it('ClassificationResult has the expected shape', () => {
    const result: ClassificationResult = {
      category: 'identity',
      type: 'passport',
      confidence: 0.95,
      method: 'ai',
      suggestedName: 'Passport - Test',
    }
    expect(result.category).toBe('identity')
    expect(result.suggestedName).toBe('Passport - Test')
  })

  it('ClassificationResult works without optional suggestedName', () => {
    const result: ClassificationResult = {
      category: 'other',
      type: 'other',
      confidence: 0.1,
      method: 'fallback',
    }
    expect(result.suggestedName).toBeUndefined()
  })
})
