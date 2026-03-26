'use client'

import { useQuery } from '@tanstack/react-query'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface FinancialBlocker {
  code: 'OUTSTANDING_BALANCE' | 'UNALLOCATED_TRUST_FUNDS'
  message: string
  cents: number
}

export interface FinancialClearanceResult {
  cleared: boolean
  outstanding_cents: number
  unallocated_cents: number
  trust_balance_cents: number
  total_billed_cents: number
  blockers: FinancialBlocker[]
}

// ─── Query Keys ──────────────────────────────────────────────────────────────

export const financialClearanceKeys = {
  all: ['financial-clearance'] as const,
  detail: (matterId: string) => [...financialClearanceKeys.all, matterId] as const,
}

// ─── Hook ────────────────────────────────────────────────────────────────────

/**
 * Fetches financial clearance status for a matter.
 * Calls the Postgres RPC via the API route  -  all math is DB-side.
 */
export function useFinancialClearance(matterId: string) {
  return useQuery({
    queryKey: financialClearanceKeys.detail(matterId),
    queryFn: async (): Promise<FinancialClearanceResult> => {
      const res = await fetch(`/api/matters/${matterId}/financial-clearance`)

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || `Financial clearance check failed (${res.status})`)
      }

      return res.json()
    },
    enabled: !!matterId,
    staleTime: 1000 * 30, // 30 sec  -  money data stays fresh
  })
}
