/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Document Extractor Precision Benchmarking  -  Directive 009
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Tests field extraction accuracy for the regex-based document extractor
 * (detectAndExtract) against ground-truth OCR text samples for each
 * document type: passport, bank statement, employment letter, IRCC forms,
 * tax documents, driver's licence, court orders, police clearance.
 */

import { describe, it, expect } from 'vitest'
import {
  detectDocumentType,
  detectAndExtract,
  type DocumentType,
  type ExtractResult,
} from '../document-extractor'
import {
  calculateExtractionMetrics,
  fuzzyFieldMatch,
  type FieldExtractionResult,
} from './precision-metrics'

// ─── Ground Truth Dataset ───────────────────────────────────────────────────

interface ExtractorGroundTruth {
  label: string
  ocrText: string
  expectedType: DocumentType
  expectedFields: Record<string, string | null>
}

const EXTRACTOR_GROUND_TRUTH: ExtractorGroundTruth[] = [
  // ── Passport ────────────────────────────────────────────────────────────
  {
    label: 'Canadian Passport',
    ocrText: [
      'CANADA',
      'PASSPORT PASSEPORT',
      'Surname: NGUYEN',
      'Given names: THANH MINH',
      'Date of birth: 15 JAN 1988',
      'Sex: M',
      'Nationality: Canadian',
      'Passport No. GA123456',
      'Date of issue: 01 MAR 2022',
      'Date of expiry: 01 MAR 2032',
      'Place of birth: Ho Chi Minh City',
    ].join('\n'),
    expectedType: 'passport',
    expectedFields: {
      given_name: 'THANH MINH',
      family_name: 'NGUYEN',
      date_of_birth: '1988-01-15',
      sex: 'M',
      nationality: 'Canadian',
      passport_number: 'GA123456',
      date_of_issue: '2022-03-01',
      date_of_expiry: '2032-03-01',
      place_of_birth: 'Ho Chi Minh City',
    },
  },

  // ── Driver's Licence ────────────────────────────────────────────────────
  {
    label: 'Ontario Driver Licence',
    ocrText: [
      'ONTARIO',
      "DRIVER'S LICENCE",
      'Name: KHAN, AHMED',
      'Date of birth: 1985-06-15',
      'Licence No A1234-56789-01234',
      'Address 123 Yonge Street',
      'Issued 2022-06-15',
      'Expiry 2027-06-15',
      'Class G',
      'Province Ontario',
    ].join('\n'),
    expectedType: 'drivers_licence',
    expectedFields: {
      full_name: 'KHAN, AHMED',
      date_of_birth: '1985-06-15',
      licence_number: 'A1234-56789-01234',
      date_of_issue: '2022-06-15',
      date_of_expiry: '2027-06-15',
    },
  },

  // ── Bank Statement ──────────────────────────────────────────────────────
  {
    label: 'TD Bank Statement',
    ocrText: [
      'TD Canada Trust',
      'Bank Statement',
      'Account holder: PRIYA PATEL',
      'Account number: 1234567890',
      'Statement from: 2024-01-01',
      'Statement to: 2024-01-31',
      'Opening balance: $5,432.10',
      'Closing balance: $6,789.50',
      'Currency: CAD',
    ].join('\n'),
    expectedType: 'bank_statement',
    expectedFields: {
      account_holder_name: 'PRIYA PATEL',
      bank_name: 'TD',
      statement_period_start: '2024-01-01',
      statement_period_end: '2024-01-31',
      opening_balance: '$5,432.10',
      closing_balance: '$6,789.50',
      currency: 'CAD',
    },
  },

  // ── Employment Letter ───────────────────────────────────────────────────
  {
    label: 'Employment Confirmation Letter',
    ocrText: [
      'ABC Corporation Inc.',
      'Employment Confirmation Letter',
      'Date: March 15, 2024',
      'This is to confirm that AHMED KHAN',
      'has been employed with our organisation since January 10, 2020',
      'Company: ABC Corporation Inc.',
      'Position: Senior Software Engineer',
      'Employment type: full-time',
      'Annual salary: $95,000',
      'NOC code: 21232',
    ].join('\n'),
    expectedType: 'employment_letter',
    expectedFields: {
      employee_name: 'AHMED KHAN',
      employer_name: 'ABC Corporation Inc.',
      job_title: 'Senior Software Engineer',
      salary: '$95,000',
      employment_type: 'full-time',
      noc_code: '21232',
    },
  },

  // ── IRCC Acknowledgement of Receipt ─────────────────────────────────────
  {
    label: 'IRCC AOR Letter',
    ocrText: [
      'Immigration, Refugees and Citizenship Canada',
      'IRCC',
      'Acknowledgement of Receipt',
      'Applicant name: FATIMA HASSAN',
      'Application number: E012345678',
      'UCI: 12345678',
      'Date received: 2024-02-15',
      'Date issued: 2024-02-20',
      'Application type: Permanent Residence - Express Entry',
      'Processing office: CPC-Edmonton',
    ].join('\n'),
    expectedType: 'ircc_acknowledgement',
    expectedFields: {
      applicant_name: 'FATIMA HASSAN',
      application_number: 'E012345678',
      uci_number: '12345678',
      date_received: '2024-02-15',
      date_issued: '2024-02-20',
      application_type: 'Permanent Residence - Express Entry',
      office: 'CPC-Edmonton',
    },
  },

  // ── IRCC Biometrics Instruction ─────────────────────────────────────────
  {
    label: 'IRCC Biometrics Instruction Letter',
    ocrText: [
      'Immigration, Refugees and Citizenship Canada',
      'IRCC',
      'Biometric Instruction Letter',
      'Applicant name: HARPREET SINGH',
      'Application number: B098765432',
      'UCI: 98765432',
      'Date issued: 2024-03-01',
      'Deadline: 2024-04-01',
      'Collection location: ASC Toronto - 55 St Clair Ave',
    ].join('\n'),
    expectedType: 'ircc_biometrics',
    expectedFields: {
      applicant_name: 'HARPREET SINGH',
      application_number: 'B098765432',
      uci_number: '98765432',
      date_issued: '2024-03-01',
      biometrics_deadline: '2024-04-01',
      biometrics_location: 'ASC Toronto - 55 St Clair Ave',
    },
  },

  // ── IRCC Decision Letter ────────────────────────────────────────────────
  {
    label: 'IRCC Decision  -  Approved',
    ocrText: [
      'Immigration, Refugees and Citizenship Canada',
      'IRCC Decision',
      'Your application has been approved.',
      'Applicant name: THANH NGUYEN',
      'Application number: V234567890',
      'UCI: 23456789',
      'Decision date: 2024-06-15',
      'Processing office: CPC-Sydney',
      'Reason: Meets all requirements',
    ].join('\n'),
    expectedType: 'ircc_decision',
    expectedFields: {
      applicant_name: 'THANH NGUYEN',
      application_number: 'V234567890',
      uci_number: '23456789',
      decision: 'approved',
      office: 'CPC-Sydney',
    },
  },

  // ── IRCC Procedural Fairness ────────────────────────────────────────────
  {
    label: 'IRCC Procedural Fairness Letter',
    ocrText: [
      'Immigration, Refugees and Citizenship Canada',
      'IRCC',
      'Procedural Fairness Letter',
      'Applicant name: JAMES WILLIAMS',
      'Application number: F345678901',
      'UCI: 34567890',
      'Date issued: 2024-05-01',
      'You must respond by: 2024-05-31',
      'Concerns: Insufficient proof of funds',
    ].join('\n'),
    expectedType: 'ircc_procedural_fairness',
    expectedFields: {
      applicant_name: 'JAMES WILLIAMS',
      application_number: 'F345678901',
      uci_number: '34567890',
      date_issued: '2024-05-01',
      response_deadline: '2024-05-31',
      concerns: 'Insufficient proof of funds',
    },
  },

  // ── Tax Document  -  T4 ──────────────────────────────────────────────────
  {
    label: 'T4 Tax Slip',
    ocrText: [
      'T4 Statement of Remuneration Paid',
      'Tax year: 2023',
      'Employee name: SARAH OLSON',
      'Social Insurance Number: 123-456-789',
      'Employment income: $78,500.00',
      'Income tax deducted: $15,200.00',
    ].join('\n'),
    expectedType: 'tax_document',
    expectedFields: {
      taxpayer_name: 'SARAH OLSON',
      tax_year: '2023',
      document_type: 'T4',
      total_income: '$78,500.00',
      tax_paid: '$15,200.00',
      social_insurance_number: '***-***-789',
    },
  },

  // ── Court Order ─────────────────────────────────────────────────────────
  {
    label: 'Ontario Family Court Order',
    ocrText: [
      'Ontario Superior Court of Justice',
      'Court file no: FC-2024-12345',
      'Between: SMITH (Applicant) and JONES (Respondent)',
      'The Honourable Justice Brown',
      'Dated: 2024-04-10',
      'IT IS ORDERED that custody of the minor child...',
    ].join('\n'),
    expectedType: 'court_order',
    expectedFields: {
      case_number: 'FC-2024-12345',
      court_name: 'Ontario Superior Court of Justice',
      order_type: 'custody',
    },
  },

  // ── Police Clearance ───────────────────────────────────────────────────
  {
    label: 'Police Clearance Certificate',
    ocrText: [
      'Toronto Police Service',
      'Police Criminal Record Clearance',
      'Applicant name: AHMED KHAN',
      'DOB: 1985-06-15',
      'Date issued: 2024-03-20',
      'Reference no: PCC-2024-98765',
      'No criminal record found',
      'Issued by: Toronto Police Service',
    ].join('\n'),
    expectedType: 'police_clearance',
    expectedFields: {
      applicant_name: 'AHMED KHAN',
      date_of_birth: '1985-06-15',
      date_issued: '2024-03-20',
      certificate_number: 'PCC-2024-98765',
      result: 'clear',
      issuing_authority: 'Toronto Police Service',
    },
  },

  // ── Birth Certificate ──────────────────────────────────────────────────
  {
    label: 'Ontario Birth Certificate',
    ocrText: [
      'Province of Ontario',
      'Certificate of Birth',
      'Birth Registration',
      'Name of child: SARAH MARIE OLSON',
      'Date of birth: 1993-04-18',
      'Place of birth: Toronto General Hospital',
      'Mother: KAREN OLSON',
      'Father: DAVID OLSON',
      'Registration No: 93-12345',
    ].join('\n'),
    expectedType: 'birth_certificate',
    expectedFields: {
      full_name: 'SARAH MARIE OLSON',
      date_of_birth: '1993-04-18',
      place_of_birth: 'Toronto General Hospital',
      mother_name: 'KAREN OLSON',
      father_name: 'DAVID OLSON',
      registration_number: '93-12345',
    },
  },

  // ── Marriage Certificate ───────────────────────────────────────────────
  {
    label: 'Marriage Certificate',
    ocrText: [
      'Certificate of Marriage',
      'Marriage Registration',
      'Spouse 1: AHMED KHAN',
      'Spouse 2: FATIMA HASSAN',
      'Date of marriage: 2020-09-15',
      'Place of marriage: Toronto City Hall',
      'Registration No: MC-2020-54321',
      'Officiant: Justice Patricia Lee',
    ].join('\n'),
    expectedType: 'marriage_certificate',
    expectedFields: {
      spouse_1_name: 'AHMED KHAN',
      spouse_2_name: 'FATIMA HASSAN',
      date_of_marriage: '2020-09-15',
      place_of_marriage: 'Toronto City Hall',
      registration_number: 'MC-2020-54321',
    },
  },
]

