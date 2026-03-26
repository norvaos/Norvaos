// ============================================================================
// Trust Transaction Log Service — Append-Only Audit Trail
// ============================================================================
// Manages the immutable trust_transaction_log table. Every trust accounting
// event (deposit, disbursement, transfer, hold change, reconciliation action,
// etc.) is recorded here as an append-only entry with hash chaining.
//
// Write path: Uses admin client (bypasses RLS) so log entries are never
// blocked by row-level security. Errors are logged but never thrown — the
// primary trust operation must not fail because of a logging issue.
//
// Read path: Uses the caller's RLS-scoped Supabase client so tenants can
// only see their own log entries.
//
// All amounts are BIGINT (cents). Sequence numbers and hashes are set by
// database triggers — the service does not compute them.
// ============================================================================

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Json } from '@/lib/types/database'
import { createAdminClient } from '@/lib/supabase/admin'

// ─── Typed Table Accessors ──────────────────────────────────────────────────
// trust_transaction_log is not yet registered in the Database['public']['Tables']
// interface. These helpers provide clean .from() access without TS errors.

/* eslint-disable @typescript-eslint/no-explicit-any */
const from = {
  trustTransactionLog: (c: SupabaseClient<Database>) =>
    (c as SupabaseClient<any>).from('trust_transaction_log'),
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ServiceResult<T = void> {
  success: boolean
  data?: T
  error?: string
}

export type TransactionLogEventType =
  | 'deposit_recorded'
  | 'disbursement_recorded'
  | 'transfer_recorded'
  | 'reversal_recorded'
  | 'hold_created'
  | 'hold_released'
  | 'hold_cancelled'
  | 'reconciliation_created'
  | 'reconciliation_completed'
  | 'reconciliation_reviewed'
  | 'disbursement_request_prepared'
  | 'disbursement_request_approved'
  | 'disbursement_request_rejected'
  | 'balance_warning'
  | 'overdraft_prevented'

export interface TransactionLogEntry {
  id: string
  tenant_id: string
  event_type: TransactionLogEventType
  trust_account_id: string | null
  matter_id: string | null
  transaction_id: string | null
  related_entity_type: string | null
  related_entity_id: string | null
  balance_before_cents: number | null
  balance_after_cents: number | null
  amount_cents: number | null
  performed_by: string
  performed_at: string
  description: string
  metadata: Record<string, unknown>
  sequence_number: number
  created_at: string
}

export interface AppendLogParams {
  tenantId: string
  eventType: TransactionLogEventType
  performedBy: string
  description: string
  trustAccountId?: string
  matterId?: string
  transactionId?: string
  relatedEntityType?: string
  relatedEntityId?: string
  balanceBeforeCents?: number
  balanceAfterCents?: number
  amountCents?: number
  metadata?: Record<string, unknown>
}

export interface QueryLogParams {
  supabase: SupabaseClient<Database>
  tenantId: string
  trustAccountId?: string
  matterId?: string
  eventType?: TransactionLogEventType
  dateFrom?: string
  dateTo?: string
  page?: number
  pageSize?: number
}

export interface PaginatedResult<T> {
  data: T[]
  total: number
  page: number
  pageSize: number
}

// ─── Constants ──────────────────────────────────────────────────────────────

const LOG_PREFIX = '[trust-transaction-log]'
const DEFAULT_PAGE_SIZE = 50
const MAX_PAGE_SIZE = 200

// ─── Internal Helpers ───────────────────────────────────────────────────────

/**
 * Clamp page/pageSize to safe bounds.
 */
function normalizePagination(page?: number, pageSize?: number) {
  const p = Math.max(1, page ?? 1)
  const ps = Math.min(MAX_PAGE_SIZE, Math.max(1, pageSize ?? DEFAULT_PAGE_SIZE))
  const fromIdx = (p - 1) * ps
  const to = fromIdx + ps - 1
  return { page: p, pageSize: ps, from: fromIdx, to }
}

// ─── 1. Append Log Entry ────────────────────────────────────────────────────

/**
 * Append an immutable entry to the trust transaction log.
 *
 * Uses the admin client to bypass RLS — log writes must never be blocked.
 * Follows fire-and-forget semantics: errors are logged to console but never
 * thrown, so the calling trust operation is never interrupted by a log failure.
 */
export async function appendLogEntry(
  params: AppendLogParams,
): Promise<ServiceResult<{ id: string; sequence_number: number }>> {
  try {
    const admin = createAdminClient()

    const entry = {
      tenant_id: params.tenantId,
      event_type: params.eventType,
      performed_by: params.performedBy,
      description: params.description,
      trust_account_id: params.trustAccountId ?? null,
      matter_id: params.matterId ?? null,
      transaction_id: params.transactionId ?? null,
      related_entity_type: params.relatedEntityType ?? null,
      related_entity_id: params.relatedEntityId ?? null,
      balance_before_cents: params.balanceBeforeCents ?? null,
      balance_after_cents: params.balanceAfterCents ?? null,
      amount_cents: params.amountCents ?? null,
      metadata: (params.metadata ?? {}) as Json,
    }

    const { data, error } = await from.trustTransactionLog(admin)
      .insert(entry)
      .select('id, sequence_number')
      .single()

    if (error) {
      console.error(`${LOG_PREFIX} Failed to append log entry:`, error.message)
      return { success: false, error: error.message }
    }

    return {
      success: true,
      data: {
        id: data.id,
        sequence_number: data.sequence_number,
      },
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error appending log entry'
    console.error(`${LOG_PREFIX} Unexpected error:`, message)
    return { success: false, error: message }
  }
}

// ─── 2. Query Transaction Log ───────────────────────────────────────────────

/**
 * Query the trust transaction log with optional filters and pagination.
 *
 * Uses the caller's RLS-scoped Supabase client so tenants can only read
 * their own log entries.
 */
export async function queryTransactionLog(
  params: QueryLogParams,
): Promise<ServiceResult<PaginatedResult<TransactionLogEntry>>> {
  const { supabase, tenantId, trustAccountId, matterId, eventType, dateFrom, dateTo } = params
  const { page, pageSize, from: fromIdx, to } = normalizePagination(params.page, params.pageSize)

  try {
    // Build count query
    let countQuery = from.trustTransactionLog(supabase)
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)

    if (trustAccountId) countQuery = countQuery.eq('trust_account_id', trustAccountId)
    if (matterId) countQuery = countQuery.eq('matter_id', matterId)
    if (eventType) countQuery = countQuery.eq('event_type', eventType)
    if (dateFrom) countQuery = countQuery.gte('performed_at', dateFrom)
    if (dateTo) countQuery = countQuery.lte('performed_at', dateTo)

    const { count, error: countError } = await countQuery

    if (countError) {
      console.error(`${LOG_PREFIX} Count query failed:`, countError.message)
      return { success: false, error: countError.message }
    }

    // Build data query
    let dataQuery = from.trustTransactionLog(supabase)
      .select('*')
      .eq('tenant_id', tenantId)

    if (trustAccountId) dataQuery = dataQuery.eq('trust_account_id', trustAccountId)
    if (matterId) dataQuery = dataQuery.eq('matter_id', matterId)
    if (eventType) dataQuery = dataQuery.eq('event_type', eventType)
    if (dateFrom) dataQuery = dataQuery.gte('performed_at', dateFrom)
    if (dateTo) dataQuery = dataQuery.lte('performed_at', dateTo)

    dataQuery = dataQuery
      .order('sequence_number', { ascending: false })
      .range(fromIdx, to)

    const { data, error } = await dataQuery

    if (error) {
      console.error(`${LOG_PREFIX} Query failed:`, error.message)
      return { success: false, error: error.message }
    }

    return {
      success: true,
      data: {
        data: (data ?? []) as TransactionLogEntry[],
        total: count ?? 0,
        page,
        pageSize,
      },
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error querying transaction log'
    console.error(`${LOG_PREFIX} Unexpected error:`, message)
    return { success: false, error: message }
  }
}

// ─── 3. Get Log Entry by Sequence Number ────────────────────────────────────

/**
 * Retrieve a single log entry by its sequence number within a tenant.
 */
export async function getLogEntryBySequence(
  supabase: SupabaseClient<Database>,
  tenantId: string,
  sequenceNumber: number,
): Promise<ServiceResult<TransactionLogEntry>> {
  try {
    const { data, error } = await from.trustTransactionLog(supabase)
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('sequence_number', sequenceNumber)
      .single()

    if (error) {
      console.error(`${LOG_PREFIX} Lookup by sequence failed:`, error.message)
      return { success: false, error: error.message }
    }

    return { success: true, data: data as TransactionLogEntry }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error fetching log entry'
    console.error(`${LOG_PREFIX} Unexpected error:`, message)
    return { success: false, error: message }
  }
}

// ─── 4. Get Latest Log Entries ──────────────────────────────────────────────

/**
 * Retrieve the N most recent log entries for a tenant, ordered by
 * sequence_number descending.
 */
export async function getLatestLogEntries(
  supabase: SupabaseClient<Database>,
  tenantId: string,
  count: number = 10,
): Promise<ServiceResult<TransactionLogEntry[]>> {
  const safeCount = Math.min(Math.max(1, count), MAX_PAGE_SIZE)

  try {
    const { data, error } = await from.trustTransactionLog(supabase)
      .select('*')
      .eq('tenant_id', tenantId)
      .order('sequence_number', { ascending: false })
      .limit(safeCount)

    if (error) {
      console.error(`${LOG_PREFIX} Latest entries query failed:`, error.message)
      return { success: false, error: error.message }
    }

    return { success: true, data: (data ?? []) as TransactionLogEntry[] }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error fetching latest entries'
    console.error(`${LOG_PREFIX} Unexpected error:`, message)
    return { success: false, error: message }
  }
}

// ─── 5. Get Log Entries for Transaction ─────────────────────────────────────

/**
 * Retrieve all log entries related to a specific trust transaction,
 * ordered by sequence_number ascending (chronological).
 */
export async function getLogEntriesForTransaction(
  supabase: SupabaseClient<Database>,
  tenantId: string,
  transactionId: string,
): Promise<ServiceResult<TransactionLogEntry[]>> {
  try {
    const { data, error } = await from.trustTransactionLog(supabase)
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('transaction_id', transactionId)
      .order('sequence_number', { ascending: true })

    if (error) {
      console.error(`${LOG_PREFIX} Transaction log query failed:`, error.message)
      return { success: false, error: error.message }
    }

    return { success: true, data: (data ?? []) as TransactionLogEntry[] }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error fetching transaction log entries'
    console.error(`${LOG_PREFIX} Unexpected error:`, message)
    return { success: false, error: message }
  }
}
