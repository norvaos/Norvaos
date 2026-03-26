/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Jurisdiction Matcher  -  "Smart-Prefill: Strings to UUIDs"
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Maps raw jurisdiction strings (e.g., "Canada", "CAN", "Canadien") to
 * structured UUID entries in the jurisdictions table via 3-tier matching:
 *   1. Exact match on code or name
 *   2. Alias match on the JSONB aliases array
 *   3. Fuzzy match via pg_trgm similarity
 *
 * Flags fuzzy matches (confidence < 80%) for human review.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface JurisdictionInfo {
  id: string
  code: string
  name: string
  type: string
}

export interface JurisdictionMatchResult {
  match_type: 'exact' | 'alias' | 'fuzzy' | 'unresolved'
  confidence: number
  jurisdiction: JurisdictionInfo | null
  needs_review?: boolean
}

// ─── Main Function ───────────────────────────────────────────────────────────

/**
 * Match a raw string to a jurisdiction using the 3-tier RPC.
 */
export async function matchJurisdiction(
  supabase: SupabaseClient<Database>,
  rawInput: string
): Promise<JurisdictionMatchResult> {
  const { data, error } = await supabase.rpc('fn_match_jurisdiction', {
    p_raw_input: rawInput,
  })

  if (error) {
    throw new Error(`Jurisdiction match failed: ${error.message}`)
  }

  return data as unknown as JurisdictionMatchResult
}

/**
 * Match a jurisdiction and persist the result to the lead + audit table.
 */
export async function prefillJurisdiction(
  supabase: SupabaseClient<Database>,
  leadId: string,
  tenantId: string,
  rawInput: string
): Promise<JurisdictionMatchResult> {
  const result = await matchJurisdiction(supabase, rawInput)

  // Persist to audit trail
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any)
    .from('lead_jurisdiction_matches')
    .insert({
      tenant_id: tenantId,
      lead_id: leadId,
      raw_input: rawInput,
      matched_jurisdiction_id: result.jurisdiction?.id ?? null,
      match_type: result.match_type,
      confidence: result.confidence,
    })

  // If confident match, update the lead's jurisdiction_id
  if (result.jurisdiction && result.confidence >= 80) {
    await supabase
      .from('leads')
      .update({
        jurisdiction_id: result.jurisdiction.id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', leadId)
  }

  return result
}
