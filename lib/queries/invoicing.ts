'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { Database, PaymentPlanRow, PaymentPlanInstalmentRow } from '@/lib/types/database'
import { toast } from 'sonner'

type TimeEntry = Database['public']['Tables']['time_entries']['Row']
type TimeEntryInsert = Database['public']['Tables']['time_entries']['Insert']
type Invoice = Database['public']['Tables']['invoices']['Row']
type InvoiceInsert = Database['public']['Tables']['invoices']['Insert']
type InvoiceLineItem = Database['public']['Tables']['invoice_line_items']['Row']
type InvoiceLineItemInsert = Database['public']['Tables']['invoice_line_items']['Insert']
type Payment = Database['public']['Tables']['payments']['Row']
type PaymentInsert = Database['public']['Tables']['payments']['Insert']

export type { TimeEntry, Invoice, InvoiceLineItem, Payment }

// ── Query Key Factory ────────────────────────────────────────────────────────

export const invoicingKeys = {
  all: ['invoicing'] as const,
  timeEntries: (tid: string, mid?: string) => [...invoicingKeys.all, 'time-entries', tid, mid] as const,
  unbilledTime: (tid: string, mid: string) => [...invoicingKeys.all, 'unbilled-time', tid, mid] as const,
  invoices: (tid: string, mid?: string) => [...invoicingKeys.all, 'invoices', tid, mid] as const,
  invoiceDetail: (id: string) => [...invoicingKeys.all, 'invoice-detail', id] as const,
  billingStats: (tid: string) => [...invoicingKeys.all, 'billing-stats', tid] as const,
  retainerSummary: (mid: string) => [...invoicingKeys.all, 'retainer-summary', mid] as const,
}

// ── Retainer Summary Types ────────────────────────────────────────────────────

export interface RetainerLineItem {
  description: string
  quantity: number
  unitPrice: number
  amount: number
}

export interface RetainerFeeItem {
  description: string
  amount: number
}

export interface MatterRetainerSummary {
  id: string
  leadId: string
  status: string
  paymentStatus: string
  billingType: string
  lineItems: RetainerLineItem[]
  governmentFees: RetainerFeeItem[]
  disbursements: RetainerFeeItem[]
  hstApplicable: boolean
  subtotalCents: number
  taxAmountCents: number
  totalAmountCents: number
  paymentAmount: number
  balanceCents: number
  paymentMethod: string | null
  paymentReceivedAt: string | null
  paymentTerms: string | null
  paymentPlan: unknown
  signedAt: string | null
}

// ── Time Entries ─────────────────────────────────────────────────────────────

export function useTimeEntries(tenantId: string, matterId?: string) {
  return useQuery({
    queryKey: invoicingKeys.timeEntries(tenantId, matterId),
    queryFn: async () => {
      const supabase = createClient()
      let query = supabase
        .from('time_entries')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('entry_date', { ascending: false })
        .limit(200)

      if (matterId) query = query.eq('matter_id', matterId)

      const { data, error } = await query
      if (error) throw error
      return data as TimeEntry[]
    },
    enabled: !!tenantId,
  })
}

export function useUnbilledTimeEntries(tenantId: string, matterId: string) {
  return useQuery({
    queryKey: invoicingKeys.unbilledTime(tenantId, matterId),
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('time_entries')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('matter_id', matterId)
        .eq('is_billable', true)
        .eq('is_billed', false)
        .order('entry_date', { ascending: true })

      if (error) throw error
      return data as TimeEntry[]
    },
    enabled: !!tenantId && !!matterId,
  })
}

export function useCreateTimeEntry() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: TimeEntryInsert) => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('time_entries')
        .insert(input)
        .select()
        .single()
      if (error) throw error
      return data as TimeEntry
    },
    onSuccess: () => {
      // Targeted invalidation — only bust time-entry and billing-stats caches
      queryClient.invalidateQueries({ queryKey: ['invoicing', 'time-entries'] })
      queryClient.invalidateQueries({ queryKey: ['invoicing', 'unbilled-time'] })
      queryClient.invalidateQueries({ queryKey: ['invoicing', 'billing-stats'] })
      toast.success('Time entry logged')
    },
    onError: (err: Error) => toast.error(`Failed to log time: ${err.message}`),
  })
}

