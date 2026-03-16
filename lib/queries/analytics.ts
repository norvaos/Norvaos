/**
 * TanStack Query hooks for Analytics & Collections (Phase 8)
 *
 * All hooks follow the established NorvaOS patterns:
 * - Queries use API routes (not direct Supabase calls) for server-side permission enforcement
 * - Mutations invalidate relevant query keys on success
 * - Canadian English in all user-facing strings
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

// ─── Types ──────────────────────────────────────────────────────────────────

export interface AgingBucket {
  bucket: string
  total_cents: number
  count: number
}

export interface KpiScorecardData {
  revenue: {
    current_cents: number
    prior_cents: number
    change_pct: number
  }
  receivables: {
    total_outstanding_cents: number
    buckets: AgingBucket[]
  }
  utilization: {
    firm_avg_pct: number
    total_billable_minutes: number
    total_target_minutes: number
  }
  trust: {
    accounts_needing_reconciliation: number
    active_holds: number
    pending_disbursements: number
  }
  pipeline: {
    new_matters: number
    closed_matters: number
    avg_days_to_close: number
  }
  collection_rate_pct: number
  wip_cents: number
}

export interface TrustComplianceData {
  reconciliation_alerts: {
    account_id: string
    account_name: string
    last_reconciliation_date: string | null
    days_since_reconciliation: number
    status: 'ok' | 'warning' | 'overdue'
  }[]
  stale_balances: {
    matter_id: string
    matter_title: string
    trust_balance_cents: number
    last_transaction_date: string
    days_inactive: number
  }[]
  overdue_holds: {
    hold_id: string
    matter_title: string
    amount_cents: number
    hold_release_date: string
    days_overdue: number
  }[]
  pending_disbursements: {
    request_id: string
    matter_title: string
    amount_cents: number
    requested_at: string
    hours_pending: number
    prepared_by_name: string
  }[]
  anomalies: {
    type: string
    description: string
    severity: 'info' | 'warning' | 'critical'
  }[]
  summary: {
    total_trust_balance_cents: number
    accounts_count: number
    matters_with_balance: number
    compliance_score: number
  }
}

// ─── Query Keys ─────────────────────────────────────────────────────────────

export const analyticsKeys = {
  all: ['analytics'] as const,
  agedReceivables: (filters: Record<string, string>) =>
    [...analyticsKeys.all, 'aged-receivables', filters] as const,
  profitability: (filters: Record<string, string>) =>
    [...analyticsKeys.all, 'profitability', filters] as const,
  utilization: (filters: Record<string, string>) =>
    [...analyticsKeys.all, 'utilization', filters] as const,
  revenue: (filters: Record<string, string>) =>
    [...analyticsKeys.all, 'revenue', filters] as const,
  trustCompliance: () =>
    [...analyticsKeys.all, 'trust-compliance'] as const,
  kpiScorecard: (filters: Record<string, string>) =>
    [...analyticsKeys.all, 'kpi-scorecard', filters] as const,
}

export const collectionKeys = {
  all: ['collections'] as const,
  actions: (invoiceId: string) =>
    [...collectionKeys.all, 'actions', invoiceId] as const,
  plans: (filters: Record<string, string>) =>
    [...collectionKeys.all, 'plans', filters] as const,
  plan: (id: string) =>
    [...collectionKeys.all, 'plan', id] as const,
}

// ─── Helper ─────────────────────────────────────────────────────────────────

async function fetchApi<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  const data = await res.json()
  if (!data.success) {
    throw new Error(data.error ?? 'An error occurred')
  }
  return data
}

function buildQueryString(filters: Record<string, string | undefined>): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(filters)) {
    if (value) params.set(key, value)
  }
  const qs = params.toString()
  return qs ? `?${qs}` : ''
}

function cleanFilters(filters: Record<string, string | undefined>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(filters).filter(([, v]) => !!v),
  ) as Record<string, string>
}

// ─── Analytics Queries ──────────────────────────────────────────────────────

interface AgedReceivablesFilters {
  practice_area_id?: string
  responsible_lawyer_id?: string
  matter_type_id?: string
  contact_id?: string
}

export function useAgedReceivables(filters: AgedReceivablesFilters = {}) {
  const f = filters as Record<string, string | undefined>
  return useQuery({
    queryKey: analyticsKeys.agedReceivables(cleanFilters(f)),
    queryFn: () =>
      fetchApi<{ success: true; data: unknown }>(
        `/api/analytics/aged-receivables${buildQueryString(f)}`,
      ),
    staleTime: 1000 * 60 * 2,
  })
}

interface MatterProfitabilityFilters {
  matter_id?: string
  practice_area_id?: string
  responsible_lawyer_id?: string
  matter_type_id?: string
}

export function useMatterProfitability(filters: MatterProfitabilityFilters = {}) {
  const f = filters as Record<string, string | undefined>
  return useQuery({
    queryKey: analyticsKeys.profitability(cleanFilters(f)),
    queryFn: () =>
      fetchApi<{ success: true; data: unknown }>(
        `/api/analytics/matter-profitability${buildQueryString(f)}`,
      ),
    staleTime: 1000 * 60 * 2,
  })
}

interface UtilizationFilters {
  user_id?: string
  practice_area_id?: string
  start_date?: string
  end_date?: string
}

export function useLawyerUtilization(filters: UtilizationFilters = {}) {
  const f = filters as Record<string, string | undefined>
  return useQuery({
    queryKey: analyticsKeys.utilization(cleanFilters(f)),
    queryFn: () =>
      fetchApi<{ success: true; data: unknown }>(
        `/api/analytics/utilization${buildQueryString(f)}`,
      ),
    staleTime: 1000 * 60 * 2,
  })
}

interface RevenueFilters {
  practice_area_id?: string
  responsible_lawyer_id?: string
  period_type?: string
  start_date?: string
  end_date?: string
}

export function useRevenueAnalytics(filters: RevenueFilters = {}) {
  const f = filters as Record<string, string | undefined>
  return useQuery({
    queryKey: analyticsKeys.revenue(cleanFilters(f)),
    queryFn: () =>
      fetchApi<{ success: true; data: unknown }>(
        `/api/analytics/revenue${buildQueryString(f)}`,
      ),
    staleTime: 1000 * 60 * 2,
  })
}

export function useTrustCompliance() {
  return useQuery({
    queryKey: analyticsKeys.trustCompliance(),
    queryFn: () =>
      fetchApi<{ success: true; data: TrustComplianceData }>(
        '/api/analytics/trust-compliance',
      ),
    staleTime: 1000 * 60 * 2,
  })
}

export interface KpiScorecardFilters {
  start_date?: string
  end_date?: string
  prior_start_date?: string
  prior_end_date?: string
}

export function useKpiScorecard(filters: KpiScorecardFilters = {}) {
  const f = filters as Record<string, string | undefined>
  return useQuery({
    queryKey: analyticsKeys.kpiScorecard(cleanFilters(f)),
    queryFn: () =>
      fetchApi<{ success: true; data: KpiScorecardData }>(
        `/api/analytics/kpi-scorecard${buildQueryString(f)}`,
      ),
    staleTime: 1000 * 60 * 2,
  })
}

// ─── Collection Actions ─────────────────────────────────────────────────────

export function useCollectionActions(invoiceId: string) {
  return useQuery({
    queryKey: collectionKeys.actions(invoiceId),
    queryFn: () =>
      fetchApi<{ success: true; actions: unknown[] }>(
        `/api/collections/actions?invoice_id=${encodeURIComponent(invoiceId)}`,
      ),
    enabled: !!invoiceId,
    staleTime: 1000 * 60 * 2,
  })
}

export function useLogCollectionAction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: {
      invoice_id: string
      matter_id?: string
      action_type: string
      notes?: string
      next_follow_up_date?: string
    }) =>
      fetchApi('/api/collections/actions', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: collectionKeys.actions(variables.invoice_id) })
      toast.success('Collection action logged')
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })
}

// ─── Payment Plans ──────────────────────────────────────────────────────────

interface PaymentPlanFilters {
  invoice_id?: string
  matter_id?: string
  contact_id?: string
  status?: string
}

export function usePaymentPlans(filters: PaymentPlanFilters = {}) {
  const f = filters as Record<string, string | undefined>
  return useQuery({
    queryKey: collectionKeys.plans(cleanFilters(f)),
    queryFn: () =>
      fetchApi<{ success: true; plans: unknown[] }>(
        `/api/collections/payment-plans${buildQueryString(f)}`,
      ),
    staleTime: 1000 * 60 * 2,
  })
}

export function useCreatePaymentPlan() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: Record<string, unknown>) =>
      fetchApi('/api/collections/payment-plans', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: collectionKeys.plans({}) })
      toast.success('Payment plan created')
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })
}

export function usePaymentPlanAction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { id: string; action: string; [key: string]: unknown }) => {
      const { id, ...body } = input
      return fetchApi(`/api/collections/payment-plans/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      })
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: collectionKeys.plan(variables.id) })
      qc.invalidateQueries({ queryKey: collectionKeys.plans({}) })
      toast.success('Payment plan updated')
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })
}

// ─── Write-Offs ─────────────────────────────────────────────────────────────

export function useRequestWriteOff() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: {
      invoice_id: string
      amount_cents: number
      reason: string
    }) =>
      fetchApi('/api/collections/write-offs', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invoices'] })
      toast.success('Write-off requested')
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })
}

export function useWriteOffAction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { id: string; action: 'approve' | 'reject' }) =>
      fetchApi(`/api/collections/write-offs/${input.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ action: input.action }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invoices'] })
      toast.success('Write-off updated')
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })
}
