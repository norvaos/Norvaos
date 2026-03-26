// ============================================================================
// Trust Ledger Service  -  Core trust accounting operations (Phase 7)
// ============================================================================
// Handles deposits, disbursements, transfers, reversals, holds, and ledger
// queries for IOLTA/trust accounts. All amounts are BIGINT (cents).
//
// Key invariants:
//   C1: No negative client balance (service + DB trigger)
//   C4: Disbursements require an approved trust_disbursement_request
//   Immutable: trust_transactions cannot be UPDATE/DELETE'd (DB trigger)
//   Audit: Every mutation writes to trust_audit_log via admin client
// ============================================================================

import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  Database,
  Json,
  TrustTransactionInsert,
  TrustTransactionRow,
  TrustPaymentMethod,
  TrustHoldInsert,
  TrustHoldRow,
  TrustHoldUpdate,
  TrustDisbursementRequestInsert,
  TrustDisbursementRequestRow,
  TrustDisbursementRequestUpdate,
  TrustAuditLogInsert,
  TrustBankAccountRow,
} from '@/lib/types/database'
import { createAdminClient } from '@/lib/supabase/admin'
import type { ServiceResult } from './trust-types'
import { normalizePagination, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './trust-types'

// ─── Typed Table Accessors ──────────────────────────────────────────────────
// Trust tables are defined as standalone types in database.ts but not yet
// registered in the Database['public']['Tables'] interface. These helpers
// provide clean .from() access without TS errors for unregistered tables.

/* eslint-disable @typescript-eslint/no-explicit-any */
const from = {
  trustTransactions: (c: SupabaseClient<Database>) =>
    (c as SupabaseClient<any>).from('trust_transactions'),
  trustHolds: (c: SupabaseClient<Database>) =>
    (c as SupabaseClient<any>).from('trust_holds'),
  trustDisbursementRequests: (c: SupabaseClient<Database>) =>
    (c as SupabaseClient<any>).from('trust_disbursement_requests'),
  trustBankAccounts: (c: SupabaseClient<Database>) =>
    (c as SupabaseClient<any>).from('trust_bank_accounts'),
  trustAuditLog: (c: SupabaseClient<Database>) =>
    (c as SupabaseClient<any>).from('trust_audit_log'),
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// ─── Service Result Pattern ─────────────────────────────────────────────────

export type { ServiceResult } from './trust-types'

// ─── Parameter Types ────────────────────────────────────────────────────────

export interface RecordDepositParams {
  supabase: SupabaseClient<Database>
  tenantId: string
  trustAccountId: string
  matterId: string
  amountCents: number
  description: string
  paymentMethod: TrustPaymentMethod
  authorizedBy: string
  recordedBy: string
  contactId?: string
  clientDescription?: string
  referenceNumber?: string
  effectiveDate?: string
  notes?: string
}

export interface RecordDisbursementParams {
  supabase: SupabaseClient<Database>
  tenantId: string
  disbursementRequestId: string
  recordedBy: string
  notes?: string
}

export interface RecordTransferParams {
  supabase: SupabaseClient<Database>
  tenantId: string
  fromMatterId: string
  toMatterId: string
  trustAccountId: string
  amountCents: number
  description: string
  authorizedBy: string
  recordedBy: string
  referenceNumber?: string
  notes?: string
}

export interface RecordReversalParams {
  supabase: SupabaseClient<Database>
  tenantId: string
  originalTransactionId: string
  description: string
  authorizedBy: string
  recordedBy: string
  notes?: string
}

export interface GetMatterLedgerParams {
  supabase: SupabaseClient<Database>
  tenantId: string
  matterId: string
  trustAccountId?: string
  page?: number
  pageSize?: number
}

export interface GetAccountLedgerParams {
  supabase: SupabaseClient<Database>
  tenantId: string
  trustAccountId: string
  page?: number
  pageSize?: number
}

export interface PrepareDisbursementRequestParams {
  supabase: SupabaseClient<Database>
  tenantId: string
  trustAccountId: string
  matterId: string
  amountCents: number
  payeeName: string
  description: string
  paymentMethod: TrustPaymentMethod
  preparedBy: string
  clientDescription?: string
  referenceNumber?: string
  invoiceId?: string
  requestType?: 'disbursement' | 'transfer' | 'refund'
  authorizationType?: 'engagement_letter' | 'settlement_direction' | 'written_instruction' | 'verbal_confirmed'
  authorizationRef?: string
}

export interface ApproveDisbursementRequestParams {
  supabase: SupabaseClient<Database>
  tenantId: string
  requestId: string
  approvedBy: string
  recordedBy: string
  notes?: string
}

export interface RejectDisbursementRequestParams {
  supabase: SupabaseClient<Database>
  tenantId: string
  requestId: string
  rejectedBy: string
  reason: string
}

export interface ReleaseHoldParams {
  supabase: SupabaseClient<Database>
  tenantId: string
  holdId: string
  userId: string
}

// ─── Internal Helpers ───────────────────────────────────────────────────────

const LOG_PREFIX = '[trust-ledger-service]'

/**
 * Write an immutable audit log entry via admin client (bypasses RLS).
 *
 * NOTE (Directive 005): The critical balance-level audit is now handled by
 * the trust_ledger_audit DB trigger (migration 200). Every trust_transactions
 * INSERT automatically creates a trust_ledger_audit row in the same DB
 * transaction  -  if the audit fails, the transaction rolls back. This
 * writeAuditLog function remains as a secondary operational log for non-
 * balance events (disbursement approvals, hold releases, etc.).
 */
async function writeAuditLog(params: {
  tenantId: string
  action: string
  entityType: string
  entityId: string
  userId: string
  matterId?: string | null
  metadata?: Record<string, unknown>
}): Promise<void> {
  const admin = createAdminClient()
  const entry: TrustAuditLogInsert = {
    tenant_id: params.tenantId,
    action: params.action,
    entity_type: params.entityType,
    entity_id: params.entityId,
    user_id: params.userId,
    matter_id: params.matterId ?? null,
    metadata: (params.metadata ?? {}) as Json,
  }

  const { error } = await from.trustAuditLog(admin).insert(entry)
  if (error) {
    // Audit failures are logged but never block the primary operation.
    // In a production upgrade, push to a dead-letter queue.
    console.error(`${LOG_PREFIX} Audit log write failed:`, error.message)
  }
}

/**
 * Compute the available balance for a matter in a trust account.
 * Available = sum(all transactions) - sum(active holds).
 */
async function getAvailableBalanceCents(
  supabase: SupabaseClient<Database>,
  tenantId: string,
  matterId: string,
  trustAccountId: string,
): Promise<{ ledgerBalance: number; heldAmount: number; available: number } | null> {
  // Ledger balance: sum of all transaction amounts for this matter + account
  const { data: txnRows, error: txnErr } = await from.trustTransactions(supabase)
    .select('amount_cents')
    .eq('tenant_id', tenantId)
    .eq('matter_id', matterId)
    .eq('trust_account_id', trustAccountId)

  if (txnErr) {
    console.error(`${LOG_PREFIX} Balance query error:`, txnErr.message)
    return null
  }

  const ledgerBalance = (txnRows ?? []).reduce(
    (sum: number, row: { amount_cents: number }) => sum + (row.amount_cents ?? 0),
    0,
  )

  // Active holds: sum of held amounts
  const { data: holdRows, error: holdErr } = await from.trustHolds(supabase)
    .select('amount_cents')
    .eq('tenant_id', tenantId)
    .eq('matter_id', matterId)
    .eq('status', 'held')

  if (holdErr) {
    console.error(`${LOG_PREFIX} Hold query error:`, holdErr.message)
    return null
  }

  const heldAmount = (holdRows ?? []).reduce(
    (sum: number, row: { amount_cents: number }) => sum + (row.amount_cents ?? 0),
    0,
  )

  return {
    ledgerBalance,
    heldAmount,
    available: ledgerBalance - heldAmount,
  }
}

// ─── 1. Record Deposit ──────────────────────────────────────────────────────

export async function recordDeposit(
  params: RecordDepositParams,
): Promise<ServiceResult<TrustTransactionRow>> {
  const {
    supabase, tenantId, trustAccountId, matterId, amountCents, description,
    paymentMethod, authorizedBy, recordedBy, contactId, clientDescription,
    referenceNumber, effectiveDate, notes,
  } = params

  try {
    if (amountCents <= 0) {
      return { success: false, error: 'Deposit amount must be positive' }
    }

    // Determine if cheque hold is needed
    const isCheque = paymentMethod === 'cheque'
    let holdReleaseDate: string | null = null

    if (isCheque) {
      // Fetch default hold days from the trust bank account
      const { data: account, error: accErr } = await from.trustBankAccounts(supabase)
        .select('default_hold_days_cheque')
        .eq('id', trustAccountId)
        .eq('tenant_id', tenantId)
        .single()

      if (accErr || !account) {
        return { success: false, error: 'Trust account not found' }
      }

      const holdDays = (account as TrustBankAccountRow).default_hold_days_cheque ?? 5
      const releaseDate = new Date()
      releaseDate.setDate(releaseDate.getDate() + holdDays)
      holdReleaseDate = releaseDate.toISOString().split('T')[0]
    }

    const txnInsert: TrustTransactionInsert = {
      tenant_id: tenantId,
      trust_account_id: trustAccountId,
      matter_id: matterId,
      transaction_type: 'deposit',
      amount_cents: amountCents,
      description,
      authorized_by: authorizedBy,
      recorded_by: recordedBy,
      contact_id: contactId ?? null,
      client_description: clientDescription ?? null,
      reference_number: referenceNumber ?? null,
      payment_method: paymentMethod,
      is_cleared: !isCheque,
      hold_release_date: holdReleaseDate,
      effective_date: effectiveDate ?? new Date().toISOString().split('T')[0],
      notes: notes ?? null,
    }

    const { data: txn, error: txnErr } = await from.trustTransactions(supabase)
      .insert(txnInsert)
      .select()
      .single()

    if (txnErr || !txn) {
      return { success: false, error: txnErr?.message ?? 'Failed to insert deposit transaction' }
    }

    const created = txn as TrustTransactionRow

    // Create hold record for uncleared cheques
    if (isCheque && holdReleaseDate) {
      const holdInsert: TrustHoldInsert = {
        tenant_id: tenantId,
        transaction_id: created.id,
        matter_id: matterId,
        amount_cents: amountCents,
        hold_release_date: holdReleaseDate,
        status: 'held',
      }

      const { error: holdErr } = await from.trustHolds(supabase).insert(holdInsert)

      if (holdErr) {
        // Non-fatal: log but don't fail the deposit (hold is a safety net, not gating)
        console.error(`${LOG_PREFIX} Hold creation failed:`, holdErr.message)
      }
    }

    // Audit log
    await writeAuditLog({
      tenantId,
      action: 'deposit_recorded',
      entityType: 'trust_transaction',
      entityId: created.id,
      userId: recordedBy,
      matterId,
      metadata: {
        amount_cents: amountCents,
        payment_method: paymentMethod,
        trust_account_id: trustAccountId,
        is_cleared: !isCheque,
        hold_release_date: holdReleaseDate,
      },
    })

    return { success: true, data: created }
  } catch (err) {
    console.error(`${LOG_PREFIX} recordDeposit error:`, err)
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to record deposit',
    }
  }
}

// ─── 2. Record Disbursement ─────────────────────────────────────────────────

export async function recordDisbursement(
  params: RecordDisbursementParams,
): Promise<ServiceResult<TrustTransactionRow>> {
  const { supabase, tenantId, disbursementRequestId, recordedBy, notes } = params

  try {
    // C4: Fetch the approved disbursement request
    const { data: rawRequest, error: reqErr } = await from.trustDisbursementRequests(supabase)
      .select('*')
      .eq('id', disbursementRequestId)
      .eq('tenant_id', tenantId)
      .single()

    if (reqErr || !rawRequest) {
      return { success: false, error: 'Disbursement request not found' }
    }

    const request = rawRequest as TrustDisbursementRequestRow

    if (request.status !== 'approved') {
      return {
        success: false,
        error: `Disbursement request is "${request.status}"  -  only approved requests can be disbursed`,
      }
    }

    if (request.trust_transaction_id) {
      return { success: false, error: 'Disbursement request has already been executed' }
    }

    const disbursementAmountCents = -Math.abs(request.amount_cents)

    // C1: Check available balance (service layer  -  DB trigger is second layer)
    const balance = await getAvailableBalanceCents(
      supabase, tenantId, request.matter_id, request.trust_account_id,
    )

    if (!balance) {
      return { success: false, error: 'Unable to compute available balance' }
    }

    if (balance.available + disbursementAmountCents < 0) {
      return {
        success: false,
        error: `Insufficient available balance. Available: ${balance.available} cents, ` +
               `requested: ${Math.abs(disbursementAmountCents)} cents`,
      }
    }

    // Insert the transaction (amount is negative for disbursement)
    const txnInsert: TrustTransactionInsert = {
      tenant_id: tenantId,
      trust_account_id: request.trust_account_id,
      matter_id: request.matter_id,
      transaction_type: 'disbursement',
      amount_cents: disbursementAmountCents,
      description: request.description,
      authorized_by: request.approved_by!,
      recorded_by: recordedBy,
      client_description: request.client_description ?? null,
      reference_number: request.reference_number ?? null,
      payment_method: request.payment_method,
      invoice_id: request.invoice_id ?? null,
      is_cleared: true,
      effective_date: new Date().toISOString().split('T')[0],
      notes: notes ?? null,
    }

    const { data: txn, error: txnErr } = await from.trustTransactions(supabase)
      .insert(txnInsert)
      .select()
      .single()

    if (txnErr || !txn) {
      return { success: false, error: txnErr?.message ?? 'Failed to insert disbursement transaction' }
    }

    const created = txn as TrustTransactionRow

    // Link the transaction back to the disbursement request
    const reqUpdate: TrustDisbursementRequestUpdate = {
      trust_transaction_id: created.id,
    }
    await from.trustDisbursementRequests(supabase)
      .update(reqUpdate)
      .eq('id', disbursementRequestId)
      .eq('tenant_id', tenantId)

    // Audit log
    await writeAuditLog({
      tenantId,
      action: 'disbursement_recorded',
      entityType: 'trust_transaction',
      entityId: created.id,
      userId: recordedBy,
      matterId: request.matter_id,
      metadata: {
        amount_cents: disbursementAmountCents,
        disbursement_request_id: disbursementRequestId,
        payee_name: request.payee_name,
        payment_method: request.payment_method,
        trust_account_id: request.trust_account_id,
        approved_by: request.approved_by,
      },
    })

    return { success: true, data: created }
  } catch (err) {
    console.error(`${LOG_PREFIX} recordDisbursement error:`, err)
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to record disbursement',
    }
  }
}

