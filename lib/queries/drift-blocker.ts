/**
 * TanStack Query hooks for Drift-Blocker (Directive 1.5).
 *
 * Checks whether unacknowledged case law alerts should block AI draft approval.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { DriftBlockStatus } from '@/lib/services/drift-sentry/drift-blocker'

// ── Query Keys ───────────────────────────────────────────────────────────────

export const driftBlockerKeys = {
  all: ['drift-blocker'] as const,
  check: (matterId: string) => [...driftBlockerKeys.all, 'check', matterId] as const,
}

// ── Hooks ────────────────────────────────────────────────────────────────────

/**
 * Check if there are drift alerts blocking draft approval for this matter.
 */
export function useDriftBlockCheck(matterId: string) {
  return useQuery({
    queryKey: driftBlockerKeys.check(matterId),
    queryFn: async () => {
      const res = await fetch(`/api/matters/${matterId}/drift-check`)
      if (!res.ok) throw new Error('Failed to check drift status')
      return res.json() as Promise<DriftBlockStatus>
    },
    enabled: !!matterId,
    staleTime: 1000 * 60 * 5, // 5 min
    refetchOnWindowFocus: true,
  })
}

/**
 * Acknowledge a drift alert to unblock draft approval.
 */
export function useAcknowledgeDrift(matterId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (alertId: string) => {
      const res = await fetch(`/api/matters/${matterId}/drift-check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alertId }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Failed' }))
        throw new Error(data.error)
      }
      return res.json()
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: driftBlockerKeys.check(matterId) })
    },
  })
}
