// ============================================================================
// Trust Reporting Service  -  LSO-Compliant Trust Accounting Reports
// ============================================================================
// Provides read-only reporting functions for trust accounting:
//   - Client trust listing (By-Law 9 requirement)
//   - Account summary
//   - Transaction reports with filters
//   - Disbursement reports
//   - Cheque register
//   - Holds report
//   - Audit trail
//   - LSO compliance report (annual filing data)
//
// All monetary values are BIGINT (cents). UI is responsible for conversion.
// Uses RLS-scoped supabase client for reads; adminClient only for audit writes.
// ============================================================================

import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  Database,
  TrustBankAccountRow,
  TrustTransactionRow,
  TrustTransactionType,
  TrustReconciliationRow,
  TrustDisbursementRequestRow,
  TrustDisbursementRequestStatus,
  TrustDisbursementRequestType,
  TrustHoldRow,
  TrustAuditLogRow,
  ChequeRow,
  ChequeAccountType,
  ChequeStatus,
} from '@/lib/types/database'
import type { ServiceResult, PaginationParams, PaginatedResult } from './trust-types'

// ─── Shared Types (re-exported from trust-types) ───────────────────────────

export type { ServiceResult, PaginationParams, PaginatedResult } from './trust-types'

// ─── Report-Specific Types ─────────────────────────────────────────────────

export interface ClientTrustListingItem {
  matter_id: string
  matter_title: string
  client_first_name: string | null
  client_last_name: string | null
  balance_cents: number
  last_transaction_date: string | null
}

export interface ClientTrustListingReport {
  trust_account_id: string
  account_name: string
  as_of_date: string
  items: ClientTrustListingItem[]
  total_balance_cents: number
}

export interface AccountSummaryReport {
  account: Pick<
    TrustBankAccountRow,
    | 'id'
    | 'account_name'
    | 'bank_name'
    | 'account_type'
    | 'opened_date'
    | 'jurisdiction_code'
    | 'is_active'
    | 'currency'
  >
  total_balance_cents: number
  active_matter_count: number
  last_reconciliation: Pick<
    TrustReconciliationRow,
    'id' | 'period_end' | 'status' | 'is_balanced' | 'completed_at'
  > | null
  outstanding_holds_total_cents: number
}

export interface TransactionReportFilters {
  trustAccountId?: string
  matterId?: string
  dateFrom?: string
  dateTo?: string
  transactionType?: TrustTransactionType
}

export interface TransactionReportRow {
  id: string
  trust_account_id: string
  matter_id: string
  matter_title: string
  contact_first_name: string | null
  contact_last_name: string | null
  transaction_type: TrustTransactionType
  amount_cents: number
  running_balance_cents: number
  description: string
  reference_number: string | null
  payment_method: string | null
  effective_date: string
  is_cleared: boolean
  created_at: string
}

export interface DisbursementReportFilters {
  trustAccountId?: string
  matterId?: string
  status?: TrustDisbursementRequestStatus
  dateFrom?: string
  dateTo?: string
}

export interface DisbursementReportRow {
  id: string
  trust_account_id: string
  matter_id: string
  matter_title: string
  amount_cents: number
  payee_name: string
  description: string
  payment_method: string
  request_type: TrustDisbursementRequestType
  status: TrustDisbursementRequestStatus
  prepared_by: string
  prepared_at: string
  approved_by: string | null
  approved_at: string | null
  rejected_by: string | null
  rejection_reason: string | null
  authorization_type: string | null
  created_at: string
}

export interface ChequeRegisterFilters {
  accountType?: ChequeAccountType
  accountId?: string
  status?: ChequeStatus
  dateFrom?: string
  dateTo?: string
}

export interface ChequeRegisterRow {
  id: string
  account_type: ChequeAccountType
  trust_account_id: string | null
  operating_account_id: string | null
  cheque_number: number
  matter_id: string | null
  matter_title: string | null
  payee_name: string
  amount_cents: number
  memo: string | null
  status: ChequeStatus
  issued_date: string | null
  cleared_date: string | null
  void_reason: string | null
  prepared_by: string
  approved_by: string | null
  created_at: string
}

