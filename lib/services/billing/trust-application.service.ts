// ============================================================================
// Trust Application Service — billing side of the trust firewall
// ============================================================================
// The trust firewall permits billing to READ trust_bank_accounts and
// trust_holds, and WRITE invoice_trust_allocations only.  Billing is
// prohibited from writing trust_transactions or any other trust table.
//
// Workflow:
//   1. Billing reads available trust balance for a matter.
//   2. Billing creates an invoice_trust_allocation with status = 'pending'.
//   3. The trust module (trust-accounting service) processes the allocation:
//      - Validates sufficient balance
//      - Writes a trust_transaction (disbursement)
//      - Updates invoice_trust_allocation.status to 'confirmed' or 'failed'
//   4. The trg_trust_allocation_recalculate trigger fires on status change and
//      calls calculate_invoice_totals() to update invoice financials.
//
// Billing totals only update on CONFIRMED, not PENDING.
// ============================================================================

import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  Database,
  TrustAllocationStatus,
  InvoiceTrustAllocationInsert,
} from '@/lib/types/database'
import { appendAuditEvent } from './invoice-audit.service'

export interface ServiceResult<T = void> {
  success: boolean
  data?: T
  error?: string
}

/* eslint-disable @typescript-eslint/no-explicit-any */
const fromAllocations = (c: SupabaseClient<Database>) =>
  (c as SupabaseClient<any>).from('invoice_trust_allocations')
const fromTrustAccounts = (c: SupabaseClient<Database>) =>
  (c as SupabaseClient<any>).from('trust_bank_accounts')
const fromMatters = (c: SupabaseClient<Database>) =>
  (c as SupabaseClient<any>).from('matters')
/* eslint-enable @typescript-eslint/no-explicit-any */

export interface TrustBalanceResult {
  /** Available trust balance for the matter in cents (BIGINT → number) */
  availableBalanceCents: number
  trustAccountId: string | null
  matterTrustBalance: number
}

/**
 * Read the available trust balance for a matter.
 *
 * Returns the balance from matters.trust_balance (maintained by trust module
 * via trigger) and the primary trust account ID.
 */
export async function getMatterTrustBalance(
  supabase: SupabaseClient<Database>,
  matterId: string,
  tenantId: string,
): Promise<ServiceResult<TrustBalanceResult>> {
  const { data: matter, error: matterErr } = await fromMatters(supabase)
    .select('id, trust_balance')
    .eq('id', matterId)
    .eq('tenant_id', tenantId)
    .single()

  if (matterErr || !matter) {
    return { success: false, error: 'Matter not found' }
  }

  // Convert trust_balance (stored as DECIMAL/numeric in matters) to cents
  const trustBalanceDollars = Number(matter.trust_balance ?? 0)
  const availableBalanceCents = Math.floor(trustBalanceDollars * 100)

  // Find primary trust account for this tenant (billing reads only)
  const { data: account } = await fromTrustAccounts(supabase)
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  return {
    success: true,
    data: {
      availableBalanceCents,
      trustAccountId: account?.id ?? null,
      matterTrustBalance: trustBalanceDollars,
    },
  }
}

export interface RequestTrustApplicationInput {
  supabase: SupabaseClient<Database>
  tenantId: string
  invoiceId: string
  matterId: string
  trustAccountId: string
  amountCents: number
  requestedByUserId: string
  notes?: string | null
}

/**
 * Create a pending trust allocation request.
 *
 * Validates that the requested amount does not exceed the available trust
 * balance, then writes an invoice_trust_allocation with status = 'pending'.
 *
 * The trust module processes the allocation asynchronously and updates the
 * status to 'confirmed' or 'failed'.
 */
