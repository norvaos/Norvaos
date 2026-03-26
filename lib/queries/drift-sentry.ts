/**
 * TanStack Query hooks for Jurisdictional Drift Sentry — Case law alerts.
 *
 * Budget: all column fragments < 20 cols per query.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

// ── Query Keys ───────────────────────────────────────────────────────────────

export const driftSentryKeys = {
  all: ['drift-sentry'] as const,
  alerts: () => [...driftSentryKeys.all, 'alerts'] as const,
  alert: (id: string) => [...driftSentryKeys.all, 'alert', id] as const,
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface CaseLawAlert {
  id: string
  title: string
  summary: string | null
  source_url: string | null
  source_citation: string | null
  court: string | null
  keywords: string[]
  relevance_score: number | null
  status: string
  decision_date: string | null
  created_at: string
}

// ── Hooks ────────────────────────────────────────────────────────────────────

export function useCaseLawAlerts() {
  return useQuery({
    queryKey: driftSentryKeys.alerts(),
    queryFn: async () => {
      const res = await fetch('/api/drift-sentry/scan')
      if (!res.ok) throw new Error('Failed to load case law alerts')
      const json = await res.json()
      return (json.alerts ?? []) as CaseLawAlert[]
    },
    staleTime: 1000 * 60 * 10, // 10 min — case law doesn't change that fast
  })
}

export function useScanForDrifts() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input?: { daysBack?: number; databases?: string[] }) => {
      const res = await fetch('/api/drift-sentry/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input ?? {}),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Scan failed' }))
        throw new Error(data.error)
      }
      return res.json() as Promise<{
        success: boolean
        alertCount: number
        alerts: CaseLawAlert[]
      }>
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: driftSentryKeys.alerts() })
    },
  })
}
