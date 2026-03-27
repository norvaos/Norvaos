/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * MRZ Validator  -  ICAO 9303 Checksum (Directive 082)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Validates Machine Readable Zone (MRZ) strings from passports using the
 * ICAO Document 9303 check digit algorithm.
 *
 * The MRZ on a TD3 passport has two lines of 44 characters each:
 *   Line 1: P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<
 *   Line 2: L898902C36UTO7408122F1204159ZE184226B<<<<<10
 *
 * Check digits use modulo 10 weighting: [7, 3, 1, 7, 3, 1, ...]
 *
 * Pure function module  -  no side effects, no DB, no I/O.
 * Used by the ID Scanner API route to validate OCR accuracy.
 */

// ── Types ────────────────────────────────────────────────────────────────────

export interface MrzValidationResult {
  /** Whether the MRZ passed all check digit validations */
  valid: boolean
  /** Parsed identity fields (only if structure was parseable) */
  fields: MrzFields | null
  /** Per-field check digit results */
  checks: MrzCheckResult[]
  /** Human-readable errors */
  errors: string[]
  /** Raw MRZ lines that were parsed */
  rawLines: string[]
}

export interface MrzFields {
  documentType: string
  issuingCountry: string
  surname: string
  givenNames: string
  documentNumber: string
  nationality: string
  dateOfBirth: string     // YYMMDD → YYYY-MM-DD
  sex: string             // M | F | <
  expiryDate: string      // YYMMDD → YYYY-MM-DD
  personalNumber: string
}

export interface MrzCheckResult {
  field: string
  value: string
  expectedDigit: number
  actualDigit: number
  valid: boolean
}

// ── Character Value Map (ICAO 9303 Part 3 Section 4.9) ──────────────────────

const CHAR_VALUES: Record<string, number> = {
  '<': 0,
  '0': 0, '1': 1, '2': 2, '3': 3, '4': 4,
  '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
  'A': 10, 'B': 11, 'C': 12, 'D': 13, 'E': 14,
  'F': 15, 'G': 16, 'H': 17, 'I': 18, 'J': 19,
  'K': 20, 'L': 21, 'M': 22, 'N': 23, 'O': 24,
  'P': 25, 'Q': 26, 'R': 27, 'S': 28, 'T': 29,
  'U': 30, 'V': 31, 'W': 32, 'X': 33, 'Y': 34,
  'Z': 35,
}

/** Weighting pattern: 7, 3, 1, repeating */
const WEIGHTS = [7, 3, 1]

// ── Core Check Digit Algorithm ──────────────────────────────────────────────

/**
 * Compute the ICAO 9303 check digit for a string.
 * Each character is assigned a numeric value, multiplied by its
 * positional weight (7, 3, 1, 7, 3, 1, ...), summed, and taken mod 10.
 */
export function computeCheckDigit(input: string): number {
  let sum = 0
  for (let i = 0; i < input.length; i++) {
    const char = input[i].toUpperCase()
    const value = CHAR_VALUES[char]
    if (value === undefined) {
      // Unknown character  -  treat as 0 (filler)
      continue
    }
    sum += value * WEIGHTS[i % 3]
  }
  return sum % 10
}

/**
 * Validate a check digit field.
 * Returns true if the computed check digit matches the actual digit.
 */
export function validateCheckDigit(data: string, checkDigit: string): boolean {
  const expected = computeCheckDigit(data)
  const actual = parseInt(checkDigit, 10)
  return !isNaN(actual) && expected === actual
}

// ── TD3 Passport MRZ Parser (2-line × 44 chars) ────────────────────────────

