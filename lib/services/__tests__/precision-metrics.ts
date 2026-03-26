/**
 * Precision Metrics Calculator — Directive 009
 * Calculates accuracy, precision, recall, F1 for classification benchmarks
 * and field-level extraction accuracy for OCR benchmarks.
 */

// ── Classification Metrics ──────────────────────────────────────────────────

export interface ClassificationResult {
  predicted: string | null
  actual: string | null
}

export interface PrecisionMetrics {
  accuracy: number
  precision: Record<string, number>
  recall: Record<string, number>
  f1: Record<string, number>
  confusionMatrix: Record<string, Record<string, number>>
  totalSamples: number
  correctPredictions: number
}

/**
 * Calculate precision, recall, F1, and accuracy from a set of classification results.
 * Treats null predictions/actuals as the literal label "null" for confusion matrix purposes.
 */
export function calculatePrecisionMetrics(results: ClassificationResult[]): PrecisionMetrics {
  const totalSamples = results.length
  if (totalSamples === 0) {
    return {
      accuracy: 0,
      precision: {},
      recall: {},
      f1: {},
      confusionMatrix: {},
      totalSamples: 0,
      correctPredictions: 0,
    }
  }

  // Normalise null → "null" for label tracking
  const norm = (v: string | null): string => v ?? 'null'

  // Collect all unique labels
  const allLabels = new Set<string>()
  for (const r of results) {
    allLabels.add(norm(r.predicted))
    allLabels.add(norm(r.actual))
  }

  // Build confusion matrix: confusionMatrix[actual][predicted] = count
  const confusionMatrix: Record<string, Record<string, number>> = {}
  for (const label of allLabels) {
    confusionMatrix[label] = {}
    for (const pred of allLabels) {
      confusionMatrix[label][pred] = 0
    }
  }

  let correctPredictions = 0
  for (const r of results) {
    const actual = norm(r.actual)
    const predicted = norm(r.predicted)
    confusionMatrix[actual][predicted] = (confusionMatrix[actual][predicted] ?? 0) + 1
    if (actual === predicted) correctPredictions++
  }

  const accuracy = correctPredictions / totalSamples

  // Per-label precision, recall, F1
  const precision: Record<string, number> = {}
  const recall: Record<string, number> = {}
  const f1: Record<string, number> = {}

  for (const label of allLabels) {
    // True positives: predicted=label AND actual=label
    let tp = confusionMatrix[label]?.[label] ?? 0

    // False positives: predicted=label but actual!=label (sum column for this label, minus TP)
    let fp = 0
    for (const actualLabel of allLabels) {
      if (actualLabel !== label) {
        fp += confusionMatrix[actualLabel]?.[label] ?? 0
      }
    }

    // False negatives: actual=label but predicted!=label (sum row for this label, minus TP)
    let fn = 0
    for (const predLabel of allLabels) {
      if (predLabel !== label) {
        fn += confusionMatrix[label]?.[predLabel] ?? 0
      }
    }

    precision[label] = tp + fp > 0 ? tp / (tp + fp) : 0
    recall[label] = tp + fn > 0 ? tp / (tp + fn) : 0
    f1[label] =
      precision[label] + recall[label] > 0
        ? (2 * precision[label] * recall[label]) / (precision[label] + recall[label])
        : 0
  }

  return {
    accuracy,
    precision,
    recall,
    f1,
    confusionMatrix,
    totalSamples,
    correctPredictions,
  }
}

// ── Field Extraction Metrics ────────────────────────────────────────────────

export interface FieldExtractionResult {
  field: string
  extracted: string | null
  expected: string | null
  match: boolean
}

export interface ExtractionMetrics {
  overallAccuracy: number
  perFieldAccuracy: Record<string, number>
  totalFields: number
  correctFields: number
  missingFields: number
  incorrectFields: number
}

/**
 * Calculate overall and per-field extraction accuracy from a set of field results.
 */
export function calculateExtractionMetrics(results: FieldExtractionResult[]): ExtractionMetrics {
  if (results.length === 0) {
    return {
      overallAccuracy: 0,
      perFieldAccuracy: {},
      totalFields: 0,
      correctFields: 0,
      missingFields: 0,
      incorrectFields: 0,
    }
  }

  let correctFields = 0
  let missingFields = 0
  let incorrectFields = 0

  // Group by field name for per-field accuracy
  const fieldCounts: Record<string, { total: number; correct: number }> = {}

  for (const r of results) {
    if (!fieldCounts[r.field]) {
      fieldCounts[r.field] = { total: 0, correct: 0 }
    }
    fieldCounts[r.field].total++

    if (r.match) {
      correctFields++
      fieldCounts[r.field].correct++
    } else if (r.extracted === null && r.expected !== null) {
      missingFields++
    } else {
      incorrectFields++
    }
  }

  const totalFields = results.length
  const overallAccuracy = totalFields > 0 ? correctFields / totalFields : 0

  const perFieldAccuracy: Record<string, number> = {}
  for (const [field, counts] of Object.entries(fieldCounts)) {
    perFieldAccuracy[field] = counts.total > 0 ? counts.correct / counts.total : 0
  }

  return {
    overallAccuracy,
    perFieldAccuracy,
    totalFields,
    correctFields,
    missingFields,
    incorrectFields,
  }
}

