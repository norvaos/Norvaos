/**
 * Readiness Score  -  TanStack Query hook
 *
 * POSTs to /api/matters/[id]/readiness which recomputes the composite score
 * server-side and persists it before returning the breakdown.
 *
 * staleTime of 30 s keeps the score fresh without hammering the DB on every
 * re-render. Callers can force a refresh by invalidating ['readiness', matterId].
 */

import { useQuery } from '@tanstack/react-query'
import type { ReadinessResult } from '@/lib/services/readiness-engine'

export type { ReadinessResult }

// ── Query Keys ───────────────────────────────────────────────────────────────

export const compositeReadinessKeys = {
  all: ['readiness'] as const,
  detail: (matterId: string) => ['readiness', matterId] as const,
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useReadinessScore(matterId: string) {
  return useQuery({
    queryKey: compositeReadinessKeys.detail(matterId),
    queryFn: async (): Promise<ReadinessResult> => {
      const res = await fetch(`/api/matters/${matterId}/readiness`, {
        method: 'POST',
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error((body as { error?: string }).error ?? 'Failed to compute readiness')
      }
      return res.json() as Promise<ReadinessResult>
    },
    enabled: !!matterId,
    staleTime: 1000 * 30, // 30 s  -  revalidate frequently
  })
}
