/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Conflict Check Alpha — "No Dirty Data Becomes a Matter"
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Pre-conversion conflict detection that searches same-tenant contacts
 * by email and passport number.
 *
 * Sentinel Guard: The RPC is SECURITY DEFINER with tenant isolation —
 * it NEVER reveals data from another tenant. Returns only "Conflict Detected"
 * with the matched field name, never the other tenant's details.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ConflictMatch {
  contact_id: string
  contact_name: string
  match_field: 'email_primary' | 'email_secondary' | 'passport_number'
}

export interface ConflictCheckResult {
  has_conflicts: boolean
  match_count: number
  matches: ConflictMatch[]
  error?: string
}

// ─── Main Function ───────────────────────────────────────────────────────────

/**
 * Run the alpha conflict check for a lead.
 * Searches same-tenant contacts by email and passport number.
 */
export async function runConflictCheckAlpha(
  supabase: SupabaseClient<Database>,
  leadId: string
): Promise<ConflictCheckResult> {
  const { data, error } = await supabase.rpc('fn_conflict_check_alpha', {
    p_lead_id: leadId,
  })

  if (error) {
    throw new Error(`Conflict check failed: ${error.message}`)
  }

  return data as unknown as ConflictCheckResult
}

/**
 * Run conflict check and update the lead's conflict_status accordingly.
 */
export async function runAndPersistConflictCheck(
  supabase: SupabaseClient<Database>,
  leadId: string
): Promise<ConflictCheckResult> {
  const result = await runConflictCheckAlpha(supabase, leadId)

  if (!result.error) {
    const newStatus = result.has_conflicts ? 'conflict_detected' : 'auto_scan_complete'

    await supabase
      .from('leads')
      .update({
        conflict_status: newStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('id', leadId)
  }

  return result
}