export function useUpdateTimeEntry() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string } & Partial<TimeEntryInsert>) => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('time_entries')
        .update(updates)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data as TimeEntry
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoicing', 'time-entries'] })
      queryClient.invalidateQueries({ queryKey: ['invoicing', 'unbilled-time'] })
      queryClient.invalidateQueries({ queryKey: ['invoicing', 'billing-stats'] })
      toast.success('Time entry updated')
    },
    onError: () => toast.error('Failed to update time entry'),
  })
}

export function useDeleteTimeEntry() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient()
      const { error } = await supabase.from('time_entries').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoicing', 'time-entries'] })
      queryClient.invalidateQueries({ queryKey: ['invoicing', 'unbilled-time'] })
      queryClient.invalidateQueries({ queryKey: ['invoicing', 'billing-stats'] })
      toast.success('Time entry deleted')
    },
    onError: () => toast.error('Failed to delete time entry'),
  })
}

// ── Invoices ─────────────────────────────────────────────────────────────────

export interface InvoiceWithMatter extends Invoice {
  matter_title?: string
  matter_number?: string | null
}

export function useInvoices(tenantId: string, matterId?: string) {
  return useQuery({
    queryKey: invoicingKeys.invoices(tenantId, matterId),
    queryFn: async (): Promise<InvoiceWithMatter[]> => {
      const supabase = createClient()
      // Join matters via FK (invoices.matter_id -> matters.id) to avoid N+1
      let query = supabase
        .from('invoices')
        .select('*, matters(id, title, matter_number)')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(100)

      if (matterId) query = query.eq('matter_id', matterId)

      const { data, error } = await query
      if (error) throw error

      // Flatten nested matter data to match InvoiceWithMatter return type
      return (data ?? []).map((inv: any) => {
        const { matters, ...rest } = inv
        return {
          ...rest,
          matter_title: matters?.title ?? 'Unknown',
          matter_number: matters?.matter_number ?? null,
        }
      }) as InvoiceWithMatter[]
    },
    enabled: !!tenantId,
  })
}

export interface InvoiceDetail extends Invoice {
  line_items: InvoiceLineItem[]
  payments: Payment[]
}

export function useInvoiceDetail(invoiceId: string | null) {
  return useQuery({
    queryKey: invoicingKeys.invoiceDetail(invoiceId ?? ''),
    queryFn: async (): Promise<InvoiceDetail> => {
      const supabase = createClient()
      const [invoiceRes, lineItemsRes, paymentsRes] = await Promise.all([
        supabase.from('invoices').select('*').eq('id', invoiceId!).single(),
        supabase.from('invoice_line_items').select('*').eq('invoice_id', invoiceId!).order('sort_order'),
        supabase.from('payments').select('*').eq('invoice_id', invoiceId!).order('payment_date', { ascending: false }),
      ])
      if (invoiceRes.error) throw invoiceRes.error

      return {
        ...(invoiceRes.data as Invoice),
        line_items: (lineItemsRes.data ?? []) as InvoiceLineItem[],
        payments: (paymentsRes.data ?? []) as Payment[],
      }
    },
    enabled: !!invoiceId,
  })
}

export interface CreateInvoiceInput {
  tenantId: string
  matterId: string
  invoiceNumber: string
  contactId?: string
  issueDate: string
  dueDate: string
  notes?: string
  lineItems: {
    description: string
    quantity: number
    unitPrice: number // cents
    timeEntryId?: string
  }[]
  taxAmount?: number // cents
}