export async function requestTrustApplication(
  input: RequestTrustApplicationInput,
): Promise<ServiceResult<{ allocationId: string }>> {
  const {
    supabase,
    tenantId,
    invoiceId,
    matterId,
    trustAccountId,
    amountCents,
    requestedByUserId,
    notes,
  } = input

  if (amountCents <= 0) {
    return { success: false, error: 'Trust allocation amount must be greater than zero' }
  }

  // Check available balance
  const balanceResult = await getMatterTrustBalance(supabase, matterId, tenantId)
  if (!balanceResult.success || !balanceResult.data) {
    return { success: false, error: balanceResult.error ?? 'Could not read trust balance' }
  }

  if (amountCents > balanceResult.data.availableBalanceCents) {
    const availableDollars = (balanceResult.data.availableBalanceCents / 100).toFixed(2)
    return {
      success: false,
      error: `Requested amount exceeds available trust balance of $${availableDollars}`,
    }
  }

  // Check for existing pending/confirmed allocations that would cause double-counting
  const { data: existing } = await fromAllocations(supabase)
    .select('id, amount_cents, allocation_status')
    .eq('invoice_id', invoiceId)
    .eq('tenant_id', tenantId)
    .in('allocation_status', ['pending', 'confirmed'])

  const alreadyAllocatedCents = (existing ?? []).reduce(
    (sum: number, a: any) => sum + Number(a.amount_cents),
    0,
  )

  if (alreadyAllocatedCents + amountCents > balanceResult.data.availableBalanceCents) {
    return {
      success: false,
      error: 'Total trust allocations for this invoice would exceed available balance',
    }
  }

  // Fetch matter_id from the invoice (required by InvoiceTrustAllocationInsert)
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const { data: invRow } = await (supabase as any)
    .from('invoices')
    .select('matter_id')
    .eq('id', invoiceId)
    .eq('tenant_id', tenantId)
    .single()
  /* eslint-enable @typescript-eslint/no-explicit-any */

  const payload: InvoiceTrustAllocationInsert = {
    tenant_id: tenantId,
    invoice_id: invoiceId,
    matter_id: invRow?.matter_id ?? '',
    trust_account_id: trustAccountId,
    amount_cents: amountCents,
    allocation_status: 'pending',
    requested_by: requestedByUserId,
    notes: notes ?? null,
  }

  const { data: newAlloc, error: insertErr } = await fromAllocations(supabase)
    .insert(payload)
    .select('id')
    .single()

  if (insertErr || !newAlloc) {
    return { success: false, error: insertErr?.message ?? 'Failed to create trust allocation' }
  }

  const trustDollars = (amountCents / 100).toFixed(2)
  await appendAuditEvent({
    supabase,
    tenantId,
    invoiceId,
    matterId: invRow?.matter_id ?? matterId,
    performedBy: requestedByUserId,
    eventType: 'trust_applied',
    eventDescription: `Trust allocation of $${trustDollars} requested (pending)`,
    changedFields: {
      allocation_id: { before: null, after: newAlloc.id },
      amount_cents: { before: null, after: amountCents },
      allocation_status: { before: null, after: 'pending' },
    },
  })

  return { success: true, data: { allocationId: newAlloc.id } }
}

/**
 * Cancel a pending trust allocation.
 *
 * Only pending allocations may be cancelled.  Confirmed allocations require
 * the trust module to process a reversal.
 */
export async function cancelTrustAllocation(
  supabase: SupabaseClient<Database>,
  tenantId: string,
  invoiceId: string,
  allocationId: string,
  userId: string,
): Promise<ServiceResult> {
  const { error } = await fromAllocations(supabase)
    .update({ allocation_status: 'cancelled' as TrustAllocationStatus, updated_at: new Date().toISOString() })
    .eq('id', allocationId)
    .eq('tenant_id', tenantId)
    .eq('invoice_id', invoiceId)
    .eq('allocation_status', 'pending')

  if (error) return { success: false, error: error.message }

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const { data: invForAudit } = await (supabase as any)
    .from('invoices')
    .select('matter_id')
    .eq('id', invoiceId)
    .eq('tenant_id', tenantId)
    .single()
  /* eslint-enable @typescript-eslint/no-explicit-any */

  await appendAuditEvent({
    supabase,
    tenantId,
    invoiceId,
    matterId: invForAudit?.matter_id ?? '',
    performedBy: userId,
    eventType: 'trust_cancelled',
    eventDescription: `Trust allocation cancelled`,
    changedFields: {
      allocation_id: { before: allocationId, after: allocationId },
      allocation_status: { before: 'pending', after: 'cancelled' },
    },
  })

  return { success: true }
}
