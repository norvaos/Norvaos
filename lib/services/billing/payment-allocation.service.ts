// ============================================================================
// Payment Allocation Service  -  record and void payments (Billing Module)
// ============================================================================
// Manages the payments table for billing.  The trg_payments_recalculate
// trigger fires after INSERT/UPDATE/DELETE on payments and calls
// calculate_invoice_totals(), keeping invoice financials in sync automatically.
//
// Payment sources:
//   bank_transfer | credit_card | cheque | trust | other
//
// Void rules:
//   • Payments cannot be voided if the invoice is 'paid' and the void would
//     create a negative amount_paid (DB trigger trg_invoices_sync_payment_status
//     re-evaluates status after recalculation).
//   • Trust payments should also cancel the related trust allocation via
//     trust-application.service.ts (caller responsibility  -  this service
//     handles the payments table only).
// ============================================================================

import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  Database,
  PaymentInsert,
  PaymentSource,
} from '@/lib/types/database'
import { appendAuditEvent } from './invoice-audit.service'

export interface ServiceResult<T = void> {
  success: boolean
  data?: T
  error?: string
}

/* eslint-disable @typescript-eslint/no-explicit-any */
const fromPayments = (c: SupabaseClient<Database>) =>
  (c as SupabaseClient<any>).from('payments')
const fromInvoices = (c: SupabaseClient<Database>) =>
  (c as SupabaseClient<any>).from('invoices')
/* eslint-enable @typescript-eslint/no-explicit-any */

export interface RecordPaymentInput {
  supabase: SupabaseClient<Database>
  tenantId: string
  invoiceId: string
  recordedByUserId: string
  amountCents: number
  paymentDate: string
  paymentMethod: string
  paymentSource: PaymentSource
  reference?: string | null
  notes?: string | null
  /** If this payment was funded from trust, link the trust transaction */
  trustTransactionId?: string | null
}

/**
 * Record a payment against an invoice.
 *
 * Amount must be > 0 and must not exceed outstanding balance.
 * After INSERT the trg_payments_recalculate trigger fires and updates
 * invoice totals and status automatically.
 */
export async function recordPayment(
  input: RecordPaymentInput,
): Promise<ServiceResult<{ paymentId: string }>> {
  const {
    supabase,
    tenantId,
    invoiceId,
    recordedByUserId,
    amountCents,
    paymentDate,
    paymentMethod,
    paymentSource,
    reference,
    notes,
    trustTransactionId,
  } = input

  if (amountCents <= 0) {
    return { success: false, error: 'Payment amount must be greater than zero' }
  }

  // Validate invoice state
  const { data: invoice, error: fetchErr } = await fromInvoices(supabase)
    .select('status, total_amount, amount_paid, matter_id')
    .eq('id', invoiceId)
    .eq('tenant_id', tenantId)
    .single()

  if (fetchErr || !invoice) {
    return { success: false, error: 'Invoice not found' }
  }

  const nonPayableStatuses = ['draft', 'void', 'cancelled']
  if (nonPayableStatuses.includes(invoice.status)) {
    return {
      success: false,
      error: `Cannot record payment against an invoice with status "${invoice.status}"`,
    }
  }

  const outstanding = (invoice.total_amount ?? 0) - (invoice.amount_paid ?? 0)
  if (amountCents > outstanding) {
    const outstandingDollars = (outstanding / 100).toFixed(2)
    return {
      success: false,
      error: `Payment amount exceeds outstanding balance of $${outstandingDollars}`,
    }
  }

  const payload: PaymentInsert = {
    tenant_id: tenantId,
    invoice_id: invoiceId,
    contact_id: (invoice as Record<string, unknown>).contact_id as string ?? '',
    amount: amountCents,
    created_at: paymentDate,
    payment_method: paymentMethod,
    payment_source: paymentSource,
    external_payment_id: reference ?? null,
    notes: notes ?? null,
    trust_transaction_id: trustTransactionId ?? null,
    // recorded_by is stored in the audit log, not on the payment row
  }

  const { data: newPayment, error: insertErr } = await fromPayments(supabase)
    .insert(payload)
    .select('id')
    .single()

  if (insertErr || !newPayment) {
    return { success: false, error: insertErr?.message ?? 'Failed to record payment' }
  }

  const amountDollars = (amountCents / 100).toFixed(2)
  await appendAuditEvent({
    supabase,
    tenantId,
    invoiceId,
    matterId: invoice.matter_id,
    performedBy: recordedByUserId,
    eventType: 'payment_recorded',
    eventDescription: `Payment of $${amountDollars} recorded via ${paymentMethod}`,
    changedFields: {
      payment_id: { before: null, after: newPayment.id },
      amount_cents: { before: null, after: amountCents },
      payment_source: { before: null, after: paymentSource },
    },
  })

  return { success: true, data: { paymentId: newPayment.id } }
}

export interface VoidPaymentInput {
  supabase: SupabaseClient<Database>
  tenantId: string
  invoiceId: string
  paymentId: string
  voidedByUserId: string
  voidReason: string
}

/**
 * Void a payment.
 *
 * Marks the payment voided_at / voided_by / void_reason and sets amount to 0
 * (soft-void pattern  -  the record is preserved for audit).  The
 * trg_payments_recalculate trigger fires and updates invoice totals.
 *
 * If the invoice was 'paid' before the void, the trigger will demote status
 * to partially_paid or sent as appropriate.
 */
export async function voidPayment(input: VoidPaymentInput): Promise<ServiceResult> {
  const { supabase, tenantId, invoiceId, paymentId, voidedByUserId, voidReason } = input

  // Verify payment belongs to this invoice and tenant
  const { data: payment, error: fetchErr } = await fromPayments(supabase)
    .select('id, amount, voided_at')
    .eq('id', paymentId)
    .eq('invoice_id', invoiceId)
    .eq('tenant_id', tenantId)
    .single()

  if (fetchErr || !payment) {
    return { success: false, error: 'Payment not found' }
  }

  if (payment.voided_at) {
    return { success: false, error: 'Payment is already voided' }
  }

  // Fetch matter_id for audit log (required NOT NULL)
  const { data: inv } = await fromInvoices(supabase)
    .select('matter_id')
    .eq('id', invoiceId)
    .eq('tenant_id', tenantId)
    .single()

  const now = new Date().toISOString()
  const originalAmount = payment.amount

  const { error: updateErr } = await fromPayments(supabase)
    .update({
      amount: 0,
      voided_at: now,
      voided_by: voidedByUserId,
      void_reason: voidReason,
    })
    .eq('id', paymentId)
    .eq('tenant_id', tenantId)

  if (updateErr) return { success: false, error: updateErr.message }

  const originalDollars = (originalAmount / 100).toFixed(2)
  await appendAuditEvent({
    supabase,
    tenantId,
    invoiceId,
    matterId: inv?.matter_id ?? '',
    performedBy: voidedByUserId,
    eventType: 'payment_voided',
    eventDescription: `Payment of $${originalDollars} voided: ${voidReason}`,
    changedFields: {
      payment_id: { before: paymentId, after: null },
      original_amount_cents: { before: originalAmount, after: 0 },
      void_reason: { before: null, after: voidReason },
    },
  })

  return { success: true }
}