// ─── 3. Record Transfer ─────────────────────────────────────────────────────

export async function recordTransfer(
  params: RecordTransferParams,
): Promise<ServiceResult<{ transferOut: TrustTransactionRow; transferIn: TrustTransactionRow }>> {
  const {
    supabase, tenantId, fromMatterId, toMatterId, trustAccountId,
    amountCents, description, authorizedBy, recordedBy, referenceNumber, notes,
  } = params

  try {
    if (amountCents <= 0) {
      return { success: false, error: 'Transfer amount must be positive' }
    }

    if (fromMatterId === toMatterId) {
      return { success: false, error: 'Source and destination matter cannot be the same' }
    }

    // C1: Check available balance on source matter
    const balance = await getAvailableBalanceCents(
      supabase, tenantId, fromMatterId, trustAccountId,
    )

    if (!balance) {
      return { success: false, error: 'Unable to compute available balance on source matter' }
    }

    if (balance.available < amountCents) {
      return {
        success: false,
        error: `Insufficient available balance on source matter. Available: ${balance.available} cents, ` +
               `requested: ${amountCents} cents`,
      }
    }

    const effectiveDate = new Date().toISOString().split('T')[0]
    const transferRef = referenceNumber ?? `TRF-${Date.now()}`

    // Transfer OUT (negative) on source matter
    const outInsert: TrustTransactionInsert = {
      tenant_id: tenantId,
      trust_account_id: trustAccountId,
      matter_id: fromMatterId,
      transaction_type: 'transfer_out',
      amount_cents: -amountCents,
      description: `${description} (transfer to matter)`,
      authorized_by: authorizedBy,
      recorded_by: recordedBy,
      reference_number: transferRef,
      is_cleared: true,
      effective_date: effectiveDate,
      notes: notes ?? null,
    }

    const { data: rawOut, error: outErr } = await from.trustTransactions(supabase)
      .insert(outInsert)
      .select()
      .single()

    if (outErr || !rawOut) {
      return { success: false, error: outErr?.message ?? 'Failed to insert transfer-out transaction' }
    }

    const txnOut = rawOut as TrustTransactionRow

    // Transfer IN (positive) on destination matter
    const inInsert: TrustTransactionInsert = {
      tenant_id: tenantId,
      trust_account_id: trustAccountId,
      matter_id: toMatterId,
      transaction_type: 'transfer_in',
      amount_cents: amountCents,
      description: `${description} (transfer from matter)`,
      authorized_by: authorizedBy,
      recorded_by: recordedBy,
      reference_number: transferRef,
      is_cleared: true,
      effective_date: effectiveDate,
      notes: notes ?? null,
    }

    const { data: rawIn, error: inErr } = await from.trustTransactions(supabase)
      .insert(inInsert)
      .select()
      .single()

    if (inErr || !rawIn) {
      // The out-transaction succeeded but in-transaction failed.
      // In production, this should be wrapped in a Postgres function/transaction.
      // Log prominently for manual reconciliation.
      console.error(
        `${LOG_PREFIX} CRITICAL: transfer_out succeeded (${txnOut.id}) but transfer_in failed. ` +
        `Manual reversal required. Error: ${inErr?.message}`,
      )
      return { success: false, error: 'Transfer partially failed  -  contact administrator' }
    }

    const txnIn = rawIn as TrustTransactionRow

    // Audit log
    await writeAuditLog({
      tenantId,
      action: 'transfer_recorded',
      entityType: 'trust_transaction',
      entityId: txnOut.id,
      userId: recordedBy,
      matterId: fromMatterId,
      metadata: {
        amount_cents: amountCents,
        from_matter_id: fromMatterId,
        to_matter_id: toMatterId,
        trust_account_id: trustAccountId,
        transfer_out_txn_id: txnOut.id,
        transfer_in_txn_id: txnIn.id,
        reference_number: transferRef,
      },
    })

    return { success: true, data: { transferOut: txnOut, transferIn: txnIn } }
  } catch (err) {
    console.error(`${LOG_PREFIX} recordTransfer error:`, err)
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to record transfer',
    }
  }
}

