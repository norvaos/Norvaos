/**
 * ID Field Parser  -  Canadian Government ID Heuristics
 *
 * Extracts structured contact fields from raw OCR text of:
 *   - Provincial driver's licences (ON, AB, BC, QC, etc.)
 *   - Canadian passports
 *   - PR cards
 *   - Provincial photo ID cards
 *
 * IMPORTANT: Province, city, and postal code are extracted TOGETHER
 * from the "CITY PROV A1A 1A1" line pattern to avoid cross-contamination.
 * Province is NEVER inferred from loose 2-letter codes in the text.
 */

export interface IdScanFields {
  first_name: string | null
  last_name: string | null
  middle_name: string | null
  date_of_birth: string | null    // YYYY-MM-DD
  address_line1: string | null
  city: string | null
  province_state: string | null   // 2-letter code (ON, AB, BC, etc.)
  postal_code: string | null
  document_number: string | null
  expiry_date: string | null      // YYYY-MM-DD
  sex: string | null              // M / F / X
  document_type: 'drivers_licence' | 'passport' | 'pr_card' | 'photo_id' | 'unknown'
  /** Fields the parser couldn't confidently extract  -  UI should show amber "Review Required" border */
  review_required: string[]
}

// ── Province constants ──────────────────────────────────────────────────────

/** Full province name → code. Used for header detection ("Ontario", "Alberta") */
const PROVINCE_NAME_MAP: Record<string, string> = {
  'ontario': 'ON',
  'alberta': 'AB',
  'british columbia': 'BC',
  'manitoba': 'MB',
  'saskatchewan': 'SK',
  'quebec': 'QC',
  'québec': 'QC',
  'new brunswick': 'NB',
  'nova scotia': 'NS',
  'prince edward island': 'PE',
  'newfoundland': 'NL',
  'newfoundland and labrador': 'NL',
  'northwest territories': 'NT',
  'nunavut': 'NU',
  'yukon': 'YT',
}

/** Valid 2-letter province codes  -  used ONLY in structured patterns, never loose */
const VALID_PROVINCE_CODES = new Set([
  'ON', 'AB', 'BC', 'MB', 'SK', 'QC', 'NB', 'NS', 'PE', 'NL', 'NT', 'NU', 'YT',
])

/** Canadian postal code regex fragment (A1A 1A1 or A1A1A1) */
const POSTAL_RE = /([A-Z]\d[A-Z])\s*(\d[A-Z]\d)/i

// ── Main entry point ────────────────────────────────────────────────────────

export function parseIdFields(rawText: string): IdScanFields {
  const text = rawText.replace(/\r\n/g, '\n')
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
  const upper = text.toUpperCase()

  const result: IdScanFields = {
    first_name: null,
    last_name: null,
    middle_name: null,
    date_of_birth: null,
    address_line1: null,
    city: null,
    province_state: null,
    postal_code: null,
    document_number: null,
    expiry_date: null,
    sex: null,
    document_type: detectDocumentType(upper),
    review_required: [],
  }

  // ── Step 1: Province from header (e.g., "Ontario" at top of DL) ────────
  // This is the most reliable signal  -  DLs always have the province name
  result.province_state = extractProvinceFromHeader(lines)

  // ── Step 2: City + Province + Postal (extracted together) ──────────────
  // Pattern: "TORONTO ON M5V 2T6"  -  single line with all three fields.
  // This is the ONLY place we extract city/postal/province-from-address.
  extractCityProvincePostal(lines, result)

  // ── Step 3: Standalone postal code (if not found in step 2) ────────────
  if (!result.postal_code) {
    const postalMatch = text.match(POSTAL_RE)
    if (postalMatch) {
      result.postal_code = `${postalMatch[1].toUpperCase()} ${postalMatch[2].toUpperCase()}`
    }
  }

  // ── Step 4: Dates ──────────────────────────────────────────────────────
  const dates = extractDates(lines)
  result.date_of_birth = dates.dob
  result.expiry_date = dates.expiry

  // ── Step 5: Sex ────────────────────────────────────────────────────────
  const sexMatch = upper.match(/\b(?:SEX|SEXE|GENDER)\s*[:/]?\s*(M|F|X)\b/)
  if (sexMatch) {
    result.sex = sexMatch[1]
  } else {
    const sexWord = upper.match(/\b(MALE|FEMALE|HOMME|FEMME)\b/)
    if (sexWord) {
      result.sex = sexWord[1][0] === 'M' || sexWord[1][0] === 'H' ? 'M' : 'F'
    }
  }

  // ── Step 6: Name ───────────────────────────────────────────────────────
  extractName(lines, upper, result)

  // ── Step 7: Street address ─────────────────────────────────────────────
  extractStreetAddress(lines, result)

  // ── Step 8: Document number ────────────────────────────────────────────
  result.document_number = extractDocumentNumber(text, upper, result.document_type)

  // ── Step 9: Flag fields that need manual review ──────────────────────
  // If the parser couldn't confidently extract a field, flag it so the UI
  // shows an amber "Review Required" border instead of leaving it silently null.
  if (!result.province_state) result.review_required.push('province_state')
  if (!result.city) result.review_required.push('city')
  if (!result.postal_code) result.review_required.push('postal_code')
  if (!result.first_name && !result.last_name) result.review_required.push('name')

  return result
}