/**
 * Validate and parse a TD3 passport MRZ (two lines of 44 characters).
 *
 * Line 1 (44 chars):
 *   [0-1]   Document type (P, P<, etc.)
 *   [2-4]   Issuing country (3-letter code)
 *   [5-43]  Names (Surname<<Given<Names)
 *
 * Line 2 (44 chars):
 *   [0-8]   Document number
 *   [9]     Check digit for document number
 *   [10-12] Nationality
 *   [13-18] Date of birth (YYMMDD)
 *   [19]    Check digit for DOB
 *   [20]    Sex (M/F/<)
 *   [21-26] Expiry date (YYMMDD)
 *   [27]    Check digit for expiry
 *   [28-41] Personal number / optional data
 *   [42]    Check digit for personal number
 *   [43]    Composite check digit (line 2 positions 0-9 + 13-19 + 21-42)
 */
export function validateTD3(line1: string, line2: string): MrzValidationResult {
  const errors: string[] = []
  const checks: MrzCheckResult[] = []
  const rawLines = [line1, line2]

  // Normalise: uppercase, replace common OCR errors
  const l1 = normaliseMrz(line1)
  const l2 = normaliseMrz(line2)

  // Length check
  if (l1.length !== 44) {
    errors.push(`Line 1 is ${l1.length} characters (expected 44)`)
  }
  if (l2.length !== 44) {
    errors.push(`Line 2 is ${l2.length} characters (expected 44)`)
  }

  if (l1.length < 44 || l2.length < 44) {
    return { valid: false, fields: null, checks, errors, rawLines }
  }

  // ── Parse Line 1 ────────────────────────────────────────────────────────

  const documentType = l1.slice(0, 2).replace(/</g, '')
  const issuingCountry = l1.slice(2, 5).replace(/</g, '')
  const namesBlock = l1.slice(5, 44)
  const nameParts = namesBlock.split('<<')
  const surname = (nameParts[0] ?? '').replace(/</g, ' ').trim()
  const givenNames = (nameParts.slice(1).join(' ') ?? '').replace(/</g, ' ').trim()

  // ── Parse Line 2 ────────────────────────────────────────────────────────

  const documentNumber = l2.slice(0, 9)
  const docCheckChar = l2[9]
  const nationality = l2.slice(10, 13).replace(/</g, '')
  const dob = l2.slice(13, 19)
  const dobCheckChar = l2[19]
  const sex = l2[20]
  const expiry = l2.slice(21, 27)
  const expiryCheckChar = l2[27]
  const personalNumber = l2.slice(28, 42)
  const personalCheckChar = l2[42]
  const compositeCheckChar = l2[43]

  // ── Check Digit 1: Document Number ──────────────────────────────────────

  const docCheck = computeCheckDigit(documentNumber)
  const docActual = parseInt(docCheckChar, 10)
  checks.push({
    field: 'Document Number',
    value: documentNumber.replace(/</g, ''),
    expectedDigit: docCheck,
    actualDigit: docActual,
    valid: docCheck === docActual,
  })
  if (docCheck !== docActual) {
    errors.push(`Document number check digit failed (expected ${docCheck}, got ${docActual})`)
  }

  // ── Check Digit 2: Date of Birth ───────────────────────────────────────

  const dobCheck = computeCheckDigit(dob)
  const dobActual = parseInt(dobCheckChar, 10)
  checks.push({
    field: 'Date of Birth',
    value: dob,
    expectedDigit: dobCheck,
    actualDigit: dobActual,
    valid: dobCheck === dobActual,
  })
  if (dobCheck !== dobActual) {
    errors.push(`Date of birth check digit failed (expected ${dobCheck}, got ${dobActual})`)
  }

  // ── Check Digit 3: Expiry Date ─────────────────────────────────────────

  const expiryCheck = computeCheckDigit(expiry)
  const expiryActual = parseInt(expiryCheckChar, 10)
  checks.push({
    field: 'Expiry Date',
    value: expiry,
    expectedDigit: expiryCheck,
    actualDigit: expiryActual,
    valid: expiryCheck === expiryActual,
  })
  if (expiryCheck !== expiryActual) {
    errors.push(`Expiry date check digit failed (expected ${expiryCheck}, got ${expiryActual})`)
  }

  // ── Check Digit 4: Personal Number ─────────────────────────────────────

  const personalCheck = computeCheckDigit(personalNumber)
  const personalActual = parseInt(personalCheckChar, 10)
  checks.push({
    field: 'Personal Number',
    value: personalNumber.replace(/</g, ''),
    expectedDigit: personalCheck,
    actualDigit: personalActual,
    valid: personalCheck === personalActual,
  })
  if (personalCheck !== personalActual) {
    errors.push(`Personal number check digit failed (expected ${personalCheck}, got ${personalActual})`)
  }

  // ── Check Digit 5: Composite ───────────────────────────────────────────
  // Covers: document number + check + DOB + check + expiry + check + personal number + check
  // = line2[0..9] + line2[13..19] + line2[21..42]

  const compositeInput = l2.slice(0, 10) + l2.slice(13, 20) + l2.slice(21, 43)
  const compositeCheck = computeCheckDigit(compositeInput)
  const compositeActual = parseInt(compositeCheckChar, 10)
  checks.push({
    field: 'Composite',
    value: '(full line 2)',
    expectedDigit: compositeCheck,
    actualDigit: compositeActual,
    valid: compositeCheck === compositeActual,
  })
  if (compositeCheck !== compositeActual) {
    errors.push(`Composite check digit failed (expected ${compositeCheck}, got ${compositeActual})`)
  }

  // ── Build fields ───────────────────────────────────────────────────────

  const fields: MrzFields = {
    documentType,
    issuingCountry,
    surname,
    givenNames,
    documentNumber: documentNumber.replace(/</g, ''),
    nationality,
    dateOfBirth: mrzDateToIso(dob),
    sex,
    expiryDate: mrzDateToIso(expiry),
    personalNumber: personalNumber.replace(/</g, '').trim(),
  }

  const allValid = checks.every((c) => c.valid)

  return {
    valid: allValid,
    fields,
    checks,
    errors,
    rawLines,
  }
}