// ─── 4. Record Reversal ─────────────────────────────────────────────────────

export async function recordReversal(
  params: RecordReversalParams,
): Promise<ServiceResult<TrustTransactionRow>> {
  const {
    supabase, tenantId, originalTransactionId, description,
    authorizedBy, recordedBy, notes,
  } = params

  try {
    // Fetch the original transaction
    const { data: rawOriginal, error: origErr } = await from.trustTransactions(supabase)
      .select('*')
      .eq('id', originalTransactionId)
      .eq('tenant_id', tenantId)
      .single()

    if (origErr || !rawOriginal) {
      return { success: false, error: 'Original transaction not found' }
    }

    const original = rawOriginal as TrustTransactionRow

    // Prevent reversing a reversal
    if (original.transaction_type === 'reversal') {
      return { success: false, error: 'Cannot reverse a reversal transaction' }
    }

    // Check if already reversed
    const { data: existingReversal } = await from.trustTransactions(supabase)
      .select('id')
      .eq('reversal_of_id', originalTransactionId)
      .eq('tenant_id', tenantId)
      .limit(1)
      .maybeSingle()

    if (existingReversal) {
      return { success: false, error: 'This transaction has already been reversed' }
    }

    // Reversal amount is opposite sign of original
    const reversalAmountCents = -original.amount_cents

    // If reversing a deposit (positive original), the reversal is negative.
    // Check that the matter has sufficient balance for the reversal.
    if (reversalAmountCents < 0) {
      const balance = await getAvailableBalanceCents(
        supabase, tenantId, original.matter_id, original.trust_account_id,
      )

      if (!balance) {
        return { success: false, error: 'Unable to compute available balance' }
      }

      if (balance.available + reversalAmountCents < 0) {
        return {
          success: false,
          error: `Insufficient available balance to reverse. Available: ${balance.available} cents, ` +
                 `reversal: ${Math.abs(reversalAmountCents)} cents`,
        }
      }
    }

    const txnInsert: TrustTransactionInsert = {
      tenant_id: tenantId,
      trust_account_id: original.trust_account_id,
      matter_id: original.matter_id,
      transaction_type: 'reversal',
      amount_cents: reversalAmountCents,
      description,
      authorized_by: authorizedBy,
      recorded_by: recordedBy,
      reversal_of_id: originalTransactionId,
      contact_id: original.contact_id,
      reference_number: original.reference_number
        ? `REV-${original.reference_number}`
        : null,
      payment_method: original.payment_method,
      is_cleared: true,
      effective_date: new Date().toISOString().split('T')[0],
      notes: notes ?? null,
    }

    const { data: rawTxn, error: txnErr } = await from.trustTransactions(supabase)
      .insert(txnInsert)
      .select()
      .single()

    if (txnErr || !rawTxn) {
      return { success: false, error: txnErr?.message ?? 'Failed to insert reversal transaction' }
    }

    const created = rawTxn as TrustTransactionRow

    // If the original had an active hold, cancel it
    const { data: activeHold } = await from.trustHolds(supabase)
      .select('id')
      .eq('transaction_id', originalTransactionId)
      .eq('tenant_id', tenantId)
      .eq('status', 'held')
      .maybeSingle()

    if (activeHold) {
      const holdUpdate: TrustHoldUpdate = {
        status: 'cancelled',
        released_at: new Date().toISOString(),
      }
      await from.trustHolds(supabase)
        .update(holdUpdate)
        .eq('id', (activeHold as { id: string }).id)
        .eq('tenant_id', tenantId)
    }

    // Audit log
    await writeAuditLog({
      tenantId,
      action: 'reversal_recorded',
      entityType: 'trust_transaction',
      entityId: created.id,
      userId: recordedBy,
      matterId: original.matter_id,
      metadata: {
        reversal_amount_cents: reversalAmountCents,
        original_transaction_id: originalTransactionId,
        original_type: original.transaction_type,
        original_amount_cents: original.amount_cents,
        trust_account_id: original.trust_account_id,
      },
    })

    return { success: true, data: created }
  } catch (err) {
    console.error(`${LOG_PREFIX} recordReversal error:`, err)
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to record reversal',
    }
  }
}

