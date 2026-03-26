/**
 * Compliance Examination Snapshot Service — Directive 004, Pillar 1
 *
 * Generates Law Society examination-ready compliance snapshots that verify
 * audit chain integrity and produce immutable reports. Each snapshot captures
 * the state of trust audit chains, sentinel chains, transaction counts,
 * reconciliation status, and unresolved discrepancies for a given period.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'
import { createAdminClient } from '@/lib/supabase/admin'
import type { ServiceResult } from './trust-types'
import { normalizePagination } from './trust-types'

// ─── Table accessors (tables not in generated Database type) ────────────────

const from = {
  complianceSnapshots: (c: SupabaseClient<Database>) =>
    (c as SupabaseClient<any>).from('compliance_examination_snapshots'),
}

// ─── Types ──────────────────────────────────────────────────────────────────

export type SnapshotType = 'law_society_exam' | 'internal_audit' | 'annual_review'

export interface GenerateSnapshotParams {
  supabase: SupabaseClient<Database>
  tenantId: string
  userId: string
  snapshotType: SnapshotType
  periodStart: string // YYYY-MM-DD
  periodEnd: string   // YYYY-MM-DD
}

export interface ComplianceSnapshot {
  id: string
  tenant_id: string
  snapshot_type: string
  generated_by: string
  generated_at: string
  period_start: string
  period_end: string
  trust_audit_chain_valid: boolean
  sentinel_chain_valid: boolean
  transaction_count: number
  reconciliation_count: number
  unresolved_discrepancies: number
  snapshot_data: Record<string, unknown>
  checksum_sha256: string
  created_at: string
}

export interface ChainVerificationResult {
  trust_audit_valid: boolean
  sentinel_valid: boolean
  trust_audit_checked: number
  sentinel_checked: number
}

// ─── Generate compliance examination snapshot ───────────────────────────────

export async function generateComplianceSnapshot(
  params: GenerateSnapshotParams,
): Promise<ServiceResult<ComplianceSnapshot>> {
  try {
    const admin = createAdminClient()

    const { data, error } = await (admin as SupabaseClient<any>).rpc(
      'rpc_generate_compliance_snapshot',
      {
        p_tenant_id: params.tenantId,
        p_user_id: params.userId,
        p_snapshot_type: params.snapshotType,
        p_period_start: params.periodStart,
        p_period_end: params.periodEnd,
      },
    )

    if (error) {
      return { success: false, error: error.message }
    }

    // The RPC returns the snapshot row (single object or array with one element)
    const snapshot: ComplianceSnapshot = Array.isArray(data) ? data[0] : data

    return { success: true, data: snapshot }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to generate compliance snapshot',
    }
  }
}

// ─── List snapshots (paginated) ─────────────────────────────────────────────

export async function listComplianceSnapshots(params: {
  supabase: SupabaseClient<Database>
  tenantId: string
  page?: number
  pageSize?: number
}): Promise<ServiceResult<{ snapshots: ComplianceSnapshot[]; total: number }>> {
  try {
    const { page, pageSize, from: fromIdx, to } = normalizePagination(
      params.page,
      params.pageSize,
    )

    const { data, error, count } = await from
      .complianceSnapshots(params.supabase)
      .select('*', { count: 'exact' })
      .eq('tenant_id', params.tenantId)
      .order('generated_at', { ascending: false })
      .range(fromIdx, to)

    if (error) {
      return { success: false, error: error.message }
    }

    return {
      success: true,
      data: {
        snapshots: (data ?? []) as ComplianceSnapshot[],
        total: count ?? 0,
      },
    }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to list compliance snapshots',
    }
  }
}

// ─── Get single snapshot by ID ──────────────────────────────────────────────

export async function getComplianceSnapshot(params: {
  supabase: SupabaseClient<Database>
  snapshotId: string
}): Promise<ServiceResult<ComplianceSnapshot>> {
  try {
    const { data, error } = await from
      .complianceSnapshots(params.supabase)
      .select('*')
      .eq('id', params.snapshotId)
      .single()

    if (error) {
      return { success: false, error: error.message }
    }

    return { success: true, data: data as ComplianceSnapshot }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to fetch compliance snapshot',
    }
  }
}

// ─── Verify audit chain integrity ───────────────────────────────────────────

export async function verifyAuditChains(params: {
  supabase: SupabaseClient<Database>
}): Promise<ServiceResult<ChainVerificationResult>> {
  try {
    const admin = createAdminClient()
    const client = admin as SupabaseClient<any>

    // Run both chain verification RPCs in parallel
    const [trustResult, sentinelResult] = await Promise.all([
      client.rpc('trust_audit_verify_chain'),
      client.rpc('sentinel_verify_chain'),
    ])

    if (trustResult.error) {
      return { success: false, error: `Trust audit chain verification failed: ${trustResult.error.message}` }
    }

    if (sentinelResult.error) {
      return { success: false, error: `Sentinel chain verification failed: ${sentinelResult.error.message}` }
    }

    // Each RPC returns { valid: boolean, checked: number } or similar
    const trustData = Array.isArray(trustResult.data) ? trustResult.data[0] : trustResult.data
    const sentinelData = Array.isArray(sentinelResult.data) ? sentinelResult.data[0] : sentinelResult.data

    return {
      success: true,
      data: {
        trust_audit_valid: trustData?.valid ?? trustData?.is_valid ?? false,
        sentinel_valid: sentinelData?.valid ?? sentinelData?.is_valid ?? false,
        trust_audit_checked: trustData?.checked ?? trustData?.rows_checked ?? 0,
        sentinel_checked: sentinelData?.checked ?? sentinelData?.rows_checked ?? 0,
      },
    }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to verify audit chains',
    }
  }
}
