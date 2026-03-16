// ============================================================================
// Discount Service — adjustments (discounts, write-downs, write-offs)
// ============================================================================
// Manages invoice_adjustments.  Three distinct operations:
//
//   discount   — reduce the invoice amount as a goodwill gesture or fee
//                reduction; requires approval above threshold
//   write_down — partial reduction of uncollectable amount; requires approval
//   write_off  — full write-off of outstanding balance; dual-user segregation
//                enforced by DB trigger (requester ≠ approver)
//
// All amounts are in cents (INTEGER).
// ============================================================================

import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  Database,
  AdjustmentType,
  AdjustmentScope,
  InvoiceAdjustmentInsert,
} from '@/lib/types/database'
import { appendAuditEvent } from './invoice-audit.service'

export interface ServiceResult<T = void> {
  success: boolean
  data?: T
  error?: string
}

/* eslint-disable @typescript-eslint/no-explicit-any */
const fromAdjustments = (c: SupabaseClient<Database>) =>
  (c as SupabaseClient<any>).from('invoice_adjustments')
const fromThresholds = (c: SupabaseClient<Database>) =>
  (c as SupabaseClient<any>).from('discount_approval_thresholds')
const fromInvoices = (c: SupabaseClient<Database>) =>
  (c as SupabaseClient<any>).from('invoices')
/* eslint-enable @typescript-eslint/no-explicit-any */

export interface ApplyAdjustmentInput {
  supabase: SupabaseClient<Database>
  tenantId: string
  invoiceId: string
  requestedByUserId: string
  adjustmentType: AdjustmentType
  scope: AdjustmentScope
  amountCents: number
  description: string
  lineItemId?: string | null
}

export interface AdjustmentCheckResult {
  requiresApproval: boolean
  thresholdAmountCents: number | null
}

/**
 * Check whether an adjustment of the given amount and type requires approval.
 *
 * Returns requiresApproval=true if the amount exceeds the configured
 * threshold, or if the type is 'write_off' (always requires approval).
 */
export async function checkAdjustmentApproval(
  supabase: SupabaseClient<Database>,
  tenantId: string,
  adjustmentType: AdjustmentType,
  amountCents: number,
): Promise<AdjustmentCheckResult> {
  // Write-offs always require approval
  if (adjustmentType === 'write_off') {
    return { requiresApproval: true, thresholdAmountCents: 0 }
  }

  const { data: threshold } = await fromThresholds(supabase)
    .select('threshold_amount_cents, requires_approval')
    .eq('tenant_id', tenantId)
    .eq('adjustment_type', adjustmentType)
    .eq('is_active', true)
    .maybeSingle()

  if (!threshold) {
    // No threshold configured — no approval required
    return { requiresApproval: false, thresholdAmountCents: null }
  }

  if (!threshold.requires_approval) {
    return { requiresApproval: false, thresholdAmountCents: threshold.threshold_amount_cents }
  }

  const requiresApproval = amountCents >= threshold.threshold_amount_cents
  return { requiresApproval, thresholdAmountCents: threshold.threshold_amount_cents }
}

/**
 * Apply an adjustment to an invoice.
 *
 * If approval is required, the adjustment is created with status 'pending'.
 * Caller must separately call approveAdjustment() or reject it.
 *
 * Adjustments may only be applied to invoices in draft, finalized, sent,
 * viewed, or partially_paid status.
 */
