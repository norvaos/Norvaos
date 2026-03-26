/**
 * TanStack Query hooks for Trust Accounting & IOLTA Compliance (Phase 7)
 *
 * All hooks follow the established NorvaOS patterns:
 * - Queries use API routes (not direct Supabase calls) for server-side permission enforcement
 * - Mutations invalidate relevant query keys on success
 * - Canadian English in all user-facing strings
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

// ─── Query Keys ─────────────────────────────────────────────────────────────

export const trustKeys = {
  all: ['trust'] as const,
  accounts: () => [...trustKeys.all, 'accounts'] as const,
  account: (id: string) => [...trustKeys.accounts(), id] as const,
  transactions: () => [...trustKeys.all, 'transactions'] as const,
  transactionList: (params: Record<string, unknown>) => [...trustKeys.transactions(), params] as const,
  disbursements: () => [...trustKeys.all, 'disbursements'] as const,
  disbursementList: (params: Record<string, unknown>) => [...trustKeys.disbursements(), params] as const,
  disbursement: (id: string) => [...trustKeys.disbursements(), id] as const,
  reconciliations: () => [...trustKeys.all, 'reconciliations'] as const,
  reconciliationList: (params: Record<string, unknown>) => [...trustKeys.reconciliations(), params] as const,
  reconciliation: (id: string) => [...trustKeys.reconciliations(), id] as const,
  reports: () => [...trustKeys.all, 'reports'] as const,
  report: (type: string, params: Record<string, unknown>) => [...trustKeys.reports(), type, params] as const,
  cheques: () => [...trustKeys.all, 'cheques'] as const,
  chequeList: (params: Record<string, unknown>) => [...trustKeys.cheques(), params] as const,
  holds: () => [...trustKeys.all, 'holds'] as const,
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

// ─── Trust Bank Accounts ────────────────────────────────────────────────────

export function useTrustAccounts(includeInactive = false) {
  return useQuery({
    queryKey: [...trustKeys.accounts(), { includeInactive }],
    queryFn: () =>
      fetchApi<{ success: true; accounts: unknown[] }>(
        `/api/trust-accounting/accounts?includeInactive=${includeInactive}`
      ),
    staleTime: 1000 * 60 * 5,
  })
}

export function useCreateTrustAccount() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: {
      accountName: string
      accountType?: 'general' | 'specific'
      bankName: string
      accountNumberEncrypted: string
      transitNumber?: string
      institutionNumber?: string
      currency?: string
      jurisdictionCode?: string
      matterId?: string
      defaultHoldDaysCheque?: number
      defaultHoldDaysEft?: number
    }) => fetchApi('/api/trust-accounting/accounts', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: trustKeys.accounts() })
      toast.success('Norva Trust Ledger  -  Account created')
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })
}

// ─── Trust Transactions ─────────────────────────────────────────────────────

interface TransactionListParams {
  matterId?: string
  trustAccountId?: string
  transactionType?: string
  dateFrom?: string
  dateTo?: string
  page?: number
  pageSize?: number
}

export function useTrustTransactions(params: TransactionListParams) {
  const queryParams = new URLSearchParams()
  if (params.matterId) queryParams.set('matterId', params.matterId)
  if (params.trustAccountId) queryParams.set('trustAccountId', params.trustAccountId)
  if (params.transactionType) queryParams.set('transactionType', params.transactionType)
  if (params.dateFrom) queryParams.set('dateFrom', params.dateFrom)
  if (params.dateTo) queryParams.set('dateTo', params.dateTo)
  if (params.page) queryParams.set('page', String(params.page))
  if (params.pageSize) queryParams.set('pageSize', String(params.pageSize))

  return useQuery({
    queryKey: trustKeys.transactionList(params as Record<string, unknown>),
    queryFn: () =>
      fetchApi<{ success: true; transactions: unknown[]; pagination: { page: number; pageSize: number; total: number } }>(
        `/api/trust-accounting/transactions?${queryParams.toString()}`
      ),
    staleTime: 1000 * 60 * 2,
  })
}

export function useRecordDeposit() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: {
      trustAccountId: string
      matterId: string
      contactId?: string
      transactionType?: 'deposit' | 'opening_balance'
      amountCents: number
      description: string
      clientDescription?: string
      referenceNumber?: string
      paymentMethod?: string
      invoiceId?: string
      effectiveDate?: string
      notes?: string
      /** Optional lead ID  -  triggers auto-conversion via Norva Ledger */
      leadId?: string
    }) => fetchApi('/api/trust-accounting/transactions', {
      method: 'POST',
      body: JSON.stringify({ transactionType: 'deposit', ...input }),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: trustKeys.transactions() })
      qc.invalidateQueries({ queryKey: trustKeys.reports() })
      qc.invalidateQueries({ queryKey: ['matters'] })
      qc.invalidateQueries({ queryKey: ['leads'] })
      toast.success('Deposit recorded')
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })
}

// ─── Disbursement Requests ──────────────────────────────────────────────────

interface DisbursementListParams {
  matterId?: string
  trustAccountId?: string
  status?: string
  page?: number
  pageSize?: number
}

export function useDisbursementRequests(params: DisbursementListParams) {
  const queryParams = new URLSearchParams()
  if (params.matterId) queryParams.set('matterId', params.matterId)
  if (params.trustAccountId) queryParams.set('trustAccountId', params.trustAccountId)
  if (params.status) queryParams.set('status', params.status)
  if (params.page) queryParams.set('page', String(params.page))
  if (params.pageSize) queryParams.set('pageSize', String(params.pageSize))

  return useQuery({
    queryKey: trustKeys.disbursementList(params as Record<string, unknown>),
    queryFn: () =>
      fetchApi<{ success: true; requests: unknown[]; pagination: { page: number; pageSize: number; total: number } }>(
        `/api/trust-accounting/disbursements?${queryParams.toString()}`
      ),
    staleTime: 1000 * 60 * 2,
  })
}

