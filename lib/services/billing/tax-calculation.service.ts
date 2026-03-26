// ============================================================================
// Tax Calculation Service  -  live tax calculation for the invoice builder
// ============================================================================
// Used in the invoice builder UI before finalization to show real-time tax
// breakdowns.  After finalization, tax amounts are stored on line items by
// calculate_invoice_totals().
//
// Tax model:
//   • Each line item has a tax_code_id (optional).  A tax code belongs to a
//     tax profile.  A tax profile maps to a jurisdiction.
//   • Tax rate is stored as NUMERIC(7,6): 0.130000 = 13% HST.
//   • Tax is only applied to lines where is_taxable = true.
// ============================================================================

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'

/** Per-line tax calculation result used in the invoice builder */
export interface TaxLineCalculation {
  line_id: string | null
  taxable_amount_cents: number
  tax_rate: number
  tax_amount_cents: number
  tax_code_label: string | null
}

export interface ServiceResult<T = void> {
  success: boolean
  data?: T
  error?: string
}

/* eslint-disable @typescript-eslint/no-explicit-any */
const fromTaxCodes = (c: SupabaseClient<Database>) =>
  (c as SupabaseClient<any>).from('tax_codes')
const fromTaxProfiles = (c: SupabaseClient<Database>) =>
  (c as SupabaseClient<any>).from('tax_profiles')
/* eslint-enable @typescript-eslint/no-explicit-any */

export interface TaxableLineInput {
  line_id?: string
  amount_cents: number
  tax_code_id: string | null
  is_taxable: boolean
}

export interface InvoiceTaxBreakdown {
  lines: TaxLineCalculation[]
  /** Total tax across all lines, in cents */
  total_tax_cents: number
  /** Taxable subtotal (before tax), in cents */
  taxable_subtotal_cents: number
}

/**
 * Calculate tax breakdown for a set of line item inputs.
 *
 * Fetches tax codes in a single query, then applies rates to each taxable
 * line.  Returns per-line breakdown and totals.
 *
 * All amounts are in cents (INTEGER).
 */
export async function calculateTaxBreakdown(
  supabase: SupabaseClient<Database>,
  tenantId: string,
  lines: TaxableLineInput[],
): Promise<ServiceResult<InvoiceTaxBreakdown>> {
  // Collect distinct tax_code_ids to fetch in one round-trip
  const taxCodeIds = [...new Set(lines.map((l) => l.tax_code_id).filter(Boolean))] as string[]

  let taxCodeMap: Map<string, { rate: number; label: string; tax_profile_id: string }> = new Map()

  if (taxCodeIds.length > 0) {
    const { data: codes, error } = await fromTaxCodes(supabase)
      .select('id, label, rate, tax_profile_id, is_active')
      .in('id', taxCodeIds)
      .eq('is_active', true)

    if (error) {
      return { success: false, error: error.message }
    }

    for (const code of codes ?? []) {
      taxCodeMap.set(code.id, {
        rate: Number(code.rate),
        label: code.label,
        tax_profile_id: code.tax_profile_id,
      })
    }
  }

  // Calculate per-line tax
  const breakdown: TaxLineCalculation[] = []
  let totalTaxCents = 0
  let taxableSubtotalCents = 0

  for (const line of lines) {
    if (!line.is_taxable || !line.tax_code_id) {
      breakdown.push({
        line_id: line.line_id ?? null,
        taxable_amount_cents: 0,
        tax_rate: 0,
        tax_amount_cents: 0,
        tax_code_label: null,
      })
      continue
    }

    const code = taxCodeMap.get(line.tax_code_id)
    if (!code) {
      // Tax code not found or inactive  -  treat as zero
      breakdown.push({
        line_id: line.line_id ?? null,
        taxable_amount_cents: line.amount_cents,
        tax_rate: 0,
        tax_amount_cents: 0,
        tax_code_label: null,
      })
      continue
    }

    // Round to nearest cent using standard half-up rounding
    const taxCents = Math.round(line.amount_cents * code.rate)

    breakdown.push({
      line_id: line.line_id ?? null,
      taxable_amount_cents: line.amount_cents,
      tax_rate: code.rate,
      tax_amount_cents: taxCents,
      tax_code_label: code.label,
    })

    taxableSubtotalCents += line.amount_cents
    totalTaxCents += taxCents
  }

  return {
    success: true,
    data: {
      lines: breakdown,
      total_tax_cents: totalTaxCents,
      taxable_subtotal_cents: taxableSubtotalCents,
    },
  }
}

/**
 * Fetch all active tax profiles for a tenant, with their tax codes.
 *
 * Used to populate the tax profile selector in the invoice builder.
 */
export async function getTaxProfilesWithCodes(
  supabase: SupabaseClient<Database>,
  tenantId: string,
): Promise<
  ServiceResult<
    Array<{
      id: string
      name: string
      jurisdiction_id: string | null
      codes: Array<{ id: string; label: string; rate: number; is_default: boolean }>
    }>
  >
> {
  const { data: profiles, error } = await fromTaxProfiles(supabase)
    .select(
      `id, name, jurisdiction_id, is_active,
       tax_codes!tax_codes_tax_profile_id_fkey(id, label, rate, is_default, is_active)`,
    )
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .order('name')

  if (error) return { success: false, error: error.message }

  const result = (profiles ?? []).map((p: any) => ({
    id: p.id as string,
    name: p.name as string,
    jurisdiction_id: p.jurisdiction_id as string | null,
    codes: ((p.tax_codes as any[]) ?? [])
      .filter((c: any) => c.is_active)
      .map((c: any) => ({
        id: c.id as string,
        label: c.label as string,
        rate: Number(c.rate),
        is_default: c.is_default as boolean,
      })),
  }))

  return { success: true, data: result }
}
