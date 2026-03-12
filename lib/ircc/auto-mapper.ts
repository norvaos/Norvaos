/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Auto-Mapper — heuristic XFA field → profile path matching
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Pure synchronous module — no I/O, no DB access.
 * Called during form upload (after XFA scan) to auto-populate profile_path
 * and is_mapped for high-confidence matches, reducing admin mapping work.
 *
 * Three strategies in priority order:
 *   1. Exact last-segment match (confidence 95)
 *      norm("FamilyName") == norm("family_name") → "personal.family_name"
 *   2. Caption label similarity (confidence 82–90)
 *      "Family name / Nom de famille" word overlap → "personal.family_name"
 *   3. XFA path keyword + section match (confidence 78–85)
 *      Section from XFA segments + camelCase token overlap against label
 *
 * Only results at or above AUTO_MAP_CONFIDENCE_THRESHOLD (85) are returned.
 */

import { PROFILE_PATH_CATALOG, type ProfilePathEntry } from './profile-path-catalog'

export const AUTO_MAP_CONFIDENCE_THRESHOLD = 85

export interface AutoMapResult {
  profile_path: string
  confidence: number
  strategy: 'exact_segment' | 'caption_label' | 'path_keyword'
}

// ── String helpers ─────────────────────────────────────────────────────────

/** Normalize: lowercase + strip non-alphanumeric (merges camelCase, snake_case, spaces) */
function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '')
}

/** Split camelCase/PascalCase into spaced words: "FamilyName" → "Family Name" */
function camelSplit(s: string): string {
  return s
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
}

const STOP_WORDS = new Set(['of', 'the', 'a', 'an', 'and', 'or', 'to', 'de', 'du', 'la', 'le', 'les', 'des', 'in', 'at', 'for'])

/** Tokenize a string into significant lowercase words */
function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP_WORDS.has(w))
}

// ── Build lookup indices at module load time ────────────────────────────────

/** norm(last path segment) → first matching catalog entry */
const byLastSegment = new Map<string, ProfilePathEntry>()
/** norm(full label, no spaces) → catalog entry */
const byNormLabel = new Map<string, ProfilePathEntry>()

for (const entry of PROFILE_PATH_CATALOG) {
  const parts = entry.path.split('.')
  const lastSeg = norm(parts[parts.length - 1])
  if (!byLastSegment.has(lastSeg)) {
    byLastSegment.set(lastSeg, entry)
  }
  const normLbl = norm(entry.label)
  if (!byNormLabel.has(normLbl)) {
    byNormLabel.set(normLbl, entry)
  }
}

// ── XFA section keyword map ─────────────────────────────────────────────────

/** Maps normalized XFA path segment → catalog section name */
const XFA_SECTION_TO_CATALOG: Record<string, string> = {
  personal: 'Personal',
  personalinfo: 'Personal',
  personaldetails: 'Personal',
  personalinformation: 'Personal',
  applicantinfo: 'Personal',
  identity: 'Personal',
  name: 'Personal',
  marital: 'Marital',
  maritalstatus: 'Marital',
  spouse: 'Marital',
  spouseinfo: 'Marital',
  spousedetails: 'Marital',
  passport: 'Passport',
  passportinfo: 'Passport',
  passportdetails: 'Passport',
  traveldoc: 'Passport',
  language: 'Language',
  languages: 'Language',
  languageability: 'Language',
  contact: 'Contact',
  contactinfo: 'Contact',
  contactdetails: 'Contact',
  address: 'Contact',
  currentaddress: 'Contact',
  education: 'Education',
  educationhistory: 'Education',
  schooling: 'Education',
  employment: 'Employment',
  employmenthistory: 'Employment',
  occupation: 'Employment',
  background: 'Background',
  backgroundinfo: 'Background',
  backgroundinformation: 'Background',
  family: 'Family',
  familyinfo: 'Family',
  familymembers: 'Family',
  children: 'Family',
  dependents: 'Family',
  visit: 'Visit',
  visitdetails: 'Visit',
  tripdetails: 'Visit',
  travel: 'Visit',
  travelhistory: 'Visit',
  representative: 'Representative',
  representativeinfo: 'Representative',
  rep: 'Representative',
  sponsor: 'Sponsor',
  sponsorinfo: 'Sponsor',
  sponsorship: 'Sponsor',
}

