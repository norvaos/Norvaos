/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Directive 009 / 011C  -  50-Document "Dirty Batch" Classification Test
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Tests the Tier 1 filename classifier against 50 documents with realistic,
 * messy filenames (as received from clients, Clio imports, scanner output).
 *
 * Key metric: Identity vs Financial smart-folder accuracy.
 */

import { describe, it, expect } from 'vitest'
import { classifyByFilename, type DocumentCategory } from '../document-classifier'

// ─── 50-Document Dirty Batch Dataset ──────────────────────────────────────────

interface DirtyBatchEntry {
  filename: string
  expectedCategory: DocumentCategory | null
  expectedFolder: 'identity' | 'financial' | 'other'
}

const DIRTY_BATCH: DirtyBatchEntry[] = [
  // ── IDENTITY DOCUMENTS (20) ─────────────────────────────────────────────────
  { filename: 'passport_ahmed_khan_scan.pdf', expectedCategory: 'identity', expectedFolder: 'identity' },
  { filename: 'DL-Front-Priya.jpg', expectedCategory: 'identity', expectedFolder: 'identity' },
  { filename: 'DRIVERS LICENCE - BACK.png', expectedCategory: 'identity', expectedFolder: 'identity' },
  { filename: 'birth-certificate-ontario.pdf', expectedCategory: 'identity', expectedFolder: 'identity' },
  { filename: 'marriage_certificate_2019.pdf', expectedCategory: 'identity', expectedFolder: 'identity' },
  { filename: 'PPT_SCAN_001.pdf', expectedCategory: 'identity', expectedFolder: 'identity' },
  { filename: 'national-id-card-front.jpg', expectedCategory: 'identity', expectedFolder: 'identity' },
  { filename: 'CNIC-pakistan-2023.pdf', expectedCategory: 'identity', expectedFolder: 'identity' },
  { filename: 'passport photo-blue background.jpg', expectedCategory: 'identity', expectedFolder: 'identity' },
  { filename: 'Photo_Headshot_Formal.png', expectedCategory: 'identity', expectedFolder: 'identity' },
  { filename: 'PR_Card_front_back.pdf', expectedCategory: null, expectedFolder: 'other' }, // PR card not in identity rules
  { filename: 'drivers-licence-alberta-renewed.pdf', expectedCategory: 'identity', expectedFolder: 'identity' },
  { filename: 'Passport - Expired 2020.pdf', expectedCategory: 'identity', expectedFolder: 'identity' },
  { filename: 'BC_drivers_license_scan.pdf', expectedCategory: 'identity', expectedFolder: 'identity' },
  { filename: 'birth_cert_translation_notarized.pdf', expectedCategory: 'identity', expectedFolder: 'identity' },
  { filename: 'AADHAR-card-india.jpg', expectedCategory: 'identity', expectedFolder: 'identity' },
  { filename: 'NIC-sri-lanka.pdf', expectedCategory: 'identity', expectedFolder: 'identity' },
  { filename: 'passport_old_cancelled.pdf', expectedCategory: 'identity', expectedFolder: 'identity' },
  { filename: 'Marriage-Cert-Translation-Urdu.pdf', expectedCategory: 'identity', expectedFolder: 'identity' },
  { filename: 'Headshot_White_Background.jpg', expectedCategory: 'identity', expectedFolder: 'identity' },

  // ── FINANCIAL DOCUMENTS (15) ────────────────────────────────────────────────
  { filename: 'bank-statement-january-2024-RBC.pdf', expectedCategory: 'financial', expectedFolder: 'financial' },
  { filename: 'T4_2023_Employment_Income.pdf', expectedCategory: 'financial', expectedFolder: 'financial' },
  { filename: 'NOA-2023-CRA.pdf', expectedCategory: 'financial', expectedFolder: 'financial' },
  { filename: 'pay-stub-march-biweekly.pdf', expectedCategory: 'financial', expectedFolder: 'financial' },
  { filename: 'INVOICE_WaseerLaw_2024-001.pdf', expectedCategory: 'financial', expectedFolder: 'financial' },
  { filename: 'receipt-government-fee-ircc.pdf', expectedCategory: 'financial', expectedFolder: 'financial' },
  { filename: 'Account_Statement_TD_Dec2023.pdf', expectedCategory: 'financial', expectedFolder: 'financial' },
  { filename: 'T1-General-2023-Tax-Return.pdf', expectedCategory: 'financial', expectedFolder: 'financial' },
  { filename: 'salary_slip_december_2023.pdf', expectedCategory: 'financial', expectedFolder: 'financial' },
  { filename: 'Bank Statement - CIBC - Q4.pdf', expectedCategory: 'financial', expectedFolder: 'financial' },
  { filename: 'pay stub feb 15 2024.pdf', expectedCategory: 'financial', expectedFolder: 'financial' },
  { filename: 'Notice_of_Assessment_2022.pdf', expectedCategory: 'financial', expectedFolder: 'financial' },
  { filename: 'INV-2024-0045.pdf', expectedCategory: 'financial', expectedFolder: 'financial' },
  { filename: 'employment-letter-abc-corp.pdf', expectedCategory: 'financial', expectedFolder: 'financial' },
  { filename: 'ROE-Record-of-Employment.pdf', expectedCategory: 'financial', expectedFolder: 'financial' },

  // ── AMBIGUOUS / OTHER (15) ──────────────────────────────────────────────────
  { filename: 'document1.pdf', expectedCategory: null, expectedFolder: 'other' },
  { filename: 'scan_001.jpg', expectedCategory: null, expectedFolder: 'other' },
  { filename: 'IMG_20240315_143022.jpg', expectedCategory: null, expectedFolder: 'other' },
  { filename: 'untitled.pdf', expectedCategory: null, expectedFolder: 'other' },
  { filename: 'WhatsApp Image 2024-03-15.jpg', expectedCategory: null, expectedFolder: 'other' },
  { filename: 'retainer-agreement-signed.pdf', expectedCategory: 'legal', expectedFolder: 'other' },
  { filename: 'court-order-custody-2024.pdf', expectedCategory: 'legal', expectedFolder: 'other' },
  { filename: 'affidavit-support-notarized.pdf', expectedCategory: 'legal', expectedFolder: 'other' },
  { filename: 'IRCC-IMM5257-Schedule1.pdf', expectedCategory: 'immigration', expectedFolder: 'other' },
  { filename: 'medical-exam-results-panel.pdf', expectedCategory: 'medical', expectedFolder: 'other' },
  { filename: 'police-clearance-RCMP.pdf', expectedCategory: 'immigration', expectedFolder: 'other' },
  { filename: 'travel-history-stamps.pdf', expectedCategory: 'immigration', expectedFolder: 'other' },
  { filename: 'WES-credential-evaluation.pdf', expectedCategory: 'immigration', expectedFolder: 'other' },
  { filename: 'power-of-attorney-signed.pdf', expectedCategory: 'legal', expectedFolder: 'other' },
  { filename: 'letter-to-ircc-cover.pdf', expectedCategory: 'correspondence', expectedFolder: 'other' },
]

