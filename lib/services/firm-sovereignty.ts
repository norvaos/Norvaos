/**
 * Firm Sovereignty Service  -  Directive 027
 *
 * "Genesis Zero"  -  the firm's birth certificate. Once initialized,
 * the Sovereign Red Pulse is armed and any database drift triggers alerts.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import type { SupabaseClient } from '@supabase/supabase-js'

// ─── Types ──────────────────────────────────────────────────────────────────

export interface GenesisZeroResult {
  success: boolean
  genesis_hash?: string
  firm_name?: string
  snapshot?: {
    total_matters: number
    sealed_genesis_blocks: number
    trust_audit_entries: number
    total_contacts: number
  }
  message?: string
  error?: string
}

export interface FirmAuditEntry {
  id: string
  event_type: string
  event_payload: Record<string, unknown>
  event_hash: string
  prev_hash: string
  chain_seq: number
  created_by: string | null
  created_at: string
}

// ─── Initialize Firm Sovereignty ────────────────────────────────────────────

export async function initializeFirmSovereignty(
  tenantId: string,
  userId: string,
): Promise<GenesisZeroResult> {
  const admin = createAdminClient()

  const { data, error } = await (admin as any).rpc('fn_initialize_firm_sovereignty', {
    p_tenant_id: tenantId,
    p_user_id: userId,
  })

  if (error) {
    console.error('[firm-sovereignty] RPC error:', error)
    return { success: false, error: error.message }
  }

  const result = data as Record<string, unknown>
  return {
    success: result.success as boolean,
    genesis_hash: result.genesis_hash as string | undefined,
    firm_name: result.firm_name as string | undefined,
    snapshot: result.snapshot as GenesisZeroResult['snapshot'],
    message: result.message as string | undefined,
    error: result.error as string | undefined,
  }
}

// ─── Check if Genesis Zero Exists ───────────────────────────────────────────

export async function isGenesisZeroInitialized(
  supabase: SupabaseClient<any>,
  tenantId: string,
): Promise<{ initialized: boolean; hash?: string; initializedAt?: string }> {
  const { data } = await (supabase as SupabaseClient<any>)
    .from('firm_global_audit_ledger')
    .select('event_hash, created_at')
    .eq('tenant_id', tenantId)
    .eq('event_type', 'genesis_zero')
    .maybeSingle()

  if (!data) return { initialized: false }

  return {
    initialized: true,
    hash: data.event_hash,
    initializedAt: data.created_at,
  }
}

// ─── Get Firm Audit Trail ───────────────────────────────────────────────────

export async function getFirmAuditTrail(
  supabase: SupabaseClient<any>,
  tenantId: string,
  limit = 50,
): Promise<FirmAuditEntry[]> {
  const { data, error } = await (supabase as SupabaseClient<any>)
    .from('firm_global_audit_ledger')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('chain_seq', { ascending: false })
    .limit(limit)

  if (error) {
    console.error('[firm-sovereignty] Audit trail fetch error:', error)
    return []
  }

  return (data ?? []) as FirmAuditEntry[]
}

// ─── Verify Firm Audit Chain Integrity ──────────────────────────────────────

export async function verifyFirmAuditChain(
  supabase: SupabaseClient<any>,
  tenantId: string,
): Promise<{ valid: boolean; entries: number; brokenAt?: number }> {
  const { data, error } = await (supabase as SupabaseClient<any>)
    .from('firm_global_audit_ledger')
    .select('chain_seq, event_hash, prev_hash')
    .eq('tenant_id', tenantId)
    .order('chain_seq', { ascending: true })

  if (error || !data) return { valid: false, entries: 0 }

  const entries = data as Array<{ chain_seq: number; event_hash: string; prev_hash: string }>

  if (entries.length === 0) return { valid: true, entries: 0 }

  // Genesis Zero should have prev_hash = FIRM_SOVEREIGNTY_GENESIS_v1
  if (entries[0].prev_hash !== 'FIRM_SOVEREIGNTY_GENESIS_v1') {
    return { valid: false, entries: entries.length, brokenAt: 1 }
  }

  for (let i = 1; i < entries.length; i++) {
    if (entries[i].prev_hash !== entries[i - 1].event_hash) {
      return { valid: false, entries: entries.length, brokenAt: entries[i].chain_seq }
    }
  }

  return { valid: true, entries: entries.length }
}
