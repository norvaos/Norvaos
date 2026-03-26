/**
 * Ignite Ritual  -  TanStack Query Hooks  (Directive 051)
 *
 * Provides:
 *   useIgniteMatter   -  mutation that POSTs to /api/matters/[id]/ignite
 *   useIgniteChecklist -  query that fetches Guardian Gate verification checks
 *
 * Invalidates ['matters'] and ['readiness'] on successful ignition so the
 * matter list and readiness gauge refresh immediately.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { compositeReadinessKeys } from '@/lib/queries/readiness'

// ─── Query Keys ─────────────────────────────────────────────────────────────

export const igniteKeys = {
  all: ['ignite'] as const,
  checklist: (matterId: string) => ['ignite', 'checklist', matterId] as const,
}

// ─── Types ──────────────────────────────────────────────────────────────────

export interface IgniteCheckItem {
  key: 'identity' | 'financials' | 'mandatory_fields'
  label: string
  passed: boolean
  detail: string
}

export interface IgniteChecklistResult {
  checks: IgniteCheckItem[]
  allPassed: boolean
  forensicHash: string
}

export interface IgniteResult {
  success: boolean
  ignitedAt: string
}

// ─── useIgniteChecklist ─────────────────────────────────────────────────────

/**
 * Fetches the Guardian Gate verification checklist for a matter.
 * Returns identity, financial, and mandatory-field checks plus the forensic hash.
 */
export function useIgniteChecklist(matterId: string) {
  return useQuery({
    queryKey: igniteKeys.checklist(matterId),
    queryFn: async (): Promise<IgniteChecklistResult> => {
      const res = await fetch(`/api/matters/${matterId}/ignite?checklist=true`)

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(
          (body as { error?: string }).error ?? 'Failed to fetch ignite checklist',
        )
      }

      return res.json() as Promise<IgniteChecklistResult>
    },
    enabled: !!matterId,
    staleTime: 1000 * 15, // 15 s  -  stays fresh while modal is open
  })
}

// ─── useIgniteMatter ────────────────────────────────────────────────────────

/**
 * Mutation that fires the Ignite Ritual.
 * On success, invalidates matters and readiness caches.
 */
export function useIgniteMatter(matterId: string) {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (): Promise<IgniteResult> => {
      const res = await fetch(`/api/matters/${matterId}/ignite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(
          (body as { error?: string }).error ?? `Ignite failed (${res.status})`,
        )
      }

      return res.json() as Promise<IgniteResult>
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['matters'] })
      qc.invalidateQueries({ queryKey: compositeReadinessKeys.all })
      qc.invalidateQueries({ queryKey: igniteKeys.checklist(matterId) })
      toast.success('Matter ignited  -  the Fortress has recorded this submission')
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Ignite ritual failed')
    },
  })
}
