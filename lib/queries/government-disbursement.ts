/**
 * Norva Ledger  -  Government Fee Disbursement Engine
 *
 * React Query hooks for the government fee disbursement workflow:
 *   1. useGovernmentDisbursement  -  fetch status + readiness gate
 *   2. useAuthorizeDisbursement  -  reserve funds for filing
 *   3. useConfirmDisbursement   -  confirm after IRCC payment
 *   4. useCancelDisbursement    -  cancel reservation
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

// ── Types ────────────────────────────────────────────────────────────────────

export interface GovernmentFee {
  description: string
  amount_cents: number
}

export interface DisbursementRecord {
  id: string
  status: 'pending_approval' | 'approved' | 'cancelled'
  amount_cents: number
  payment_reference: string
  prepared_at: string
  approved_at: string | null
  transaction_id: string | null
}

export interface GovernmentDisbursementStatus {
  success: boolean
  readiness_score: number
  readiness_gate_met: boolean
  government_fee_cents: number
  government_fee_dollars: string
  trust_balance_cents: number
  funds_sufficient: boolean
  fee_breakdown: GovernmentFee[]
  disbursement: DisbursementRecord | null
}

export interface AuthorizeResult {
  success: boolean
  disbursement_request_id: string
  government_fee_cents: number
  government_fee_dollars: string
  trust_balance_cents: number
  payment_reference: string
  matter_id: string
  readiness_score: number
  status: string
  error?: string
}

export interface ConfirmResult {
  success: boolean
  transaction_id: string
  amount_cents: number
  amount_dollars: string
  payment_reference: string
  receipt_ref: string | null
  new_trust_balance: number
  status: string
  error?: string
}

// ── Query Keys ───────────────────────────────────────────────────────────────

export const govtDisbursementKeys = {
  all: ['government-disbursement'] as const,
  status: (matterId: string) => ['government-disbursement', 'status', matterId] as const,
}

// ── Fetch Status ─────────────────────────────────────────────────────────────

async function fetchDisbursementStatus(matterId: string): Promise<GovernmentDisbursementStatus> {
  const res = await fetch(`/api/matters/${matterId}/government-disbursement`)
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `Failed to fetch disbursement status (${res.status})`)
  }
  return res.json()
}

export function useGovernmentDisbursement(matterId: string) {
  return useQuery({
    queryKey: govtDisbursementKeys.status(matterId),
    queryFn: () => fetchDisbursementStatus(matterId),
    enabled: !!matterId,
    staleTime: 30_000,
  })
}

// ── Authorize (Reserve Funds) ────────────────────────────────────────────────

export function useAuthorizeDisbursement(matterId: string) {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (): Promise<AuthorizeResult> => {
      const res = await fetch(`/api/matters/${matterId}/government-disbursement`, {
        method: 'POST',
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to authorize disbursement')
      }
      return data
    },
    onSuccess: (data) => {
      toast.success('Government fees reserved', {
        description: `${data.government_fee_dollars} reserved for IRCC filing. Payment ref: ${data.payment_reference}`,
      })
      qc.invalidateQueries({ queryKey: govtDisbursementKeys.status(matterId) })
      qc.invalidateQueries({ queryKey: ['trust'] })
    },
    onError: (err: Error) => {
      toast.error('Disbursement authorisation failed', {
        description: err.message,
      })
    },
  })
}

// ── Confirm (After IRCC Payment) ─────────────────────────────────────────────

export function useConfirmDisbursement(matterId: string) {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (receiptRef?: string): Promise<ConfirmResult> => {
      const res = await fetch(`/api/matters/${matterId}/government-disbursement`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ receiptRef }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to confirm disbursement')
      }
      return data
    },
    onSuccess: (data) => {
      toast.success('Government fees disbursed', {
        description: `${data.amount_dollars} transferred to IRCC. Trust-to-General entry recorded automatically.`,
      })
      qc.invalidateQueries({ queryKey: govtDisbursementKeys.status(matterId) })
      qc.invalidateQueries({ queryKey: ['trust'] })
      qc.invalidateQueries({ queryKey: ['readiness'] })
    },
    onError: (err: Error) => {
      toast.error('Disbursement confirmation failed', {
        description: err.message,
      })
    },
  })
}

// ── Cancel Reservation ───────────────────────────────────────────────────────

export function useCancelDisbursement(matterId: string) {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (reason?: string) => {
      const res = await fetch(`/api/matters/${matterId}/government-disbursement`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to cancel disbursement')
      }
      return data
    },
    onSuccess: () => {
      toast.success('Reservation cancelled', {
        description: 'Government fee funds have been released back to available balance.',
      })
      qc.invalidateQueries({ queryKey: govtDisbursementKeys.status(matterId) })
      qc.invalidateQueries({ queryKey: ['trust'] })
    },
    onError: (err: Error) => {
      toast.error('Cancellation failed', { description: err.message })
    },
  })
}
