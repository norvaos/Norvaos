/**
 * TanStack Query hooks for Trust Transaction Log (append-only financial event log)
 *
 * Read-only hooks — the transaction log is written internally by services.
 */

import { useQuery } from '@tanstack/react-query'

// ─── Query Keys ─────────────────────────────────────────────────────────────

export const transactionLogKeys = {
  all: ['trust-transaction-log'] as const,
  list: (params: Record<string, unknown>) => [...transactionLogKeys.all, 'list', params] as const,
  entry: (id: string) => [...transactionLogKeys.all, 'entry', id] as const,
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

// ─── Hooks ──────────────────────────────────────────────────────────────────

interface TransactionLogParams {
  trustAccountId?: string
  matterId?: string
  eventType?: string
  dateFrom?: string
  dateTo?: string
  page?: number
  pageSize?: number
}

export function useTransactionLog(params: TransactionLogParams) {
  const queryParams = new URLSearchParams()
  if (params.trustAccountId) queryParams.set('trustAccountId', params.trustAccountId)
  if (params.matterId) queryParams.set('matterId', params.matterId)
  if (params.eventType) queryParams.set('eventType', params.eventType)
  if (params.dateFrom) queryParams.set('dateFrom', params.dateFrom)
  if (params.dateTo) queryParams.set('dateTo', params.dateTo)
  if (params.page) queryParams.set('page', String(params.page))
  if (params.pageSize) queryParams.set('pageSize', String(params.pageSize))

  return useQuery({
    queryKey: transactionLogKeys.list(params as Record<string, unknown>),
    queryFn: () =>
      fetchApi<{
        success: true
        entries: Array<{
          id: string
          event_type: string
          trust_account_id: string | null
          matter_id: string | null
          transaction_id: string | null
          balance_before_cents: number | null
          balance_after_cents: number | null
          amount_cents: number | null
          performed_by: string
          performed_at: string
          description: string
          metadata: Record<string, unknown>
          sequence_number: number
          created_at: string
        }>
        pagination: { page: number; pageSize: number; total: number }
      }>(`/api/trust-accounting/transaction-log?${queryParams.toString()}`),
    staleTime: 1000 * 60 * 2,
  })
}

export function useTransactionLogForMatter(matterId: string) {
  return useTransactionLog({ matterId, pageSize: 100 })
}

export function useTransactionLogForAccount(trustAccountId: string) {
  return useTransactionLog({ trustAccountId, pageSize: 100 })
}
