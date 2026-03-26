/**
 * Auto-Reconciliation Service — Directive 004, Pillar 2
 *
 * Automated three-way reconciliation with disbursement lockdown.
 * Runs reconciliation via RPC, manages disbursement locks based on
 * discrepancy status, and provides CRUD for reconciliation schedules.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'
import { createAdminClient } from '@/lib/supabase/admin'
import type { ServiceResult } from './trust-types'
import { normalizePagination } from './trust-types'

// ─── Table accessors (tables not in generated Database type) ────────────────

const from = {
  reconciliationDiscrepancies: (c: SupabaseClient<Database>) =>
    (c as SupabaseClient<any>).from('reconciliation_discrepancies'),
  reconciliationSchedule: (c: SupabaseClient<Database>) =>
    (c as SupabaseClient<any>).from('reconciliation_schedule'),
  disbursementLocks: (c: SupabaseClient<Database>) =>
    (c as SupabaseClient<any>).from('disbursement_locks'),
}

// ─── Types ──────────────────────────────────────────────────────────────────

export interface AutoReconcileParams {
  supabase: SupabaseClient<Database>
  tenantId: string
  userId: string
  trustAccountId: string
  periodStart: string // YYYY-MM-DD
  periodEnd: string   // YYYY-MM-DD
}

export interface AutoReconcileResult {
  reconciliation_id: string
  status: string
  book_balance: number
  bank_balance: number
  client_listing_total: number
  discrepancies_found: number
  disbursement_locked: boolean
}

export interface Discrepancy {
  id: string
  tenant_id: string
  trust_account_id: string
  reconciliation_id: string
  discrepancy_type: string
  amount: number
  description: string
  status: string
  resolved_by: string | null
  resolved_at: string | null
  resolution_notes: string | null
  created_at: string
}

export interface DisbursementLockStatus {
  locked: boolean
  reason: string | null
  locked_at: string | null
}

export type ReconciliationFrequency = 'daily' | 'weekly' | 'monthly'

export interface ReconciliationScheduleRow {
  id: string
  tenant_id: string
  trust_account_id: string
  frequency: ReconciliationFrequency
  next_run_date: string
  last_run_date: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

// ─── 1. Run auto-reconciliation ─────────────────────────────────────────────

export async function runAutoReconciliation(
  params: AutoReconcileParams,
): Promise<ServiceResult<AutoReconcileResult>> {
  try {
    const admin = createAdminClient()

    const { data, error } = await (admin as SupabaseClient<any>).rpc(
      'rpc_auto_reconcile',
      {
        p_tenant_id: params.tenantId,
        p_user_id: params.userId,
        p_trust_account_id: params.trustAccountId,
        p_period_start: params.periodStart,
        p_period_end: params.periodEnd,
      },
    )

    if (error) {
      return { success: false, error: error.message }
    }

    const result: AutoReconcileResult = Array.isArray(data) ? data[0] : data

    return { success: true, data: result }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to run auto-reconciliation',
    }
  }
}

// ─── 2. Check disbursement lock status ──────────────────────────────────────

export async function checkDisbursementLock(
  supabase: SupabaseClient<Database>,
  tenantId: string,
  trustAccountId: string,
): Promise<ServiceResult<DisbursementLockStatus>> {
  try {
    const { data, error } = await from
      .disbursementLocks(supabase)
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('trust_account_id', trustAccountId)
      .eq('is_active', true)
      .maybeSingle()

    if (error) {
      return { success: false, error: error.message }
    }

    if (!data) {
      return {
        success: true,
        data: { locked: false, reason: null, locked_at: null },
      }
    }

    return {
      success: true,
      data: {
        locked: true,
        reason: data.reason ?? 'Unresolved reconciliation discrepancies',
        locked_at: data.locked_at ?? data.created_at,
      },
    }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to check disbursement lock',
    }
  }
}

// ─── 3. Get discrepancies ───────────────────────────────────────────────────

export async function getDiscrepancies(
  supabase: SupabaseClient<Database>,
  tenantId: string,
  trustAccountId: string,
  status?: 'open' | 'resolved' | 'dismissed',
): Promise<ServiceResult<Discrepancy[]>> {
  try {
    let query = from
      .reconciliationDiscrepancies(supabase)
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('trust_account_id', trustAccountId)
      .order('created_at', { ascending: false })

    if (status) {
      query = query.eq('status', status)
    }

    const { data, error } = await query

    if (error) {
      return { success: false, error: error.message }
    }

    return { success: true, data: (data ?? []) as Discrepancy[] }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to fetch discrepancies',
    }
  }
}

// ─── 4. Resolve a discrepancy ───────────────────────────────────────────────

export async function resolveDiscrepancy(
  supabase: SupabaseClient<Database>,
  tenantId: string,
  discrepancyId: string,
  userId: string,
  notes: string,
): Promise<ServiceResult<Discrepancy>> {
  try {
    const admin = createAdminClient()

    const { data, error } = await from
      .reconciliationDiscrepancies(admin)
      .update({
        status: 'resolved',
        resolved_by: userId,
        resolved_at: new Date().toISOString(),
        resolution_notes: notes,
      })
      .eq('id', discrepancyId)
      .eq('tenant_id', tenantId)
      .select()
      .single()

    if (error) {
      return { success: false, error: error.message }
    }

    // After resolving, check if all discrepancies for this account are resolved.
    // If so, release the disbursement lock.
    const trustAccountId = (data as Discrepancy).trust_account_id

    const { count } = await from
      .reconciliationDiscrepancies(admin)
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('trust_account_id', trustAccountId)
      .eq('status', 'open')

    if (count === 0) {
      // No more open discrepancies — release the lock
      await from
        .disbursementLocks(admin)
        .update({ is_active: false })
        .eq('tenant_id', tenantId)
        .eq('trust_account_id', trustAccountId)
        .eq('is_active', true)
    }

    // Audit log
    await (admin as SupabaseClient<any>).from('trust_audit_log').insert({
      tenant_id: tenantId,
      action: 'discrepancy_resolved',
      entity_type: 'reconciliation_discrepancy',
      entity_id: discrepancyId,
      user_id: userId,
      metadata: { resolution_notes: notes, trust_account_id: trustAccountId },
    })

    return { success: true, data: data as Discrepancy }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to resolve discrepancy',
    }
  }
}

// ─── 5. Get reconciliation schedule ─────────────────────────────────────────

export async function getReconciliationSchedule(
  supabase: SupabaseClient<Database>,
  tenantId: string,
): Promise<ServiceResult<ReconciliationScheduleRow[]>> {
  try {
    const { data, error } = await from
      .reconciliationSchedule(supabase)
      .select('*')
      .eq('tenant_id', tenantId)
      .order('next_run_date', { ascending: true })

    if (error) {
      return { success: false, error: error.message }
    }

    return { success: true, data: (data ?? []) as ReconciliationScheduleRow[] }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to fetch reconciliation schedule',
    }
  }
}

// ─── 6. Upsert reconciliation schedule ──────────────────────────────────────

export async function upsertReconciliationSchedule(
  supabase: SupabaseClient<Database>,
  tenantId: string,
  trustAccountId: string,
  frequency: ReconciliationFrequency,
  nextRunDate: string,
): Promise<ServiceResult<ReconciliationScheduleRow>> {
  try {
    const admin = createAdminClient()

    const { data, error } = await from
      .reconciliationSchedule(admin)
      .upsert(
        {
          tenant_id: tenantId,
          trust_account_id: trustAccountId,
          frequency,
          next_run_date: nextRunDate,
          is_active: true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'tenant_id,trust_account_id' },
      )
      .select()
      .single()

    if (error) {
      return { success: false, error: error.message }
    }

    return { success: true, data: data as ReconciliationScheduleRow }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to upsert reconciliation schedule',
    }
  }
}