// ─── 5. Get Matter Ledger ───────────────────────────────────────────────────

export interface MatterLedgerResult {
  transactions: TrustTransactionRow[]
  page: number
  pageSize: number
  totalCount: number
}

export async function getMatterLedger(
  params: GetMatterLedgerParams,
): Promise<ServiceResult<MatterLedgerResult>> {
  const { supabase, tenantId, matterId, trustAccountId, page, pageSize } = params

  try {
    const pag = normalizePagination(page, pageSize)

    let query = from.trustTransactions(supabase)
      .select('*', { count: 'exact' })
      .eq('tenant_id', tenantId)
      .eq('matter_id', matterId)
      .order('created_at', { ascending: false })
      .range(pag.from, pag.to)

    if (trustAccountId) {
      query = query.eq('trust_account_id', trustAccountId)
    }

    const { data, error, count } = await query

    if (error) {
      return { success: false, error: error.message }
    }

    return {
      success: true,
      data: {
        transactions: (data ?? []) as TrustTransactionRow[],
        page: pag.page,
        pageSize: pag.pageSize,
        totalCount: count ?? 0,
      },
    }
  } catch (err) {
    console.error(`${LOG_PREFIX} getMatterLedger error:`, err)
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to fetch matter ledger',
    }
  }
}

// ─── 6. Get Account Ledger ──────────────────────────────────────────────────