// ── Convenience: Auto-detect and validate ───────────────────────────────────

/**
 * Auto-detect MRZ format and validate.
 * Accepts a raw string (possibly from OCR) and tries to extract two 44-char lines.
 */
export function validateMrz(raw: string): MrzValidationResult {
  // Clean: remove whitespace between characters but preserve line breaks
  const lines = raw
    .split(/\n|\r\n?/)
    .map((l) => l.replace(/\s/g, '').toUpperCase())
    .filter((l) => l.length >= 30) // MRZ lines are at least 30 chars

  if (lines.length >= 2) {
    // Try the two longest lines as TD3
    const sorted = lines.sort((a, b) => b.length - a.length)
    return validateTD3(sorted[0], sorted[1])
  }

  // Single long line  -  might be both lines concatenated
  if (lines.length === 1 && lines[0].length >= 88) {
    return validateTD3(lines[0].slice(0, 44), lines[0].slice(44, 88))
  }

  return {
    valid: false,
    fields: null,
    checks: [],
    errors: ['Could not detect MRZ lines. Expected 2 lines of 44 characters for a TD3 passport.'],
    rawLines: lines,
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Convert YYMMDD to YYYY-MM-DD.
 * Uses a pivot year of 30: YY <= 30 → 20YY, YY > 30 → 19YY.
 */
function mrzDateToIso(yymmdd: string): string {
  if (yymmdd.length !== 6) return ''
  const yy = parseInt(yymmdd.slice(0, 2), 10)
  const mm = yymmdd.slice(2, 4)
  const dd = yymmdd.slice(4, 6)
  const century = yy <= 30 ? '20' : '19'
  return `${century}${yymmdd.slice(0, 2)}-${mm}-${dd}`
}

/**
 * Normalise MRZ string: uppercase, replace common OCR misreads.
 * O ↔ 0 context-dependent correction is NOT done here  -  that would
 * defeat the purpose of checksum validation. We only fix spacing.
 */
function normaliseMrz(line: string): string {
  return line
    .toUpperCase()
    .replace(/\s/g, '')   // Strip all whitespace
    .replace(/\|/g, '<')  // OCR sometimes reads < as |
    .replace(/\./g, '<')  // OCR sometimes reads < as .
}
