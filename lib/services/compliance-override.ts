/**
 * Compliance Override Service  -  Directive 026
 *
 * Emergency Override: allows Partner/Admin to bypass "Red" readiness blockers
 * (stale documents, continuity gaps, compliance pillars) with:
 *   - Partner-level PIN verification
 *   - 50-character minimum justification
 *   - Permanent hash amendment to the Genesis Block + Firm Audit Ledger
 */

import { createAdminClient } from '@/lib/supabase/admin'
import type { SupabaseClient } from '@supabase/supabase-js'

// ─── Types ──────────────────────────────────────────────────────────────────

export type OverrideType = 'stale_document' | 'gap_blocker' | 'compliance_pillar' | 'financial_hold'

export interface ComplianceOverride {
  id: string
  matter_id: string
  override_type: OverrideType
  blocked_node: string
  original_status: string
  justification: string
  justification_hash: string
  authorized_by: string
  authorized_role: string
  genesis_amendment_hash: string | null
  is_active: boolean
  expires_at: string | null
  created_at: string
}

export interface LogOverrideParams {
  tenantId: string
  matterId: string
  userId: string
  overrideType: OverrideType
  blockedNode: string
  originalStatus: string
  justification: string
  partnerPin: string
}

export interface LogOverrideResult {
  success: boolean
  override_id?: string
  amendment_hash?: string
  error?: string
}

// ─── Log Override ───────────────────────────────────────────────────────────

export async function logComplianceOverride(
  params: LogOverrideParams,
): Promise<LogOverrideResult> {
  // Client-side validation before RPC
  if (params.justification.trim().length < 50) {
    return { success: false, error: 'Justification must be at least 50 characters' }
  }

  if (params.partnerPin.trim().length < 4) {
    return { success: false, error: 'Partner PIN must be at least 4 characters' }
  }

  const admin = createAdminClient()

  const { data, error } = await (admin as any).rpc('fn_log_compliance_override', {
    p_tenant_id: params.tenantId,
    p_matter_id: params.matterId,
    p_user_id: params.userId,
    p_override_type: params.overrideType,
    p_blocked_node: params.blockedNode,
    p_original_status: params.originalStatus,
    p_justification: params.justification.trim(),
    p_partner_pin: params.partnerPin,
  })

  if (error) {
    console.error('[compliance-override] RPC error:', error)
    return { success: false, error: error.message }
  }

  const result = data as Record<string, unknown>
  return {
    success: result.success as boolean,
    override_id: result.override_id as string | undefined,
    amendment_hash: result.amendment_hash as string | undefined,
    error: result.error as string | undefined,
  }
}

// ─── Get Active Overrides for Matter ────────────────────────────────────────

export async function getMatterOverrides(
  supabase: SupabaseClient<any>,
  matterId: string,
): Promise<ComplianceOverride[]> {
  const { data, error } = await (supabase as SupabaseClient<any>)
    .from('compliance_overrides')
    .select('*')
    .eq('matter_id', matterId)
    .eq('is_active', true)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[compliance-override] Fetch error:', error)
    return []
  }

  return (data ?? []) as ComplianceOverride[]
}

// ─── Revoke Override ────────────────────────────────────────────────────────

export async function revokeOverride(params: {
  overrideId: string
  userId: string
  reason: string
}): Promise<{ success: boolean; error?: string }> {
  if (params.reason.trim().length < 10) {
    return { success: false, error: 'Revocation reason must be at least 10 characters' }
  }

  const admin = createAdminClient()

  const { error } = await (admin as SupabaseClient<any>)
    .from('compliance_overrides')
    .update({
      is_active: false,
      revoked_at: new Date().toISOString(),
      revoked_by: params.userId,
      revocation_reason: params.reason.trim(),
    })
    .eq('id', params.overrideId)

  if (error) {
    console.error('[compliance-override] Revoke error:', error)
    return { success: false, error: error.message }
  }

  return { success: true }
}

// ─── Check if matter has active override for a blocker ──────────────────────

export async function hasActiveOverride(
  supabase: SupabaseClient<any>,
  matterId: string,
  blockedNode: string,
): Promise<boolean> {
  const { data } = await (supabase as SupabaseClient<any>)
    .from('compliance_overrides')
    .select('id')
    .eq('matter_id', matterId)
    .eq('blocked_node', blockedNode)
    .eq('is_active', true)
    .or('expires_at.is.null,expires_at.gt.' + new Date().toISOString())
    .limit(1)
    .maybeSingle()

  return !!data
}
