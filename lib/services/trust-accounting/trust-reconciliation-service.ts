// ============================================================================
// Trust Reconciliation Service — LSO By-Law 9 Compliant 8-Step Workflow
// ============================================================================
// Implements the compliance-grade reconciliation workflow:
//   Step 1: Set bank statement balance
//   Step 2: Compute book balance from ledger
//   Step 3: Identify outstanding items (uncleared cheques, deposits in transit)
//   Step 4: Compute adjusted bank balance
//   Step 5: Compute client trust listing
//   Step 6: Three-way balance check (bank == book == client listing)
//   Step 7: Complete reconciliation
//   Step 8: Review reconciliation (segregation of duties)
//
// All amounts are BIGINT (cents). Reviewed reconciliations are immutable
// (enforced by DB trigger). Reviewer must differ from completer.
// ============================================================================

import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  Database,
  Json,
  TrustReconciliationRow,
  TrustReconciliationInsert,
  TrustReconciliationUpdate,
  TrustReconciliationItemRow,
  TrustReconciliationItemInsert,
  TrustReconciliationItemUpdate,
  TrustReconciliationItemType,
  TrustAuditLogInsert,
} from '@/lib/types/database'
import { createAdminClient } from '@/lib/supabase/admin'

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ServiceResult<T = void> {
  success: boolean
  data?: T
  error?: string
}

export interface CreateReconciliationParams {
  supabase: SupabaseClient<Database>
  tenantId: string
  userId: string
  trustAccountId: string
  periodStart: string // ISO date (YYYY-MM-DD)
  periodEnd: string   // ISO date (YYYY-MM-DD)
}

export interface AddReconciliationItemParams {
  supabase: SupabaseClient<Database>
  tenantId: string
  userId: string
  reconciliationId: string
  itemType: TrustReconciliationItemType
  description: string
  amountCents: number
  transactionId?: string | null
}

export interface ReconciliationWithItems extends TrustReconciliationRow {
  items: TrustReconciliationItemRow[]
}

export interface PaginationParams {
  page?: number
  pageSize?: number
}

export interface PaginatedResult<T> {
  data: T[]
  total: number
  page: number
  pageSize: number
}

// ─── Audit Logging ──────────────────────────────────────────────────────────