export interface AccountLedgerTransaction extends TrustTransactionRow {
  matter_title?: string
}

export interface AccountLedgerResult {
  transactions: AccountLedgerTransaction[]
  page: number
  pageSize: number
  totalCount: number
}

export async function getAccountLedger(
  params: GetAccountLedgerParams,
): Promise<ServiceResult<AccountLedgerResult>> {
  const { supabase, tenantId, trustAccountId, page, pageSize } = params

  try {
    const pag = normalizePagination(page, pageSize)

    const { data, error, count } = await from.trustTransactions(supabase)
      .select('*, matters!inner(title)', { count: 'exact' })
      .eq('tenant_id', tenantId)
      .eq('trust_account_id', trustAccountId)
      .order('created_at', { ascending: false })
      .range(pag.from, pag.to)

    if (error) {
      return { success: false, error: error.message }
    }

    // Flatten the joined matter title
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const transactions: AccountLedgerTransaction[] = (data ?? []).map((row: any) => {
      const { matters, ...txn } = row
      return {
        ...txn,
        matter_title: matters?.title ?? undefined,
      }
    })

    return {
      success: true,
      data: {
        transactions,
        page: pag.page,
        pageSize: pag.pageSize,
        totalCount: count ?? 0,
      },
    }
  } catch (err) {
    console.error(`${LOG_PREFIX} getAccountLedger error:`, err)
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to fetch account ledger',
    }
  }
}