// ── Document type detection ─────────────────────────────────────────────────

function detectDocumentType(upper: string): IdScanFields['document_type'] {
  if (upper.includes('PASSPORT') || upper.includes('PASSEPORT')) return 'passport'
  if (upper.includes('PERMANENT RESIDENT') || upper.includes('RÉSIDENT PERMANENT') || upper.includes('PR CARD')) return 'pr_card'
  if (upper.includes('DRIVER') || upper.includes('LICENCE') || upper.includes('LICENSE') || upper.includes('PERMIS DE CONDUIRE')) return 'drivers_licence'
  if (upper.includes('PHOTO CARD') || upper.includes('PHOTO ID')) return 'photo_id'
  return 'unknown'
}

// ── Province from header ────────────────────────────────────────────────────
// Ontario DLs say "Ontario" at the top. Alberta says "Alberta". etc.
// This is far more reliable than scanning for 2-letter codes.

function extractProvinceFromHeader(lines: string[]): string | null {
  // Sort province names longest-first to prevent "prince edward island" matching
  // before "ontario" when both could substring-match the same noisy OCR line.
  const sortedEntries = Object.entries(PROVINCE_NAME_MAP)
    .sort((a, b) => b[0].length - a[0].length)

  const headerLines = lines.slice(0, 6)

  // Pass 1: Exact line match (most reliable  -  "Ontario" on its own line)
  for (const line of headerLines) {
    const lower = line.toLowerCase().trim()
    for (const [name, code] of sortedEntries) {
      if (lower === name) return code
    }
  }

  // Pass 2: Word-boundary match (e.g. "Ontario Driver's Licence")
  // Uses word boundary to prevent "prince" matching inside another word.
  for (const line of headerLines) {
    const lower = line.toLowerCase().trim()
    for (const [name, code] of sortedEntries) {
      // Build a word-boundary regex: /(^|\s)ontario($|\s|[,.'"])/
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const re = new RegExp(`(?:^|\\s)${escaped}(?:$|\\s|[,.'"\\-])`, 'i')
      if (re.test(lower)) return code
    }
  }

  return null
}

// ── City + Province + Postal (combined extraction) ──────────────────────────
// The key insight: on Canadian DLs the city/province/postal always appear
// together as "CITYNAME ON M5V 2T6". We extract all three at once to avoid
// the city field accidentally swallowing the province or postal.

