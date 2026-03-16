// ============================================================================
// Invoice State Service — status transition enforcement (Billing Module)
// ============================================================================
// Manages all invoice lifecycle transitions.  The allowed graph is:
//
//   draft → finalized → sent → viewed → partially_paid → paid
//                    └──────────────────────────────────→ overdue
//                    └──────────────────────────────────→ void
//                    └──────────────────────────────────→ written_off
//                    └──────────────────────────────────→ cancelled
//
// Rules:
//   • Only draft invoices may be finalized.
//   • Only finalized invoices may be sent (batch-send targets finalized only).
//   • viewed is client-driven only (portal token view event).
//   • void and cancelled are only allowed before payment is received.
//   • paid and written_off are terminal — no further transitions.
//   • Paid invoices are immutable (DB trigger backs this up).
// ============================================================================

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, InvoiceStatus } from '@/lib/types/database'
import { generateInvoiceNumber } from './invoice-calculation.service'
import { appendAuditEvent } from './invoice-audit.service'

export interface ServiceResult<T = void> {
  success: boolean
  data?: T
  error?: string
}

// ─── Allowed transition map ─────────────────────────────────────────────────

const ALLOWED_TRANSITIONS: Record<InvoiceStatus, InvoiceStatus[]> = {
  draft: ['finalized', 'cancelled'],
  finalized: ['sent', 'void', 'cancelled'],
  sent: ['viewed', 'partially_paid', 'paid', 'overdue', 'void', 'written_off'],
  viewed: ['partially_paid', 'paid', 'overdue', 'void', 'written_off'],
  partially_paid: ['paid', 'overdue', 'written_off'],
  paid: [],
  overdue: ['paid', 'partially_paid', 'written_off', 'void'],
  void: [],
  written_off: [],
  cancelled: [],
}

function canTransition(from: InvoiceStatus, to: InvoiceStatus): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false
}

// ─── Types ──────────────────────────────────────────────────────────────────

/* eslint-disable @typescript-eslint/no-explicit-any */
const fromInvoices = (c: SupabaseClient<Database>) =>
  (c as SupabaseClient<any>).from('invoices')
const fromLineItems = (c: SupabaseClient<Database>) =>
  (c as SupabaseClient<any>).from('invoice_line_items')
const fromPaymentPlans = (c: SupabaseClient<Database>) =>
  (c as SupabaseClient<any>).from('payment_plans')
/* eslint-enable @typescript-eslint/no-explicit-any */

export interface FinalizeInvoiceInput {
  supabase: SupabaseClient<Database>
  invoiceId: string
  tenantId: string
  userId: string
  /**
   * When true, bypasses the taxable-lines-without-tax-profile guard.
   * Must be set explicitly by the caller; defaults to false.
   * Override is recorded in the audit log.
   */
  overrideTaxCheck?: boolean
}

export interface VoidInvoiceInput {
  supabase: SupabaseClient<Database>
  invoiceId: string
  tenantId: string
  userId: string
  reason: string
}

export interface MarkViewedInput {
  supabase: SupabaseClient<Database>
  invoiceId: string
  tenantId: string
  /** Null when driven by portal token (no authenticated user) */
  userId: string | null
}

// ─── Finalize ───────────────────────────────────────────────────────────────

/**
 * Transition an invoice from draft → finalized.
 *
 * Assigns an invoice number (if not already set) and records finalized_by /
 * finalized_at.  After this point, line items cannot be added or removed.
 */