export interface HoldsReportRow {
  id: string
  transaction_id: string
  matter_id: string
  matter_title: string
  amount_cents: number
  hold_start_date: string
  hold_release_date: string
  days_remaining: number
  status: string
}

export interface AuditTrailFilters {
  entityType?: string
  entityId?: string
  matterId?: string
  userId?: string
  dateFrom?: string
  dateTo?: string
}

export interface AuditTrailRow {
  id: string
  action: string
  entity_type: string
  entity_id: string
  matter_id: string | null
  user_id: string
  user_first_name: string | null
  user_last_name: string | null
  metadata: unknown
  created_at: string
}

export interface LSOComplianceReport {
  account_summary: AccountSummaryReport
  client_listing: ClientTrustListingReport
  period_start: string
  period_end: string
  opening_balance_cents: number
  closing_balance_cents: number
  total_deposits_cents: number
  total_disbursements_cents: number
  reconciliation_status: Pick<
    TrustReconciliationRow,
    'id' | 'status' | 'is_balanced' | 'completed_at' | 'reviewed_by' | 'reviewed_at'
  > | null
  transaction_count: number
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function paginationOffsetLimit(params: PaginationParams): { offset: number; limit: number } {
  const page = Math.max(1, params.page ?? 1)
  const pageSize = Math.min(Math.max(1, params.pageSize ?? 25), 500) // cap at 500
  return { offset: (page - 1) * pageSize, limit: pageSize }
}

function buildPaginatedResult<T>(
  rows: T[],
  total: number,
  params: PaginationParams
): PaginatedResult<T> {
  const pageSize = Math.min(Math.max(1, params.pageSize ?? 25), 500)
  return {
    rows,
    total,
    page: Math.max(1, params.page ?? 1),
    pageSize,
    totalPages: Math.ceil(total / pageSize) || 1,
  }
}

// ─── 1. Client Trust Listing ───────────────────────────────────────────────

/**
 * List every matter with a non-zero trust balance on a given account.
 * Required for LSO By-Law 9 reconciliation.
 *
 * Strategy: for each matter that has transactions on this account, take
 * the running_balance_cents from the latest transaction (by effective_date,
 * then created_at). Exclude matters where that balance is zero.
 */
export async function getClientTrustListing(
  supabase: SupabaseClient<Database>,
  tenantId: string,
  trustAccountId: string,
  asOfDate?: string
): Promise<ServiceResult<ClientTrustListingReport>> {
  try {
    // Fetch account name
    const { data: account, error: accountErr } = await (supabase as any)
      .from('trust_bank_accounts')
      .select('id, account_name')
      .eq('id', trustAccountId)
      .eq('tenant_id', tenantId)
      .single()

    if (accountErr || !account) {
      return { success: false, error: 'Trust account not found' }
    }

    const effectiveDate = asOfDate ?? new Date().toISOString().split('T')[0]

    // Fetch all transactions up to the as-of date, ordered so the latest per matter is first
    let txnQuery = (supabase as any)
      .from('trust_transactions')
      .select('matter_id, running_balance_cents, effective_date, created_at')
      .eq('trust_account_id', trustAccountId)
      .eq('tenant_id', tenantId)
      .order('effective_date', { ascending: false })
      .order('created_at', { ascending: false })

    if (asOfDate) {
      txnQuery = txnQuery.lte('effective_date', asOfDate)
    }

    const { data: transactions, error: txnErr } = await txnQuery

    if (txnErr) {
      return { success: false, error: `Failed to fetch transactions: ${txnErr.message}` }
    }

    // Deduplicate: keep only the latest transaction per matter
    const latestByMatter = new Map<
      string,
      { balance_cents: number; last_transaction_date: string }
    >()
    for (const txn of transactions ?? []) {
      if (!latestByMatter.has(txn.matter_id)) {
        latestByMatter.set(txn.matter_id, {
          balance_cents: txn.running_balance_cents,
          last_transaction_date: txn.effective_date,
        })
      }
    }

    // Filter out zero balances
    const nonZeroMatterIds: string[] = []
    const balanceMap = new Map<string, { balance_cents: number; last_transaction_date: string }>()
    for (const [matterId, info] of latestByMatter) {
      if (info.balance_cents !== 0) {
        nonZeroMatterIds.push(matterId)
        balanceMap.set(matterId, info)
      }
    }

    if (nonZeroMatterIds.length === 0) {
      return {
        success: true,
        data: {
          trust_account_id: trustAccountId,
          account_name: account.account_name,
          as_of_date: effectiveDate,
          items: [],
          total_balance_cents: 0,
        },
      }
    }

    // Fetch matter + primary client contact for each matter
    const { data: matters, error: matterErr } = await (supabase as any)
      .from('matters')
      .select('id, title, contact_id')
      .in('id', nonZeroMatterIds)

    if (matterErr) {
      return { success: false, error: `Failed to fetch matters: ${matterErr.message}` }
    }

    // Gather contact IDs for a batch lookup
    const contactIds = (matters ?? [])
      .map((m: any) => m.contact_id)
      .filter((id: any): id is string => id != null)
    const uniqueContactIds = [...new Set(contactIds)] as string[]

    let contactMap = new Map<string, { first_name: string | null; last_name: string | null }>()
    if (uniqueContactIds.length > 0) {
      const { data: contacts } = await supabase
        .from('contacts')
        .select('id, first_name, last_name')
        .in('id', uniqueContactIds)

      for (const c of contacts ?? []) {
        contactMap.set(c.id, { first_name: c.first_name, last_name: c.last_name })
      }
    }

    const items: ClientTrustListingItem[] = (matters ?? [])
      .map((m: any) => {
        const balInfo = balanceMap.get(m.id)!
        const contact = m.contact_id ? contactMap.get(m.contact_id) : null
        return {
          matter_id: m.id,
          matter_title: m.title,
          client_first_name: contact?.first_name ?? null,
          client_last_name: contact?.last_name ?? null,
          balance_cents: balInfo.balance_cents,
          last_transaction_date: balInfo.last_transaction_date,
        }
      })
      .sort((a: any, b: any) => {
        // Sort by matter title for consistent output
        return a.matter_title.localeCompare(b.matter_title)
      })

    const totalBalanceCents = items.reduce((sum, item) => sum + item.balance_cents, 0)

    return {
      success: true,
      data: {
        trust_account_id: trustAccountId,
        account_name: account.account_name,
        as_of_date: effectiveDate,
        items,
        total_balance_cents: totalBalanceCents,
      },
    }
  } catch (err) {
    return {
      success: false,
      error: `Unexpected error generating client trust listing: ${err instanceof Error ? err.message : String(err)}`,
    }
  }
}

// ─── 2. Account Summary ───────────────────────────────────────────────────

/**
 * Returns a high-level summary of a trust bank account including
 * total balance, active matter count, last reconciliation, and outstanding holds.
 */
export async function getAccountSummary(
  supabase: SupabaseClient<Database>,
  tenantId: string,
  trustAccountId: string
): Promise<ServiceResult<AccountSummaryReport>> {
  try {
    // Fetch account details
    const { data: account, error: accountErr } = await (supabase as any)
      .from('trust_bank_accounts')
      .select(
        'id, account_name, bank_name, account_type, opened_date, jurisdiction_code, is_active, currency'
      )
      .eq('id', trustAccountId)
      .eq('tenant_id', tenantId)
      .single()

    if (accountErr || !account) {
      return { success: false, error: 'Trust account not found' }
    }

    // Fetch latest transaction per matter for balance calc (same approach as client listing)
    const { data: transactions, error: txnErr } = await (supabase as any)
      .from('trust_transactions')
      .select('matter_id, running_balance_cents')
      .eq('trust_account_id', trustAccountId)
      .eq('tenant_id', tenantId)
      .order('effective_date', { ascending: false })
      .order('created_at', { ascending: false })

    if (txnErr) {
      return { success: false, error: `Failed to fetch transactions: ${txnErr.message}` }
    }

    // Deduplicate: latest balance per matter
    const latestByMatter = new Map<string, number>()
    for (const txn of transactions ?? []) {
      if (!latestByMatter.has(txn.matter_id)) {
        latestByMatter.set(txn.matter_id, txn.running_balance_cents)
      }
    }

    const totalBalanceCents = Array.from(latestByMatter.values()).reduce(
      (sum, bal) => sum + bal,
      0
    )
    const activeMatterCount = Array.from(latestByMatter.values()).filter((b) => b !== 0).length

    // Latest reconciliation
    const { data: lastRecon } = await (supabase as any)
      .from('trust_reconciliations')
      .select('id, period_end, status, is_balanced, completed_at')
      .eq('trust_account_id', trustAccountId)
      .eq('tenant_id', tenantId)
      .order('period_end', { ascending: false })
      .limit(1)
      .maybeSingle()

    // Outstanding holds total
    const { data: holds } = await (supabase as any)
      .from('trust_holds')
      .select('amount_cents')
      .eq('tenant_id', tenantId)
      .eq('status', 'held')

    // Filter holds: if trustAccountId specified, we need to join via transaction_id
    // Since holds don't have trust_account_id directly, fetch held amounts for all
    // matters on this account. We use the matter IDs we already have.
    const matterIdsOnAccount = Array.from(latestByMatter.keys())
    let outstandingHoldsCents = 0

    if (matterIdsOnAccount.length > 0) {
      const { data: accountHolds } = await (supabase as any)
        .from('trust_holds')
        .select('amount_cents')
        .eq('tenant_id', tenantId)
        .eq('status', 'held')
        .in('matter_id', matterIdsOnAccount)

      outstandingHoldsCents = (accountHolds ?? []).reduce((sum: number, h: any) => sum + h.amount_cents, 0)
    }

    return {
      success: true,
      data: {
        account,
        total_balance_cents: totalBalanceCents,
        active_matter_count: activeMatterCount,
        last_reconciliation: lastRecon ?? null,
        outstanding_holds_total_cents: outstandingHoldsCents,
      },
    }
  } catch (err) {
    return {
      success: false,
      error: `Unexpected error generating account summary: ${err instanceof Error ? err.message : String(err)}`,
    }
  }
}

// ─── 3. Trust Transaction Report ──────────────────────────────────────────

/**
 * Filtered, paginated list of trust transactions with matter and contact details.
 */
export async function getTrustTransactionReport(
  supabase: SupabaseClient<Database>,
  tenantId: string,
  filters: TransactionReportFilters,
  pagination: PaginationParams = { page: 1, pageSize: 50 }
): Promise<ServiceResult<PaginatedResult<TransactionReportRow>>> {
  try {
    const { offset, limit } = paginationOffsetLimit(pagination)

    // Build query
    let query = (supabase as any)
      .from('trust_transactions')
      .select(
        `
        id,
        trust_account_id,
        matter_id,
        transaction_type,
        amount_cents,
        running_balance_cents,
        description,
        reference_number,
        payment_method,
        effective_date,
        is_cleared,
        created_at,
        contact_id,
        matters!inner ( title ),
        contacts ( first_name, last_name )
      `,
        { count: 'exact' }
      )
      .eq('tenant_id', tenantId)
      .order('effective_date', { ascending: false })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (filters.trustAccountId) {
      query = query.eq('trust_account_id', filters.trustAccountId)
    }
    if (filters.matterId) {
      query = query.eq('matter_id', filters.matterId)
    }
    if (filters.dateFrom) {
      query = query.gte('effective_date', filters.dateFrom)
    }
    if (filters.dateTo) {
      query = query.lte('effective_date', filters.dateTo)
    }
    if (filters.transactionType) {
      query = query.eq('transaction_type', filters.transactionType)
    }

    const { data, error, count } = await query

    if (error) {
      return { success: false, error: `Failed to fetch transactions: ${error.message}` }
    }

    const rows: TransactionReportRow[] = (data ?? []).map((row: any) => ({
      id: row.id,
      trust_account_id: row.trust_account_id,
      matter_id: row.matter_id,
      matter_title: row.matters?.title ?? '',
      contact_first_name: row.contacts?.first_name ?? null,
      contact_last_name: row.contacts?.last_name ?? null,
      transaction_type: row.transaction_type,
      amount_cents: row.amount_cents,
      running_balance_cents: row.running_balance_cents,
      description: row.description,
      reference_number: row.reference_number,
      payment_method: row.payment_method,
      effective_date: row.effective_date,
      is_cleared: row.is_cleared,
      created_at: row.created_at,
    }))

    return {
      success: true,
      data: buildPaginatedResult(rows, count ?? 0, pagination),
    }
  } catch (err) {
    return {
      success: false,
      error: `Unexpected error generating transaction report: ${err instanceof Error ? err.message : String(err)}`,
    }
  }
}

// ─── 4. Disbursement Report ───────────────────────────────────────────────

/**
 * Filtered, paginated list of disbursement requests with matter details.
 */
export async function getDisbursementReport(
  supabase: SupabaseClient<Database>,
  tenantId: string,
  filters: DisbursementReportFilters,
  pagination: PaginationParams = { page: 1, pageSize: 50 }
): Promise<ServiceResult<PaginatedResult<DisbursementReportRow>>> {
  try {
    const { offset, limit } = paginationOffsetLimit(pagination)

    let query = (supabase as any)
      .from('trust_disbursement_requests')
      .select(
        `
        id,
        trust_account_id,
        matter_id,
        amount_cents,
        payee_name,
        description,
        payment_method,
        request_type,
        status,
        prepared_by,
        prepared_at,
        approved_by,
        approved_at,
        rejected_by,
        rejection_reason,
        authorization_type,
        created_at,
        matters!inner ( title )
      `,
        { count: 'exact' }
      )
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (filters.trustAccountId) {
      query = query.eq('trust_account_id', filters.trustAccountId)
    }
    if (filters.matterId) {
      query = query.eq('matter_id', filters.matterId)
    }
    if (filters.status) {
      query = query.eq('status', filters.status)
    }
    if (filters.dateFrom) {
      query = query.gte('prepared_at', filters.dateFrom)
    }
    if (filters.dateTo) {
      query = query.lte('prepared_at', filters.dateTo)
    }

    const { data, error, count } = await query

    if (error) {
      return { success: false, error: `Failed to fetch disbursement requests: ${error.message}` }
    }

    const rows: DisbursementReportRow[] = (data ?? []).map((row: any) => ({
      id: row.id,
      trust_account_id: row.trust_account_id,
      matter_id: row.matter_id,
      matter_title: row.matters?.title ?? '',
      amount_cents: row.amount_cents,
      payee_name: row.payee_name,
      description: row.description,
      payment_method: row.payment_method,
      request_type: row.request_type,
      status: row.status,
      prepared_by: row.prepared_by,
      prepared_at: row.prepared_at,
      approved_by: row.approved_by,
      approved_at: row.approved_at,
      rejected_by: row.rejected_by,
      rejection_reason: row.rejection_reason,
      authorization_type: row.authorization_type,
      created_at: row.created_at,
    }))

    return {
      success: true,
      data: buildPaginatedResult(rows, count ?? 0, pagination),
    }
  } catch (err) {
    return {
      success: false,
      error: `Unexpected error generating disbursement report: ${err instanceof Error ? err.message : String(err)}`,
    }
  }
}

// ─── 5. Cheque Register ──────────────────────────────────────────────────

/**
 * Filtered, paginated cheque register for trust and/or operating accounts.
 */
export async function getChequeRegister(
  supabase: SupabaseClient<Database>,
  tenantId: string,
  filters: ChequeRegisterFilters,
  pagination: PaginationParams = { page: 1, pageSize: 50 }
): Promise<ServiceResult<PaginatedResult<ChequeRegisterRow>>> {
  try {
    const { offset, limit } = paginationOffsetLimit(pagination)

    let query = (supabase as any)
      .from('cheques')
      .select(
        `
        id,
        account_type,
        trust_account_id,
        operating_account_id,
        cheque_number,
        matter_id,
        payee_name,
        amount_cents,
        memo,
        status,
        issued_date,
        cleared_date,
        void_reason,
        prepared_by,
        approved_by,
        created_at,
        matters ( title )
      `,
        { count: 'exact' }
      )
      .eq('tenant_id', tenantId)
      .order('cheque_number', { ascending: false })
      .range(offset, offset + limit - 1)

    if (filters.accountType) {
      query = query.eq('account_type', filters.accountType)
    }
    if (filters.accountId) {
      // Determine which column to filter based on account type
      if (filters.accountType === 'operating') {
        query = query.eq('operating_account_id', filters.accountId)
      } else {
        query = query.eq('trust_account_id', filters.accountId)
      }
    }
    if (filters.status) {
      query = query.eq('status', filters.status)
    }
    if (filters.dateFrom) {
      query = query.gte('issued_date', filters.dateFrom)
    }
    if (filters.dateTo) {
      query = query.lte('issued_date', filters.dateTo)
    }

    const { data, error, count } = await query

    if (error) {
      return { success: false, error: `Failed to fetch cheque register: ${error.message}` }
    }

    const rows: ChequeRegisterRow[] = (data ?? []).map((row: any) => ({
      id: row.id,
      account_type: row.account_type,
      trust_account_id: row.trust_account_id,
      operating_account_id: row.operating_account_id,
      cheque_number: row.cheque_number,
      matter_id: row.matter_id,
      matter_title: row.matters?.title ?? null,
      payee_name: row.payee_name,
      amount_cents: row.amount_cents,
      memo: row.memo,
      status: row.status,
      issued_date: row.issued_date,
      cleared_date: row.cleared_date,
      void_reason: row.void_reason,
      prepared_by: row.prepared_by,
      approved_by: row.approved_by,
      created_at: row.created_at,
    }))

    return {
      success: true,
      data: buildPaginatedResult(rows, count ?? 0, pagination),
    }
  } catch (err) {
    return {
      success: false,
      error: `Unexpected error generating cheque register: ${err instanceof Error ? err.message : String(err)}`,
    }
  }
}

// ─── 6. Holds Report ─────────────────────────────────────────────────────

/**
 * All active holds (status = 'held') with matter details and days remaining.
 * Optionally scoped to a specific trust account via the related transactions.
 */
export async function getHoldsReport(
  supabase: SupabaseClient<Database>,
  tenantId: string,
  trustAccountId?: string
): Promise<ServiceResult<HoldsReportRow[]>> {
  try {
    let query = (supabase as any)
      .from('trust_holds')
      .select(
        `
        id,
        transaction_id,
        matter_id,
        amount_cents,
        hold_start_date,
        hold_release_date,
        status,
        matters!inner ( title )
      `
      )
      .eq('tenant_id', tenantId)
      .eq('status', 'held')
      .order('hold_release_date', { ascending: true })

    const { data: holds, error: holdsErr } = await query

    if (holdsErr) {
      return { success: false, error: `Failed to fetch holds: ${holdsErr.message}` }
    }

    let filteredHolds = holds ?? []

    // If trustAccountId specified, filter holds to those whose transactions
    // belong to this account
    if (trustAccountId && filteredHolds.length > 0) {
      const transactionIds = filteredHolds.map((h: any) => h.transaction_id)
      const { data: txns } = await (supabase as any)
        .from('trust_transactions')
        .select('id')
        .eq('trust_account_id', trustAccountId)
        .in('id', transactionIds)

      const validTxnIds = new Set((txns ?? []).map((t: any) => t.id))
      filteredHolds = filteredHolds.filter((h: any) => validTxnIds.has(h.transaction_id))
    }

    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const rows: HoldsReportRow[] = filteredHolds.map((h: any) => {
      const releaseDate = new Date(h.hold_release_date)
      releaseDate.setHours(0, 0, 0, 0)
      const diffMs = releaseDate.getTime() - today.getTime()
      const daysRemaining = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)))

      return {
        id: h.id,
        transaction_id: h.transaction_id,
        matter_id: h.matter_id,
        matter_title: h.matters?.title ?? '',
        amount_cents: h.amount_cents,
        hold_start_date: h.hold_start_date,
        hold_release_date: h.hold_release_date,
        days_remaining: daysRemaining,
        status: h.status,
      }
    })

    return { success: true, data: rows }
  } catch (err) {
    return {
      success: false,
      error: `Unexpected error generating holds report: ${err instanceof Error ? err.message : String(err)}`,
    }
  }
}