export function useCreateInvoice() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: CreateInvoiceInput) => {
      const supabase = createClient()

      // Calculate totals
      const subtotal = input.lineItems.reduce((sum, li) => sum + Math.round(li.quantity * li.unitPrice), 0)
      const taxAmount = input.taxAmount ?? 0
      const totalAmount = subtotal + taxAmount

      // Create invoice
      const { data: invoice, error: invError } = await supabase
        .from('invoices')
        .insert({
          tenant_id: input.tenantId,
          matter_id: input.matterId,
          invoice_number: input.invoiceNumber,
          contact_id: input.contactId ?? '',
          issue_date: input.issueDate,
          due_date: input.dueDate,
          subtotal,
          tax_amount: taxAmount,
          total_amount: totalAmount,
          notes: input.notes ?? null,
        })
        .select()
        .single()

      if (invError) throw invError

      // Create line items
      const lineItemInserts: InvoiceLineItemInsert[] = input.lineItems.map((li, idx) => ({
        tenant_id: input.tenantId,
        invoice_id: invoice.id,
        description: li.description,
        quantity: li.quantity,
        unit_price: li.unitPrice,
        amount: Math.round(li.quantity * li.unitPrice),
        time_entry_id: li.timeEntryId ?? null,
        sort_order: idx,
      }))

      if (lineItemInserts.length > 0) {
        const { error: liError } = await supabase.from('invoice_line_items').insert(lineItemInserts)
        if (liError) throw liError
      }

      // Mark time entries as billed
      const timeEntryIds = input.lineItems
        .filter((li) => li.timeEntryId)
        .map((li) => li.timeEntryId!)
      if (timeEntryIds.length > 0) {
        await supabase
          .from('time_entries')
          .update({ is_billed: true, invoice_id: invoice.id })
          .in('id', timeEntryIds)
      }

      return invoice as Invoice
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: invoicingKeys.all })
      toast.success('Invoice created')
    },
    onError: (err: Error) => toast.error(`Failed to create invoice: ${err.message}`),
  })
}

export function useUpdateInvoiceStatus() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('invoices')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .update({ status } as any)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data as Invoice
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: invoicingKeys.all })
      toast.success(`Invoice marked as ${data.status}`)
    },
    onError: () => toast.error('Failed to update invoice status'),
  })
}

export function useDeleteInvoice() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient()

      // Unmark time entries
      const { data: lineItems } = await supabase
        .from('invoice_line_items')
        .select('time_entry_id')
        .eq('invoice_id', id)
        .not('time_entry_id', 'is', null)

      const timeEntryIds = (lineItems ?? []).map((li) => li.time_entry_id).filter(Boolean) as string[]
      if (timeEntryIds.length > 0) {
        await supabase
          .from('time_entries')
          .update({ is_billed: false, invoice_id: null })
          .in('id', timeEntryIds)
      }

      // Delete invoice (cascade deletes line items and payments)
      const { error } = await supabase.from('invoices').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: invoicingKeys.all })
      toast.success('Invoice deleted')
    },
    onError: () => toast.error('Failed to delete invoice'),
  })
}

// ── Payments ─────────────────────────────────────────────────────────────────

export function useRecordPayment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: PaymentInsert) => {
      const supabase = createClient()

      // Insert payment
      const { data: payment, error: payError } = await supabase
        .from('payments')
        .insert(input)
        .select()
        .single()
      if (payError) throw payError

      // Update invoice amount_paid
      if (input.invoice_id) {
        const { data: invoice } = await supabase
          .from('invoices')
          .select('amount_paid, total_amount')
          .eq('id', input.invoice_id)
          .single()

        if (invoice) {
          const newAmountPaid = (invoice.amount_paid ?? 0) + input.amount
          const updateData: Record<string, unknown> = { amount_paid: newAmountPaid }
          if (newAmountPaid >= invoice.total_amount) {
            updateData.status = 'paid'
          }
          await supabase.from('invoices').update(updateData).eq('id', input.invoice_id)
        }
      }

      return payment as Payment
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: invoicingKeys.all })
      toast.success('Payment recorded')
    },
    onError: (err: Error) => toast.error(`Failed to record payment: ${err.message}`),
  })
}

// ── Billing Stats ────────────────────────────────────────────────────────────

export interface BillingStats {
  totalOutstanding: number  // cents
  totalOverdue: number      // cents
  collectedThisMonth: number // cents
  unbilledHours: number     // decimal hours
  invoiceCount: number
}