export async function finalizeInvoice(
  input: FinalizeInvoiceInput,
): Promise<ServiceResult<{ invoiceNumber: string }>> {
  const { supabase, invoiceId, tenantId, userId, overrideTaxCheck = false } = input

  // Fetch current state
  const { data: invoice, error: fetchErr } = await fromInvoices(supabase)
    .select('status, invoice_number, matter_id, tax_profile_id')
    .eq('id', invoiceId)
    .eq('tenant_id', tenantId)
    .single()

  if (fetchErr || !invoice) {
    return { success: false, error: 'Invoice not found' }
  }

  if (!canTransition(invoice.status as InvoiceStatus, 'finalized')) {
    return {
      success: false,
      error: `Cannot finalise an invoice with status "${invoice.status}"`,
    }
  }

  // ── Tax profile guard ──────────────────────────────────────────────────────
  // If any line item is taxable and the invoice has no tax profile attached,
  // block finalization unless the caller has explicitly set overrideTaxCheck.
  if (!invoice.tax_profile_id && !overrideTaxCheck) {
    const { data: taxableLines } = await fromLineItems(supabase)
      .select('id')
      .eq('invoice_id', invoiceId)
      .eq('is_taxable', true)
      .limit(1)

    if (taxableLines && taxableLines.length > 0) {
      return {
        success: false,
        error:
          'This invoice has taxable line items but no tax profile is attached. ' +
          'Attach a tax profile before finalising, or pass override_tax_check=true to finalise with zero tax.',
      }
    }
  }

  // Generate invoice number if not already set
  let invoiceNumber: string = invoice.invoice_number
  if (!invoiceNumber) {
    const year = new Date().getFullYear()
    const numResult = await generateInvoiceNumber(supabase, tenantId, year)
    if (!numResult.success || !numResult.data) {
      return { success: false, error: numResult.error ?? 'Failed to generate invoice number' }
    }
    invoiceNumber = numResult.data
  }

  const now = new Date().toISOString()

  const { error: updateErr } = await fromInvoices(supabase)
    .update({
      status: 'finalized',
      invoice_number: invoiceNumber,
      finalized_by: userId,
      finalized_at: now,
      updated_at: now,
    })
    .eq('id', invoiceId)
    .eq('tenant_id', tenantId)

  if (updateErr) {
    return { success: false, error: updateErr.message }
  }

  await appendAuditEvent({
    supabase,
    tenantId,
    invoiceId,
    matterId: invoice.matter_id,
    performedBy: userId,
    eventType: 'finalized',
    eventDescription: overrideTaxCheck
      ? `Invoice finalised with tax-check override (no tax profile attached)`
      : `Invoice finalised and assigned number ${invoiceNumber}`,
    changedFields: {
      status: { before: 'draft', after: 'finalized' },
      invoice_number: { before: null, after: invoiceNumber },
      ...(overrideTaxCheck ? { tax_check_overridden: { before: false, after: true } } : {}),
    },
  })

  return { success: true, data: { invoiceNumber } }
}

// ─── Send ───────────────────────────────────────────────────────────────────

/**
 * Transition an invoice from finalized → sent.
 *
 * Caller is responsible for the actual email delivery; this updates status
 * only.  Delivery events should be recorded in invoice_delivery_logs
 * separately.
 */
export async function markInvoiceSent(
  supabase: SupabaseClient<Database>,
  invoiceId: string,
  tenantId: string,
  userId: string,
): Promise<ServiceResult> {
  const { data: invoice, error: fetchErr } = await fromInvoices(supabase)
    .select('status, matter_id')
    .eq('id', invoiceId)
    .eq('tenant_id', tenantId)
    .single()

  if (fetchErr || !invoice) {
    return { success: false, error: 'Invoice not found' }
  }

  if (!canTransition(invoice.status as InvoiceStatus, 'sent')) {
    return {
      success: false,
      error: `Cannot mark invoice as sent from status "${invoice.status}"`,
    }
  }

  const now = new Date().toISOString()
  const { error } = await fromInvoices(supabase)
    .update({ status: 'sent', updated_at: now })
    .eq('id', invoiceId)
    .eq('tenant_id', tenantId)

  if (error) return { success: false, error: error.message }

  await appendAuditEvent({
    supabase,
    tenantId,
    invoiceId,
    matterId: invoice.matter_id,
    performedBy: userId,
    eventType: 'sent',
    eventDescription: 'Invoice sent to client',
    changedFields: { status: { before: invoice.status, after: 'sent' } },
  })

  return { success: true }
}