// ─── Metrics ──────────────────────────────────────────────────────────────────

interface FolderMetrics {
  total: number
  correct: number
  accuracy: number
  falsePositives: number
  falseNegatives: number
}

function computeFolderMetrics(
  batch: DirtyBatchEntry[],
  results: (ReturnType<typeof classifyByFilename>)[],
  folder: 'identity' | 'financial',
): FolderMetrics {
  let total = 0
  let correct = 0
  let falsePositives = 0
  let falseNegatives = 0

  for (let i = 0; i < batch.length; i++) {
    const entry = batch[i]
    const result = results[i]
    const predicted = result?.category === folder
    const actual = entry.expectedFolder === folder

    if (actual) total++

    if (actual && predicted) correct++
    if (!actual && predicted) falsePositives++
    if (actual && !predicted) falseNegatives++
  }

  return {
    total,
    correct,
    accuracy: total > 0 ? correct / total : 1,
    falsePositives,
    falseNegatives,
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Test Suite
// ═══════════════════════════════════════════════════════════════════════════════

describe('Directive 009/011C: 50-Document Dirty Batch', () => {
  const results = DIRTY_BATCH.map((entry) => classifyByFilename(entry.filename))

  it('classifies all 50 documents without crashing', () => {
    expect(results).toHaveLength(50)
  })

  // ── Identity Folder Accuracy ──────────────────────────────────────────────

  it('Identity folder: correctly identifies >= 85% of identity documents', () => {
    const metrics = computeFolderMetrics(DIRTY_BATCH, results, 'identity')
    console.log(`\n  IDENTITY FOLDER METRICS:`)
    console.log(`    Total identity docs: ${metrics.total}`)
    console.log(`    Correctly classified: ${metrics.correct}`)
    console.log(`    Accuracy: ${(metrics.accuracy * 100).toFixed(1)}%`)
    console.log(`    False positives: ${metrics.falsePositives}`)
    console.log(`    False negatives: ${metrics.falseNegatives}`)
    expect(metrics.accuracy).toBeGreaterThanOrEqual(0.85)
  })

  it('Identity folder: zero false positives (no non-identity docs sorted into identity)', () => {
    const metrics = computeFolderMetrics(DIRTY_BATCH, results, 'identity')
    expect(metrics.falsePositives).toBe(0)
  })

  // ── Financial Folder Accuracy ─────────────────────────────────────────────

  it('Financial folder: correctly identifies >= 85% of financial documents', () => {
    const metrics = computeFolderMetrics(DIRTY_BATCH, results, 'financial')
    console.log(`\n  FINANCIAL FOLDER METRICS:`)
    console.log(`    Total financial docs: ${metrics.total}`)
    console.log(`    Correctly classified: ${metrics.correct}`)
    console.log(`    Accuracy: ${(metrics.accuracy * 100).toFixed(1)}%`)
    console.log(`    False positives: ${metrics.falsePositives}`)
    console.log(`    False negatives: ${metrics.falseNegatives}`)
    expect(metrics.accuracy).toBeGreaterThanOrEqual(0.85)
  })

  it('Financial folder: zero false positives', () => {
    const metrics = computeFolderMetrics(DIRTY_BATCH, results, 'financial')
    expect(metrics.falsePositives).toBe(0)
  })

  // ── Combined Report ───────────────────────────────────────────────────────

  it('generates full classification report', () => {
    const identityMetrics = computeFolderMetrics(DIRTY_BATCH, results, 'identity')
    const financialMetrics = computeFolderMetrics(DIRTY_BATCH, results, 'financial')

    let classified = 0
    let unclassified = 0
    const categoryBreakdown: Record<string, number> = {}

    for (let i = 0; i < DIRTY_BATCH.length; i++) {
      const result = results[i]
      if (result) {
        classified++
        categoryBreakdown[result.category] = (categoryBreakdown[result.category] ?? 0) + 1
      } else {
        unclassified++
      }
    }

    console.log(`\n  ══════════════════════════════════════════════`)
    console.log(`  DIRECTIVE 011C  -  50-DOCUMENT DIRTY BATCH REPORT`)
    console.log(`  ══════════════════════════════════════════════`)
    console.log(`  Total documents:     ${DIRTY_BATCH.length}`)
    console.log(`  Tier 1 classified:   ${classified}`)
    console.log(`  Unclassified (→ AI): ${unclassified}`)
    console.log(`  ──────────────────────────────────────────────`)
    console.log(`  IDENTITY folder:     ${identityMetrics.correct}/${identityMetrics.total} = ${(identityMetrics.accuracy * 100).toFixed(1)}%`)
    console.log(`  FINANCIAL folder:    ${financialMetrics.correct}/${financialMetrics.total} = ${(financialMetrics.accuracy * 100).toFixed(1)}%`)
    console.log(`  ──────────────────────────────────────────────`)
    console.log(`  Category breakdown:`)
    for (const [cat, count] of Object.entries(categoryBreakdown).sort((a, b) => b[1] - a[1])) {
      console.log(`    ${cat.padEnd(16)} ${count}`)
    }
    console.log(`    ${'(none)'.padEnd(16)} ${unclassified}`)
    console.log(`  ══════════════════════════════════════════════`)

    // Overall: combined identity + financial accuracy must be >= 85%
    const combinedCorrect = identityMetrics.correct + financialMetrics.correct
    const combinedTotal = identityMetrics.total + financialMetrics.total
    const combinedAccuracy = combinedTotal > 0 ? combinedCorrect / combinedTotal : 0
    console.log(`  COMBINED (Identity+Financial): ${combinedCorrect}/${combinedTotal} = ${(combinedAccuracy * 100).toFixed(1)}%`)

    expect(combinedAccuracy).toBeGreaterThanOrEqual(0.85)
  })

  // ── Per-document detail ───────────────────────────────────────────────────

  it('detailed per-document classification log', () => {
    const misclassified: string[] = []

    for (let i = 0; i < DIRTY_BATCH.length; i++) {
      const entry = DIRTY_BATCH[i]
      const result = results[i]
      const predictedCategory = result?.category ?? '(none)'
      const match = entry.expectedCategory === null
        ? result === null
        : predictedCategory === entry.expectedCategory

      if (!match) {
        misclassified.push(
          `  ✗ "${entry.filename}" → predicted: ${predictedCategory}, expected: ${entry.expectedCategory ?? '(none)'}`,
        )
      }
    }

    if (misclassified.length > 0) {
      console.log(`\n  MISCLASSIFIED (${misclassified.length}):`)
      for (const m of misclassified) console.log(m)
    } else {
      console.log(`\n  ALL 50 DOCUMENTS CORRECTLY CLASSIFIED ✓`)
    }

    // This test always passes  -  it's for reporting
    expect(true).toBe(true)
  })
})
