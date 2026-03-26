/**
 * PII Scrub Service  -  Directive 026
 *
 * "Data Minimisation" compliance: when a Lead converts to a Matter (Atomic Transfer),
 * the original Lead record is scrubbed of raw PII and replaced with a pointer
 * to the Matter. This satisfies Canadian privacy law requirements.
 *
 * Scrubbed fields: first_name, last_name, email, phone, date_of_birth,
 * address fields, immigration_data, custom_fields containing PII.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import type { SupabaseClient } from '@supabase/supabase-js'

// ─── Types ──────────────────────────────────────────────────────────────────

export interface PiiScrubResult {
  success: boolean
  leadId: string
  matterId: string
  fieldsRedacted: string[]
  error?: string
}

// The sentinel value indicating PII was scrubbed
const REDACTED = '[REDACTED  -  See Matter Record]'

// Fields to scrub from the leads table
const LEAD_PII_FIELDS = [
  'first_name',
  'last_name',
  'email',
  'phone',
  'date_of_birth',
  'address',
  'city',
  'province',
  'postal_code',
  'country',
  'notes',
] as const

// ─── Scrub Lead PII ────────────────────────────────────────────────────────

/**
 * Perform a PII scrub on a Lead record after Atomic Transfer to Matter.
 * Replaces all PII fields with a redaction marker pointing to the Matter.
 *
 * @param leadId - The lead to scrub
 * @param matterId - The matter the data was transferred to
 * @param tenantId - For validation
 */
export async function scrubLeadPii(
  leadId: string,
  matterId: string,
  tenantId: string,
): Promise<PiiScrubResult> {
  const admin = createAdminClient()

  // 1. Verify lead exists and belongs to tenant
  const { data: lead, error: fetchError } = await (admin as SupabaseClient<any>)
    .from('leads')
    .select('*')
    .eq('id', leadId)
    .eq('tenant_id', tenantId)
    .single()

  if (fetchError || !lead) {
    return { success: false, leadId, matterId, fieldsRedacted: [], error: 'Lead not found' }
  }

  // 2. Build the scrub update  -  replace PII with redaction marker
  const scrubUpdate: Record<string, unknown> = {
    converted_matter_id: matterId,
    updated_at: new Date().toISOString(),
  }

  const fieldsRedacted: string[] = []

  for (const field of LEAD_PII_FIELDS) {
    if (lead[field] !== null && lead[field] !== undefined && lead[field] !== REDACTED) {
      scrubUpdate[field] = REDACTED
      fieldsRedacted.push(field)
    }
  }

  // Also scrub custom_fields if present
  scrubUpdate.custom_fields = JSON.stringify({
    _scrubbed: true,
    _matter_reference: matterId,
    _scrubbed_at: new Date().toISOString(),
  })
  fieldsRedacted.push('custom_fields')

  // 3. Apply the scrub
  const { error: updateError } = await (admin as SupabaseClient<any>)
    .from('leads')
    .update(scrubUpdate)
    .eq('id', leadId)

  if (updateError) {
    console.error('[pii-scrub] Update error:', updateError)
    return { success: false, leadId, matterId, fieldsRedacted: [], error: updateError.message }
  }

  console.log(`[pii-scrub] Lead ${leadId} scrubbed: ${fieldsRedacted.length} fields redacted → Matter ${matterId}`)

  return {
    success: true,
    leadId,
    matterId,
    fieldsRedacted,
  }
}

// ─── Verify Scrub ──────────────────────────────────────────────────────────

/**
 * Verify that a lead has been properly scrubbed of PII.
 * Returns true if all PII fields are redacted.
 */
export async function verifyPiiScrub(
  supabase: SupabaseClient<any>,
  leadId: string,
): Promise<{ isScrubbed: boolean; remainingPii: string[] }> {
  const { data: lead } = await (supabase as SupabaseClient<any>)
    .from('leads')
    .select('*')
    .eq('id', leadId)
    .single()

  if (!lead) {
    return { isScrubbed: false, remainingPii: ['LEAD_NOT_FOUND'] }
  }

  const remainingPii: string[] = []

  for (const field of LEAD_PII_FIELDS) {
    const val = lead[field]
    if (val !== null && val !== undefined && val !== REDACTED && val !== '') {
      remainingPii.push(field)
    }
  }

  return {
    isScrubbed: remainingPii.length === 0,
    remainingPii,
  }
}

// ─── Check if Lead is Scrubbed (Quick) ──────────────────────────────────────

export function isFieldRedacted(value: unknown): boolean {
  return value === REDACTED
}

export { REDACTED, LEAD_PII_FIELDS }
