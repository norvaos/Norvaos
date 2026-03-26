/**
 * First-Hour Command Centre — TanStack Query hooks.
 *
 * Directive 26.1: Real-time metrics for the first 60 minutes of firm onboarding.
 * Tracks Clio-to-Norva sync velocity, Ghost-Writer usage, and Language Toggle distribution.
 */

import { useQuery } from '@tanstack/react-query'
import type { FirstHourMetrics } from '@/app/api/admin/first-hour/route'

export type { FirstHourMetrics }

// ─── Query Keys ──────────────────────────────────────────────────────────────

export const firstHourKeys = {
  all: ['first-hour'] as const,
  metrics: () => [...firstHourKeys.all, 'metrics'] as const,
}

// ─── Hooks ───────────────────────────────────────────────────────────────────

/**
 * Fetches real-time First-Hour metrics.
 * Polls every 15 seconds for live dashboard feel.
 */
export function useFirstHourMetrics(enabled = true) {
  return useQuery({
    queryKey: firstHourKeys.metrics(),
    queryFn: async (): Promise<FirstHourMetrics> => {
      const response = await fetch('/api/admin/first-hour')
      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: 'Unknown error' }))
        throw new Error(err.error ?? 'Failed to fetch first-hour metrics')
      }
      return response.json() as Promise<FirstHourMetrics>
    },
    enabled,
    staleTime: 15_000,        // 15s — live dashboard
    refetchInterval: 15_000,  // Auto-poll every 15s
    refetchOnWindowFocus: true,
  })
}