async function writeAuditLog(
  tenantId: string,
  action: string,
  entityType: string,
  entityId: string,
  userId: string,
  metadata: Record<string, unknown> = {},
  matterId?: string | null,
): Promise<void> {
  const admin = createAdminClient()
  const entry: TrustAuditLogInsert = {
    tenant_id: tenantId,
    action,
    entity_type: entityType,
    entity_id: entityId,
    user_id: userId,
    metadata: metadata as Json,
    matter_id: matterId ?? null,
  }
  // Fire-and-forget is intentional for audit logs — we log errors but
  // never let an audit write failure block the primary operation.
  const { error } = await (admin as any).from('trust_audit_log').insert(entry)
  if (error) {
    console.error('[trust-reconciliation] audit log write failed:', error.message, { action, entityId })
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Fetch a reconciliation by ID with tenant guard.
 * Returns null if not found or tenant mismatch.
 */
async function fetchReconciliation(
  supabase: SupabaseClient<Database>,
  reconciliationId: string,
  tenantId: string,
): Promise<TrustReconciliationRow | null> {
  const { data, error } = await (supabase as any)
    .from('trust_reconciliations')
    .select('*')
    .eq('id', reconciliationId)
    .eq('tenant_id', tenantId)
    .single()

  if (error || !data) return null
  return data as TrustReconciliationRow
}

/**
 * Guard: ensure reconciliation exists and is still mutable (draft or flagged).
 */
async function fetchMutableReconciliation(
  supabase: SupabaseClient<Database>,
  reconciliationId: string,
  tenantId: string,
): Promise<ServiceResult<TrustReconciliationRow>> {
  const rec = await fetchReconciliation(supabase, reconciliationId, tenantId)
  if (!rec) {
    return { success: false, error: 'Reconciliation not found' }
  }
  if (rec.status === 'reviewed') {
    return { success: false, error: 'Reconciliation is reviewed and immutable' }
  }
  if (rec.status === 'completed') {
    return { success: false, error: 'Reconciliation is completed — reopen or flag before modifying' }
  }
  return { success: true, data: rec }
}

/**
 * Update a reconciliation record with tenant guard.
 */
async function updateReconciliation(
  supabase: SupabaseClient<Database>,
  reconciliationId: string,
  tenantId: string,
  updates: TrustReconciliationUpdate,
): Promise<ServiceResult<TrustReconciliationRow>> {
  const { data, error } = await (supabase as any)
    .from('trust_reconciliations')
    .update(updates)
    .eq('id', reconciliationId)
    .eq('tenant_id', tenantId)
    .select('*')
    .single()

  if (error) {
    return { success: false, error: error.message }
  }
  return { success: true, data: data as TrustReconciliationRow }
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Create a new draft reconciliation for a trust account + period.
 * UNIQUE constraint: one reconciliation per account per period_start.
 */
export async function createReconciliation(
  params: CreateReconciliationParams,
): Promise<ServiceResult<TrustReconciliationRow>> {
  const { supabase, tenantId, userId, trustAccountId, periodStart, periodEnd } = params

  if (periodEnd <= periodStart) {
    return { success: false, error: 'period_end must be after period_start' }
  }

  const insert: TrustReconciliationInsert = {
    tenant_id: tenantId,
    trust_account_id: trustAccountId,
    period_start: periodStart,
    period_end: periodEnd,
    status: 'draft',
  }

  const { data, error } = await (supabase as any)
    .from('trust_reconciliations')
    .insert(insert)
    .select('*')
    .single()

  if (error) {
    // Handle unique constraint violation
    if (error.code === '23505') {
      return {
        success: false,
        error: `A reconciliation already exists for this account and period starting ${periodStart}`,
      }
    }
    return { success: false, error: error.message }
  }

  const rec = data as TrustReconciliationRow

  await writeAuditLog(
    tenantId,
    'reconciliation.created',
    'trust_reconciliation',
    rec.id,
    userId,
    { trust_account_id: trustAccountId, period_start: periodStart, period_end: periodEnd },
  )

  return { success: true, data: rec }
}

// ── Step 1: Set Bank Statement Balance ──────────────────────────────────────

/**
 * Step 1 — User enters the bank statement closing balance.
 */
export async function setStatementBalance(
  supabase: SupabaseClient<Database>,
  tenantId: string,
  userId: string,
  reconciliationId: string,
  bankStatementBalanceCents: number,
): Promise<ServiceResult<TrustReconciliationRow>> {
  const guard = await fetchMutableReconciliation(supabase, reconciliationId, tenantId)
  if (!guard.success) return guard

  const result = await updateReconciliation(supabase, reconciliationId, tenantId, {
    bank_statement_balance_cents: bankStatementBalanceCents,
  })

  if (result.success) {
    await writeAuditLog(
      tenantId,
      'reconciliation.statement_balance_set',
      'trust_reconciliation',
      reconciliationId,
      userId,
      { bank_statement_balance_cents: bankStatementBalanceCents },
    )
  }

  return result
}

// ── Step 2: Compute Book Balance ────────────────────────────────────────────

/**
 * Step 2 — Sum all trust_transactions for the account in the period.
 * Deposits are positive, disbursements are negative (net sum = book balance).
 *
 * We use the running_balance of the LAST transaction in the period as the
 * authoritative book balance, since running_balance is maintained by the
 * append-only ledger trigger.
 */
export async function computeBookBalance(
  supabase: SupabaseClient<Database>,
  tenantId: string,
  userId: string,
  reconciliationId: string,
): Promise<ServiceResult<TrustReconciliationRow>> {
  const guard = await fetchMutableReconciliation(supabase, reconciliationId, tenantId)
  if (!guard.success) return guard
  const rec = guard.data!

  // Get the last transaction by effective_date within the period for this account
  const { data: lastTx, error: txError } = await (supabase as any)
    .from('trust_transactions')
    .select('running_balance_cents')
    .eq('trust_account_id', rec.trust_account_id)
    .eq('tenant_id', tenantId)
    .lte('effective_date', rec.period_end)
    .order('effective_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (txError) {
    return { success: false, error: `Failed to compute book balance: ${txError.message}` }
  }

  // If no transactions exist, book balance is 0
  const bookBalanceCents = lastTx?.running_balance_cents ?? 0

  const result = await updateReconciliation(supabase, reconciliationId, tenantId, {
    book_balance_cents: bookBalanceCents,
  })

  if (result.success) {
    await writeAuditLog(
      tenantId,
      'reconciliation.book_balance_computed',
      'trust_reconciliation',
      reconciliationId,
      userId,
      { book_balance_cents: bookBalanceCents },
    )
  }

  return result
}

// ── Step 3: Identify Outstanding Items ──────────────────────────────────────

/**
 * Step 3 — Find uncleared cheques and deposits in transit.
 * Auto-creates trust_reconciliation_items for each.
 */
export async function identifyOutstandingItems(
  supabase: SupabaseClient<Database>,
  tenantId: string,
  userId: string,
  reconciliationId: string,
): Promise<ServiceResult<TrustReconciliationItemRow[]>> {
  const guard = await fetchMutableReconciliation(supabase, reconciliationId, tenantId)
  if (!guard.success) return { success: false, error: guard.error }
  const rec = guard.data!

  // Clear any previously auto-generated items for this reconciliation
  // (manual items are preserved — they have types like bank_error, book_error, other)
  const { error: deleteError } = await (supabase as any)
    .from('trust_reconciliation_items')
    .delete()
    .eq('reconciliation_id', reconciliationId)
    .eq('tenant_id', tenantId)
    .in('item_type', ['outstanding_cheque', 'deposit_in_transit'])

  if (deleteError) {
    return { success: false, error: `Failed to clear prior items: ${deleteError.message}` }
  }

  // Find uncleared cheques up to and including the period end
  const { data: unclearedCheques, error: chequeErr } = await (supabase as any)
    .from('trust_transactions')
    .select('id, description, amount_cents, reference_number, effective_date')
    .eq('trust_account_id', rec.trust_account_id)
    .eq('tenant_id', tenantId)
    .eq('is_cleared', false)
    .eq('payment_method', 'cheque')
    .in('transaction_type', ['disbursement', 'refund'])
    .lte('effective_date', rec.period_end)

  if (chequeErr) {
    return { success: false, error: `Failed to query uncleared cheques: ${chequeErr.message}` }
  }

  // Find deposits in transit (uncleared deposits up to period end)
  const { data: depositsInTransit, error: depositErr } = await (supabase as any)
    .from('trust_transactions')
    .select('id, description, amount_cents, reference_number, effective_date')
    .eq('trust_account_id', rec.trust_account_id)
    .eq('tenant_id', tenantId)
    .eq('is_cleared', false)
    .eq('transaction_type', 'deposit')
    .lte('effective_date', rec.period_end)

  if (depositErr) {
    return { success: false, error: `Failed to query deposits in transit: ${depositErr.message}` }
  }

  // Build reconciliation items
  const items: TrustReconciliationItemInsert[] = []

  let outstandingChequesCents = 0
  for (const cheque of unclearedCheques ?? []) {
    // Disbursement amounts are stored as positive values; they reduce the bank balance
    outstandingChequesCents += Math.abs(cheque.amount_cents)
    items.push({
      tenant_id: tenantId,
      reconciliation_id: reconciliationId,
      item_type: 'outstanding_cheque',
      description: `Cheque ${cheque.reference_number ?? 'N/A'}: ${cheque.description}`,
      amount_cents: Math.abs(cheque.amount_cents),
      transaction_id: cheque.id,
    })
  }

  let depositsInTransitCents = 0
  for (const deposit of depositsInTransit ?? []) {
    depositsInTransitCents += Math.abs(deposit.amount_cents)
    items.push({
      tenant_id: tenantId,
      reconciliation_id: reconciliationId,
      item_type: 'deposit_in_transit',
      description: `Deposit in transit: ${deposit.description}`,
      amount_cents: Math.abs(deposit.amount_cents),
      transaction_id: deposit.id,
    })
  }

  // Insert items (if any)
  let insertedItems: TrustReconciliationItemRow[] = []
  if (items.length > 0) {
    const { data: inserted, error: insertErr } = await (supabase as any)
      .from('trust_reconciliation_items')
      .insert(items)
      .select('*')

    if (insertErr) {
      return { success: false, error: `Failed to insert reconciliation items: ${insertErr.message}` }
    }
    insertedItems = (inserted ?? []) as TrustReconciliationItemRow[]
  }

  // Update reconciliation with outstanding totals
  const updateResult = await updateReconciliation(supabase, reconciliationId, tenantId, {
    outstanding_cheques_cents: outstandingChequesCents,
    outstanding_deposits_cents: depositsInTransitCents,
  })

  if (!updateResult.success) {
    return { success: false, error: updateResult.error }
  }

  await writeAuditLog(
    tenantId,
    'reconciliation.outstanding_items_identified',
    'trust_reconciliation',
    reconciliationId,
    userId,
    {
      outstanding_cheques_count: unclearedCheques?.length ?? 0,
      outstanding_cheques_cents: outstandingChequesCents,
      deposits_in_transit_count: depositsInTransit?.length ?? 0,
      deposits_in_transit_cents: depositsInTransitCents,
    },
  )

  return { success: true, data: insertedItems }
}

// ── Step 4: Compute Adjusted Bank Balance ───────────────────────────────────

/**
 * Step 4 — adjusted = bank_statement_balance - outstanding_cheques + deposits_in_transit
 */
export async function computeAdjustedBankBalance(
  supabase: SupabaseClient<Database>,
  tenantId: string,
  userId: string,
  reconciliationId: string,
): Promise<ServiceResult<TrustReconciliationRow>> {
  const guard = await fetchMutableReconciliation(supabase, reconciliationId, tenantId)
  if (!guard.success) return guard
  const rec = guard.data!

  if (rec.bank_statement_balance_cents === null) {
    return { success: false, error: 'Bank statement balance not set (Step 1 required)' }
  }
  if (rec.outstanding_cheques_cents === null || rec.outstanding_deposits_cents === null) {
    return { success: false, error: 'Outstanding items not identified (Step 3 required)' }
  }

  const adjustedBankBalanceCents =
    rec.bank_statement_balance_cents
    - rec.outstanding_cheques_cents
    + rec.outstanding_deposits_cents

  const result = await updateReconciliation(supabase, reconciliationId, tenantId, {
    adjusted_bank_balance_cents: adjustedBankBalanceCents,
  })

  if (result.success) {
    await writeAuditLog(
      tenantId,
      'reconciliation.adjusted_bank_balance_computed',
      'trust_reconciliation',
      reconciliationId,
      userId,
      {
        bank_statement_balance_cents: rec.bank_statement_balance_cents,
        outstanding_cheques_cents: rec.outstanding_cheques_cents,
        outstanding_deposits_cents: rec.outstanding_deposits_cents,
        adjusted_bank_balance_cents: adjustedBankBalanceCents,
      },
    )
  }

  return result
}

// ── Step 5: Compute Client Listing ──────────────────────────────────────────

/**
 * Step 5 — Sum of running balances across all matters for this trust account.
 * The "client trust listing" total — what the firm owes all clients combined.
 *
 * For each matter, we take the running_balance_cents of the latest transaction
 * on or before the period_end.
 */
export async function computeClientListing(
  supabase: SupabaseClient<Database>,
  tenantId: string,
  userId: string,
  reconciliationId: string,
): Promise<ServiceResult<TrustReconciliationRow>> {
  const guard = await fetchMutableReconciliation(supabase, reconciliationId, tenantId)
  if (!guard.success) return guard
  const rec = guard.data!

  // Get distinct matter IDs for this trust account
  const { data: matterRows, error: matterErr } = await (supabase as any)
    .from('trust_transactions')
    .select('matter_id')
    .eq('trust_account_id', rec.trust_account_id)
    .eq('tenant_id', tenantId)
    .lte('effective_date', rec.period_end)

  if (matterErr) {
    return { success: false, error: `Failed to query matters: ${matterErr.message}` }
  }

  // Deduplicate matter IDs
  const matterIds = Array.from(new Set((matterRows ?? []).map((r: any) => r.matter_id)))

  let clientListingTotalCents = 0

  // For each matter, get the latest running_balance_cents on or before period_end
  for (const matterId of matterIds) {
    const { data: lastTx, error: txErr } = await (supabase as any)
      .from('trust_transactions')
      .select('running_balance_cents')
      .eq('trust_account_id', rec.trust_account_id)
      .eq('matter_id', matterId)
      .eq('tenant_id', tenantId)
      .lte('effective_date', rec.period_end)
      .order('effective_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (txErr) {
      return { success: false, error: `Failed to query balance for matter ${matterId}: ${txErr.message}` }
    }

    clientListingTotalCents += lastTx?.running_balance_cents ?? 0
  }

  const result = await updateReconciliation(supabase, reconciliationId, tenantId, {
    client_listing_total_cents: clientListingTotalCents,
  })

  if (result.success) {
    await writeAuditLog(
      tenantId,
      'reconciliation.client_listing_computed',
      'trust_reconciliation',
      reconciliationId,
      userId,
      {
        client_listing_total_cents: clientListingTotalCents,
        matter_count: matterIds.length,
      },
    )
  }

  return result
}

// ── Step 6: Three-Way Balance Check ─────────────────────────────────────────

/**
 * Step 6 — Compare: adjusted_bank_balance == book_balance == client_listing_total
 * Sets is_balanced = true/false.
 */
export async function checkThreeWayBalance(
  supabase: SupabaseClient<Database>,
  tenantId: string,
  userId: string,
  reconciliationId: string,
): Promise<ServiceResult<TrustReconciliationRow>> {
  const guard = await fetchMutableReconciliation(supabase, reconciliationId, tenantId)
  if (!guard.success) return guard
  const rec = guard.data!

  if (rec.adjusted_bank_balance_cents === null) {
    return { success: false, error: 'Adjusted bank balance not computed (Step 4 required)' }
  }
  if (rec.book_balance_cents === null) {
    return { success: false, error: 'Book balance not computed (Step 2 required)' }
  }
  if (rec.client_listing_total_cents === null) {
    return { success: false, error: 'Client listing not computed (Step 5 required)' }
  }

  const isBalanced =
    rec.adjusted_bank_balance_cents === rec.book_balance_cents &&
    rec.book_balance_cents === rec.client_listing_total_cents

  const result = await updateReconciliation(supabase, reconciliationId, tenantId, {
    is_balanced: isBalanced,
  })

  if (result.success) {
    await writeAuditLog(
      tenantId,
      'reconciliation.three_way_check',
      'trust_reconciliation',
      reconciliationId,
      userId,
      {
        adjusted_bank_balance_cents: rec.adjusted_bank_balance_cents,
        book_balance_cents: rec.book_balance_cents,
        client_listing_total_cents: rec.client_listing_total_cents,
        is_balanced: isBalanced,
        variance_bank_vs_book: rec.adjusted_bank_balance_cents - rec.book_balance_cents,
        variance_book_vs_client: rec.book_balance_cents - rec.client_listing_total_cents,
      },
    )
  }

  return result
}

// ── Step 7: Complete Reconciliation ─────────────────────────────────────────

/**
 * Step 7 — Mark reconciliation as completed.
 * All steps must have been computed (not necessarily balanced — can complete with flags).
 */
export async function completeReconciliation(
  supabase: SupabaseClient<Database>,
  tenantId: string,
  reconciliationId: string,
  userId: string,
): Promise<ServiceResult<TrustReconciliationRow>> {
  const rec = await fetchReconciliation(supabase, reconciliationId, tenantId)
  if (!rec) {
    return { success: false, error: 'Reconciliation not found' }
  }
  if (rec.status === 'reviewed') {
    return { success: false, error: 'Reconciliation is already reviewed and immutable' }
  }
  if (rec.status === 'completed') {
    return { success: false, error: 'Reconciliation is already completed' }
  }

  // Verify all steps have been computed
  if (rec.bank_statement_balance_cents === null) {
    return { success: false, error: 'Step 1 incomplete: bank statement balance not set' }
  }
  if (rec.book_balance_cents === null) {
    return { success: false, error: 'Step 2 incomplete: book balance not computed' }
  }
  if (rec.outstanding_cheques_cents === null || rec.outstanding_deposits_cents === null) {
    return { success: false, error: 'Step 3 incomplete: outstanding items not identified' }
  }
  if (rec.adjusted_bank_balance_cents === null) {
    return { success: false, error: 'Step 4 incomplete: adjusted bank balance not computed' }
  }
  if (rec.client_listing_total_cents === null) {
    return { success: false, error: 'Step 5 incomplete: client listing not computed' }
  }
  if (rec.is_balanced === null) {
    return { success: false, error: 'Step 6 incomplete: three-way balance check not performed' }
  }

  const now = new Date().toISOString()
  const result = await updateReconciliation(supabase, reconciliationId, tenantId, {
    status: 'completed',
    completed_by: userId,
    completed_at: now,
  })

  if (result.success) {
    await writeAuditLog(
      tenantId,
      'reconciliation.completed',
      'trust_reconciliation',
      reconciliationId,
      userId,
      {
        is_balanced: rec.is_balanced,
        completed_at: now,
      },
    )
  }

  return result
}

// ── Step 8: Review Reconciliation ───────────────────────────────────────────

/**
 * Step 8 — Mark reconciliation as reviewed.
 * Reviewer must be different from completer (segregation of duties).
 * Once reviewed, the reconciliation is IMMUTABLE (DB trigger protects).
 */
export async function reviewReconciliation(
  supabase: SupabaseClient<Database>,
  tenantId: string,
  reconciliationId: string,
  reviewerId: string,
): Promise<ServiceResult<TrustReconciliationRow>> {
  const rec = await fetchReconciliation(supabase, reconciliationId, tenantId)
  if (!rec) {
    return { success: false, error: 'Reconciliation not found' }
  }
  if (rec.status === 'reviewed') {
    return { success: false, error: 'Reconciliation is already reviewed' }
  }
  if (rec.status !== 'completed') {
    return { success: false, error: 'Reconciliation must be completed before review (current status: ' + rec.status + ')' }
  }

  // Segregation of duties: reviewer != completer
  if (rec.completed_by === reviewerId) {
    return {
      success: false,
      error: 'Segregation of duties violation: reviewer cannot be the same person who completed the reconciliation',
    }
  }

  const now = new Date().toISOString()
  const result = await updateReconciliation(supabase, reconciliationId, tenantId, {
    status: 'reviewed',
    reviewed_by: reviewerId,
    reviewed_at: now,
  })

  if (result.success) {
    await writeAuditLog(
      tenantId,
      'reconciliation.reviewed',
      'trust_reconciliation',
      reconciliationId,
      reviewerId,
      {
        completed_by: rec.completed_by,
        reviewed_at: now,
        is_balanced: rec.is_balanced,
      },
    )
  }

  return result
}

// ── Flag Reconciliation ─────────────────────────────────────────────────────

/**
 * Flag a reconciliation with notes explaining the discrepancy.
 * Can be applied to draft or completed reconciliations.
 */
export async function flagReconciliation(
  supabase: SupabaseClient<Database>,
  tenantId: string,
  userId: string,
  reconciliationId: string,
  notes: string,
): Promise<ServiceResult<TrustReconciliationRow>> {
  const rec = await fetchReconciliation(supabase, reconciliationId, tenantId)
  if (!rec) {
    return { success: false, error: 'Reconciliation not found' }
  }
  if (rec.status === 'reviewed') {
    return { success: false, error: 'Reconciliation is reviewed and immutable — cannot flag' }
  }

  const result = await updateReconciliation(supabase, reconciliationId, tenantId, {
    status: 'flagged',
    notes,
  })

  if (result.success) {
    await writeAuditLog(
      tenantId,
      'reconciliation.flagged',
      'trust_reconciliation',
      reconciliationId,
      userId,
      { notes, previous_status: rec.status },
    )
  }

  return result
}

// ── Reconciliation Items ────────────────────────────────────────────────────

/**
 * Manually add an item (bank_error, book_error, unmatched_bank_item, etc.).
 */
export async function addReconciliationItem(
  params: AddReconciliationItemParams,
): Promise<ServiceResult<TrustReconciliationItemRow>> {
  const { supabase, tenantId, userId, reconciliationId, itemType, description, amountCents, transactionId } = params

  const guard = await fetchMutableReconciliation(supabase, reconciliationId, tenantId)
  if (!guard.success) return { success: false, error: guard.error }

  const insert: TrustReconciliationItemInsert = {
    tenant_id: tenantId,
    reconciliation_id: reconciliationId,
    item_type: itemType,
    description,
    amount_cents: amountCents,
    transaction_id: transactionId ?? null,
  }

  const { data, error } = await (supabase as any)
    .from('trust_reconciliation_items')
    .insert(insert)
    .select('*')
    .single()

  if (error) {
    return { success: false, error: error.message }
  }

  const item = data as TrustReconciliationItemRow

  await writeAuditLog(
    tenantId,
    'reconciliation_item.added',
    'trust_reconciliation_item',
    item.id,
    userId,
    {
      reconciliation_id: reconciliationId,
      item_type: itemType,
      amount_cents: amountCents,
      description,
    },
  )

  return { success: true, data: item }
}

/**
 * Mark a reconciliation item as resolved.
 */
export async function resolveReconciliationItem(
  supabase: SupabaseClient<Database>,
  tenantId: string,
  userId: string,
  itemId: string,
): Promise<ServiceResult<TrustReconciliationItemRow>> {
  // Fetch item and verify it belongs to a mutable reconciliation
  const { data: item, error: fetchErr } = await (supabase as any)
    .from('trust_reconciliation_items')
    .select('*, reconciliation_id')
    .eq('id', itemId)
    .eq('tenant_id', tenantId)
    .single()

  if (fetchErr || !item) {
    return { success: false, error: 'Reconciliation item not found' }
  }

  const typedItem = item as TrustReconciliationItemRow

  if (typedItem.resolved) {
    return { success: false, error: 'Item is already resolved' }
  }

  // Ensure parent reconciliation is mutable
  const guard = await fetchMutableReconciliation(supabase, typedItem.reconciliation_id, tenantId)
  if (!guard.success) return { success: false, error: guard.error }

  const now = new Date().toISOString()
  const updates: TrustReconciliationItemUpdate = {
    resolved: true,
    resolved_at: now,
  }

  const { data: updated, error: updateErr } = await (supabase as any)
    .from('trust_reconciliation_items')
    .update(updates)
    .eq('id', itemId)
    .eq('tenant_id', tenantId)
    .select('*')
    .single()

  if (updateErr) {
    return { success: false, error: updateErr.message }
  }

  const resolvedItem = updated as TrustReconciliationItemRow

  await writeAuditLog(
    tenantId,
    'reconciliation_item.resolved',
    'trust_reconciliation_item',
    itemId,
    userId,
    {
      reconciliation_id: typedItem.reconciliation_id,
      item_type: typedItem.item_type,
      amount_cents: typedItem.amount_cents,
      resolved_at: now,
    },
  )

  return { success: true, data: resolvedItem }
}

// ── Queries ─────────────────────────────────────────────────────────────────

/**
 * Get a single reconciliation with all its items.
 */
export async function getReconciliation(
  supabase: SupabaseClient<Database>,
  tenantId: string,
  reconciliationId: string,
): Promise<ServiceResult<ReconciliationWithItems>> {
  const { data: rec, error: recErr } = await (supabase as any)
    .from('trust_reconciliations')
    .select('*')
    .eq('id', reconciliationId)
    .eq('tenant_id', tenantId)
    .single()

  if (recErr || !rec) {
    return { success: false, error: 'Reconciliation not found' }
  }

  const { data: items, error: itemsErr } = await (supabase as any)
    .from('trust_reconciliation_items')
    .select('*')
    .eq('reconciliation_id', reconciliationId)
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: true })

  if (itemsErr) {
    return { success: false, error: `Failed to fetch items: ${itemsErr.message}` }
  }

  const result: ReconciliationWithItems = {
    ...(rec as TrustReconciliationRow),
    items: (items ?? []) as TrustReconciliationItemRow[],
  }

  return { success: true, data: result }
}

/**
 * List reconciliations for a trust account, ordered by period DESC.
 */
export async function listReconciliations(
  supabase: SupabaseClient<Database>,
  tenantId: string,
  trustAccountId: string,
  pagination?: PaginationParams,
): Promise<ServiceResult<PaginatedResult<TrustReconciliationRow>>> {
  const page = pagination?.page ?? 1
  const pageSize = pagination?.pageSize ?? 25
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  // Count total
  const { count, error: countErr } = await (supabase as any)
    .from('trust_reconciliations')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('trust_account_id', trustAccountId)

  if (countErr) {
    return { success: false, error: countErr.message }
  }

  // Fetch page
  const { data, error } = await (supabase as any)
    .from('trust_reconciliations')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('trust_account_id', trustAccountId)
    .order('period_start', { ascending: false })
    .range(from, to)

  if (error) {
    return { success: false, error: error.message }
  }

  return {
    success: true,
    data: {
      data: (data ?? []) as TrustReconciliationRow[],
      total: count ?? 0,
      page,
      pageSize,
    },
  }
}