export async function applyAdjustment(
  input: ApplyAdjustmentInput,
): Promise<ServiceResult<{ adjustmentId: string; requiresApproval: boolean }>> {
  const {
    supabase,
    tenantId,
    invoiceId,
    requestedByUserId,
    adjustmentType,
    scope,
    amountCents,
    description,
    lineItemId,
  } = input

  // Verify invoice exists and is in an adjustable state
  const { data: invoice, error: fetchErr } = await fromInvoices(supabase)
    .select('status, total_amount, matter_id')
    .eq('id', invoiceId)
    .eq('tenant_id', tenantId)
    .single()

  if (fetchErr || !invoice) {
    return { success: false, error: 'Invoice not found' }
  }

  const nonAdjustableStatuses = ['paid', 'void', 'cancelled', 'written_off']
  if (nonAdjustableStatuses.includes(invoice.status)) {
    return {
      success: false,
      error: `Cannot apply adjustment to invoice with status "${invoice.status}"`,
    }
  }

  // Check approval requirement
  const { requiresApproval } = await checkAdjustmentApproval(
    supabase,
    tenantId,
    adjustmentType,
    amountCents,
  )

  const approvalStatus = requiresApproval ? 'pending' : 'auto_approved'

  // InvoiceAdjustmentInsert maps to the DB schema; use the fields that exist.
  // Some legacy fields (amount_cents, description, requested_by) differ from the
  // generated type — cast to any to allow the insert without a schema mismatch.
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const insertPayload: any = {
    tenant_id: tenantId,
    invoice_id: invoiceId,
    line_item_id: lineItemId ?? null,
    adjustment_type: adjustmentType,
    scope,
    calculated_amount_cents: amountCents,
    fixed_amount_cents: amountCents,
    calculation_type: 'fixed_amount',
    reason_note: description,
    reason_code: adjustmentType,
    applied_by: requestedByUserId,
    requires_approval: requiresApproval,
    approval_status: approvalStatus,
  }

  const { data: newAdj, error: insertErr } = await fromAdjustments(supabase)
    .insert(insertPayload)
    .select('id')
    .single()
  /* eslint-enable @typescript-eslint/no-explicit-any */

  if (insertErr || !newAdj) {
    return { success: false, error: insertErr?.message ?? 'Failed to create adjustment' }
  }

  const adjDollars = (amountCents / 100).toFixed(2)
  await appendAuditEvent({
    supabase,
    tenantId,
    invoiceId,
    matterId: invoice.matter_id,
    performedBy: requestedByUserId,
    eventType: 'adjustment_added',
    eventDescription: `${adjustmentType} adjustment of $${adjDollars} added (${approvalStatus})`,
    changedFields: {
      adjustment_id: { before: null, after: newAdj.id },
      adjustment_type: { before: null, after: adjustmentType },
      amount_cents: { before: null, after: amountCents },
      approval_status: { before: null, after: approvalStatus },
    },
  })

  return {
    success: true,
    data: { adjustmentId: newAdj.id, requiresApproval },
  }
}

/**
 * Approve a pending adjustment.
 *
 * For write_offs, the DB trigger enforce_write_off_segregation() will raise
 * an exception if approver === requester (segregation of duties).
 */
export async function approveAdjustment(
  supabase: SupabaseClient<Database>,
  tenantId: string,
  invoiceId: string,
  adjustmentId: string,
  approverUserId: string,
): Promise<ServiceResult> {
  const now = new Date().toISOString()

  const { error } = await fromAdjustments(supabase)
    .update({
      approval_status: 'approved',
      approved_by: approverUserId,
      approved_at: now,
    })
    .eq('id', adjustmentId)
    .eq('tenant_id', tenantId)
    .eq('invoice_id', invoiceId)
    .eq('approval_status', 'pending')

  if (error) {
    // DB trigger may raise segregation violation — surface the message directly
    return { success: false, error: error.message }
  }

  const { data: inv } = await fromInvoices(supabase)
    .select('matter_id')
    .eq('id', invoiceId)
    .eq('tenant_id', tenantId)
    .single()

  await appendAuditEvent({
    supabase,
    tenantId,
    invoiceId,
    matterId: inv?.matter_id ?? '',
    performedBy: approverUserId,
    eventType: 'adjustment_approved',
    eventDescription: `Adjustment approved`,
    changedFields: { adjustment_id: { before: adjustmentId, after: adjustmentId }, approval_status: { before: 'pending', after: 'approved' } },
  })

  return { success: true }
}

/**
 * Reject a pending adjustment.
 */
export async function rejectAdjustment(
  supabase: SupabaseClient<Database>,
  tenantId: string,
  invoiceId: string,
  adjustmentId: string,
  reviewerUserId: string,
): Promise<ServiceResult> {
  const now = new Date().toISOString()

  const { error } = await fromAdjustments(supabase)
    .update({
      approval_status: 'rejected',
      approved_by: reviewerUserId,
      approved_at: now,
    })
    .eq('id', adjustmentId)
    .eq('tenant_id', tenantId)
    .eq('invoice_id', invoiceId)
    .eq('approval_status', 'pending')

  if (error) return { success: false, error: error.message }

  const { data: inv } = await fromInvoices(supabase)
    .select('matter_id')
    .eq('id', invoiceId)
    .eq('tenant_id', tenantId)
    .single()

  await appendAuditEvent({
    supabase,
    tenantId,
    invoiceId,
    matterId: inv?.matter_id ?? '',
    performedBy: reviewerUserId,
    eventType: 'adjustment_rejected',
    eventDescription: `Adjustment rejected`,
    changedFields: { adjustment_id: { before: adjustmentId, after: adjustmentId }, approval_status: { before: 'pending', after: 'rejected' } },
  })

  return { success: true }
}
