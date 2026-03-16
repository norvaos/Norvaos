import { createAdminClient } from '@/lib/supabase/admin'
import type { AuthContext } from '@/lib/services/auth'

// ── Types ────────────────────────────────────────────────────────────────────

/** Standard service return envelope. */
export interface ServiceResult<T> {
  success: boolean
  data?: T
  error?: string
}

export interface CollectionActionInput {
  invoice_id: string
  matter_id?: string
  action_type: string
  notes?: string
  next_follow_up_date?: string
}

export interface CollectionAction {
  id: string
  invoice_id: string
  matter_id: string | null
  action_type: string
  notes: string | null
  next_follow_up_date: string | null
  performed_by: string
  performed_at: string
}

export interface PaymentPlanInput {
  invoice_id: string
  matter_id?: string
  client_contact_id: string
  total_amount_cents: number
  instalment_amount_cents: number
  frequency: 'weekly' | 'biweekly' | 'monthly'
  start_date: string
  instalments_total: number
  notes?: string
}

export interface PaymentPlan {
  id: string
  invoice_id: string
  matter_id: string | null
  client_contact_id: string
  total_amount_cents: number
  instalment_amount_cents: number
  frequency: string
  start_date: string
  next_due_date: string
  instalments_total: number
  instalments_paid: number
  status: string
  created_by: string
  approved_by: string | null
  notes: string | null
  created_at: string
}

export interface PaymentPlanFilters {
  invoice_id?: string
  status?: string
}

export interface ClientStatementMatter {
  title: string
  invoices: {
    id: string
    invoice_number: string
    total_cents: number
    amount_paid_cents: number
    balance_due_cents: number
    status: string
    invoice_date: string
  }[]
  payments: {
    id: string
    amount_cents: number
    payment_date: string
    method: string | null
  }[]
  trust_balance_cents: number
  outstanding_cents: number
}

