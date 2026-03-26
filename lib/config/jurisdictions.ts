// ============================================================================
// Jurisdiction Configuration — v1: Canada-only
// ============================================================================

export interface JurisdictionDef {
  code: string
  name: string
  flag: string
  enabled: boolean
  disabledTooltip?: string
}

export const JURISDICTIONS: JurisdictionDef[] = [
  { code: 'CA', name: 'Canada', flag: '🇨🇦', enabled: true },
  { code: 'US', name: 'United States', flag: '🇺🇸', enabled: false, disabledTooltip: 'Coming soon' },
  { code: 'GB', name: 'United Kingdom', flag: '🇬🇧', enabled: false, disabledTooltip: 'Coming soon' },
]

export const ENABLED_JURISDICTIONS = JURISDICTIONS.filter((j) => j.enabled).map((j) => j.code)

export const DEFAULT_JURISDICTION = 'CA'

export function isJurisdictionEnabled(code: string): boolean {
  return ENABLED_JURISDICTIONS.includes(code)
}

// ── Canadian Provinces / Territories ──────────────────────────────────────────

export interface ProvinceDef {
  code: string
  name: string
  lawSociety: string
  lawSocietyAbbr: string
}

export const CANADIAN_PROVINCES: ProvinceDef[] = [
  { code: 'AB', name: 'Alberta', lawSociety: 'Law Society of Alberta', lawSocietyAbbr: 'LSA' },
  { code: 'BC', name: 'British Columbia', lawSociety: 'Law Society of British Columbia', lawSocietyAbbr: 'LSBC' },
  { code: 'MB', name: 'Manitoba', lawSociety: 'Law Society of Manitoba', lawSocietyAbbr: 'LSM' },
  { code: 'NB', name: 'New Brunswick', lawSociety: 'Law Society of New Brunswick', lawSocietyAbbr: 'LSNB' },
  { code: 'NL', name: 'Newfoundland and Labrador', lawSociety: 'Law Society of Newfoundland and Labrador', lawSocietyAbbr: 'LSNL' },
  { code: 'NS', name: 'Nova Scotia', lawSociety: 'Nova Scotia Barristers\' Society', lawSocietyAbbr: 'NSBS' },
  { code: 'NT', name: 'Northwest Territories', lawSociety: 'Law Society of the Northwest Territories', lawSocietyAbbr: 'LSNT' },
  { code: 'NU', name: 'Nunavut', lawSociety: 'Law Society of Nunavut', lawSocietyAbbr: 'LSNu' },
  { code: 'ON', name: 'Ontario', lawSociety: 'Law Society of Ontario', lawSocietyAbbr: 'LSO' },
  { code: 'PE', name: 'Prince Edward Island', lawSociety: 'Law Society of Prince Edward Island', lawSocietyAbbr: 'LSPEI' },
  { code: 'QC', name: 'Québec', lawSociety: 'Barreau du Québec', lawSocietyAbbr: 'BQ' },
  { code: 'SK', name: 'Saskatchewan', lawSociety: 'Law Society of Saskatchewan', lawSocietyAbbr: 'LSS' },
  { code: 'YT', name: 'Yukon', lawSociety: 'Law Society of Yukon', lawSocietyAbbr: 'LSY' },
]

// ── Regulatory Bodies ────────────────────────────────────────────────────────
// Covers both provincial Law Societies (for lawyers/paralegals) and federal
// bodies (CICC for immigration consultants). A firm selects their primary
// regulatory body — this drives compliance rules system-wide.

export type RegulatoryScope = 'provincial' | 'federal'

export interface RegulatoryBodyDef {
  code: string
  name: string
  abbr: string
  scope: RegulatoryScope
  /** Province code (for provincial bodies) or null (for federal) */
  provinceCode: string | null
  description: string
}

