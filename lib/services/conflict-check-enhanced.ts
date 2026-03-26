/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Enhanced Conflict Check — 3-Way Auto-Audit (Directive 5.5)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Before auto-converting a Lead to a Matter via trust deposit, run a 3-way
 * check: Name, Date of Birth, and Passport Number against all active and
 * archived matters.
 *
 * This extends the existing fn_conflict_check_alpha with:
 *   - Name matching (exact, case-insensitive)
 *   - Date of Birth matching
 *   - Archived matter scanning (not just active contacts)
 *   - Per-match metadata (is_active, has_matters)
 *
 * Uses fn_conflict_check_enhanced RPC (migration 182).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'
import { log } from '@/lib/utils/logger'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface EnhancedConflictMatch {
  contact_id: string
  contact_name: string
  match_field: 'passport_number' | 'email' | 'name_and_dob' | 'name_only'
  is_active: boolean
  has_matters: boolean
}

export interface EnhancedConflictResult {
  has_conflicts: boolean
  match_count: number
  matches: EnhancedConflictMatch[]
  checked_fields: string[]
  includes_archived: boolean
  /** Severity: 'block' if passport/email match, 'review' if name-only */
  severity: 'block' | 'review' | 'clear'
  error?: string
}

// Match fields that should block auto-conversion (high confidence)
const BLOCKING_MATCH_FIELDS = new Set(['passport_number', 'email', 'name_and_dob'])

// ─── Main Function ───────────────────────────────────────────────────────────

/**
 * Run the enhanced 3-way conflict check for a lead.
 * Returns structured results with severity classification.
 */
export async function runEnhancedConflictCheck(
  supabase: SupabaseClient<Database>,
  leadId: string,
): Promise<EnhancedConflictResult> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).rpc('fn_conflict_check_enhanced', {
      p_lead_id: leadId,
    })

    if (error) {
      log.error('conflict_check_enhanced.rpc_failed', { lead_id: leadId, error: error.message })
      // Fall back to alpha check
      return fallbackToAlpha(supabase, leadId)
    }

    const result = data as unknown as {
      has_conflicts: boolean
      match_count: number
      matches: EnhancedConflictMatch[]
      checked_fields: string[]
      includes_archived: boolean
      error?: string
    }

    if (result.error) {
      return {
        ...result,
        severity: 'clear',
      }
    }

    // Determine severity based on match types
    const hasBlockingMatch = result.matches.some((m) => BLOCKING_MATCH_FIELDS.has(m.match_field))
    const hasNameOnlyMatch = result.matches.some((m) => m.match_field === 'name_only')

    let severity: 'block' | 'review' | 'clear' = 'clear'
    if (hasBlockingMatch) {
      severity = 'block'
    } else if (hasNameOnlyMatch) {
      severity = 'review'
    }

    return {
      ...result,
      severity,
    }
  } catch (err) {
    log.error('conflict_check_enhanced.failed', {
      lead_id: leadId,
      error: err instanceof Error ? err.message : 'Unknown',
    })
    return fallbackToAlpha(supabase, leadId)
  }
}

/**
 * Run conflict check and update the lead's conflict_status.
 */
export async function runAndPersistEnhancedConflictCheck(
  supabase: SupabaseClient<Database>,
  leadId: string,
): Promise<EnhancedConflictResult> {
  const result = await runEnhancedConflictCheck(supabase, leadId)

  if (!result.error) {
    let newStatus: string
    if (result.severity === 'block') {
      newStatus = 'conflict_detected'
    } else if (result.severity === 'review') {
      newStatus = 'review_required'
    } else {
      newStatus = 'auto_scan_complete'
    }

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

// ─── Fallback ────────────────────────────────────────────────────────────────

/**
 * If fn_conflict_check_enhanced doesn't exist yet (migration not run),
 * fall back to the existing alpha check.
 */
async function fallbackToAlpha(
  supabase: SupabaseClient<Database>,
  leadId: string,
): Promise<EnhancedConflictResult> {
  try {
    const { data, error } = await supabase.rpc('fn_conflict_check_alpha', {
      p_lead_id: leadId,
    })

    if (error) {
      return {
        has_conflicts: false,
        match_count: 0,
        matches: [],
        checked_fields: ['email', 'passport_number'],
        includes_archived: false,
        severity: 'clear',
        error: `Alpha fallback also failed: ${error.message}`,
      }
    }

    const alpha = data as unknown as {
      has_conflicts: boolean
      match_count: number
      matches: Array<{ contact_id: string; contact_name: string; match_field: string }>
    }

    return {
      has_conflicts: alpha.has_conflicts,
      match_count: alpha.match_count,
      matches: (alpha.matches ?? []).map((m) => ({
        contact_id: m.contact_id,
        contact_name: m.contact_name,
        match_field: m.match_field as EnhancedConflictMatch['match_field'],
        is_active: true,
        has_matters: false,
      })),
      checked_fields: ['email', 'passport_number'],
      includes_archived: false,
      severity: alpha.has_conflicts ? 'block' : 'clear',
    }
  } catch {
    return {
      has_conflicts: false,
      match_count: 0,
      matches: [],
      checked_fields: [],
      includes_archived: false,
      severity: 'clear',
      error: 'Both enhanced and alpha conflict checks failed.',
    }
  }
}