// ── Main export ─────────────────────────────────────────────────────────────

/**
 * Attempt to auto-map an XFA field path to a profile path.
 *
 * @param xfaPath      - Full XFA field path (e.g. "Page1.PersonalInfo.FamilyName")
 * @param fieldType    - Field type from scanner (e.g. "text", "date", "checkbox")
 * @param sectionKey   - Section key derived by field-auto-classify (e.g. "PersonalInfo")
 * @param captionLabel - Actual form label text from <draw> sibling, if available
 * @returns AutoMapResult if confidence ≥ threshold, else null
 */
export function tryAutoMap(
  xfaPath: string,
  fieldType: string,
  sectionKey: string | null,
  captionLabel?: string | null,
): AutoMapResult | null {
  const segments = xfaPath.split('.')
  const lastSegRaw = segments[segments.length - 1]

  // ── Strategy 1: Exact last-segment match (confidence 95) ────────────────
  const lastSegNorm = norm(lastSegRaw)
  const exactMatch = byLastSegment.get(lastSegNorm)
  if (exactMatch) {
    return { profile_path: exactMatch.path, confidence: 95, strategy: 'exact_segment' }
  }

  // ── Strategy 2: Caption label similarity (confidence 82–90) ─────────────
  if (captionLabel?.trim()) {
    // 2a. Full normalized label match
    const normCaption = norm(captionLabel)
    const fullLabelMatch = byNormLabel.get(normCaption)
    if (fullLabelMatch) {
      return { profile_path: fullLabelMatch.path, confidence: 90, strategy: 'caption_label' }
    }

    // 2b. Word overlap scoring against all catalog labels
    // Strip bilingual suffixes (IRCC captions often have " / Nom de famille" after English text)
    const englishPart = captionLabel.split(/\s*\/\s*/)[0]
    const captionTokens = new Set(tokenize(englishPart))
    if (captionTokens.size > 0) {
      let bestEntry: ProfilePathEntry | null = null
      let bestScore = 0
      for (const entry of PROFILE_PATH_CATALOG) {
        const labelTokens = tokenize(entry.label)
        const overlap = labelTokens.filter((w) => captionTokens.has(w)).length
        if (overlap === 0) continue
        const score = overlap / Math.max(captionTokens.size, labelTokens.length)
        if (score > bestScore) {
          bestScore = score
          bestEntry = entry
        }
      }
      if (bestEntry && bestScore >= 0.6) {
        const confidence = Math.round(82 + bestScore * 8) // 82–90 range
        if (confidence >= AUTO_MAP_CONFIDENCE_THRESHOLD) {
          return { profile_path: bestEntry.path, confidence, strategy: 'caption_label' }
        }
      }
    }
  }

  // ── Strategy 3: Section-aware XFA path keyword match (confidence 78–85) ─
  // Identify catalog section from XFA path segments
  let candidateSection: string | null = null
  for (const seg of segments) {
    const alias = XFA_SECTION_TO_CATALOG[norm(seg)]
    if (alias) {
      candidateSection = alias
      break
    }
  }
  if (!candidateSection && sectionKey) {
    candidateSection = XFA_SECTION_TO_CATALOG[norm(sectionKey)] ?? null
  }

  if (!candidateSection) return null

  // Split camelCase last segment into tokens for label matching
  const xfaTokens = new Set(tokenize(camelSplit(lastSegRaw)))
  if (xfaTokens.size === 0) return null

  let bestEntry: ProfilePathEntry | null = null
  let bestScore = 0
  for (const entry of PROFILE_PATH_CATALOG) {
    if (entry.section !== candidateSection) continue
    const labelTokens = tokenize(entry.label)
    const overlap = labelTokens.filter((w) => xfaTokens.has(w)).length
    if (overlap === 0) continue
    const score = overlap / Math.max(xfaTokens.size, labelTokens.length)
    if (score > bestScore) {
      bestScore = score
      bestEntry = entry
    }
  }

  if (bestEntry && bestScore >= 0.5) {
    const confidence = Math.round(78 + bestScore * 7) // 78–85 range
    if (confidence >= AUTO_MAP_CONFIDENCE_THRESHOLD) {
      return { profile_path: bestEntry.path, confidence, strategy: 'path_keyword' }
    }
  }

  return null
}
