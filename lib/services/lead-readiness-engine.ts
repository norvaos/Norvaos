/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Lead Readiness Engine  -  "Score Before You Convert"
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Calls the fn_calculate_lead_readiness RPC to compute a 0-100% readiness
 * score based on required fields for the lead's matter type.
 *
 * Budget: RPC executes in < 10ms (single query, no round trips).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface LeadMissingField {
  key: string
  label: string
  source: 'contact' | 'lead' | 'intake_profile' | 'screening'
}

export interface LeadReadinessBreakdown {
  field_key: string
  label: string
  filled: boolean
  source: string
}

export interface LeadReadinessResult {
  score: number
  total_fields: number
  filled_fields: number
  missing: LeadMissingField[]
  breakdown: LeadReadinessBreakdown[]
  error?: string
}

// ─── Main Function ───────────────────────────────────────────────────────────

/**
 * Calculate readiness score for a lead via server-side RPC.
 * Returns a 0-100% score with field-by-field breakdown.
 */
export async function calculateLeadReadiness(
  supabase: SupabaseClient<Database>,
  leadId: string
): Promise<LeadReadinessResult> {
  const { data, error } = await supabase.rpc('fn_calculate_lead_readiness', {
    p_lead_id: leadId,
  })

  if (error) {
    throw new Error(`Readiness calculation failed: ${error.message}`)
  }

  const result = data as unknown as LeadReadinessResult
  return result
}

/**
 * Calculate readiness and persist the score to the leads table.
 */
export async function calculateAndPersistReadiness(
  supabase: SupabaseClient<Database>,
  leadId: string
): Promise<LeadReadinessResult> {
  const result = await calculateLeadReadiness(supabase, leadId)

  if (!result.error) {
    // Persist cached score (lean update: 3 columns)
    await supabase
      .from('leads')
      .update({
        readiness_score: result.score,
        readiness_breakdown: result.breakdown as unknown as Database['public']['Tables']['leads']['Update']['readiness_breakdown'],
        updated_at: new Date().toISOString(),
      })
      .eq('id', leadId)
  }

  return result
}

/**
 * Get just the missing fields for a lead (convenience wrapper).
 */
export async function getLeadMissingFields(
  supabase: SupabaseClient<Database>,
  leadId: string
): Promise<LeadMissingField[]> {
  const result = await calculateLeadReadiness(supabase, leadId)
  return result.missing ?? []
}