export function useBillingStats(tenantId: string) {
  return useQuery({
    queryKey: invoicingKeys.billingStats(tenantId),
    queryFn: async (): Promise<BillingStats> => {
      const supabase = createClient()
      const today = new Date().toISOString().split('T')[0]
      const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
        .toISOString()
        .split('T')[0]

      const [invoicesRes, overdueRes, paymentsRes, unbilledRes] = await Promise.all([
        // Outstanding invoices (sent, viewed, overdue)
        supabase
          .from('invoices')
          .select('total_amount, amount_paid')
          .eq('tenant_id', tenantId)
          .in('status', ['sent', 'viewed', 'overdue']),
        // Overdue specifically
        supabase
          .from('invoices')
          .select('total_amount, amount_paid')
          .eq('tenant_id', tenantId)
          .in('status', ['sent', 'viewed', 'overdue'])
          .lt('due_date', today),
        // Payments this month
        supabase
          .from('payments')
          .select('amount')
          .eq('tenant_id', tenantId)
          .gte('payment_date', monthStart),
        // Unbilled time entries
        supabase
          .from('time_entries')
          .select('duration_minutes')
          .eq('tenant_id', tenantId)
          .eq('is_billable', true)
          .eq('is_billed', false),
      ])

      const outstanding = (invoicesRes.data ?? []).reduce(
        (sum, i) => sum + ((i.total_amount ?? 0) - (i.amount_paid ?? 0)),
        0
      )
      const overdue = (overdueRes.data ?? []).reduce(
        (sum, i) => sum + ((i.total_amount ?? 0) - (i.amount_paid ?? 0)),
        0
      )
      const collected = (paymentsRes.data ?? []).reduce((sum, p) => sum + (p.amount ?? 0), 0)
      const unbilledMinutes = (unbilledRes.data ?? []).reduce((sum, t) => sum + (t.duration_minutes ?? 0), 0)

      return {
        totalOutstanding: outstanding,
        totalOverdue: overdue,
        collectedThisMonth: collected,
        unbilledHours: Math.round((unbilledMinutes / 60) * 10) / 10,
        invoiceCount: (invoicesRes.data ?? []).length,
      }
    },
    enabled: !!tenantId,
    staleTime: 2 * 60 * 1000,
  })
}

// ── Matter Retainer Summary ───────────────────────────────────────────────────

/**
 * Fetches the retainer package (fees agreed at signing) linked to a matter
 * via matters.originating_lead_id → lead_retainer_packages.lead_id.
 * Returns null if no retainer package exists.
 */
export function useMatterRetainerSummary(matterId: string | undefined) {
  return useQuery({
    queryKey: invoicingKeys.retainerSummary(matterId ?? ''),
    queryFn: async (): Promise<MatterRetainerSummary | null> => {
      const res = await fetch(`/api/matters/${matterId}/retainer-summary`)
      if (!res.ok) throw new Error('Failed to fetch retainer summary')
      const data = await res.json()
      return data.retainerSummary ?? null
    },
    enabled: !!matterId,
    staleTime: 60 * 1000,
  })
}

/**
 * Records a payment against the retainer package from within the matter page.
 * Does NOT trigger lead-to-matter conversion (already converted).
 */
export function useRecordMatterRetainerPayment(matterId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      amount: number        // cents
      paymentMethod: string
      reference?: string
    }) => {
      const res = await fetch(`/api/matters/${matterId}/retainer-summary`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Payment failed' }))
        throw new Error(err.error ?? 'Payment failed')
      }
      return res.json()
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: invoicingKeys.retainerSummary(matterId) })
      toast.success('Payment recorded')
    },
    onError: (err: Error) => {
      toast.error(err.message ?? 'Failed to record payment')
    },
  })
}

// ── Phase 9: Invoice Lifecycle Hooks ──────────────────────────────────────────

/** Send an invoice via email */
export function useSendInvoice() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ invoiceId, emailOverride }: { invoiceId: string; emailOverride?: string }) => {
      const res = await fetch(`/api/invoices/${invoiceId}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email_override: emailOverride }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to send invoice')
      }
      return res.json()
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: invoicingKeys.all })
    },
  })
}

/** Send a payment receipt */
export function useSendReceipt() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ invoiceId, emailOverride }: { invoiceId: string; emailOverride?: string }) => {
      const res = await fetch(`/api/invoices/${invoiceId}/receipt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email_override: emailOverride }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to send receipt')
      }
      return res.json()
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: invoicingKeys.all })
    },
  })
}

