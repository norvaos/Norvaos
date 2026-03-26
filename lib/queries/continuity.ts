/**
 * Continuity & Shadow Matter Query Hooks — Directives 018 / 021 / 024
 *
 * Hooks for:
 *   - useNarrativeContext — fetch narrative context for a matter
 *   - useGaplessProof — fetch chronological proof
 *   - useAddressHistory — fetch address history for a matter
 *   - usePersonalHistory — fetch personal/employment history
 *   - useProspectTriggers — fetch active prospect triggers
 *   - useInitializeShadowMatter — mutation to create shadow matter
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

// ─── Query Keys ─────────────────────────────────────────────────────────────

export const continuityKeys = {
  narrative: (matterId: string) => ['narrative-context', matterId] as const,
  gaplessProof: (matterId: string) => ['gapless-proof', matterId] as const,
  addressHistory: (matterId: string) => ['address-history', matterId] as const,
  personalHistory: (matterId: string) => ['personal-history', matterId] as const,
  prospectTriggers: ['prospect-triggers'] as const,
}

// ─── Narrative Context ──────────────────────────────────────────────────────

export function useNarrativeContext(matterId: string | undefined) {
  return useQuery({
    queryKey: continuityKeys.narrative(matterId ?? ''),
    queryFn: async () => {
      const res = await fetch(`/api/matters/${matterId}/narrative-context`)
      if (!res.ok) throw new Error(`Failed to fetch narrative context: ${res.status}`)
      return res.json()
    },
    enabled: !!matterId,
    staleTime: 1000 * 60 * 2, // 2 min
  })
}

// ─── Gapless Proof ──────────────────────────────────────────────────────────

export function useGaplessProof(matterId: string | undefined) {
  return useQuery({
    queryKey: continuityKeys.gaplessProof(matterId ?? ''),
    queryFn: async () => {
      const res = await fetch(`/api/matters/${matterId}/gapless-proof`)
      if (!res.ok) throw new Error(`Failed to fetch gapless proof: ${res.status}`)
      return res.json()
    },
    enabled: !!matterId,
    staleTime: 1000 * 60 * 2,
  })
}

// ─── Initialize Shadow Matter ───────────────────────────────────────────────

export function useInitializeShadowMatter() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (params: {
      contactId: string
      matterTypeId: string
      sourceMatterId?: string
      triggerId?: string
    }) => {
      const res = await fetch('/api/admin/shadow-matter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `Failed to create shadow matter: ${res.status}`)
      }
      return res.json()
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: continuityKeys.prospectTriggers })
      toast.success('Norva Shadow Matter initialised — Atomic Transfer complete')
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to create shadow matter')
    },
  })
}