export const REGULATORY_BODIES: RegulatoryBodyDef[] = [
  // ── Federal ──
  { code: 'CICC', name: 'College of Immigration and Citizenship Consultants', abbr: 'CICC', scope: 'federal', provinceCode: null, description: 'Regulates Regulated Canadian Immigration Consultants (RCICs) — federal jurisdiction' },
  // ── Provincial (A–Z) ──
  { code: 'LSA',  name: 'Law Society of Alberta', abbr: 'LSA', scope: 'provincial', provinceCode: 'AB', description: 'Regulates lawyers and articling students in Alberta' },
  { code: 'LSBC', name: 'Law Society of British Columbia', abbr: 'LSBC', scope: 'provincial', provinceCode: 'BC', description: 'Regulates lawyers and articling students in British Columbia' },
  { code: 'LSM',  name: 'Law Society of Manitoba', abbr: 'LSM', scope: 'provincial', provinceCode: 'MB', description: 'Regulates lawyers in Manitoba' },
  { code: 'LSNB', name: 'Law Society of New Brunswick', abbr: 'LSNB', scope: 'provincial', provinceCode: 'NB', description: 'Regulates lawyers in New Brunswick' },
  { code: 'LSNL', name: 'Law Society of Newfoundland and Labrador', abbr: 'LSNL', scope: 'provincial', provinceCode: 'NL', description: 'Regulates lawyers in Newfoundland and Labrador' },
  { code: 'NSBS', name: 'Nova Scotia Barristers\' Society', abbr: 'NSBS', scope: 'provincial', provinceCode: 'NS', description: 'Regulates lawyers in Nova Scotia' },
  { code: 'LSNT', name: 'Law Society of the Northwest Territories', abbr: 'LSNT', scope: 'provincial', provinceCode: 'NT', description: 'Regulates lawyers in the Northwest Territories' },
  { code: 'LSNu', name: 'Law Society of Nunavut', abbr: 'LSNu', scope: 'provincial', provinceCode: 'NU', description: 'Regulates lawyers in Nunavut' },
  { code: 'LSO',  name: 'Law Society of Ontario', abbr: 'LSO', scope: 'provincial', provinceCode: 'ON', description: 'Regulates lawyers, paralegals, and limited licensees in Ontario' },
  { code: 'LSPEI', name: 'Law Society of Prince Edward Island', abbr: 'LSPEI', scope: 'provincial', provinceCode: 'PE', description: 'Regulates lawyers in Prince Edward Island' },
  { code: 'BQ',   name: 'Barreau du Québec', abbr: 'BQ', scope: 'provincial', provinceCode: 'QC', description: 'Regulates lawyers (avocats) in Québec' },
  { code: 'LSS',  name: 'Law Society of Saskatchewan', abbr: 'LSS', scope: 'provincial', provinceCode: 'SK', description: 'Regulates lawyers in Saskatchewan' },
  { code: 'LSY',  name: 'Law Society of Yukon', abbr: 'LSY', scope: 'provincial', provinceCode: 'YT', description: 'Regulates lawyers in Yukon' },
]

/** Resolve a regulatory body code (e.g. 'LSO', 'CICC') to its definition */
export function resolveRegulatoryBody(code: string | null | undefined): RegulatoryBodyDef | null {
  if (!code) return null
  const upper = code.toUpperCase().trim()
  return REGULATORY_BODIES.find((b) => b.code.toUpperCase() === upper) ?? null
}

/** Resolve province code to its Law Society. Returns null if not found. */
export function resolveLawSociety(provinceCode: string | null | undefined): ProvinceDef | null {
  if (!provinceCode) return null
  const upper = provinceCode.toUpperCase().trim()
  // Check if it's actually a regulatory body code (e.g. 'CICC', 'LSO')
  const asBody = resolveRegulatoryBody(upper)
  if (asBody) {
    // Map back to ProvinceDef for backward compat
    return {
      code: asBody.provinceCode ?? asBody.code,
      name: asBody.provinceCode ? (CANADIAN_PROVINCES.find(p => p.code === asBody.provinceCode)?.name ?? asBody.name) : 'Federal',
      lawSociety: asBody.name,
      lawSocietyAbbr: asBody.abbr,
    }
  }
  // Try exact province code match
  const byCode = CANADIAN_PROVINCES.find((p) => p.code === upper)
  if (byCode) return byCode
  // Try name match (e.g. "Ontario" → ON)
  const byName = CANADIAN_PROVINCES.find(
    (p) => p.name.toLowerCase() === provinceCode.toLowerCase().trim()
  )
  return byName ?? null
}