// ─── 7. Prepare Disbursement Request ────────────────────────────────────────

export async function prepareDisbursementRequest(
  params: PrepareDisbursementRequestParams,
): Promise<ServiceResult<TrustDisbursementRequestRow>> {
  const {
    supabase, tenantId, trustAccountId, matterId, amountCents, payeeName,
    description, paymentMethod, preparedBy, clientDescription, referenceNumber,
    invoiceId, requestType, authorizationType, authorizationRef,
  } = params

  try {
    if (amountCents <= 0) {
      return { success: false, error: 'Disbursement amount must be positive' }
    }

    const insert: TrustDisbursementRequestInsert = {
      tenant_id: tenantId,
      trust_account_id: trustAccountId,
      matter_id: matterId,
      amount_cents: amountCents,
      payee_name: payeeName,
      description,
      payment_method: paymentMethod,
      prepared_by: preparedBy,
      status: 'pending_approval',
      client_description: clientDescription ?? null,
      reference_number: referenceNumber ?? null,
      invoice_id: invoiceId ?? null,
      request_type: requestType ?? 'disbursement',
      authorization_type: authorizationType ?? null,
      authorization_ref: authorizationRef ?? null,
    }

    const { data, error } = await from.trustDisbursementRequests(supabase)
      .insert(insert)
      .select()
      .single()

    if (error || !data) {
      return { success: false, error: error?.message ?? 'Failed to create disbursement request' }
    }

    const created = data as TrustDisbursementRequestRow

    // Audit log
    await writeAuditLog({
      tenantId,
      action: 'disbursement_request_prepared',
      entityType: 'trust_disbursement_request',
      entityId: created.id,
      userId: preparedBy,
      matterId,
      metadata: {
        amount_cents: amountCents,
        payee_name: payeeName,
        payment_method: paymentMethod,
        trust_account_id: trustAccountId,
        request_type: requestType ?? 'disbursement',
      },
    })

    return { success: true, data: created }
  } catch (err) {
    console.error(`${LOG_PREFIX} prepareDisbursementRequest error:`, err)
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to prepare disbursement request',
    }
  }
}

