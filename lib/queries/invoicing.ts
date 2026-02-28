'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { Database } from '@/lib/types/database'
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
      queryClient.invalidateQueries({ queryKey: invoicingKeys.all })
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
      queryClient.invalidateQueries({ queryKey: invoicingKeys.all })
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
      queryClient.invalidateQueries({ queryKey: invoicingKeys.all })
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
      let query = supabase
        .from('invoices')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(100)

      if (matterId) query = query.eq('matter_id', matterId)

      const { data, error } = await query
      if (error) throw error

      const invoices = (data ?? []) as Invoice[]

      // Resolve matter titles
      const matterIds = [...new Set(invoices.map((i) => i.matter_id))]
      let matterMap: Record<string, { title: string; matter_number: string | null }> = {}
      if (matterIds.length > 0) {
        const { data: matters } = await supabase
          .from('matters')
          .select('id, title, matter_number')
          .in('id', matterIds)
        if (matters) {
          matterMap = Object.fromEntries(
            matters.map((m) => [m.id, { title: m.title, matter_number: m.matter_number }])
          )
        }
      }

      return invoices.map((inv) => ({
        ...inv,
        matter_title: matterMap[inv.matter_id]?.title ?? 'Unknown',
        matter_number: matterMap[inv.matter_id]?.matter_number ?? null,
      }))
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
          contact_id: input.contactId ?? null,
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
        .update({ status })
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