// ── Fuzzy String Matching ───────────────────────────────────────────────────

/**
 * Fuzzy comparison for extracted vs expected field values.
 * Handles case differences, whitespace normalisation, and date format variations.
 *
 * @param extracted - The value extracted by the parser
 * @param expected  - The ground-truth expected value
 * @param threshold - Minimum similarity ratio (0-1) for a match. Default 0.85.
 * @returns true if the values are considered a match
 */
export function fuzzyFieldMatch(
  extracted: string | null,
  expected: string | null,
  threshold: number = 0.85,
): boolean {
  // Both null → match
  if (extracted === null && expected === null) return true
  // One null → no match
  if (extracted === null || expected === null) return false

  // Normalise: lowercase, collapse whitespace, trim, strip punctuation at edges
  const normA = normalise(extracted)
  const normB = normalise(expected)

  // Exact match after normalisation
  if (normA === normB) return true

  // Date format equivalence: try to parse both as dates
  const dateA = parseDateLoose(normA)
  const dateB = parseDateLoose(normB)
  if (dateA && dateB && dateA === dateB) return true

  // Levenshtein similarity
  const similarity = levenshteinSimilarity(normA, normB)
  if (similarity >= threshold) return true

  // Containment: if one string fully contains the other (for partial extractions)
  if (normA.length > 3 && normB.length > 3) {
    if (normA.includes(normB) || normB.includes(normA)) return true
  }

  return false
}

// ── Internal helpers ────────────────────────────────────────────────────────

function normalise(s: string): string {
  return s
    .toLowerCase()
    .replace(/[,.'":;!?]+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Attempt loose date parsing: returns YYYY-MM-DD or null.
 * Supports ISO, slash, "15 JAN 1988", "January 15, 1988", etc.
 */
function parseDateLoose(s: string): string | null {
  // Already ISO
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`

  // YYYY/MM/DD
  const slashYMD = s.match(/^(\d{4})[/.](\d{1,2})[/.](\d{1,2})$/)
  if (slashYMD) return `${slashYMD[1]}-${slashYMD[2].padStart(2, '0')}-${slashYMD[3].padStart(2, '0')}`

  // DD/MM/YYYY or DD-MM-YYYY
  const dmy = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/)
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`

  const months: Record<string, string> = {
    january: '01', february: '02', march: '03', april: '04', may: '05', june: '06',
    july: '07', august: '08', september: '09', october: '10', november: '11', december: '12',
    jan: '01', feb: '02', mar: '03', apr: '04', jun: '06', jul: '07',
    aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
  }

  // "15 JAN 1988" or "15 January 1988"
  const dmy2 = s.match(/^(\d{1,2})\s+([a-z]+)\s+(\d{4})$/i)
  if (dmy2) {
    const mon = months[dmy2[2].toLowerCase()]
    if (mon) return `${dmy2[3]}-${mon}-${dmy2[1].padStart(2, '0')}`
  }

  // "January 15, 1988" or "Jan 15 1988"
  const mdy = s.match(/^([a-z]+)\s+(\d{1,2}),?\s+(\d{4})$/i)
  if (mdy) {
    const mon = months[mdy[1].toLowerCase()]
    if (mon) return `${mdy[3]}-${mon}-${mdy[2].padStart(2, '0')}`
  }

  return null
}

/**
 * Levenshtein distance-based similarity ratio (0-1).
 */
function levenshteinSimilarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length)
  if (maxLen === 0) return 1

  const dist = levenshteinDistance(a, b)
  return 1 - dist / maxLen
}

function levenshteinDistance(a: string, b: string): number {
  const m = a.length
  const n = b.length

  // Use single-row optimisation
  const prev = new Array(n + 1)
  const curr = new Array(n + 1)

  for (let j = 0; j <= n; j++) prev[j] = j

  for (let i = 1; i <= m; i++) {
    curr[0] = i
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      curr[j] = Math.min(
        curr[j - 1] + 1,      // insert
        prev[j] + 1,          // delete
        prev[j - 1] + cost,   // substitute
      )
    }
    for (let j = 0; j <= n; j++) prev[j] = curr[j]
  }

  return prev[n]
}
