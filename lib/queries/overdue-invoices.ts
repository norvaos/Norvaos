/**
 * TanStack Query hook for detecting overdue invoices (>30 days past due)
 *
 * Used by the Trust module to trigger red UI indicators when
 * invoices are overdue, as required by Team TRUST financial integrity rules.
 */

import { useQuery } from '@tanstack/react-query'

// ─── Query Keys ─────────────────────────────────────────────────────────────

export const overdueInvoiceKeys = {
  all: ['overdue-invoices'] as const,
  forMatter: (matterId: string) => [...overdueInvoiceKeys.all, 'matter', matterId] as const,
  forTenant: () => [...overdueInvoiceKeys.all, 'tenant'] as const,
}

// ─── Helper ─────────────────────────────────────────────────────────────────

async function fetchApi<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
  })
  const data = await res.json()
  if (!data.success) {
    throw new Error(data.error ?? 'An error occurred')
  }
  return data
}

// ─── Types ──────────────────────────────────────────────────────────────────

export interface OverdueInvoice {
  id: string
  invoice_number: string | null
  matter_id: string
  amount_cents: number
  due_date: string
  days_overdue: number
  aging_bucket: string
}

// ─── Hooks ──────────────────────────────────────────────────────────────────

/**
 * Fetch invoices overdue >30 days for a specific matter.
 */
export function useOverdueInvoices(matterId: string) {
  return useQuery({
    queryKey: overdueInvoiceKeys.forMatter(matterId),
    queryFn: () =>
      fetchApi<{
        success: true
        invoices: OverdueInvoice[]
        count: number
      }>(`/api/invoices/overdue?matterId=${matterId}&minDaysOverdue=30`),
    enabled: !!matterId,
    staleTime: 1000 * 60 * 5,
  })
}

/**
 * Fetch all overdue invoices across the tenant (for dashboard).
 */
export function useAllOverdueInvoices() {
  return useQuery({
    queryKey: overdueInvoiceKeys.forTenant(),
    queryFn: () =>
      fetchApi<{
        success: true
        invoices: OverdueInvoice[]
        count: number
      }>(`/api/invoices/overdue?minDaysOverdue=30`),
    staleTime: 1000 * 60 * 5,
  })
}

/**
 * Get the count of overdue invoices for a matter (lightweight check).
 * Useful for badge indicators without fetching full invoice data.
 */
export function useOverdueInvoiceCount(matterId: string) {
  const query = useOverdueInvoices(matterId)
  return {
    ...query,
    count: query.data?.count ?? 0,
  }
}