function extractCityProvincePostal(lines: string[], result: IdScanFields) {
  // Pattern 1: "CITY ON M5V 2T6" or "CITY, ON M5V2T6" (with/without space in postal)
  // Non-greedy city capture stops at the last valid separator before province code.
  for (const line of lines) {
    const match = line.match(
      /^(.+?)[\s,]+([A-Z]{2})[\s,]+([A-Z]\d[A-Z])\s*(\d[A-Z]\d)\s*$/i
    )
    if (!match) continue

    // Clean city: strip trailing commas, periods, extra whitespace
    const cityCandidate = match[1].replace(/[,.\s]+$/, '').trim()
    const provCandidate = match[2].toUpperCase()
    const postal = `${match[3].toUpperCase()} ${match[4].toUpperCase()}`

    // Province code must be valid
    if (!VALID_PROVINCE_CODES.has(provCandidate)) continue

    // City must look like a name (letters, spaces, hyphens, apostrophes, periods)
    if (!/^[A-Za-zÀ-ÿ\s.'-]+$/.test(cityCandidate)) continue

    // City must not be too short (avoid matching lone letters)
    if (cityCandidate.length < 2) continue

    // Guard: city must NOT contain a postal code fragment (OCR noise)
    if (/[A-Z]\d[A-Z]/i.test(cityCandidate)) continue

    result.city = titleCase(cityCandidate)
    result.postal_code = postal
    // Only set province from address if header didn't find one
    if (!result.province_state) {
      result.province_state = provCandidate
    }
    return
  }

  // Pattern 2: Postal code glued to province  -  "TORONTO ON M5V2T6" (no space in postal)
  for (const line of lines) {
    const match = line.match(
      /^(.+?)[\s,]+([A-Z]{2})[\s,]+([A-Z]\d[A-Z]\d[A-Z]\d)\s*$/i
    )
    if (!match) continue
    const cityCandidate = match[1].replace(/[,.\s]+$/, '').trim()
    const provCandidate = match[2].toUpperCase()
    const rawPostal = match[3].toUpperCase()
    const postal = `${rawPostal.slice(0, 3)} ${rawPostal.slice(3)}`

    if (!VALID_PROVINCE_CODES.has(provCandidate)) continue
    if (!/^[A-Za-zÀ-ÿ\s.'-]+$/.test(cityCandidate)) continue
    if (cityCandidate.length < 2) continue
    if (/[A-Z]\d[A-Z]/i.test(cityCandidate)) continue

    result.city = titleCase(cityCandidate)
    result.postal_code = postal
    if (!result.province_state) result.province_state = provCandidate
    return
  }

  // Pattern 3: "CITY, PROV" without postal code
  for (const line of lines) {
    const match = line.match(/^([A-Za-zÀ-ÿ\s.'-]{2,})[,\s]+([A-Z]{2})\s*$/i)
    if (!match) continue
    const provCandidate = match[2].toUpperCase()
    if (!VALID_PROVINCE_CODES.has(provCandidate)) continue
    result.city = titleCase(match[1].replace(/[,.\s]+$/, '').trim())
    if (!result.province_state) result.province_state = provCandidate
    return
  }
}

// ── Date extraction ─────────────────────────────────────────────────────────

function extractDates(lines: string[]): { dob: string | null; expiry: string | null } {
  const allDates: { date: string; context: string }[] = []

  for (const line of lines) {
    // YYYY-MM-DD or YYYY/MM/DD
    for (const match of line.matchAll(/(\d{4})[-/](\d{2})[-/](\d{2})/g)) {
      const y = parseInt(match[1]), m = parseInt(match[2]), d = parseInt(match[3])
      if (y >= 1920 && y <= 2040 && m >= 1 && m <= 12 && d >= 1 && d <= 31) {
        allDates.push({
          date: `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
          context: line,
        })
      }
    }

    // DD-MM-YYYY or DD/MM/YYYY
    for (const match of line.matchAll(/(\d{2})[-/](\d{2})[-/](\d{4})/g)) {
      const p1 = parseInt(match[1]), p2 = parseInt(match[2]), y = parseInt(match[3])
      if (y >= 1920 && y <= 2040 && p2 >= 1 && p2 <= 12 && p1 >= 1 && p1 <= 31) {
        const formatted = `${y}-${String(p2).padStart(2, '0')}-${String(p1).padStart(2, '0')}`
        if (!allDates.find(ad => ad.date === formatted)) {
          allDates.push({ date: formatted, context: line })
        }
      }
    }
  }

  let dob: string | null = null
  let expiry: string | null = null

  for (const entry of allDates) {
    const ctx = entry.context.toUpperCase()
    const year = parseInt(entry.date.slice(0, 4))

    if (ctx.includes('DOB') || ctx.includes('BIRTH') || ctx.includes('NAISSANCE') || ctx.includes('DATE OF BIRTH') || ctx.includes('DN')) {
      dob = entry.date
    } else if (ctx.includes('EXP') || ctx.includes('VALID') || ctx.includes('UNTIL')) {
      expiry = entry.date
    } else if (year < 2010 && !dob) {
      dob = entry.date
    } else if (year >= 2024 && !expiry) {
      expiry = entry.date
    }
  }

  return { dob, expiry }
}

// ── Name extraction ─────────────────────────────────────────────────────────

function extractName(lines: string[], upper: string, result: IdScanFields) {
  // Pattern 1: "LAST, FIRST MIDDLE" (common on Canadian DLs)
  const commaName = upper.match(/(?:(?:SURNAME|LAST|NOM|FAMILY)\s*[:/]?\s*)?([A-Z'-]+)\s*,\s*([A-Z'-]+)(?:\s+([A-Z'-]+))?/)
  if (commaName) {
    result.last_name = titleCase(commaName[1])
    result.first_name = titleCase(commaName[2])
    if (commaName[3]) result.middle_name = titleCase(commaName[3])
    return
  }

  // Pattern 2: Labelled fields
  for (const line of lines) {
    const lineUpper = line.toUpperCase()

    const surnameMatch = lineUpper.match(/(?:SURNAME|LAST\s*NAME|NOM\s*DE?\s*FAMILLE|FAMILY\s*NAME)\s*[:/]?\s*(.+)/i)
    if (surnameMatch && !result.last_name) {
      result.last_name = titleCase(surnameMatch[1].trim())
    }

    const givenMatch = lineUpper.match(/(?:GIVEN\s*NAME|FIRST\s*NAME|PRENOM|PRÉNOM)\s*S?\s*[:/]?\s*(.+)/i)
    if (givenMatch && !result.first_name) {
      const parts = givenMatch[1].trim().split(/\s+/)
      result.first_name = titleCase(parts[0])
      if (parts[1]) result.middle_name = titleCase(parts[1])
    }
  }

  // Pattern 3: For passports  -  "MEHTA" on one line, "ARJUN" on next
  if (!result.last_name && result.document_type === 'passport') {
    const nameLines = lines.filter(l =>
      /^[A-Z'-\s]{2,30}$/.test(l) &&
      !l.match(/\d/) &&
      !VALID_PROVINCE_CODES.has(l.trim()) &&
      !['CANADA', 'PASSPORT', 'PASSEPORT', 'MALE', 'FEMALE'].includes(l.trim())
    )
    if (nameLines.length >= 2) {
      result.last_name = titleCase(nameLines[0])
      const parts = nameLines[1].split(/\s+/)
      result.first_name = titleCase(parts[0])
      if (parts[1]) result.middle_name = titleCase(parts[1])
    }
  }
}

// ── Street address extraction ───────────────────────────────────────────────

const STREET_SUFFIXES = /(?:ST|AVE|AVENUE|RD|ROAD|DR|DRIVE|BLVD|BOULEVARD|WAY|CRES|CRESCENT|CT|COURT|PL|PLACE|CIR|CIRCLE|TRAIL|TRL|LANE|LN|TERR|TERRACE|HWY|HIGHWAY|PKY|PARKWAY)/i

function extractStreetAddress(lines: string[], result: IdScanFields) {
  for (const line of lines) {
    // Street: starts with number, contains a street suffix
    const isStreet = /^\d+[A-Z]?\s+/i.test(line) && STREET_SUFFIXES.test(line)
    if (isStreet && !result.address_line1) {
      // Strip off any trailing city/province/postal if they're on the same line
      let address = line
      const trailingCityProv = line.match(
        /^(.+(?:ST|AVE|AVENUE|RD|ROAD|DR|DRIVE|BLVD|BOULEVARD|WAY|CRES|CRESCENT|CT|COURT|PL|PLACE|CIR|CIRCLE|TRAIL|TRL|LANE|LN|TERR|TERRACE|HWY|HIGHWAY|PKY|PARKWAY)\S*)\s+[A-Z][a-z]/i
      )
      if (trailingCityProv) {
        address = trailingCityProv[1]
      }
      result.address_line1 = titleCase(address.trim())
      continue
    }

    // APT/UNIT lines
    if (/^(?:APT|UNIT|SUITE|#)\s/i.test(line) && !result.address_line1) {
      result.address_line1 = titleCase(line)
    }
  }
}

// ── Document number extraction ──────────────────────────────────────────────

function extractDocumentNumber(text: string, upper: string, docType: IdScanFields['document_type']): string | null {
  // Ontario DL: "M1234-56789-01234"
  const ontarioDL = text.match(/[A-Z]\d{4}[-\s]?\d{5}[-\s]?\d{5}/i)
  if (ontarioDL) return ontarioDL[0].toUpperCase()

  // Alberta DL: 6-digit number
  const albertaDL = upper.match(/(?:LICENCE|LICENSE|DL)\s*(?:NO|#|NUMBER)?\s*[:/]?\s*(\d{6,9})/i)
  if (albertaDL) return albertaDL[1]

  // BC DL: 7-digit
  const bcDL = text.match(/\b\d{7}\b/)
  if (bcDL && docType === 'drivers_licence') return bcDL[0]

  // Passport: 2 letters + 6 digits
  const passportNum = text.match(/[A-Z]{2}\d{6}/i)
  if (passportNum && docType === 'passport') return passportNum[0].toUpperCase()

  // Generic: labelled document/licence number
  const labelledNum = text.match(/(?:DOC|LICENCE|LICENSE|CARD|NO|DL)\s*(?:NO|#|NUMBER)?\s*[:/]?\s*([A-Z0-9-]{5,20})/i)
  if (labelledNum) return labelledNum[1].toUpperCase()

  return null
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function titleCase(str: string): string {
  return str
    .toLowerCase()
    .replace(/(?:^|\s|[-'])\S/g, (c) => c.toUpperCase())
    .trim()
}
