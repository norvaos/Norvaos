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