/** Batch send multiple invoices */
export function useBatchSendInvoices() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (invoiceIds: string[]) => {
      const res = await fetch('/api/invoices/batch-send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoice_ids: invoiceIds }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Batch send failed')
      }
      return res.json() as Promise<{ sent: string[]; failed: { id: string; reason: string }[] }>
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: invoicingKeys.all })
    },
  })
}

/** Fetch client statement */
export function useClientStatement(contactId: string, dateRange?: { from?: string; to?: string }) {
  return useQuery({
    queryKey: ['client-statement', contactId, dateRange],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (dateRange?.from) params.set('from', dateRange.from)
      if (dateRange?.to) params.set('to', dateRange.to)
      const qs = params.toString()
      const res = await fetch(`/api/contacts/${contactId}/statement${qs ? `?${qs}` : ''}`)
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to fetch statement')
      }
      return res.json()
    },
    enabled: !!contactId,
    staleTime: 1000 * 60 * 2,
  })
}

// ── Phase 9 Billing Module: Extended Keys ─────────────────────────────────────

export const billingKeys = {
  ...invoicingKeys,
  adjustments: (invoiceId: string) => ['invoicing', 'adjustments', invoiceId] as const,
  trustAllocations: (invoiceId: string) => ['invoicing', 'trust-allocations', invoiceId] as const,
  auditLog: (invoiceId: string) => ['invoicing', 'audit-log', invoiceId] as const,
  lineItems: (invoiceId: string) => ['invoicing', 'line-items', invoiceId] as const,
  paymentPlan: (invoiceId: string) => ['invoicing', 'payment-plan', invoiceId] as const,
}

// ── Finalize Invoice ──────────────────────────────────────────────────────────

