/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * OCR ID Field Parser Precision Benchmarking — Directive 009
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Tests extraction accuracy of parseIdFields() against known OCR text outputs
 * from Canadian government IDs (driver's licences, passports, PR cards).
 *
 * Measures per-field and overall accuracy with fuzzy matching.
 */

import { describe, it, expect } from 'vitest'
import { parseIdFields, type IdScanFields } from '../ocr/id-field-parser'
import {
  calculateExtractionMetrics,
  fuzzyFieldMatch,
  type FieldExtractionResult,
} from './precision-metrics'

// ─── Ground Truth Dataset ───────────────────────────────────────────────────

interface OcrGroundTruth {
  label: string
  ocrText: string
  expected: Partial<IdScanFields>
}

const OCR_GROUND_TRUTH: OcrGroundTruth[] = [
  {
    label: 'Ontario Driver Licence — Standard',
    ocrText: [
      'ONTARIO',
      "DRIVER'S LICENCE",
      'SURNAME KHAN',
      'GIVEN NAME AHMED',
      'DATE OF BIRTH 1985-06-15',
      'SEX M',
      'HEIGHT 178',
      '123 YONGE STREET',
      'TORONTO ON M5C 1W4',
      'LICENCE NO A1234-56789-01234',
      'EXPIRY 2027-06-15',
    ].join('\n'),
    expected: {
      first_name: 'Ahmed',
      last_name: 'Khan',
      date_of_birth: '1985-06-15',
      sex: 'M',
      city: 'Toronto',
      province_state: 'ON',
      postal_code: 'M5C 1W4',
      document_number: 'A1234-56789-01234',
      document_type: 'drivers_licence',
    },
  },
  {
    label: 'BC Driver Licence',
    ocrText: [
      'BRITISH COLUMBIA',
      "DRIVER'S LICENCE",
      'SURNAME PATEL',
      'GIVEN NAME PRIYA',
      'DATE OF BIRTH 1990-03-22',
      'SEX F',
      '456 ROBSON ST',
      'VANCOUVER BC V6B 2A1',
      'LICENCE NO 7654321',
    ].join('\n'),
    expected: {
      first_name: 'Priya',
      last_name: 'Patel',
      date_of_birth: '1990-03-22',
      sex: 'F',
      city: 'Vancouver',
      province_state: 'BC',
      postal_code: 'V6B 2A1',
      document_type: 'drivers_licence',
    },
  },
  {
    label: 'Alberta Driver Licence',
    ocrText: [
      'ALBERTA',
      "DRIVER'S LICENCE",
      'SURNAME SINGH',
      'GIVEN NAME HARPREET',
      'DATE OF BIRTH 1988-11-03',
      'SEX M',
      '789 JASPER AVE',
      'EDMONTON AB T5J 1N9',
      'LICENCE NO 654321',
      'EXPIRY 2026-11-03',
    ].join('\n'),
    expected: {
      first_name: 'Harpreet',
      last_name: 'Singh',
      date_of_birth: '1988-11-03',
      sex: 'M',
      city: 'Edmonton',
      province_state: 'AB',
      postal_code: 'T5J 1N9',
      document_type: 'drivers_licence',
    },
  },
  {
    label: 'Canadian Passport — Standard',
    ocrText: [
      'CANADA',
      'PASSPORT PASSEPORT',
      'Surname NGUYEN',
      'Given names THANH MINH',
      'Date of birth 1988-01-15',
      'Sex M',
      'Passport No. GA123456',
    ].join('\n'),
    expected: {
      first_name: 'Thanh Minh',
      last_name: 'Nguyen',
      date_of_birth: '1988-01-15',
      sex: 'M',
      document_number: 'GA123456',
      document_type: 'passport',
    },
  },
  {
    label: 'PR Card — Standard',
    ocrText: [
      'CANADA',
      'PERMANENT RESIDENT CARD',
      'Surname HASSAN',
      'Given name FATIMA',
      'Date of birth 1992-08-10',
      'Sex F',
      'Document No RA1234567',
    ].join('\n'),
    expected: {
      first_name: 'Fatima',
      last_name: 'Hassan',
      date_of_birth: '1992-08-10',
      sex: 'F',
      document_type: 'pr_card',
    },
  },
  {
    label: 'Ontario DL — Comma-separated Name',
    ocrText: [
      'ONTARIO',
      "DRIVER'S LICENCE",
      'MEHTA, ARJUN',
      'DOB 1995-02-28',
      'SEX M',
      '50 BAY ST',
      'TORONTO ON M5J 2X8',
      'A5678-12345-67890',
      'EXP 2028-02-28',
    ].join('\n'),
    expected: {
      first_name: 'Arjun',
      last_name: 'Mehta',
      date_of_birth: '1995-02-28',
      sex: 'M',
      city: 'Toronto',
      province_state: 'ON',
      postal_code: 'M5J 2X8',
      document_number: 'A5678-12345-67890',
      document_type: 'drivers_licence',
    },
  },
  {
    label: 'Quebec Driver Licence (French)',
    ocrText: [
      'QUÉBEC',
      'PERMIS DE CONDUIRE',
      'NOM DE FAMILLE TREMBLAY',
      'PRÉNOM MARIE',
      'DATE DE NAISSANCE 1987-07-14',
      'SEXE F',
      '100 RUE STE-CATHERINE',
      'MONTRÉAL QC H2X 1K3',
      'NO 9876543',
    ].join('\n'),
    expected: {
      first_name: 'Marie',
      last_name: 'Tremblay',
      date_of_birth: '1987-07-14',
      sex: 'F',
      province_state: 'QC',
      postal_code: 'H2X 1K3',
      document_type: 'drivers_licence',
    },
  },
  {
    label: 'Passport — MRZ-style name (uppercase all caps)',
    ocrText: [
      'CANADA',
      'PASSPORT',
      'Surname',
      'WILLIAMS',
      'Given names',
      'JAMES DAVID',
      'Date of birth 1975-12-25',
      'Sex M',
      'Passport No. HB654321',
    ].join('\n'),
    expected: {
      first_name: 'James David',
      last_name: 'Williams',
      date_of_birth: '1975-12-25',
      sex: 'M',
      document_number: 'HB654321',
      document_type: 'passport',
    },
  },
  {
    label: 'Saskatchewan DL — Minimal format',
    ocrText: [
      'SASKATCHEWAN',
      "DRIVER'S LICENCE",
      'LAST NAME OLSON',
      'FIRST NAME SARAH',
      'DOB 1993-04-18',
      'SEX F',
      'SASKATOON SK S7K 3J5',
    ].join('\n'),
    expected: {
      first_name: 'Sarah',
      last_name: 'Olson',
      date_of_birth: '1993-04-18',
      sex: 'F',
      city: 'Saskatoon',
      province_state: 'SK',
      postal_code: 'S7K 3J5',
      document_type: 'drivers_licence',
    },
  },
]

// ─── Helper: Compare Parsed Fields Against Expected ─────────────────────────

function compareFields(
  parsed: IdScanFields,
  expected: Partial<IdScanFields>,
  label: string,
): FieldExtractionResult[] {
  const results: FieldExtractionResult[] = []

  for (const [key, expectedValue] of Object.entries(expected)) {
    if (key === 'review_required') continue // Skip array field
    const extractedValue = (parsed as Record<string, unknown>)[key]
    const extracted = extractedValue != null ? String(extractedValue) : null
    const exp = expectedValue != null ? String(expectedValue) : null
    const match = fuzzyFieldMatch(extracted, exp)

    results.push({
      field: key,
      extracted,
      expected: exp,
      match,
    })
  }

  return results
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('Directive 009 — OCR ID Field Parser Precision Benchmark', () => {
  describe('Per-Document Extraction Accuracy', () => {
    for (const gt of OCR_GROUND_TRUTH) {
      it(`should extract fields from: ${gt.label}`, () => {
        const parsed = parseIdFields(gt.ocrText)
        const fieldResults = compareFields(parsed, gt.expected, gt.label)

        const failedFields = fieldResults.filter((r) => !r.match)
        if (failedFields.length > 0) {
          console.log(`\n  Mismatches for "${gt.label}":`)
          for (const f of failedFields) {
            console.log(`    ${f.field}: expected="${f.expected}" got="${f.extracted}"`)
          }
        }

        // At least 70% of fields should match per document
        const matchRate = fieldResults.filter((r) => r.match).length / fieldResults.length
        expect(matchRate).toBeGreaterThanOrEqual(0.70)
      })
    }
  })

  describe('Aggregate Field-Level Accuracy', () => {
    let allResults: FieldExtractionResult[] = []

    // Collect all field results across all documents
    beforeAll()

    function beforeAll() {
      allResults = []
      for (const gt of OCR_GROUND_TRUTH) {
        const parsed = parseIdFields(gt.ocrText)
        allResults.push(...compareFields(parsed, gt.expected, gt.label))
      }
    }

    it('should achieve >= 85% name extraction accuracy', () => {
      beforeAll()
      const nameFields = allResults.filter(
        (r) => r.field === 'first_name' || r.field === 'last_name',
      )
      const metrics = calculateExtractionMetrics(nameFields)

      console.log(`\nName accuracy: ${metrics.correctFields}/${metrics.totalFields} = ${(metrics.overallAccuracy * 100).toFixed(1)}%`)
      expect(metrics.overallAccuracy).toBeGreaterThanOrEqual(0.85)
    })

    it('should achieve >= 90% DOB extraction accuracy', () => {
      beforeAll()
      const dobFields = allResults.filter((r) => r.field === 'date_of_birth')
      const metrics = calculateExtractionMetrics(dobFields)

      console.log(`DOB accuracy: ${metrics.correctFields}/${metrics.totalFields} = ${(metrics.overallAccuracy * 100).toFixed(1)}%`)
      expect(metrics.overallAccuracy).toBeGreaterThanOrEqual(0.90)
    })

    it('should achieve >= 95% province extraction accuracy', () => {
      beforeAll()
      const provFields = allResults.filter((r) => r.field === 'province_state')
      const metrics = calculateExtractionMetrics(provFields)

      console.log(`Province accuracy: ${metrics.correctFields}/${metrics.totalFields} = ${(metrics.overallAccuracy * 100).toFixed(1)}%`)
      expect(metrics.overallAccuracy).toBeGreaterThanOrEqual(0.95)
    })

    it('should achieve >= 80% overall field accuracy', () => {
      beforeAll()
      const metrics = calculateExtractionMetrics(allResults)

      console.log('\n╔══════════════════════════════════════════════════════════╗')
      console.log('║  OCR ID Parser — Aggregate Extraction Metrics            ║')
      console.log('╠══════════════════════════════════════════════════════════╣')
      console.log(`║  Total fields:        ${metrics.totalFields}`)
      console.log(`║  Correct:             ${metrics.correctFields}`)
      console.log(`║  Missing:             ${metrics.missingFields}`)
      console.log(`║  Incorrect:           ${metrics.incorrectFields}`)
      console.log(`║  Overall accuracy:    ${(metrics.overallAccuracy * 100).toFixed(1)}%`)
      console.log('║')
      for (const [field, acc] of Object.entries(metrics.perFieldAccuracy).sort()) {
        console.log(`║  ${field.padEnd(20)} ${(acc * 100).toFixed(0)}%`)
      }
      console.log('╚══════════════════════════════════════════════════════════╝\n')

      expect(metrics.overallAccuracy).toBeGreaterThanOrEqual(0.80)
    })
  })

  describe('Document Type Detection Accuracy', () => {
    it('should correctly detect document type for all test cases', () => {
      let correct = 0
      for (const gt of OCR_GROUND_TRUTH) {
        if (!gt.expected.document_type) continue
        const parsed = parseIdFields(gt.ocrText)
        if (parsed.document_type === gt.expected.document_type) {
          correct++
        } else {
          console.log(
            `  Type mismatch for "${gt.label}": expected=${gt.expected.document_type} got=${parsed.document_type}`,
          )
        }
      }

      const typeCases = OCR_GROUND_TRUTH.filter((g) => g.expected.document_type).length
      const accuracy = typeCases > 0 ? correct / typeCases : 0

      console.log(`\nDocument type accuracy: ${correct}/${typeCases} = ${(accuracy * 100).toFixed(1)}%`)
      expect(accuracy).toBeGreaterThanOrEqual(0.90)
    })
  })

  describe('Sex Field Extraction Accuracy', () => {
    it('should correctly extract sex for all test cases', () => {
      let correct = 0
      let total = 0
      for (const gt of OCR_GROUND_TRUTH) {
        if (!gt.expected.sex) continue
        total++
        const parsed = parseIdFields(gt.ocrText)
        if (parsed.sex === gt.expected.sex) correct++
      }

      const accuracy = total > 0 ? correct / total : 0
      console.log(`Sex field accuracy: ${correct}/${total} = ${(accuracy * 100).toFixed(1)}%`)
      expect(accuracy).toBeGreaterThanOrEqual(0.90)
    })
  })

  describe('Review Required Flags', () => {
    it('should flag missing critical fields for review', () => {
      // Minimal OCR text with no city/postal
      const parsed = parseIdFields('PASSPORT\nSurname SMITH\nGiven name JOHN')
      expect(parsed.review_required).toContain('province_state')
      expect(parsed.review_required).toContain('city')
      expect(parsed.review_required).toContain('postal_code')
    })

    it('should not flag fields that were successfully extracted', () => {
      const parsed = parseIdFields(
        'ONTARIO\nDRIVER\'S LICENCE\nSURNAME SMITH\nGIVEN NAME JOHN\nTORONTO ON M5V 2T6',
      )
      expect(parsed.review_required).not.toContain('province_state')
      expect(parsed.review_required).not.toContain('name')
    })
  })
})
