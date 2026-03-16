// ============================================================================
// Payment Plan Service — creation, approval, cancellation, instalment payment
// ============================================================================
// Manages the payment plan lifecycle on top of the existing invoice/payments
// infrastructure.  Invoice totals remain authoritative through the existing
// trg_payments_recalculate trigger — this service does NOT touch
// calculate_invoice_totals() or any invoice status transition directly.
//
// Overdue detection is query-time only:
//   status = 'pending' AND due_date < CURRENT_DATE
// No stored 'overdue' status per approved workstream scope.
// ============================================================================

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'
import { appendAuditEvent } from './invoice-audit.service'

export interface ServiceResult<T = void> {
  success: boolean
  data?: T
  error?: string
}

/* eslint-disable @typescript-eslint/no-explicit-any */
const fromPlans = (c: SupabaseClient<Database>) =>
  (c as SupabaseClient<any>).from('payment_plans')
const fromInstalments = (c: SupabaseClient<Database>) =>
  (c as SupabaseClient<any>).from('payment_plan_instalments')
const fromPayments = (c: SupabaseClient<Database>) =>
  (c as SupabaseClient<any>).from('payments')
const fromInvoices = (c: SupabaseClient<Database>) =>
  (c as SupabaseClient<any>).from('invoices')
/* eslint-enable @typescript-eslint/no-explicit-any */

// ── Types ────────────────────────────────────────────────────────────────────

export interface CreatePaymentPlanInput {
  supabase: SupabaseClient<Database>
  tenantId: string
  userId: string
  invoiceId: string
  clientContactId: string
  totalAmountCents: number
  instalmentAmountCents: number
  instalmentCount: number
  frequency: 'weekly' | 'biweekly' | 'monthly'
  startDate: string  // ISO date string YYYY-MM-DD
  notes?: string | null
}

export interface ApprovePaymentPlanInput {
  supabase: SupabaseClient<Database>
  tenantId: string
  userId: string
  planId: string
}

export interface CancelPaymentPlanInput {
  supabase: SupabaseClient<Database>
  tenantId: string
  userId: string
  planId: string
  reason?: string | null
}