// ─── 7. Audit Trail ─────────────────────────────────────────────────────

/**
 * Filtered, paginated trust audit log with user name resolution.
 */
export async function getAuditTrail(
  supabase: SupabaseClient<Database>,
  tenantId: string,
  filters: AuditTrailFilters,
  pagination: PaginationParams = { page: 1, pageSize: 50 }
): Promise<ServiceResult<PaginatedResult<AuditTrailRow>>> {
  try {
    const { offset, limit } = paginationOffsetLimit(pagination)

    let query = (supabase as any)
      .from('trust_audit_log')
      .select(
        `
        id,
        action,
        entity_type,
        entity_id,
        matter_id,
        user_id,
        metadata,
        created_at,
        users!inner ( first_name, last_name )
      `,
        { count: 'exact' }
      )
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (filters.entityType) {
      query = query.eq('entity_type', filters.entityType)
    }
    if (filters.entityId) {
      query = query.eq('entity_id', filters.entityId)
    }
    if (filters.matterId) {
      query = query.eq('matter_id', filters.matterId)
    }
    if (filters.userId) {
      query = query.eq('user_id', filters.userId)
    }
    if (filters.dateFrom) {
      query = query.gte('created_at', filters.dateFrom)
    }
    if (filters.dateTo) {
      query = query.lte('created_at', filters.dateTo)
    }

    const { data, error, count } = await query

    if (error) {
      return { success: false, error: `Failed to fetch audit trail: ${error.message}` }
    }

    const rows: AuditTrailRow[] = (data ?? []).map((row: any) => ({
      id: row.id,
      action: row.action,
      entity_type: row.entity_type,
      entity_id: row.entity_id,
      matter_id: row.matter_id,
      user_id: row.user_id,
      user_first_name: row.users?.first_name ?? null,
      user_last_name: row.users?.last_name ?? null,
      metadata: row.metadata,
      created_at: row.created_at,
    }))

    return {
      success: true,
      data: buildPaginatedResult(rows, count ?? 0, pagination),
    }
  } catch (err) {
    return {
      success: false,
      error: `Unexpected error generating audit trail: ${err instanceof Error ? err.message : String(err)}`,
    }
  }
}