export interface ClientStatementData {
  contact: {
    name: string
    email: string | null
  }
  matters: ClientStatementMatter[]
  totals: {
    total_billed_cents: number
    total_paid_cents: number
    total_outstanding_cents: number
    total_trust_cents: number
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Compute the next due date based on a start date and frequency.
 */
function computeNextDueDate(fromDate: string, frequency: 'weekly' | 'biweekly' | 'monthly'): string {
  const d = new Date(fromDate)
  switch (frequency) {
    case 'weekly':
      d.setDate(d.getDate() + 7)
      break
    case 'biweekly':
      d.setDate(d.getDate() + 14)
      break
    case 'monthly':
      d.setMonth(d.getMonth() + 1)
      break
  }
  return d.toISOString().split('T')[0]
}

// ── Service Functions ────────────────────────────────────────────────────────

/**
 * Log a collection action against an invoice.
 *
 * Uses the admin client to bypass RLS for the insert.
 */
export async function logCollectionAction(
  auth: AuthContext,
  input: CollectionActionInput,
): Promise<ServiceResult<{ id: string }>> {
  try {
    const admin = createAdminClient()

    const { data, error } = await (admin as any)
      .from('collection_actions')
      .insert({
        tenant_id: auth.tenantId,
        invoice_id: input.invoice_id,
        matter_id: input.matter_id ?? null,
        action_type: input.action_type,
        notes: input.notes ?? null,
        next_follow_up_date: input.next_follow_up_date ?? null,
        performed_by: auth.userId,
        performed_at: new Date().toISOString(),
      })
      .select('id')
      .single()

    if (error) {
      return { success: false, error: `Failed to log collection action: ${error.message}` }
    }

    return { success: true, data: { id: data.id } }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error in logCollectionAction'
    return { success: false, error: message }
  }
}

/**
 * List collection actions for a given invoice, most recent first.
 */
export async function getCollectionActions(
  auth: AuthContext,
  invoiceId: string,
): Promise<ServiceResult<CollectionAction[]>> {
  try {
    const client = auth.supabase

    const { data, error } = await (client as any)
      .from('collection_actions')
      .select('id, invoice_id, matter_id, action_type, notes, next_follow_up_date, performed_by, performed_at')
      .eq('tenant_id', auth.tenantId)
      .eq('invoice_id', invoiceId)
      .order('performed_at', { ascending: false })

    if (error) {
      return { success: false, error: `Failed to fetch collection actions: ${error.message}` }
    }

    return { success: true, data: data ?? [] }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error in getCollectionActions'
    return { success: false, error: message }
  }
}

/**
 * Create a payment plan for an invoice.
 *
 * Also logs a collection action of type 'payment_plan_offered'.
 */
export async function createPaymentPlan(
  auth: AuthContext,
  input: PaymentPlanInput,
): Promise<ServiceResult<{ id: string }>> {
  try {
    const admin = createAdminClient()
    const nextDueDate = computeNextDueDate(input.start_date, input.frequency)

    const { data, error } = await (admin as any)
      .from('payment_plans')
      .insert({
        tenant_id: auth.tenantId,
        invoice_id: input.invoice_id,
        matter_id: input.matter_id ?? null,
        client_contact_id: input.client_contact_id,
        total_amount_cents: input.total_amount_cents,
        instalment_amount_cents: input.instalment_amount_cents,
        frequency: input.frequency,
        start_date: input.start_date,
        next_due_date: nextDueDate,
        instalments_total: input.instalments_total,
        instalments_paid: 0,
        status: 'active',
        created_by: auth.userId,
        approved_by: null,
        notes: input.notes ?? null,
      })
      .select('id')
      .single()

    if (error) {
      return { success: false, error: `Failed to create payment plan: ${error.message}` }
    }

    // Log a collection action for the payment plan offer
    await logCollectionAction(auth, {
      invoice_id: input.invoice_id,
      matter_id: input.matter_id,
      action_type: 'payment_plan_offered',
      notes: `Payment plan created: ${input.instalments_total} instalments of ${input.instalment_amount_cents} cents, ${input.frequency}`,
    })

    return { success: true, data: { id: data.id } }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error in createPaymentPlan'
    return { success: false, error: message }
  }
}

/**
 * Approve a payment plan.
 *
 * Enforces segregation of duties: the approver must not be the creator.
 */
export async function approvePaymentPlan(
  auth: AuthContext,
  planId: string,
): Promise<ServiceResult<{ approved: boolean }>> {
  try {
    const client = auth.supabase

    // Fetch the plan to validate segregation of duties
    const { data: plan, error: fetchError } = await (client as any)
      .from('payment_plans')
      .select('id, created_by, status, tenant_id')
      .eq('id', planId)
      .eq('tenant_id', auth.tenantId)
      .single()

    if (fetchError || !plan) {
      return { success: false, error: 'Payment plan not found or does not belong to this tenant' }
    }

    // Segregation of duties: approver cannot be the creator
    if (plan.created_by === auth.userId) {
      return {
        success: false,
        error: 'Segregation of duties violation: the creator of a payment plan cannot also approve it',
      }
    }

    // Update the plan with the approver
    const admin = createAdminClient()
    const { error: updateError } = await (admin as any)
      .from('payment_plans')
      .update({ approved_by: auth.userId })
      .eq('id', planId)
      .eq('tenant_id', auth.tenantId)

    if (updateError) {
      return { success: false, error: `Failed to approve payment plan: ${updateError.message}` }
    }

    return { success: true, data: { approved: true } }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error in approvePaymentPlan'
    return { success: false, error: message }
  }
}

/**
 * Record an instalment payment against a payment plan.
 *
 * Increments instalments_paid, computes the next due date based on frequency,
 * and marks the plan as completed when all instalments are paid.
 */
export async function recordInstalmentPayment(
  auth: AuthContext,
  planId: string,
): Promise<ServiceResult<{ instalments_paid: number; status: string; next_due_date: string | null }>> {
  try {
    const client = auth.supabase

    // Fetch current plan state
    const { data: plan, error: fetchError } = await (client as any)
      .from('payment_plans')
      .select('id, instalments_paid, instalments_total, frequency, next_due_date, status, tenant_id')
      .eq('id', planId)
      .eq('tenant_id', auth.tenantId)
      .single()

    if (fetchError || !plan) {
      return { success: false, error: 'Payment plan not found or does not belong to this tenant' }
    }

    if (plan.status === 'completed') {
      return { success: false, error: 'Payment plan is already completed' }
    }

    const newPaid = (plan.instalments_paid ?? 0) + 1
    const isComplete = newPaid >= plan.instalments_total
    const newStatus = isComplete ? 'completed' : plan.status
    const newNextDue = isComplete
      ? null
      : computeNextDueDate(plan.next_due_date, plan.frequency as 'weekly' | 'biweekly' | 'monthly')

    const admin = createAdminClient()
    const { error: updateError } = await (admin as any)
      .from('payment_plans')
      .update({
        instalments_paid: newPaid,
        status: newStatus,
        next_due_date: newNextDue,
      })
      .eq('id', planId)
      .eq('tenant_id', auth.tenantId)

    if (updateError) {
      return { success: false, error: `Failed to record instalment: ${updateError.message}` }
    }

    return {
      success: true,
      data: {
        instalments_paid: newPaid,
        status: newStatus,
        next_due_date: newNextDue,
      },
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error in recordInstalmentPayment'
    return { success: false, error: message }
  }
}

/**
 * List payment plans with optional filters, scoped to the tenant.
 */
export async function getPaymentPlans(
  auth: AuthContext,
  filters: PaymentPlanFilters = {},
): Promise<ServiceResult<PaymentPlan[]>> {
  try {
    const client = auth.supabase

    let query = (client as any)
      .from('payment_plans')
      .select('*')
      .eq('tenant_id', auth.tenantId)
      .order('created_at', { ascending: false })

    if (filters.invoice_id) {
      query = query.eq('invoice_id', filters.invoice_id)
    }
    if (filters.status) {
      query = query.eq('status', filters.status)
    }

    const { data, error } = await query

    if (error) {
      return { success: false, error: `Failed to fetch payment plans: ${error.message}` }
    }

    return { success: true, data: data ?? [] }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error in getPaymentPlans'
    return { success: false, error: message }
  }
}

/**
 * Request a write-off for an invoice.
 *
 * Logs a collection action of type 'write_off_requested'. A partner must
 * subsequently approve or reject the request.
 */
export async function requestWriteOff(
  auth: AuthContext,
  invoiceId: string,
  amount_cents: number,
  reason: string,
): Promise<ServiceResult<{ action_id: string }>> {
  try {
    const result = await logCollectionAction(auth, {
      invoice_id: invoiceId,
      action_type: 'write_off_requested',
      notes: `Write-off requested: ${amount_cents} cents. Reason: ${reason}`,
    })

    if (!result.success) {
      return { success: false, error: result.error }
    }

    return { success: true, data: { action_id: result.data!.id } }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error in requestWriteOff'
    return { success: false, error: message }
  }
}

/**
 * Approve a write-off request.
 *
 * Validates the action is a write_off_requested and that the approver
 * is not the requester (partner approval required).
 */
export async function approveWriteOff(
  auth: AuthContext,
  actionId: string,
): Promise<ServiceResult<{ action_id: string }>> {
  try {
    const client = auth.supabase

    // Fetch the original write-off request action
    const { data: action, error: fetchError } = await (client as any)
      .from('collection_actions')
      .select('id, invoice_id, matter_id, action_type, performed_by, tenant_id')
      .eq('id', actionId)
      .eq('tenant_id', auth.tenantId)
      .single()

    if (fetchError || !action) {
      return { success: false, error: 'Collection action not found or does not belong to this tenant' }
    }

    if (action.action_type !== 'write_off_requested') {
      return { success: false, error: `Action is of type '${action.action_type}', expected 'write_off_requested'` }
    }

    // Segregation of duties: approver cannot be the requester
    if (action.performed_by === auth.userId) {
      return {
        success: false,
        error: 'Segregation of duties violation: the requester of a write-off cannot also approve it',
      }
    }

    // Log the approval
    const result = await logCollectionAction(auth, {
      invoice_id: action.invoice_id,
      matter_id: action.matter_id ?? undefined,
      action_type: 'write_off_approved',
      notes: `Write-off approved. Original request: ${actionId}`,
    })

    if (!result.success) {
      return { success: false, error: result.error }
    }

    return { success: true, data: { action_id: result.data!.id } }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error in approveWriteOff'
    return { success: false, error: message }
  }
}

/**
 * Reject a write-off request.
 *
 * Validates the action is a write_off_requested and logs a rejection.
 */
export async function rejectWriteOff(
  auth: AuthContext,
  actionId: string,
  reason: string,
): Promise<ServiceResult<{ action_id: string }>> {
  try {
    const client = auth.supabase

    // Fetch the original write-off request action
    const { data: action, error: fetchError } = await (client as any)
      .from('collection_actions')
      .select('id, invoice_id, matter_id, action_type, tenant_id')
      .eq('id', actionId)
      .eq('tenant_id', auth.tenantId)
      .single()

    if (fetchError || !action) {
      return { success: false, error: 'Collection action not found or does not belong to this tenant' }
    }

    if (action.action_type !== 'write_off_requested') {
      return { success: false, error: `Action is of type '${action.action_type}', expected 'write_off_requested'` }
    }

    // Log the rejection
    const result = await logCollectionAction(auth, {
      invoice_id: action.invoice_id,
      matter_id: action.matter_id ?? undefined,
      action_type: 'write_off_rejected',
      notes: `Write-off rejected. Original request: ${actionId}. Reason: ${reason}`,
    })

    if (!result.success) {
      return { success: false, error: result.error }
    }

    return { success: true, data: { action_id: result.data!.id } }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error in rejectWriteOff'
    return { success: false, error: message }
  }
}

/**
 * Get a consolidated client statement for a contact.
 *
 * Returns all matters for the contact with their invoices, payments,
 * trust balance, and outstanding amounts.
 */
export async function getClientStatement(
  auth: AuthContext,
  contactId: string,
  dateRange?: { start_date: string; end_date: string },
): Promise<ServiceResult<ClientStatementData>> {
  try {
    const client = auth.supabase

    // Fetch contact details
    const { data: contact, error: contactError } = await client
      .from('contacts')
      .select('id, first_name, last_name, email_primary')
      .eq('id', contactId)
      .eq('tenant_id', auth.tenantId)
      .single()

    if (contactError || !contact) {
      return { success: false, error: 'Contact not found or does not belong to this tenant' }
    }

    // Fetch matters for this contact via matter_contacts junction table
    const { data: matterLinks, error: linksError } = await (client as any)
      .from('matter_contacts')
      .select('matter_id')
      .eq('contact_id', contactId)

    if (linksError) {
      return { success: false, error: `Failed to fetch matter links: ${linksError.message}` }
    }

    const linkedMatterIds = (matterLinks ?? []).map((ml: { matter_id: string }) => ml.matter_id)

    const { data: matters, error: mattersError } = linkedMatterIds.length > 0
      ? await client
          .from('matters')
          .select('id, title')
          .eq('tenant_id', auth.tenantId)
          .in('id', linkedMatterIds)
      : { data: [] as { id: string; title: string }[], error: null }

    if (mattersError) {
      return { success: false, error: `Failed to fetch matters: ${mattersError.message}` }
    }

    if (!matters || matters.length === 0) {
      return {
        success: true,
        data: {
          contact: {
            name: `${contact.first_name ?? ''} ${contact.last_name ?? ''}`.trim(),
            email: contact.email_primary ?? null,
          },
          matters: [],
          totals: { total_billed_cents: 0, total_paid_cents: 0, total_outstanding_cents: 0, total_trust_cents: 0 },
        },
      }
    }

    const matterIds = matters.map((m) => m.id)

    // Fetch invoices and payments for these matters
    let invoicesQuery = client
      .from('invoices')
      .select('id, invoice_number, total, amount_paid, balance_due, status, issue_date, matter_id')
      .eq('tenant_id', auth.tenantId)
      .in('matter_id', matterIds)

    if (dateRange) {
      invoicesQuery = invoicesQuery.gte('issue_date', dateRange.start_date).lte('issue_date', dateRange.end_date)
    }

    let paymentsQuery = client
      .from('payments')
      .select('id, amount, created_at, payment_method, matter_id')
      .eq('tenant_id', auth.tenantId)
      .in('matter_id', matterIds)

    if (dateRange) {
      paymentsQuery = paymentsQuery.gte('created_at', dateRange.start_date).lte('created_at', dateRange.end_date)
    }

    // Fetch trust balances per matter (latest transaction)
    const [invoicesResult, paymentsResult, trustTxnResult] = await Promise.all([
      invoicesQuery,
      paymentsQuery,
      (client as any)
        .from('trust_transactions')
        .select('matter_id, running_balance_cents, created_at')
        .eq('tenant_id', auth.tenantId)
        .in('matter_id', matterIds)
        .order('created_at', { ascending: false }),
    ])

    if (invoicesResult.error) {
      return { success: false, error: `Failed to fetch invoices: ${invoicesResult.error.message}` }
    }
    if (paymentsResult.error) {
      return { success: false, error: `Failed to fetch payments: ${paymentsResult.error.message}` }
    }

    // Group invoices by matter
    const invoicesByMatter = new Map<string, any[]>()
    for (const inv of invoicesResult.data ?? []) {
      const matterId = (inv as any).matter_id
      if (!invoicesByMatter.has(matterId)) invoicesByMatter.set(matterId, [])
      invoicesByMatter.get(matterId)!.push(inv)
    }

    // Group payments by matter
    const paymentsByMatter = new Map<string, any[]>()
    for (const pmt of paymentsResult.data ?? []) {
      const matterId = (pmt as any).matter_id
      if (!paymentsByMatter.has(matterId)) paymentsByMatter.set(matterId, [])
      paymentsByMatter.get(matterId)!.push(pmt)
    }

    // Latest trust balance per matter
    const trustByMatter = new Map<string, number>()
    for (const txn of trustTxnResult.data ?? []) {
      if (!trustByMatter.has(txn.matter_id)) {
        trustByMatter.set(txn.matter_id, Number(txn.running_balance_cents))
      }
    }

    // Build statement matters
    let totalBilled = 0
    let totalPaid = 0
    let totalOutstanding = 0
    let totalTrust = 0

    const statementMatters: ClientStatementMatter[] = matters.map((m) => {
      const mInvoices = (invoicesByMatter.get(m.id) ?? []).map((inv: any) => {
        const totalCents = Math.round((Number(inv.total_amount) || 0) * 100)
        const paidCents = Math.round((Number(inv.amount_paid) || 0) * 100)
        const balanceCents = Math.round((Number(inv.balance_due) || 0) * 100)
        totalBilled += totalCents
        totalPaid += paidCents
        totalOutstanding += balanceCents
        return {
          id: inv.id,
          invoice_number: inv.invoice_number,
          total_cents: totalCents,
          amount_paid_cents: paidCents,
          balance_due_cents: balanceCents,
          status: inv.status,
          invoice_date: inv.issue_date,
        }
      })

      const mPayments = (paymentsByMatter.get(m.id) ?? []).map((pmt: any) => ({
        id: pmt.id,
        amount_cents: Math.round((Number(pmt.amount) || 0) * 100),
        payment_date: pmt.created_at,
        method: pmt.payment_method ?? null,
      }))

      const trustBalance = trustByMatter.get(m.id) ?? 0
      totalTrust += trustBalance

      const matterOutstanding = mInvoices.reduce((s: number, i: any) => s + i.balance_due_cents, 0)

      return {
        title: m.title,
        invoices: mInvoices,
        payments: mPayments,
        trust_balance_cents: trustBalance,
        outstanding_cents: matterOutstanding,
      }
    })

    return {
      success: true,
      data: {
        contact: {
          name: `${contact.first_name ?? ''} ${contact.last_name ?? ''}`.trim(),
          email: contact.email_primary ?? null,
        },
        matters: statementMatters,
        totals: {
          total_billed_cents: totalBilled,
          total_paid_cents: totalPaid,
          total_outstanding_cents: totalOutstanding,
          total_trust_cents: totalTrust,
        },
      },
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error in getClientStatement'
    return { success: false, error: message }
  }
}