export function useFinalizeInvoice() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      invoiceId,
      overrideTaxCheck = false,
    }: {
      invoiceId: string
      overrideTaxCheck?: boolean
    }) => {
      const res = await fetch(`/api/billing/invoices/${invoiceId}/finalize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ override_tax_check: overrideTaxCheck }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to finalise invoice')
      return data as { invoiceNumber: string }
    },
    onSuccess: (_data, { invoiceId }) => {
      qc.invalidateQueries({ queryKey: invoicingKeys.invoiceDetail(invoiceId) })
      qc.invalidateQueries({ queryKey: ['invoicing', 'invoices'] })
      toast.success('Invoice finalised')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

// ── Void Invoice ──────────────────────────────────────────────────────────────

export function useVoidInvoice() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ invoiceId, reason }: { invoiceId: string; reason: string }) => {
      const res = await fetch(`/api/billing/invoices/${invoiceId}/void`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to void invoice')
      return data
    },
    onSuccess: (_data, { invoiceId }) => {
      qc.invalidateQueries({ queryKey: invoicingKeys.invoiceDetail(invoiceId) })
      qc.invalidateQueries({ queryKey: ['invoicing', 'invoices'] })
      toast.success('Invoice voided')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

// ── Invoice Line Items (v2 — category-aware) ──────────────────────────────────

export function useInvoiceLineItems(invoiceId: string | null) {
  return useQuery({
    queryKey: billingKeys.lineItems(invoiceId ?? ''),
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('invoice_line_items')
        .select('*')
        .eq('invoice_id', invoiceId!)
        .is('deleted_at', null)
        .order('sort_order')
      if (error) throw error
      return data as InvoiceLineItem[]
    },
    enabled: !!invoiceId,
    staleTime: 30 * 1000,
  })
}

export function useAddLineItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      invoiceId,
      ...payload
    }: { invoiceId: string } & InvoiceLineItemInsert) => {
      const res = await fetch(`/api/billing/invoices/${invoiceId}/lines`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to add line item')
      return data
    },
    onSuccess: (_data, { invoiceId }) => {
      qc.invalidateQueries({ queryKey: billingKeys.lineItems(invoiceId) })
      qc.invalidateQueries({ queryKey: invoicingKeys.invoiceDetail(invoiceId) })
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

export function useDeleteLineItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ invoiceId, lineItemId }: { invoiceId: string; lineItemId: string }) => {
      const res = await fetch(`/api/billing/invoices/${invoiceId}/lines/${lineItemId}`, {
        method: 'DELETE',
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to remove line item')
      return data
    },
    onSuccess: (_data, { invoiceId }) => {
      qc.invalidateQueries({ queryKey: billingKeys.lineItems(invoiceId) })
      qc.invalidateQueries({ queryKey: invoicingKeys.invoiceDetail(invoiceId) })
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

// ── Adjustments ───────────────────────────────────────────────────────────────

export interface AdjustmentRow {
  id: string
  invoice_id: string
  adjustment_type: string
  scope: string
  amount_cents: number
  description: string
  approval_status: string
  requested_by: string | null
  approved_by: string | null
  approved_at: string | null
  created_at: string
}

export function useInvoiceAdjustments(invoiceId: string | null) {
  return useQuery({
    queryKey: billingKeys.adjustments(invoiceId ?? ''),
    queryFn: async () => {
      const supabase = createClient()
      /* eslint-disable @typescript-eslint/no-explicit-any */
      const { data, error } = await (supabase as any)
        .from('invoice_adjustments')
        .select('*')
        .eq('invoice_id', invoiceId!)
        .order('created_at', { ascending: false })
      /* eslint-enable @typescript-eslint/no-explicit-any */
      if (error) throw error
      return (data ?? []) as AdjustmentRow[]
    },
    enabled: !!invoiceId,
    staleTime: 30 * 1000,
  })
}

export function useApplyAdjustment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      invoiceId,
      ...payload
    }: {
      invoiceId: string
      adjustmentType: string
      scope: string
      amountCents: number
      description: string
      lineItemId?: string | null
    }) => {
      const res = await fetch(`/api/billing/invoices/${invoiceId}/adjustments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to apply adjustment')
      return data as { adjustmentId: string; requiresApproval: boolean }
    },
    onSuccess: (_data, { invoiceId }) => {
      qc.invalidateQueries({ queryKey: billingKeys.adjustments(invoiceId) })
      qc.invalidateQueries({ queryKey: invoicingKeys.invoiceDetail(invoiceId) })
      toast.success('Adjustment applied')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

export function useApproveAdjustment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      invoiceId,
      adjustmentId,
    }: {
      invoiceId: string
      adjustmentId: string
    }) => {
      const res = await fetch(
        `/api/billing/invoices/${invoiceId}/adjustments/${adjustmentId}/approve`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' } },
      )
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to approve adjustment')
      return data
    },
    onSuccess: (_data, { invoiceId }) => {
      qc.invalidateQueries({ queryKey: billingKeys.adjustments(invoiceId) })
      qc.invalidateQueries({ queryKey: invoicingKeys.invoiceDetail(invoiceId) })
      toast.success('Adjustment approved')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

// ── Trust Allocations ─────────────────────────────────────────────────────────

export interface TrustAllocationRow {
  id: string
  invoice_id: string
  trust_account_id: string
  amount_cents: number
  allocation_status: string
  requested_by: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export function useInvoiceTrustAllocations(invoiceId: string | null) {
  return useQuery({
    queryKey: billingKeys.trustAllocations(invoiceId ?? ''),
    queryFn: async () => {
      const supabase = createClient()
      /* eslint-disable @typescript-eslint/no-explicit-any */
      const { data, error } = await (supabase as any)
        .from('invoice_trust_allocations')
        .select('*')
        .eq('invoice_id', invoiceId!)
        .order('created_at', { ascending: false })
      /* eslint-enable @typescript-eslint/no-explicit-any */
      if (error) throw error
      return (data ?? []) as TrustAllocationRow[]
    },
    enabled: !!invoiceId,
    staleTime: 30 * 1000,
  })
}

export function useRequestTrustAllocation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      invoiceId,
      ...payload
    }: {
      invoiceId: string
      trustAccountId: string
      amountCents: number
      notes?: string | null
    }) => {
      const res = await fetch(`/api/billing/invoices/${invoiceId}/trust`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to request trust allocation')
      return data as { allocationId: string }
    },
    onSuccess: (_data, { invoiceId }) => {
      qc.invalidateQueries({ queryKey: billingKeys.trustAllocations(invoiceId) })
      qc.invalidateQueries({ queryKey: invoicingKeys.invoiceDetail(invoiceId) })
      toast.success('Norva Trust Ledger — Allocation requested')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

// ── Invoice Audit Log ─────────────────────────────────────────────────────────

export interface AuditLogEntry {
  id: string
  invoice_id: string
  matter_id: string
  event_type: string
  event_description: string
  changed_fields: Record<string, { before: unknown; after: unknown }> | null
  performed_by: string
  performed_at: string
}

export function useInvoiceAuditLog(invoiceId: string | null) {
  return useQuery({
    queryKey: billingKeys.auditLog(invoiceId ?? ''),
    queryFn: async () => {
      const supabase = createClient()
      /* eslint-disable @typescript-eslint/no-explicit-any */
      const { data, error } = await (supabase as any)
        .from('invoice_audit_log')
        .select('id, invoice_id, matter_id, event_type, event_description, changed_fields, performed_by, performed_at')
        .eq('invoice_id', invoiceId!)
        .order('performed_at', { ascending: false })
        .limit(100)
      /* eslint-enable @typescript-eslint/no-explicit-any */
      if (error) throw error
      return (data ?? []) as AuditLogEntry[]
    },
    enabled: !!invoiceId,
    staleTime: 60 * 1000,
  })
}

// ── Payment Plans ─────────────────────────────────────────────────────────────

export type { PaymentPlanRow, PaymentPlanInstalmentRow }

export interface PaymentPlanWithInstalments extends PaymentPlanRow {
  instalments: (PaymentPlanInstalmentRow & { is_overdue: boolean })[]
}

export function useInvoicePaymentPlan(invoiceId: string | null) {
  return useQuery({
    queryKey: billingKeys.paymentPlan(invoiceId ?? ''),
    queryFn: async (): Promise<PaymentPlanWithInstalments | null> => {
      /* eslint-disable @typescript-eslint/no-explicit-any */
      const supabase = createClient()
      const { data: plan, error } = await (supabase as any)
        .from('payment_plans')
        .select('*')
        .eq('invoice_id', invoiceId!)
        .eq('status', 'active')
        .maybeSingle()
      /* eslint-enable @typescript-eslint/no-explicit-any */
      if (error) throw error
      if (!plan) return null

      const res = await fetch(`/api/billing/payment-plans/${plan.id}`)
      if (!res.ok) throw new Error('Failed to load payment plan')
      return res.json() as Promise<PaymentPlanWithInstalments>
    },
    enabled: !!invoiceId,
    staleTime: 30 * 1000,
  })
}

export function useCreatePaymentPlan() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: {
      invoiceId: string
      clientContactId: string
      totalAmountCents: number
      instalmentAmountCents: number
      instalmentCount: number
      frequency: 'weekly' | 'biweekly' | 'monthly'
      startDate: string
      notes?: string | null
    }) => {
      const res = await fetch('/api/billing/payment-plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoice_id: payload.invoiceId,
          client_contact_id: payload.clientContactId,
          total_amount_cents: payload.totalAmountCents,
          instalment_amount_cents: payload.instalmentAmountCents,
          instalment_count: payload.instalmentCount,
          frequency: payload.frequency,
          start_date: payload.startDate,
          notes: payload.notes ?? null,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to create payment plan')
      return data as { planId: string; instalmentCount: number }
    },
    onSuccess: (_data, { invoiceId }) => {
      qc.invalidateQueries({ queryKey: billingKeys.paymentPlan(invoiceId) })
      qc.invalidateQueries({ queryKey: invoicingKeys.invoiceDetail(invoiceId) })
      toast.success('Payment plan created')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

export function useApprovePaymentPlan() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ planId }: { planId: string; invoiceId: string }) => {
      const res = await fetch(`/api/billing/payment-plans/${planId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve' }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to approve payment plan')
      return data
    },
    onSuccess: (_data, { invoiceId }) => {
      qc.invalidateQueries({ queryKey: billingKeys.paymentPlan(invoiceId) })
      toast.success('Payment plan approved')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

export function useCancelPaymentPlan() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ planId, reason }: { planId: string; invoiceId: string; reason?: string }) => {
      const res = await fetch(`/api/billing/payment-plans/${planId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cancel', reason: reason ?? null }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to cancel payment plan')
      return data
    },
    onSuccess: (_data, { invoiceId }) => {
      qc.invalidateQueries({ queryKey: billingKeys.paymentPlan(invoiceId) })
      qc.invalidateQueries({ queryKey: invoicingKeys.invoiceDetail(invoiceId) })
      toast.success('Payment plan cancelled')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

export function usePayInstalment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      planId,
      instalmentId,
      paymentMethod,
      notes,
    }: {
      planId: string
      instalmentId: string
      invoiceId: string
      paymentMethod: string
      notes?: string | null
    }) => {
      const res = await fetch(
        `/api/billing/payment-plans/${planId}/instalments/${instalmentId}/pay`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ payment_method: paymentMethod, notes: notes ?? null }),
        },
      )
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to record payment')
      return data as { paymentId: string }
    },
    onSuccess: (_data, { invoiceId, planId }) => {
      qc.invalidateQueries({ queryKey: billingKeys.paymentPlan(invoiceId) })
      qc.invalidateQueries({ queryKey: invoicingKeys.invoiceDetail(invoiceId) })
      qc.invalidateQueries({ queryKey: ['invoicing', 'invoices'] })
      toast.success('Instalment payment recorded')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

// ── Extended Billing Stats (includes finalized) ───────────────────────────────

export const billingKeys2 = {
  dashboardStats: (tid: string) => ['billing-dashboard-stats', tid] as const,
}

export interface BillingDashboardStats {
  totalOutstandingCents: number
  totalOverdueCents: number
  collectedThisMonthCents: number
  unbilledHours: number
  draftCount: number
  finalizedCount: number
  overdueCount: number
}

export function useBillingDashboardStats(tenantId: string) {
  return useQuery({
    queryKey: billingKeys2.dashboardStats(tenantId),
    queryFn: async (): Promise<BillingDashboardStats> => {
      const supabase = createClient()
      const today = new Date().toISOString().split('T')[0]
      const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
        .toISOString()
        .split('T')[0]

      const [invoicesRes, paymentsRes, unbilledRes] = await Promise.all([
        supabase
          .from('invoices')
          .select('status, total_amount, amount_paid, due_date')
          .eq('tenant_id', tenantId)
          .in('status', ['draft', 'finalized', 'sent', 'viewed', 'partially_paid', 'overdue']),
        supabase
          .from('payments')
          .select('amount')
          .eq('tenant_id', tenantId)
          .gte('payment_date', monthStart)
          .is('voided_at', null),
        supabase
          .from('time_entries')
          .select('duration_minutes')
          .eq('tenant_id', tenantId)
          .eq('is_billable', true)
          .eq('is_billed', false),
      ])

      const invoices = invoicesRes.data ?? []
      const outstanding = invoices
        .filter((i) => ['sent', 'viewed', 'partially_paid', 'overdue'].includes(i.status ?? ''))
        .reduce((sum, i) => sum + ((i.total_amount ?? 0) - (i.amount_paid ?? 0)), 0)
      const overdue = invoices
        .filter((i) => i.status === 'overdue' || (i.due_date && i.due_date < today && ['sent', 'viewed', 'partially_paid'].includes(i.status ?? '')))
        .reduce((sum, i) => sum + ((i.total_amount ?? 0) - (i.amount_paid ?? 0)), 0)
      const collected = (paymentsRes.data ?? []).reduce((sum, p) => sum + (p.amount ?? 0), 0)
      const unbilledMinutes = (unbilledRes.data ?? []).reduce(
        (sum, t) => sum + (t.duration_minutes ?? 0),
        0,
      )

      return {
        totalOutstandingCents: outstanding,
        totalOverdueCents: overdue,
        collectedThisMonthCents: collected,
        unbilledHours: Math.round((unbilledMinutes / 60) * 10) / 10,
        draftCount: invoices.filter((i) => i.status === 'draft').length,
        finalizedCount: invoices.filter((i) => i.status === 'finalized').length,
        overdueCount: invoices.filter(
          (i) =>
            i.status === 'overdue' ||
            (i.due_date && i.due_date < today && ['sent', 'viewed', 'partially_paid'].includes(i.status ?? '')),
        ).length,
      }
    },
    enabled: !!tenantId,
    staleTime: 2 * 60 * 1000,
  })
}
