// ============================================================================
// Invoice Calculation Service  -  the ONLY authorised path to recalculate
// invoice financial fields (Billing Module)
// ============================================================================
// The DB function calculate_invoice_totals(UUID) is the sole authorised
// writer of invoice financial columns.  It sets the GUC
// norvaos.recalculation_context = 'invoice_calculation_service' before
// executing the UPDATE, and the BEFORE UPDATE trigger
// trg_guard_invoice_financial_fields blocks any other path.
//
// This service wraps that RPC call and surfaces typed results.
// ============================================================================

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, InvoiceTotalsResult } from '@/lib/types/database'

export interface ServiceResult<T = void> {
  success: boolean
  data?: T
  error?: string
}

/**
 * Recalculate all financial fields for an invoice via the DB function
 * calculate_invoice_totals().
 *
 * This is the ONLY authorised path to update invoice totals.  Direct
 * UPDATE statements against financial columns are blocked by a DB trigger
 * unless the GUC guard is set  -  and only this DB function sets that guard.
 */
export async function recalculateInvoice(
  supabase: SupabaseClient<Database>,
  invoiceId: string,
): Promise<ServiceResult<InvoiceTotalsResult>> {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const { data, error } = await (supabase as SupabaseClient<any>).rpc(
    'calculate_invoice_totals',
    { p_invoice_id: invoiceId },
  )
  /* eslint-enable @typescript-eslint/no-explicit-any */

  if (error) {
    return { success: false, error: error.message }
  }

  // The function returns JSONB  -  cast to our typed result
  const result = data as InvoiceTotalsResult
  return { success: true, data: result }
}

/**
 * Generate a new invoice number for the given tenant and year.
 *
 * Calls generate_invoice_number(p_tenant_id, p_year) which uses atomic
 * upsert with row locking to guarantee uniqueness within the tenant + year.
 *
 * Returns the formatted string e.g. "INV-2026-000042".
 */
export async function generateInvoiceNumber(
  supabase: SupabaseClient<Database>,
  tenantId: string,
  year: number,
): Promise<ServiceResult<string>> {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const { data, error } = await (supabase as SupabaseClient<any>).rpc(
    'generate_invoice_number',
    { p_tenant_id: tenantId, p_year: year },
  )
  /* eslint-enable @typescript-eslint/no-explicit-any */

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true, data: data as string }
}