// ─── 8. Approve Disbursement Request ────────────────────────────────────────

export async function approveDisbursementRequest(
  params: ApproveDisbursementRequestParams,
): Promise<ServiceResult<{ request: TrustDisbursementRequestRow; transaction: TrustTransactionRow }>> {
  const { supabase, tenantId, requestId, approvedBy, recordedBy, notes } = params

  try {
    // Fetch the request
    const { data: rawRequest, error: reqErr } = await from.trustDisbursementRequests(supabase)
      .select('*')
      .eq('id', requestId)
      .eq('tenant_id', tenantId)
      .single()

    if (reqErr || !rawRequest) {
      return { success: false, error: 'Disbursement request not found' }
    }

    const request = rawRequest as TrustDisbursementRequestRow

    if (request.status !== 'pending_approval') {
      return {
        success: false,
        error: `Request is "${request.status}"  -  only pending requests can be approved`,
      }
    }

    // Segregation of duties: approver must not be the preparer
    if (request.prepared_by === approvedBy) {
      return {
        success: false,
        error: 'Segregation of duties violation: approver cannot be the same person who prepared the request',
      }
    }

    // Update the request to approved
    const reqUpdate: TrustDisbursementRequestUpdate = {
      status: 'approved',
      approved_by: approvedBy,
      approved_at: new Date().toISOString(),
    }

    const { data: rawUpdated, error: updateErr } = await from.trustDisbursementRequests(supabase)
      .update(reqUpdate)
      .eq('id', requestId)
      .eq('tenant_id', tenantId)
      .select()
      .single()

    if (updateErr || !rawUpdated) {
      return { success: false, error: updateErr?.message ?? 'Failed to approve request' }
    }

    const updatedRequest = rawUpdated as TrustDisbursementRequestRow

    // Execute the disbursement
    const disbursementResult = await recordDisbursement({
      supabase,
      tenantId,
      disbursementRequestId: requestId,
      recordedBy,
      notes,
    })

    if (!disbursementResult.success || !disbursementResult.data) {
      // Rollback approval status  -  the disbursement failed (e.g. insufficient funds)
      const rollback: TrustDisbursementRequestUpdate = {
        status: 'pending_approval',
        approved_by: null,
        approved_at: null,
      }
      await from.trustDisbursementRequests(supabase)
        .update(rollback)
        .eq('id', requestId)
        .eq('tenant_id', tenantId)

      return {
        success: false,
        error: `Approval succeeded but disbursement failed: ${disbursementResult.error}`,
      }
    }

    // Audit log
    await writeAuditLog({
      tenantId,
      action: 'disbursement_request_approved',
      entityType: 'trust_disbursement_request',
      entityId: requestId,
      userId: approvedBy,
      matterId: request.matter_id,
      metadata: {
        amount_cents: request.amount_cents,
        payee_name: request.payee_name,
        prepared_by: request.prepared_by,
        transaction_id: disbursementResult.data.id,
      },
    })

    return {
      success: true,
      data: {
        request: updatedRequest,
        transaction: disbursementResult.data,
      },
    }
  } catch (err) {
    console.error(`${LOG_PREFIX} approveDisbursementRequest error:`, err)
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to approve disbursement request',
    }
  }
}

// ─── 9. Reject Disbursement Request ─────────────────────────────────────────