// ─── Mark Viewed (portal-driven) ────────────────────────────────────────────

/**
 * Transition an invoice to "viewed" when a client opens it via the portal.
 *
 * userId is null for unauthenticated portal views.
 * Only valid from: finalized, sent.
 */
export async function markInvoiceViewed(input: MarkViewedInput): Promise<ServiceResult> {
  const { supabase, invoiceId, tenantId, userId } = input

  const { data: invoice, error: fetchErr } = await fromInvoices(supabase)
    .select('status, matter_id')
    .eq('id', invoiceId)
    .eq('tenant_id', tenantId)
    .single()

  if (fetchErr || !invoice) return { success: false, error: 'Invoice not found' }

  // Viewed is only set once — idempotent if already viewed, sent, or later
  const currentStatus = invoice.status as InvoiceStatus
  if (!canTransition(currentStatus, 'viewed')) {
    // If already past 'viewed' (e.g. partially_paid), this is a no-op — not an error
    return { success: true }
  }

  const now = new Date().toISOString()
  const { error } = await fromInvoices(supabase)
    .update({ status: 'viewed', updated_at: now })
    .eq('id', invoiceId)
    .eq('tenant_id', tenantId)

  if (error) return { success: false, error: error.message }

  // performedBy may be null for unauthenticated portal views —
  // appendAuditEvent skips the insert when performedBy is null
  await appendAuditEvent({
    supabase,
    tenantId,
    invoiceId,
    matterId: invoice.matter_id,
    performedBy: userId,
    eventType: 'viewed',
    eventDescription: 'Invoice viewed via client portal',
    changedFields: { status: { before: currentStatus, after: 'viewed' } },
  })

  return { success: true }
}

// ─── Void ───────────────────────────────────────────────────────────────────

/**
 * Void an invoice.  Only allowed before any payment has been received.
 *
 * Paid invoices are rejected at the DB layer (prevent_paid_invoice_mutation
 * trigger) even if the app-layer check passes.
 */
export async function voidInvoice(input: VoidInvoiceInput): Promise<ServiceResult> {
  const { supabase, invoiceId, tenantId, userId, reason } = input

  const { data: invoice, error: fetchErr } = await fromInvoices(supabase)
    .select('status, amount_paid, matter_id')
    .eq('id', invoiceId)
    .eq('tenant_id', tenantId)
    .single()

  if (fetchErr || !invoice) return { success: false, error: 'Invoice not found' }

  const currentStatus = invoice.status as InvoiceStatus

  if (!canTransition(currentStatus, 'void')) {
    return {
      success: false,
      error: `Cannot void an invoice with status "${currentStatus}"`,
    }
  }

  if ((invoice.amount_paid ?? 0) > 0) {
    return {
      success: false,
      error: 'Cannot void an invoice with payments applied. Use a credit note or reversal.',
    }
  }

  // Block void if an active payment plan exists — cancel the plan first
  const { data: activePlan } = await fromPaymentPlans(supabase)
    .select('id')
    .eq('invoice_id', invoiceId)
    .eq('tenant_id', tenantId)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle()

  if (activePlan) {
    return {
      success: false,
      error: 'Cannot void an invoice with an active payment plan. Cancel the payment plan first.',
    }
  }

  const now = new Date().toISOString()
  const { error } = await fromInvoices(supabase)
    .update({
      status: 'void',
      voided_by: userId,
      voided_at: now,
      voided_reason: reason,
      updated_at: now,
    })
    .eq('id', invoiceId)
    .eq('tenant_id', tenantId)

  if (error) return { success: false, error: error.message }

  await appendAuditEvent({
    supabase,
    tenantId,
    invoiceId,
    matterId: invoice.matter_id,
    performedBy: userId,
    eventType: 'voided',
    eventDescription: `Invoice voided: ${reason}`,
    changedFields: { status: { before: currentStatus, after: 'void' }, reason: { before: null, after: reason } },
  })

  return { success: true }
}