// ─── Helper ─────────────────────────────────────────────────────────────────

function compareExtractedFields(
  result: ExtractResult,
  expected: Record<string, string | null>,
): FieldExtractionResult[] {
  const fieldResults: FieldExtractionResult[] = []

  for (const [field, expectedValue] of Object.entries(expected)) {
    const extractedRaw = result.fields[field]
    const extracted = extractedRaw != null ? String(extractedRaw) : null
    const match = fuzzyFieldMatch(extracted, expectedValue)

    fieldResults.push({ field, extracted, expected: expectedValue, match })
  }

  return fieldResults
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('Directive 009  -  Document Extractor Precision Benchmark', () => {
  // ── Document Type Detection ───────────────────────────────────────────

  describe('Document Type Detection', () => {
    it('should correctly detect document type for all test cases', () => {
      let correct = 0
      const total = EXTRACTOR_GROUND_TRUTH.length

      for (const gt of EXTRACTOR_GROUND_TRUTH) {
        const detected = detectDocumentType(gt.ocrText)
        if (detected === gt.expectedType) {
          correct++
        } else {
          console.log(
            `  Type mismatch for "${gt.label}": expected=${gt.expectedType} got=${detected}`,
          )
        }
      }

      const accuracy = total > 0 ? correct / total : 0
      console.log(`\nDocument type detection: ${correct}/${total} = ${(accuracy * 100).toFixed(1)}%`)
      expect(accuracy).toBeGreaterThanOrEqual(0.85)
    })
  })

  // ── Per-Document Field Extraction ─────────────────────────────────────

  describe('Per-Document Field Extraction', () => {
    for (const gt of EXTRACTOR_GROUND_TRUTH) {
      it(`should extract fields from: ${gt.label}`, () => {
        const result = detectAndExtract(gt.ocrText)
        const fieldResults = compareExtractedFields(result, gt.expectedFields)

        const failedFields = fieldResults.filter((r) => !r.match)
        if (failedFields.length > 0) {
          console.log(`\n  Mismatches for "${gt.label}":`)
          for (const f of failedFields) {
            console.log(`    ${f.field}: expected="${f.expected}" got="${f.extracted}"`)
          }
        }

        // At least 50% of expected fields should match per document
        // (regex-only extraction is inherently limited)
        const matchRate = fieldResults.filter((r) => r.match).length / fieldResults.length
        expect(matchRate).toBeGreaterThanOrEqual(0.50)
      })
    }
  })

  // ── Aggregate Metrics ─────────────────────────────────────────────────

  describe('Aggregate Extraction Metrics', () => {
    it('should achieve >= 60% overall field accuracy (regex-only)', () => {
      const allResults: FieldExtractionResult[] = []

      for (const gt of EXTRACTOR_GROUND_TRUTH) {
        const result = detectAndExtract(gt.ocrText)
        allResults.push(...compareExtractedFields(result, gt.expectedFields))
      }

      const metrics = calculateExtractionMetrics(allResults)

      console.log('\n╔══════════════════════════════════════════════════════════╗')
      console.log('║  Document Extractor  -  Aggregate Metrics (regex-only)     ║')
      console.log('╠══════════════════════════════════════════════════════════╣')
      console.log(`║  Total fields:        ${metrics.totalFields}`)
      console.log(`║  Correct:             ${metrics.correctFields}`)
      console.log(`║  Missing:             ${metrics.missingFields}`)
      console.log(`║  Incorrect:           ${metrics.incorrectFields}`)
      console.log(`║  Overall accuracy:    ${(metrics.overallAccuracy * 100).toFixed(1)}%`)
      console.log('║')
      for (const [field, acc] of Object.entries(metrics.perFieldAccuracy).sort()) {
        console.log(`║  ${field.padEnd(28)} ${(acc * 100).toFixed(0)}%`)
      }
      console.log('╚══════════════════════════════════════════════════════════╝\n')

      expect(metrics.overallAccuracy).toBeGreaterThanOrEqual(0.60)
    })

    it('should achieve >= 70% accuracy for name-related fields', () => {
      const allResults: FieldExtractionResult[] = []
      for (const gt of EXTRACTOR_GROUND_TRUTH) {
        const result = detectAndExtract(gt.ocrText)
        allResults.push(...compareExtractedFields(result, gt.expectedFields))
      }

      const nameFields = allResults.filter((r) =>
        ['applicant_name', 'full_name', 'given_name', 'family_name',
         'employee_name', 'taxpayer_name', 'account_holder_name',
         'spouse_1_name', 'spouse_2_name', 'mother_name', 'father_name'].includes(r.field),
      )
      const metrics = calculateExtractionMetrics(nameFields)
      console.log(`Name field accuracy: ${(metrics.overallAccuracy * 100).toFixed(1)}%`)
      expect(metrics.overallAccuracy).toBeGreaterThanOrEqual(0.70)
    })

    it('should achieve >= 75% accuracy for date-related fields', () => {
      const allResults: FieldExtractionResult[] = []
      for (const gt of EXTRACTOR_GROUND_TRUTH) {
        const result = detectAndExtract(gt.ocrText)
        allResults.push(...compareExtractedFields(result, gt.expectedFields))
      }

      const dateFields = allResults.filter((r) =>
        r.field.includes('date') || r.field.includes('deadline'),
      )
      const metrics = calculateExtractionMetrics(dateFields)
      console.log(`Date field accuracy: ${(metrics.overallAccuracy * 100).toFixed(1)}%`)
      expect(metrics.overallAccuracy).toBeGreaterThanOrEqual(0.75)
    })
  })

  // ── Confidence Score Sanity ───────────────────────────────────────────

  describe('Confidence Score Sanity Checks', () => {
    it('should produce non-zero confidence for well-structured documents', () => {
      for (const gt of EXTRACTOR_GROUND_TRUTH) {
        const result = detectAndExtract(gt.ocrText)
        expect(result.confidence).toBeGreaterThan(0)
        expect(result.confidence).toBeLessThanOrEqual(100)
      }
    })

    it('should produce higher confidence for documents with more extracted fields', () => {
      // AOR with full fields should have higher confidence than minimal text
      const richResult = detectAndExtract(EXTRACTOR_GROUND_TRUTH.find(
        (g) => g.label === 'IRCC AOR Letter',
      )!.ocrText)

      const poorResult = detectAndExtract('Some random text with no useful fields')

      expect(richResult.confidence).toBeGreaterThan(poorResult.confidence)
    })
  })

  // ── Extraction Method Tagging ─────────────────────────────────────────

  describe('Extraction Method Tagging', () => {
    it('should tag all sync extractions as "regex"', () => {
      for (const gt of EXTRACTOR_GROUND_TRUTH) {
        const result = detectAndExtract(gt.ocrText)
        expect(result.extractionMethod).toBe('regex')
      }
    })
  })

  // ── Summary Generation ────────────────────────────────────────────────

  describe('Summary Generation', () => {
    it('should generate non-empty summaries for all document types', () => {
      for (const gt of EXTRACTOR_GROUND_TRUTH) {
        const result = detectAndExtract(gt.ocrText)
        expect(result.summary).toBeTruthy()
        expect(result.summary.length).toBeGreaterThan(10)
        expect(result.summary.length).toBeLessThanOrEqual(250)
      }
    })
  })

  // ── Detailed Report ───────────────────────────────────────────────────

  describe('Detailed Extraction Report', () => {
    it('should log a per-document extraction report', () => {
      console.log('\n┌─────────────────────────────────────────────────────────────────┐')
      console.log('│  Document Extractor  -  Per-Document Report                        │')
      console.log('├──────────────────────────────┬──────────────┬──────────┬─────────┤')
      console.log('│  Document                    │  Detected    │  Fields  │  Conf   │')
      console.log('├──────────────────────────────┼──────────────┼──────────┼─────────┤')

      for (const gt of EXTRACTOR_GROUND_TRUTH) {
        const result = detectAndExtract(gt.ocrText)
        const fieldResults = compareExtractedFields(result, gt.expectedFields)
        const matched = fieldResults.filter((r) => r.match).length
        const total = fieldResults.length

        const lbl = gt.label.slice(0, 28).padEnd(28)
        const det = result.documentType.slice(0, 12).padEnd(12)
        const fld = `${matched}/${total}`.padEnd(8)
        const conf = `${result.confidence}%`.padEnd(7)
        console.log(`│  ${lbl} │  ${det} │  ${fld} │  ${conf} │`)
      }

      console.log('└──────────────────────────────┴──────────────┴──────────┴─────────┘\n')
      expect(true).toBe(true) // Informational
    })
  })
})