export function usePrepareDisbursement() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: {
      trustAccountId: string
      matterId: string
      amountCents: number
      payeeName: string
      description: string
      clientDescription?: string
      paymentMethod: string
      referenceNumber?: string
      invoiceId?: string
      requestType?: 'disbursement' | 'transfer' | 'refund'
      authorizationType?: string
      authorizationRef?: string
    }) => fetchApi('/api/trust-accounting/disbursements', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: trustKeys.disbursements() })
      toast.success('Disbursement request prepared')
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })
}

export function useApproveDisbursement() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => fetchApi(`/api/trust-accounting/disbursements/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ action: 'approve' }),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: trustKeys.disbursements() })
      qc.invalidateQueries({ queryKey: trustKeys.transactions() })
      qc.invalidateQueries({ queryKey: trustKeys.reports() })
      qc.invalidateQueries({ queryKey: ['matters'] })
      toast.success('Disbursement approved and recorded')
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })
}

export function useRejectDisbursement() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { id: string; rejectionReason: string }) =>
      fetchApi(`/api/trust-accounting/disbursements/${input.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ action: 'reject', rejectionReason: input.rejectionReason }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: trustKeys.disbursements() })
      toast.success('Disbursement request rejected')
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })
}

// ─── Reconciliations ────────────────────────────────────────────────────────

interface ReconciliationListParams {
  trustAccountId?: string
  status?: string
  page?: number
  pageSize?: number
}

export function useReconciliations(params: ReconciliationListParams) {
  const queryParams = new URLSearchParams()
  if (params.trustAccountId) queryParams.set('trustAccountId', params.trustAccountId)
  if (params.status) queryParams.set('status', params.status)
  if (params.page) queryParams.set('page', String(params.page))
  if (params.pageSize) queryParams.set('pageSize', String(params.pageSize))

  return useQuery({
    queryKey: trustKeys.reconciliationList(params as Record<string, unknown>),
    queryFn: () =>
      fetchApi<{ success: true; reconciliations: unknown[]; pagination: { page: number; pageSize: number; total: number } }>(
        `/api/trust-accounting/reconciliations?${queryParams.toString()}`
      ),
    staleTime: 1000 * 60 * 2,
  })
}

export function useReconciliation(id: string) {
  return useQuery({
    queryKey: trustKeys.reconciliation(id),
    queryFn: () =>
      fetchApi<{ success: true; reconciliation: unknown }>(
        `/api/trust-accounting/reconciliations/${id}`
      ),
    enabled: !!id,
    staleTime: 1000 * 60,
  })
}

export function useCreateReconciliation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: {
      trustAccountId: string
      periodStart: string
      periodEnd: string
    }) => fetchApi('/api/trust-accounting/reconciliations', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: trustKeys.reconciliations() })
      toast.success('Reconciliation created')
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })
}

export function useReconciliationAction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { id: string; action: string; [key: string]: unknown }) => {
      const { id, ...body } = input
      return fetchApi(`/api/trust-accounting/reconciliations/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: trustKeys.reconciliations() })
      toast.success('Reconciliation updated')
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })
}

// ─── Reports ────────────────────────────────────────────────────────────────

export function useTrustReport(reportType: string, params: Record<string, string>) {
  const queryParams = new URLSearchParams({ report: reportType, ...params })

  return useQuery({
    queryKey: trustKeys.report(reportType, params),
    queryFn: () =>
      fetchApi<{ success: true; report: string; data: unknown }>(
        `/api/trust-accounting/reports?${queryParams.toString()}`
      ),
    enabled: !!reportType && !!params.trustAccountId,
    staleTime: 1000 * 60 * 2,
  })
}

// ─── Cheques ────────────────────────────────────────────────────────────────

interface ChequeListParams {
  accountType?: string
  trustAccountId?: string
  status?: string
  matterId?: string
  page?: number
  pageSize?: number
}

export function useCheques(params: ChequeListParams) {
  const queryParams = new URLSearchParams()
  if (params.accountType) queryParams.set('accountType', params.accountType)
  if (params.trustAccountId) queryParams.set('trustAccountId', params.trustAccountId)
  if (params.status) queryParams.set('status', params.status)
  if (params.matterId) queryParams.set('matterId', params.matterId)
  if (params.page) queryParams.set('page', String(params.page))
  if (params.pageSize) queryParams.set('pageSize', String(params.pageSize))

  return useQuery({
    queryKey: trustKeys.chequeList(params as Record<string, unknown>),
    queryFn: () =>
      fetchApi<{ success: true; cheques: unknown[]; pagination: { page: number; pageSize: number; total: number } }>(
        `/api/trust-accounting/cheques?${queryParams.toString()}`
      ),
    staleTime: 1000 * 60 * 2,
  })
}

export function useCreateCheque() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: {
      accountType: 'trust' | 'operating'
      trustAccountId?: string
      operatingAccountId?: string
      matterId?: string
      payeeName: string
      amountCents: number
      memo?: string
      trustDisbursementRequestId?: string
    }) => fetchApi('/api/trust-accounting/cheques', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: trustKeys.cheques() })
      toast.success('Cheque created')
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })
}

// ─── Holds ──────────────────────────────────────────────────────────────────

export function useReleaseHold() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      fetchApi(`/api/trust-accounting/holds/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ action: 'release' }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: trustKeys.holds() })
      qc.invalidateQueries({ queryKey: trustKeys.transactions() })
      qc.invalidateQueries({ queryKey: trustKeys.reports() })
      toast.success('Hold released')
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })
}