export interface PayInstalmentInput {
  supabase: SupabaseClient<Database>
  tenantId: string
  userId: string
  planId: string
  instalmentId: string
  paymentMethod: string
  notes?: string | null
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function addInterval(date: Date, frequency: 'weekly' | 'biweekly' | 'monthly', count: number): Date {
  const d = new Date(date)
  if (frequency === 'weekly') {
    d.setDate(d.getDate() + 7 * count)
  } else if (frequency === 'biweekly') {
    d.setDate(d.getDate() + 14 * count)
  } else {
    d.setMonth(d.getMonth() + count)
  }
  return d
}

function toISODate(d: Date): string {
  return d.toISOString().split('T')[0]
}

// ── Create Payment Plan ───────────────────────────────────────────────────────

/**
 * Create a payment plan for an invoice and generate all instalment records.
 *
 * Validates:
 *   - Invoice is not paid, void, cancelled, written_off, or draft
 *   - Plan total matches invoice balance_due (cents)
 *   - instalmentAmountCents * instalmentCount within 1 cent of totalAmountCents
 *   - No active plan already exists for this invoice
 */
export async function createPaymentPlan(
  input: CreatePaymentPlanInput,
): Promise<ServiceResult<{ planId: string; instalmentCount: number }>> {
  const {
    supabase,
    tenantId,
    userId,
    invoiceId,
    clientContactId,
    totalAmountCents,
    instalmentAmountCents,
    instalmentCount,
    frequency,
    startDate,
    notes,
  } = input

  // ── Fetch invoice ────────────────────────────────────────────────────────
  const { data: invoice, error: fetchErr } = await fromInvoices(supabase)
    .select('status, balance_due, matter_id')
    .eq('id', invoiceId)
    .eq('tenant_id', tenantId)
    .single()

  if (fetchErr || !invoice) {
    return { success: false, error: 'Invoice not found' }
  }

  // Block on terminal or unpayable statuses
  const blocked = ['draft', 'paid', 'void', 'cancelled', 'written_off']
  if (blocked.includes(invoice.status)) {
    return {
      success: false,
      error: `Cannot create a payment plan for an invoice with status "${invoice.status}"`,
    }
  }

  // ── Validate total matches balance_due ───────────────────────────────────
  const balanceDueCents = Math.round(Number(invoice.balance_due))
  if (totalAmountCents !== balanceDueCents) {
    return {
      success: false,
      error: `Payment plan total (${totalAmountCents}¢) must equal the invoice balance due (${balanceDueCents}¢)`,
    }
  }

  // ── Validate instalment arithmetic ───────────────────────────────────────
  // Allow last instalment to absorb rounding: difference must be < 1 cent
  const impliedTotal = instalmentAmountCents * instalmentCount
  const diff = Math.abs(impliedTotal - totalAmountCents)
  if (diff > instalmentCount) {
    // More than 1 cent per instalment of variance — reject
    return {
      success: false,
      error: `Instalment amount (${instalmentAmountCents}¢ × ${instalmentCount}) does not reconcile to plan total (${totalAmountCents}¢)`,
    }
  }

  // ── Create plan record ────────────────────────────────────────────────────
  const start = new Date(startDate)
  const firstDueDate = toISODate(start)
  const lastInstalmentDueDate = toISODate(addInterval(start, frequency, instalmentCount - 1))

  const { data: plan, error: planErr } = await fromPlans(supabase)
    .insert({
      tenant_id: tenantId,
      invoice_id: invoiceId,
      matter_id: invoice.matter_id,
      client_contact_id: clientContactId,
      total_amount_cents: totalAmountCents,
      instalment_amount_cents: instalmentAmountCents,
      instalments_total: instalmentCount,
      instalments_paid: 0,
      frequency,
      start_date: firstDueDate,
      next_due_date: firstDueDate,
      status: 'active',
      created_by: userId,
      notes: notes ?? null,
    })
    .select('id')
    .single()

  if (planErr || !plan) {
    // Surface UNIQUE violation (one active plan per invoice) as a clear error
    if (planErr?.code === '23505') {
      return {
        success: false,
        error: 'An active payment plan already exists for this invoice. Cancel it before creating a new one.',
      }
    }
    return { success: false, error: planErr?.message ?? 'Failed to create payment plan' }
  }

  // ── Generate instalments ──────────────────────────────────────────────────
  const instalmentRows = []
  for (let i = 0; i < instalmentCount; i++) {
    const dueDate = toISODate(addInterval(start, frequency, i))
    // Last instalment absorbs any cent rounding
    const amount =
      i === instalmentCount - 1
        ? totalAmountCents - instalmentAmountCents * (instalmentCount - 1)
        : instalmentAmountCents

    instalmentRows.push({
      tenant_id: tenantId,
      payment_plan_id: plan.id,
      invoice_id: invoiceId,
      instalment_number: i + 1,
      due_date: dueDate,
      amount_cents: amount,
      status: 'pending',
    })
  }

  const { error: instErr } = await fromInstalments(supabase).insert(instalmentRows)
  if (instErr) {
    // Attempt to roll back the plan row on instalment failure
    await fromPlans(supabase).delete().eq('id', plan.id).eq('tenant_id', tenantId)
    return { success: false, error: `Failed to generate instalments: ${instErr.message}` }
  }

  // ── Audit ─────────────────────────────────────────────────────────────────
  await appendAuditEvent({
    supabase,
    tenantId,
    invoiceId,
    matterId: invoice.matter_id,
    performedBy: userId,
    eventType: 'payment_plan_created',
    eventDescription: `Payment plan created: ${instalmentCount} instalments of ${instalmentAmountCents}¢ ${frequency}, starting ${firstDueDate}`,
    changedFields: {
      payment_plan_id: { before: null, after: plan.id },
      total_amount_cents: { before: null, after: totalAmountCents },
      instalments_total: { before: null, after: instalmentCount },
      frequency: { before: null, after: frequency },
    },
  })

  return { success: true, data: { planId: plan.id, instalmentCount } }
}

// ── Approve Payment Plan ──────────────────────────────────────────────────────

/**
 * Approve a payment plan.  Approver must differ from creator (DB trigger enforces).
 * No instalment payment may be applied until approval is set.
 */
export async function approvePaymentPlan(
  input: ApprovePaymentPlanInput,
): Promise<ServiceResult> {
  const { supabase, tenantId, userId, planId } = input

  const { data: plan, error: fetchErr } = await fromPlans(supabase)
    .select('id, status, created_by, approved_by, invoice_id, matter_id')
    .eq('id', planId)
    .eq('tenant_id', tenantId)
    .single()

  if (fetchErr || !plan) {
    return { success: false, error: 'Payment plan not found' }
  }

  if (plan.status !== 'active') {
    return { success: false, error: `Cannot approve a payment plan with status "${plan.status}"` }
  }

  if (plan.approved_by) {
    return { success: false, error: 'Payment plan is already approved' }
  }

  // Enforce segregation at service layer (DB trigger is backup)
  if (plan.created_by === userId) {
    return {
      success: false,
      error: 'Segregation of duties: the creator of a payment plan cannot approve it',
    }
  }

  const now = new Date().toISOString()
  const { error: updateErr } = await fromPlans(supabase)
    .update({ approved_by: userId, updated_at: now })
    .eq('id', planId)
    .eq('tenant_id', tenantId)

  if (updateErr) {
    // Surface DB-level segregation violation
    if (updateErr.message?.includes('Segregation of duties')) {
      return { success: false, error: updateErr.message }
    }
    return { success: false, error: updateErr.message }
  }

  await appendAuditEvent({
    supabase,
    tenantId,
    invoiceId: plan.invoice_id,
    matterId: plan.matter_id,
    performedBy: userId,
    eventType: 'payment_plan_approved',
    eventDescription: `Payment plan approved`,
    changedFields: { approved_by: { before: null, after: userId } },
  })

  return { success: true }
}

// ── Cancel Payment Plan ───────────────────────────────────────────────────────

/**
 * Cancel an active payment plan.
 * All pending instalments are marked cancelled.
 * Payments already recorded against paid instalments are NOT reversed.
 */
export async function cancelPaymentPlan(
  input: CancelPaymentPlanInput,
): Promise<ServiceResult> {
  const { supabase, tenantId, userId, planId, reason } = input

  const { data: plan, error: fetchErr } = await fromPlans(supabase)
    .select('id, status, invoice_id, matter_id')
    .eq('id', planId)
    .eq('tenant_id', tenantId)
    .single()

  if (fetchErr || !plan) {
    return { success: false, error: 'Payment plan not found' }
  }

  if (plan.status !== 'active') {
    return { success: false, error: `Cannot cancel a payment plan with status "${plan.status}"` }
  }

  const now = new Date().toISOString()

  // Cancel all pending instalments
  const { error: instErr } = await fromInstalments(supabase)
    .update({ status: 'cancelled', updated_at: now })
    .eq('payment_plan_id', planId)
    .eq('status', 'pending')

  if (instErr) {
    return { success: false, error: `Failed to cancel instalments: ${instErr.message}` }
  }

  // Cancel the plan
  const { error: planErr } = await fromPlans(supabase)
    .update({ status: 'cancelled', updated_at: now })
    .eq('id', planId)
    .eq('tenant_id', tenantId)

  if (planErr) {
    return { success: false, error: planErr.message }
  }

  await appendAuditEvent({
    supabase,
    tenantId,
    invoiceId: plan.invoice_id,
    matterId: plan.matter_id,
    performedBy: userId,
    eventType: 'payment_plan_cancelled',
    eventDescription: reason
      ? `Payment plan cancelled: ${reason}`
      : 'Payment plan cancelled',
    changedFields: { status: { before: 'active', after: 'cancelled' } },
  })

  return { success: true }
}

// ── Pay Instalment ────────────────────────────────────────────────────────────

/**
 * Record a payment for a specific instalment.
 *
 * Guards:
 *   - Plan must be approved (approved_by IS NOT NULL)
 *   - Instalment must be pending
 *   - Instalment must belong to the specified plan and tenant
 *
 * Side effects:
 *   - Inserts a row into payments → trg_payments_recalculate fires →
 *     calculate_invoice_totals() updates invoice.amount_paid and balance_due
 *   - Marks instalment as paid
 *   - Increments plan.instalments_paid
 *   - If plan is now complete, sets plan.status = 'completed'
 *   - Updates plan.next_due_date to next pending instalment's due_date
 */
export async function payInstalment(
  input: PayInstalmentInput,
): Promise<ServiceResult<{ paymentId: string }>> {
  const { supabase, tenantId, userId, planId, instalmentId, paymentMethod, notes } = input

  // ── Fetch plan ───────────────────────────────────────────────────────────
  const { data: plan, error: planErr } = await fromPlans(supabase)
    .select('id, status, approved_by, invoice_id, matter_id, instalments_paid, instalments_total')
    .eq('id', planId)
    .eq('tenant_id', tenantId)
    .single()

  if (planErr || !plan) {
    return { success: false, error: 'Payment plan not found' }
  }

  if (plan.status !== 'active') {
    return { success: false, error: `Cannot record payment on a "${plan.status}" payment plan` }
  }

  // Flag A enforcement: plan must be approved before any payment is applied
  if (!plan.approved_by) {
    return {
      success: false,
      error: 'Payment plan must be approved before instalments can be paid. Obtain approval first.',
    }
  }

  // ── Fetch instalment ─────────────────────────────────────────────────────
  const { data: instalment, error: instErr } = await fromInstalments(supabase)
    .select('id, status, amount_cents, instalment_number, due_date')
    .eq('id', instalmentId)
    .eq('payment_plan_id', planId)
    .eq('tenant_id', tenantId)
    .single()

  if (instErr || !instalment) {
    return { success: false, error: 'Instalment not found' }
  }

  if (instalment.status !== 'pending') {
    return {
      success: false,
      error: `Instalment is already "${instalment.status}" and cannot be paid again`,
    }
  }

  // ── Fetch invoice contact for payment record ─────────────────────────────
  // contact_id is NOT NULL on payments — fetch is required
  const { data: invoiceContact, error: contactErr } = await fromInvoices(supabase)
    .select('contact_id')
    .eq('id', plan.invoice_id)
    .eq('tenant_id', tenantId)
    .single()

  if (contactErr || !invoiceContact?.contact_id) {
    return { success: false, error: 'Could not retrieve invoice contact information' }
  }

  const now = new Date().toISOString()

  // ── Insert payment row ────────────────────────────────────────────────────
  // trg_payments_recalculate fires on INSERT → calculate_invoice_totals() runs
  const { data: payment, error: payErr } = await fromPayments(supabase)
    .insert({
      tenant_id: tenantId,
      invoice_id: plan.invoice_id,
      contact_id: invoiceContact.contact_id,
      matter_id: plan.matter_id,
      amount: instalment.amount_cents,
      payment_method: paymentMethod,
      payment_source: 'direct',
      instalment_id: instalmentId,
      received_by: userId,
      notes: notes ?? null,
      status: 'completed',
    })
    .select('id')
    .single()

  if (payErr || !payment) {
    return { success: false, error: payErr?.message ?? 'Failed to record payment' }
  }

  // ── Mark instalment paid ─────────────────────────────────────────────────
  await fromInstalments(supabase)
    .update({ status: 'paid', payment_id: payment.id, paid_at: now, updated_at: now })
    .eq('id', instalmentId)

  // ── Update plan counter ───────────────────────────────────────────────────
  const newInstalmentsPaid = (plan.instalments_paid ?? 0) + 1
  const isComplete = newInstalmentsPaid >= plan.instalments_total

  // Find next pending instalment due_date
  let nextDueDate: string | null = null
  if (!isComplete) {
    const { data: nextInst } = await fromInstalments(supabase)
      .select('due_date')
      .eq('payment_plan_id', planId)
      .eq('status', 'pending')
      .order('instalment_number', { ascending: true })
      .limit(1)
      .single()
    nextDueDate = nextInst?.due_date ?? null
  }

  await fromPlans(supabase)
    .update({
      instalments_paid: newInstalmentsPaid,
      status: isComplete ? 'completed' : 'active',
      // When complete, next_due_date is irrelevant but column is NOT NULL — use today
      next_due_date: nextDueDate ?? now.split('T')[0],
      updated_at: now,
    })
    .eq('id', planId)
    .eq('tenant_id', tenantId)

  // ── Audit ─────────────────────────────────────────────────────────────────
  await appendAuditEvent({
    supabase,
    tenantId,
    invoiceId: plan.invoice_id,
    matterId: plan.matter_id,
    performedBy: userId,
    eventType: 'instalment_paid',
    eventDescription: `Instalment ${instalment.instalment_number} of ${plan.instalments_total} paid: ${instalment.amount_cents}¢ (payment ${payment.id})`,
    changedFields: {
      instalment_id: { before: null, after: instalmentId },
      payment_id: { before: null, after: payment.id },
      instalments_paid: { before: plan.instalments_paid, after: newInstalmentsPaid },
    },
  })

  if (isComplete) {
    await appendAuditEvent({
      supabase,
      tenantId,
      invoiceId: plan.invoice_id,
      matterId: plan.matter_id,
      performedBy: userId,
      eventType: 'payment_plan_completed',
      eventDescription: `Payment plan completed — all ${plan.instalments_total} instalments paid`,
      changedFields: { status: { before: 'active', after: 'completed' } },
    })
  }

  return { success: true, data: { paymentId: payment.id } }
}
