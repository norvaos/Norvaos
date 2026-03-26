/**
 * OCR Identity Comparator — Directive 41.3, Item 3
 *
 * Compares OCR-extracted passport/ID fields against the contact profile.
 * Used to auto-detect identity mismatches after document scanning.
 *
 * Logic:
 *   - Name: case-insensitive, trimmed, Levenshtein distance <= 2 (OCR tolerance)
 *   - DOB: exact match on YYYY-MM-DD string
 *   - Overall: both must pass
 */

export interface OcrExtractedFields {
  given_name?: string
  family_name?: string
  first_name?: string
  last_name?: string
  date_of_birth?: string
  [key: string]: string | undefined
}

export interface ContactProfile {
  first_name: string | null
  last_name: string | null
  date_of_birth: string | null // YYYY-MM-DD
}

export interface IdentityComparisonResult {
  nameMatch: boolean
  dobMatch: boolean
  overallMatch: boolean
  mismatches: string[]
  /** The extracted values that were compared */
  extracted: {
    name: string | null
    dob: string | null
  }
  /** The profile values that were compared against */
  profile: {
    name: string | null
    dob: string | null
  }
}

/**
 * Levenshtein distance — edit distance between two strings.
 * Used to tolerate minor OCR misreads (e.g., "INAAYA" vs "INAAVA").
 */
function levenshtein(a: string, b: string): number {
  const matrix: number[][] = []
  for (let i = 0; i <= a.length; i++) {
    matrix[i] = [i]
  }
  for (let j = 0; j <= b.length; j++) {
    matrix[0][j] = j
  }
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,     // deletion
        matrix[i][j - 1] + 1,     // insertion
        matrix[i - 1][j - 1] + cost // substitution
      )
    }
  }
  return matrix[a.length][b.length]
}

/** Normalise a name for comparison: trim, uppercase, collapse whitespace */
function normaliseName(name: string | null | undefined): string {
  if (!name) return ''
  return name.trim().toUpperCase().replace(/\s+/g, ' ')
}

/** Normalise a date string to YYYY-MM-DD */
function normaliseDate(date: string | null | undefined): string {
  if (!date) return ''
  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) return date
  // Try DD/MM/YYYY or DD-MM-YYYY
  const dmy = date.match(/^(\d{2})[/-](\d{2})[/-](\d{4})$/)
  if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`
  return date
}

const OCR_NAME_TOLERANCE = 2 // max Levenshtein distance

export function compareIdentity(
  extracted: OcrExtractedFields,
  profile: ContactProfile
): IdentityComparisonResult {
  const mismatches: string[] = []

  // Resolve extracted name (OCR uses various key names)
  const extractedFirst = normaliseName(extracted.given_name ?? extracted.first_name)
  const extractedLast = normaliseName(extracted.family_name ?? extracted.last_name)
  const extractedFullName = `${extractedFirst} ${extractedLast}`.trim()

  // Profile name
  const profileFirst = normaliseName(profile.first_name)
  const profileLast = normaliseName(profile.last_name)
  const profileFullName = `${profileFirst} ${profileLast}`.trim()

  // Name comparison with Levenshtein tolerance
  let nameMatch = false
  if (extractedFullName && profileFullName) {
    const firstDist = levenshtein(extractedFirst, profileFirst)
    const lastDist = levenshtein(extractedLast, profileLast)
    nameMatch = firstDist <= OCR_NAME_TOLERANCE && lastDist <= OCR_NAME_TOLERANCE
  }
  if (!nameMatch && extractedFullName && profileFullName) {
    mismatches.push(
      `Name mismatch: OCR detected "${extractedFullName}" but profile has "${profileFullName}"`
    )
  }

  // DOB comparison — exact match
  const extractedDob = normaliseDate(extracted.date_of_birth)
  const profileDob = normaliseDate(profile.date_of_birth)
  const dobMatch = !!extractedDob && !!profileDob && extractedDob === profileDob
  if (!dobMatch && extractedDob && profileDob) {
    mismatches.push(
      `DOB mismatch: OCR detected "${extractedDob}" but profile has "${profileDob}"`
    )
  }

  // If either is missing, we can't verify — not a mismatch but not a match
  if (!extractedFullName) mismatches.push('OCR could not extract a name from the document')
  if (!extractedDob) mismatches.push('OCR could not extract a date of birth from the document')

  const overallMatch = nameMatch && dobMatch

  return {
    nameMatch,
    dobMatch,
    overallMatch,
    mismatches,
    extracted: {
      name: extractedFullName || null,
      dob: extractedDob || null,
    },
    profile: {
      name: profileFullName || null,
      dob: profileDob || null,
    },
  }
}
