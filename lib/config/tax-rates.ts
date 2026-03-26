/**
 * Canadian tax rates for legal services.
 *
 * Notes:
 * - PST/RST does NOT apply to legal services in BC, SK, or MB  -  only GST.
 * - Quebec charges GST + QST (combined 14.975%).
 * - Nova Scotia HST changed to 14% effective 1 April 2025.
 * - Government fees (e.g. IRCC filing fees) are always tax-exempt.
 * - Non-resident clients (outside Canada) are zero-rated under
 *   Section 23, Part V, Schedule VI of the Excise Tax Act.
 */

export interface ProvinceTaxConfig {
  /** Combined effective tax rate as a decimal (e.g. 0.13 = 13%) */
  rate: number
  /** Short label shown in the UI (e.g. "HST", "GST", "GST + QST") */
  label: string
  /** Full province / territory name */
  name: string
}

export const CANADIAN_TAX_RATES: Record<string, ProvinceTaxConfig> = {
  ON: { rate: 0.13, label: 'HST', name: 'Ontario' },
  NB: { rate: 0.15, label: 'HST', name: 'New Brunswick' },
  NL: { rate: 0.15, label: 'HST', name: 'Newfoundland and Labrador' },
  NS: { rate: 0.14, label: 'HST', name: 'Nova Scotia' },
  PE: { rate: 0.15, label: 'HST', name: 'Prince Edward Island' },
  BC: { rate: 0.05, label: 'GST', name: 'British Columbia' },
  SK: { rate: 0.05, label: 'GST', name: 'Saskatchewan' },
  MB: { rate: 0.05, label: 'GST', name: 'Manitoba' },
  QC: { rate: 0.14975, label: 'GST + QST', name: 'Quebec' },
  AB: { rate: 0.05, label: 'GST', name: 'Alberta' },
  NT: { rate: 0.05, label: 'GST', name: 'Northwest Territories' },
  NU: { rate: 0.05, label: 'GST', name: 'Nunavut' },
  YT: { rate: 0.05, label: 'GST', name: 'Yukon' },
} as const

/** Province codes sorted alphabetically by name for dropdown display */
export const PROVINCE_OPTIONS = Object.entries(CANADIAN_TAX_RATES)
  .map(([code, config]) => ({
    code,
    name: config.name,
    rate: config.rate,
    label: config.label,
  }))
  .sort((a, b) => a.name.localeCompare(b.name))

/**
 * Place of Supply Tax Resolution  -  Excise Tax Act, Part IX
 *
 * For legal services, tax is based on the client's province of residence
 * (place of supply), NOT the firm's location. This function resolves the
 * applicable tax config for a given client province code.
 *
 * Falls back to the firm's home jurisdiction if the client province is
 * unknown or outside Canada.
 */
export function getPlaceOfSupplyTax(
  clientProvinceCode: string | null | undefined,
  firmJurisdictionCode?: string,
): ProvinceTaxConfig & { provinceCode: string; isOutOfProvince: boolean } {
  const normalised = clientProvinceCode?.toUpperCase().trim() ?? ''
  const clientTax = CANADIAN_TAX_RATES[normalised]

  if (clientTax) {
    const firmCode = firmJurisdictionCode?.toUpperCase().replace(/^CA-/, '') ?? 'ON'
    return {
      ...clientTax,
      provinceCode: normalised,
      isOutOfProvince: normalised !== firmCode,
    }
  }

  // Fallback: firm's home jurisdiction (default ON for LSO)
  const firmCode = firmJurisdictionCode?.toUpperCase().replace(/^CA-/, '') ?? 'ON'
  const firmTax = CANADIAN_TAX_RATES[firmCode] ?? CANADIAN_TAX_RATES.ON
  return {
    ...firmTax,
    provinceCode: firmCode,
    isOutOfProvince: false,
  }
}