export async function rejectDisbursementRequest(
  params: RejectDisbursementRequestParams,
): Promise<ServiceResult<TrustDisbursementRequestRow>> {
  const { supabase, tenantId, requestId, rejectedBy, reason } = params

  try {
    if (!reason || reason.trim().length === 0) {
      return { success: false, error: 'Rejection reason is required' }
    }

    // Fetch and validate
    const { data: rawRequest, error: reqErr } = await from.trustDisbursementRequests(supabase)
      .select('*')
      .eq('id', requestId)
      .eq('tenant_id', tenantId)
      .single()

    if (reqErr || !rawRequest) {
      return { success: false, error: 'Disbursement request not found' }
    }

    const request = rawRequest as TrustDisbursementRequestRow

    if (request.status !== 'pending_approval') {
      return {
        success: false,
        error: `Request is "${request.status}"  -  only pending requests can be rejected`,
      }
    }

    const reqUpdate: TrustDisbursementRequestUpdate = {
      status: 'rejected',
      rejected_by: rejectedBy,
      rejection_reason: reason.trim(),
    }

    const { data: rawUpdated, error: updateErr } = await from.trustDisbursementRequests(supabase)
      .update(reqUpdate)
      .eq('id', requestId)
      .eq('tenant_id', tenantId)
      .select()
      .single()

    if (updateErr || !rawUpdated) {
      return { success: false, error: updateErr?.message ?? 'Failed to reject request' }
    }

    const updated = rawUpdated as TrustDisbursementRequestRow

    // Audit log
    await writeAuditLog({
      tenantId,
      action: 'disbursement_request_rejected',
      entityType: 'trust_disbursement_request',
      entityId: requestId,
      userId: rejectedBy,
      matterId: request.matter_id,
      metadata: {
        amount_cents: request.amount_cents,
        payee_name: request.payee_name,
        prepared_by: request.prepared_by,
        rejection_reason: reason.trim(),
      },
    })

    return { success: true, data: updated }
  } catch (err) {
    console.error(`${LOG_PREFIX} rejectDisbursementRequest error:`, err)
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to reject disbursement request',
    }
  }
}

// ─── 10. Release Hold ───────────────────────────────────────────────────────

export async function releaseHold(
  params: ReleaseHoldParams,
): Promise<ServiceResult<TrustHoldRow>> {
  const { supabase, tenantId, holdId, userId } = params

  try {
    // Fetch the hold
    const { data: rawHold, error: holdErr } = await from.trustHolds(supabase)
      .select('*')
      .eq('id', holdId)
      .eq('tenant_id', tenantId)
      .single()

    if (holdErr || !rawHold) {
      return { success: false, error: 'Hold not found' }
    }

    const hold = rawHold as TrustHoldRow

    if (hold.status !== 'held') {
      return {
        success: false,
        error: `Hold is "${hold.status}"  -  only active holds can be released`,
      }
    }

    // Update hold status to released.
    // Note: trust_transactions are immutable (DB trigger blocks UPDATE/DELETE).
    // The available balance calculation uses trust_holds, not is_cleared on
    // transactions. Releasing a hold increases available balance without
    // touching the transaction.
    const holdUpdate: TrustHoldUpdate = {
      status: 'released',
      released_at: new Date().toISOString(),
    }

    const { data: rawUpdated, error: updateErr } = await from.trustHolds(supabase)
      .update(holdUpdate)
      .eq('id', holdId)
      .eq('tenant_id', tenantId)
      .select()
      .single()

    if (updateErr || !rawUpdated) {
      return { success: false, error: updateErr?.message ?? 'Failed to release hold' }
    }

    const updated = rawUpdated as TrustHoldRow

    // Audit log
    await writeAuditLog({
      tenantId,
      action: 'hold_released',
      entityType: 'trust_hold',
      entityId: holdId,
      userId,
      matterId: hold.matter_id,
      metadata: {
        transaction_id: hold.transaction_id,
        amount_cents: hold.amount_cents,
        hold_release_date: hold.hold_release_date,
      },
    })

    return { success: true, data: updated }
  } catch (err) {
    console.error(`${LOG_PREFIX} releaseHold error:`, err)
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to release hold',
    }
  }
}

// ─── Exported Utility ───────────────────────────────────────────────────────

/**
 * Public wrapper for balance computation  -  used by UI components and other services.
 */
export async function getAvailableBalance(
  supabase: SupabaseClient<Database>,
  tenantId: string,
  matterId: string,
  trustAccountId: string,
): Promise<ServiceResult<{ ledgerBalance: number; heldAmount: number; available: number }>> {
  const result = await getAvailableBalanceCents(supabase, tenantId, matterId, trustAccountId)
  if (!result) {
    return { success: false, error: 'Unable to compute available balance' }
  }
  return { success: true, data: result }
}
