'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { trustKeys } from './trust-accounting'
import { invoicingKeys } from './invoicing'
import { financialClearanceKeys } from './financial-clearance'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface TransactionMatch {
  match_type: 'exact' | 'partial' | 'overpayment'
  priority: number
  invoice_id: string
  invoice_number: string | null
  invoice_total: number
  remaining_cents: number
  due_date: string | null
  transaction_id: string
  deposit_cents: number
  available_cents: number
  apply_cents: number
  description: string
  reference: string | null
  deposit_date: string
  payment_method: string | null
}

export interface ApplyMatchResult {
  success: boolean
  allocation_id: string
  amount_cents: number
  invoice_id: string
  invoice_number: string | null
  transaction_id: string
  new_balance_due: number
  invoice_paid: boolean
}

export interface ReverseMatchResult {
  success: boolean
  reversed_allocation: string
  offsetting_entry_id: string
  amount_cents: number
  invoice_id: string
  new_balance_due: number
  reason: string
}

// ─── Query Keys ──────────────────────────────────────────────────────────────

export const trustMatchKeys = {
  all: ['trust-match'] as const,
  suggestions: (matterId: string) => [...trustMatchKeys.all, 'suggestions', matterId] as const,
}

// ─── Fetch Suggestions ──────────────────────────────────────────────────────

export function useTransactionMatches(matterId: string) {
  return useQuery({
    queryKey: trustMatchKeys.suggestions(matterId),
    queryFn: async (): Promise<TransactionMatch[]> => {
      const res = await fetch(`/api/matters/${matterId}/trust-match`)

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || `Smart-Match failed (${res.status})`)
      }

      const data = await res.json()
      return data.suggestions ?? []
    },
    enabled: !!matterId,
    staleTime: 1000 * 30, // 30s  -  financial data stays fresh
  })
}

// ─── Apply Match ─────────────────────────────────────────────────────────────

export function useApplyTrustMatch(matterId: string) {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (input: {
      invoiceId: string
      transactionId: string
      amountCents: number
      notes?: string
    }): Promise<ApplyMatchResult> => {
      const res = await fetch(`/api/matters/${matterId}/trust-match`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || `Apply failed (${res.status})`)
      }

      return res.json()
    },
    onSuccess: (data) => {
      // Invalidate everything that could be affected
      qc.invalidateQueries({ queryKey: trustMatchKeys.suggestions(matterId) })
      qc.invalidateQueries({ queryKey: trustKeys.transactions() })
      qc.invalidateQueries({ queryKey: invoicingKeys.all })
      qc.invalidateQueries({ queryKey: financialClearanceKeys.all })
      qc.invalidateQueries({ queryKey: ['matters'] })
      qc.invalidateQueries({ queryKey: ['readiness'] })

      if (data.invoice_paid) {
        toast.success(`Invoice ${data.invoice_number ?? ''} fully paid  -  balance cleared`)
      } else {
        const applied = (data.amount_cents / 100).toFixed(2)
        toast.success(`$${applied} applied to Invoice ${data.invoice_number ?? ''}`)
      }
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })
}

// ─── Reverse Match ───────────────────────────────────────────────────────────

export function useReverseTrustMatch(matterId: string) {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (input: {
      allocationId: string
      reason: string
    }): Promise<ReverseMatchResult> => {
      const res = await fetch(`/api/matters/${matterId}/trust-match`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || `Reversal failed (${res.status})`)
      }

      return res.json()
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: trustMatchKeys.suggestions(matterId) })
      qc.invalidateQueries({ queryKey: trustKeys.transactions() })
      qc.invalidateQueries({ queryKey: invoicingKeys.all })
      qc.invalidateQueries({ queryKey: financialClearanceKeys.all })
      qc.invalidateQueries({ queryKey: ['matters'] })
      qc.invalidateQueries({ queryKey: ['readiness'] })

      toast.success('Allocation reversed  -  offsetting entry created')
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })
}
