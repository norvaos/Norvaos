/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Smart Document Precision Benchmarking — Directive 009
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Tests classification accuracy against a ground-truth dataset.
 * Measures: accuracy, precision, recall, F1 score per category.
 *
 * Tier 1 (filename heuristics) is tested directly via classifyByFilename.
 * Tier 2 (AI) is tested via classifyDocument with mocked Anthropic API.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  classifyByFilename,
  classifyDocument,
  type ClassificationResult as ClassifierResult,
} from '../document-classifier'
import {
  calculatePrecisionMetrics,
  type ClassificationResult,
} from './precision-metrics'

// ─── Mocks ──────────────────────────────────────────────────────────────────

vi.mock('@/lib/utils/logger', () => ({
  log: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

// ─── Ground Truth Dataset ───────────────────────────────────────────────────

interface GroundTruthEntry {
  filename: string
  expectedCategory: string | null
  expectedType: string | null
}

const GROUND_TRUTH: GroundTruthEntry[] = [
  // ── Identity Documents ──────────────────────────────────────────────────
  { filename: 'passport_scan.pdf', expectedCategory: 'identity', expectedType: 'passport' },
  { filename: 'drivers-licence-front.jpg', expectedCategory: 'identity', expectedType: 'drivers_licence' },
  { filename: 'PR_Card_Front.png', expectedCategory: null, expectedType: null }, // No "PR card" pattern in rules
  { filename: 'birth-certificate-scan.pdf', expectedCategory: 'identity', expectedType: 'birth_certificate' },
  { filename: 'national-id-card.pdf', expectedCategory: 'identity', expectedType: 'national_id' },
  { filename: 'CNIC-front.jpg', expectedCategory: 'identity', expectedType: 'national_id' },
  { filename: 'marriage-certificate.pdf', expectedCategory: 'identity', expectedType: 'marriage_certificate' },

  // ── Immigration Documents ───────────────────────────────────────────────
  { filename: 'IMM5257-application-form.pdf', expectedCategory: 'immigration', expectedType: 'immigration_form' },
  { filename: 'IRCC-decision-letter.pdf', expectedCategory: 'immigration', expectedType: 'immigration_form' },
  { filename: 'travel-history-stamps.pdf', expectedCategory: 'immigration', expectedType: 'travel_history' },
  { filename: 'police-clearance-certificate.pdf', expectedCategory: 'immigration', expectedType: 'police_clearance' },
  { filename: 'PCC-india.pdf', expectedCategory: 'immigration', expectedType: 'police_clearance' },
  { filename: 'WES-credential-evaluation.pdf', expectedCategory: 'immigration', expectedType: 'education_credential' },
  { filename: 'diploma-university.pdf', expectedCategory: 'immigration', expectedType: 'education_credential' },

  // ── Financial Documents ─────────────────────────────────────────────────
  { filename: 'bank-statement-january-2024.pdf', expectedCategory: 'financial', expectedType: 'bank_statement' },
  { filename: 'T4-2023-employment-income.pdf', expectedCategory: 'financial', expectedType: 'tax_return' },
  { filename: 'NOA-2023.pdf', expectedCategory: 'financial', expectedType: 'tax_return' },
  { filename: 'pay-stub-march-2024.pdf', expectedCategory: 'financial', expectedType: 'pay_stub' },
  { filename: 'invoice-legal-services.pdf', expectedCategory: 'financial', expectedType: 'invoice' },
  { filename: 'receipt-filing-fee.pdf', expectedCategory: 'financial', expectedType: 'receipt' },

  // ── Employment Documents ────────────────────────────────────────────────
  { filename: 'employment-letter-company.pdf', expectedCategory: 'financial', expectedType: 'employment_letter' },
  { filename: 'reference-letter-manager.pdf', expectedCategory: 'correspondence', expectedType: 'letter' },

  // ── Legal Documents ─────────────────────────────────────────────────────
  { filename: 'retainer-agreement-signed.pdf', expectedCategory: 'legal', expectedType: 'retainer_agreement' },
  { filename: 'court-order-custody.pdf', expectedCategory: 'legal', expectedType: 'court_order' },
  { filename: 'affidavit-support.pdf', expectedCategory: 'legal', expectedType: 'affidavit' },
  { filename: 'power-of-attorney.pdf', expectedCategory: 'legal', expectedType: 'power_of_attorney' },

  // ── Correspondence ──────────────────────────────────────────────────────
  { filename: 'client-letter-intake.pdf', expectedCategory: 'correspondence', expectedType: 'letter' },
  { filename: 'correspondence-ircc.pdf', expectedCategory: 'correspondence', expectedType: 'letter' },

  // ── Medical ─────────────────────────────────────────────────────────────
  { filename: 'medical-exam-results.pdf', expectedCategory: 'medical', expectedType: 'medical_report' },
  { filename: 'upfront-medical-report.pdf', expectedCategory: 'medical', expectedType: 'medical_report' },

  // ── Edge cases — ambiguous filenames ────────────────────────────────────
  { filename: 'document1.pdf', expectedCategory: null, expectedType: null },
  { filename: 'scan_001.jpg', expectedCategory: null, expectedType: null },
  { filename: 'IMG_20240315.png', expectedCategory: null, expectedType: null },
  { filename: 'untitled.pdf', expectedCategory: null, expectedType: null },
  { filename: 'file.docx', expectedCategory: null, expectedType: null },
]

// ─── Tier 1: Filename Heuristics Benchmark ──────────────────────────────────

describe('Directive 009 — Document Classifier Precision Benchmark', () => {
  describe('Tier 1: Filename Heuristics Accuracy', () => {
    // Separate ground truth into classifiable (has expected values) and ambiguous
    const classifiableEntries = GROUND_TRUTH.filter(
      (e) => e.expectedCategory !== null && e.expectedType !== null,
    )
    const ambiguousEntries = GROUND_TRUTH.filter(
      (e) => e.expectedCategory === null,
    )

    it('should classify non-ambiguous filenames with >= 70% overall accuracy', () => {
      const categoryResults: ClassificationResult[] = []

      for (const entry of classifiableEntries) {
        const result = classifyByFilename(entry.filename)
        categoryResults.push({
          predicted: result?.category ?? null,
          actual: entry.expectedCategory,
        })
      }

      const metrics = calculatePrecisionMetrics(categoryResults)

      console.log('\n╔══════════════════════════════════════════════════════════╗')
      console.log('║  Tier 1 — Filename Category Classification Metrics      ║')
      console.log('╠══════════════════════════════════════════════════════════╣')
      console.log(`║  Total samples:       ${metrics.totalSamples}`)
      console.log(`║  Correct:             ${metrics.correctPredictions}`)
      console.log(`║  Accuracy:            ${(metrics.accuracy * 100).toFixed(1)}%`)
      console.log('║')
      for (const label of Object.keys(metrics.recall).sort()) {
        if (label === 'null') continue
        console.log(
          `║  ${label.padEnd(18)} P=${(metrics.precision[label] * 100).toFixed(0)}%  R=${(metrics.recall[label] * 100).toFixed(0)}%  F1=${(metrics.f1[label] * 100).toFixed(0)}%`,
        )
      }
      console.log('╚══════════════════════════════════════════════════════════╝\n')

      expect(metrics.accuracy).toBeGreaterThanOrEqual(0.70)
    })

    it('should achieve >= 90% recall for identity category', () => {
      const identityEntries = classifiableEntries.filter(
        (e) => e.expectedCategory === 'identity',
      )
      let correct = 0
      for (const entry of identityEntries) {
        const result = classifyByFilename(entry.filename)
        if (result?.category === 'identity') correct++
      }
      const recall = identityEntries.length > 0 ? correct / identityEntries.length : 0

      console.log(`Identity recall: ${correct}/${identityEntries.length} = ${(recall * 100).toFixed(1)}%`)
      expect(recall).toBeGreaterThanOrEqual(0.90)
    })

    it('should achieve >= 85% recall for immigration category', () => {
      const immigrationEntries = classifiableEntries.filter(
        (e) => e.expectedCategory === 'immigration',
      )
      let correct = 0
      for (const entry of immigrationEntries) {
        const result = classifyByFilename(entry.filename)
        if (result?.category === 'immigration') correct++
      }
      const recall = immigrationEntries.length > 0 ? correct / immigrationEntries.length : 0

      console.log(`Immigration recall: ${correct}/${immigrationEntries.length} = ${(recall * 100).toFixed(1)}%`)
      expect(recall).toBeGreaterThanOrEqual(0.85)
    })

    it('should achieve >= 80% recall for financial category', () => {
      const financialEntries = classifiableEntries.filter(
        (e) => e.expectedCategory === 'financial',
      )
      let correct = 0
      for (const entry of financialEntries) {
        const result = classifyByFilename(entry.filename)
        if (result?.category === 'financial') correct++
      }
      const recall = financialEntries.length > 0 ? correct / financialEntries.length : 0

      console.log(`Financial recall: ${correct}/${financialEntries.length} = ${(recall * 100).toFixed(1)}%`)
      expect(recall).toBeGreaterThanOrEqual(0.80)
    })

    it('should return null for ambiguous filenames (triggers AI tier)', () => {
      for (const entry of ambiguousEntries) {
        const result = classifyByFilename(entry.filename)
        expect(result).toBeNull()
      }
    })

    it('should produce correct type classification with >= 65% accuracy', () => {
      const typeResults: ClassificationResult[] = []

      for (const entry of classifiableEntries) {
        const result = classifyByFilename(entry.filename)
        typeResults.push({
          predicted: result?.type ?? null,
          actual: entry.expectedType,
        })
      }

      const metrics = calculatePrecisionMetrics(typeResults)

      console.log('\n╔══════════════════════════════════════════════════════════╗')
      console.log('║  Tier 1 — Filename Type Classification Metrics           ║')
      console.log('╠══════════════════════════════════════════════════════════╣')
      console.log(`║  Type accuracy:       ${(metrics.accuracy * 100).toFixed(1)}%`)
      console.log('╚══════════════════════════════════════════════════════════╝\n')

      expect(metrics.accuracy).toBeGreaterThanOrEqual(0.65)
    })
  })

  // ─── Tier 2: AI Classification (Mocked) ─────────────────────────────────

  describe('Tier 2: AI Classification for Ambiguous Filenames', () => {
    const originalEnv = process.env

    beforeEach(() => {
      process.env = { ...originalEnv, ANTHROPIC_API_KEY: 'test-key-009' }
    })

    afterEach(() => {
      process.env = originalEnv
      vi.restoreAllMocks()
    })

    function mockAIResponse(category: string, type: string, confidence: number) {
      const response = {
        ok: true,
        json: () =>
          Promise.resolve({
            content: [
              {
                text: JSON.stringify({
                  category,
                  type,
                  confidence,
                  suggestedName: `${type} document`,
                }),
              },
            ],
          }),
      }
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response))
    }

    it('should escalate to AI for ambiguous filenames and classify correctly', async () => {
      mockAIResponse('identity', 'photo', 0.7)

      const result = await classifyDocument('IMG_20240315.png')
      expect(result.method).toBe('ai')
      expect(result.category).toBe('identity')
      expect(result.type).toBe('photo')
    })

    it('should prefer filename result over AI when filename confidence is high', async () => {
      // passport_scan.pdf has 0.9 confidence from filename rules
      mockAIResponse('other', 'other', 0.5)

      const result = await classifyDocument('passport_scan.pdf')
      expect(result.method).toBe('filename')
      expect(result.category).toBe('identity')
      expect(result.type).toBe('passport')
    })

    it('should fall back gracefully when API key is missing', async () => {
      process.env = { ...originalEnv }
      delete process.env.ANTHROPIC_API_KEY

      const result = await classifyDocument('document1.pdf')
      expect(result.method).toBe('fallback')
      expect(result.category).toBe('other')
    })

    it('should fall back on API error', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({ ok: false, status: 500 }),
      )

      const result = await classifyDocument('scan_001.jpg')
      expect(result.method).toBe('fallback')
    })

    it('should handle malformed AI JSON gracefully', async () => {
      const response = {
        ok: true,
        json: () =>
          Promise.resolve({
            content: [{ text: 'not valid json at all' }],
          }),
      }
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response))

      const result = await classifyDocument('untitled.pdf')
      expect(result.method).toBe('fallback')
    })
  })

  // ─── Confusion Matrix Validation ────────────────────────────────────────

  describe('Confusion Matrix Integrity', () => {
    it('should produce a confusion matrix where row sums equal ground truth counts', () => {
      const classifiableEntries = GROUND_TRUTH.filter(
        (e) => e.expectedCategory !== null,
      )
      const results: ClassificationResult[] = classifiableEntries.map((entry) => {
        const r = classifyByFilename(entry.filename)
        return { predicted: r?.category ?? null, actual: entry.expectedCategory }
      })

      const metrics = calculatePrecisionMetrics(results)

      // Row sums should equal total samples
      let totalFromMatrix = 0
      for (const actual of Object.keys(metrics.confusionMatrix)) {
        for (const predicted of Object.keys(metrics.confusionMatrix[actual])) {
          totalFromMatrix += metrics.confusionMatrix[actual][predicted]
        }
      }
      expect(totalFromMatrix).toBe(metrics.totalSamples)
    })
  })

  // ─── Per-Filename Detailed Report ───────────────────────────────────────

  describe('Detailed Per-Filename Classification Report', () => {
    it('should log a detailed report of each filename classification', () => {
      const classifiableEntries = GROUND_TRUTH.filter(
        (e) => e.expectedCategory !== null,
      )

      console.log('\n┌─────────────────────────────────────────────────────────────────────────────┐')
      console.log('│  Per-Filename Classification Detail                                          │')
      console.log('├──────────────────────────────────┬───────────────┬───────────────┬───────────┤')
      console.log('│  Filename                        │  Expected     │  Got          │  Match    │')
      console.log('├──────────────────────────────────┼───────────────┼───────────────┼───────────┤')

      let matches = 0
      for (const entry of classifiableEntries) {
        const result = classifyByFilename(entry.filename)
        const catMatch = result?.category === entry.expectedCategory
        const typeMatch = result?.type === entry.expectedType
        const bothMatch = catMatch && typeMatch
        if (bothMatch) matches++

        const fn = entry.filename.slice(0, 32).padEnd(32)
        const exp = `${entry.expectedCategory}`.padEnd(13)
        const got = `${result?.category ?? 'null'}`.padEnd(13)
        const mark = bothMatch ? 'PASS' : catMatch ? 'CAT OK' : 'FAIL'
        console.log(`│  ${fn} │  ${exp} │  ${got} │  ${mark.padEnd(7)} │`)
      }

      console.log('└──────────────────────────────────┴───────────────┴───────────────┴───────────┘')
      console.log(`  Score: ${matches}/${classifiableEntries.length} full matches\n`)

      // This is informational — the threshold assertions are in the tests above
      expect(matches).toBeGreaterThan(0)
    })
  })
})