// ─── 8. LSO Compliance Report ────────────────────────────────────────────

/**
 * Combined report providing all data required for LSO By-Law 9 annual filing.
 * Includes account summary, client listing, transaction totals, and
 * reconciliation status for the specified period.
 */
export async function getLSOComplianceReport(
  supabase: SupabaseClient<Database>,
  tenantId: string,
  trustAccountId: string,
  periodStart: string,
  periodEnd: string
): Promise<ServiceResult<LSOComplianceReport>> {
  try {
    // Run sub-reports in parallel where possible
    const [summaryResult, listingResult] = await Promise.all([
      getAccountSummary(supabase, tenantId, trustAccountId),
      getClientTrustListing(supabase, tenantId, trustAccountId, periodEnd),
    ])

    if (!summaryResult.success || !summaryResult.data) {
      return { success: false, error: summaryResult.error ?? 'Failed to generate account summary' }
    }

    if (!listingResult.success || !listingResult.data) {
      return {
        success: false,
        error: listingResult.error ?? 'Failed to generate client trust listing',
      }
    }

    // Fetch opening balance: running_balance_cents of the latest transaction
    // with effective_date < periodStart
    const { data: openingTxn } = await (supabase as any)
      .from('trust_transactions')
      .select('running_balance_cents')
      .eq('trust_account_id', trustAccountId)
      .eq('tenant_id', tenantId)
      .lt('effective_date', periodStart)
      .order('effective_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    // Note: opening balance is the sum across all matters, but for a single-matter
    // view we'd need the latest per matter. For the compliance report, we compute
    // the aggregate opening balance by summing latest-per-matter before period start.
    // However, the simpler approach: opening = closing - deposits + disbursements.
    // We'll compute deposits and disbursements in the period, then derive opening.

    // Fetch period transactions for totals
    const { data: periodTxns, error: periodErr } = await (supabase as any)
      .from('trust_transactions')
      .select('transaction_type, amount_cents')
      .eq('trust_account_id', trustAccountId)
      .eq('tenant_id', tenantId)
      .gte('effective_date', periodStart)
      .lte('effective_date', periodEnd)

    if (periodErr) {
      return {
        success: false,
        error: `Failed to fetch period transactions: ${periodErr.message}`,
      }
    }

    const depositTypes: TrustTransactionType[] = [
      'deposit',
      'transfer_in',
      'interest',
      'opening_balance',
    ]
    const disbursementTypes: TrustTransactionType[] = [
      'disbursement',
      'transfer_out',
      'refund',
      'bank_fee',
    ]

    let totalDepositsCents = 0
    let totalDisbursementsCents = 0
    let transactionCount = 0

    for (const txn of periodTxns ?? []) {
      transactionCount++
      if (depositTypes.includes(txn.transaction_type)) {
        totalDepositsCents += Math.abs(txn.amount_cents)
      } else if (disbursementTypes.includes(txn.transaction_type)) {
        totalDisbursementsCents += Math.abs(txn.amount_cents)
      }
      // reversals and adjustments could go either way; include absolute values
      // in the appropriate direction based on sign
      if (txn.transaction_type === 'reversal' || txn.transaction_type === 'adjustment') {
        if (txn.amount_cents > 0) {
          totalDepositsCents += txn.amount_cents
        } else {
          totalDisbursementsCents += Math.abs(txn.amount_cents)
        }
      }
    }

    const closingBalanceCents = listingResult.data.total_balance_cents
    const openingBalanceCents = closingBalanceCents - totalDepositsCents + totalDisbursementsCents

    // Fetch reconciliation for this period
    const { data: reconData } = await (supabase as any)
      .from('trust_reconciliations')
      .select('id, status, is_balanced, completed_at, reviewed_by, reviewed_at')
      .eq('trust_account_id', trustAccountId)
      .eq('tenant_id', tenantId)
      .lte('period_start', periodEnd)
      .gte('period_end', periodStart)
      .order('period_end', { ascending: false })
      .limit(1)
      .maybeSingle()

    return {
      success: true,
      data: {
        account_summary: summaryResult.data,
        client_listing: listingResult.data,
        period_start: periodStart,
        period_end: periodEnd,
        opening_balance_cents: openingBalanceCents,
        closing_balance_cents: closingBalanceCents,
        total_deposits_cents: totalDepositsCents,
        total_disbursements_cents: totalDisbursementsCents,
        reconciliation_status: reconData ?? null,
        transaction_count: transactionCount,
      },
    }
  } catch (err) {
    return {
      success: false,
      error: `Unexpected error generating LSO compliance report: ${err instanceof Error ? err.message : String(err)}`,
    }
  }
}
