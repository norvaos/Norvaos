/**
 * Compliance Override Query Hooks  -  Directive 026
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

export const overrideKeys = {
  matter: (matterId: string) => ['compliance-overrides', matterId] as const,
}

export function useComplianceOverrides(matterId: string | undefined) {
  return useQuery({
    queryKey: overrideKeys.matter(matterId ?? ''),
    queryFn: async () => {
      const res = await fetch(`/api/matters/${matterId}/compliance-override`)
      if (!res.ok) throw new Error('Failed to fetch overrides')
      return res.json()
    },
    enabled: !!matterId,
    staleTime: 1000 * 60 * 2,
  })
}

export function useLogComplianceOverride() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (params: {
      matterId: string
      overrideType: string
      blockedNode: string
      originalStatus: string
      justification: string
      partnerPin: string
    }) => {
      const res = await fetch(`/api/matters/${params.matterId}/compliance-override`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          overrideType: params.overrideType,
          blockedNode: params.blockedNode,
          originalStatus: params.originalStatus,
          justification: params.justification,
          partnerPin: params.partnerPin,
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `Override failed: ${res.status}`)
      }
      return res.json()
    },
    onSuccess: (_data, params) => {
      qc.invalidateQueries({ queryKey: overrideKeys.matter(params.matterId) })
      toast.success('Norva Compliance Override logged  -  Genesis amendment recorded')
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to log override')
    },
  })
}

export function useRevokeOverride() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (params: { matterId: string; overrideId: string; reason: string }) => {
      const res = await fetch(`/api/matters/${params.matterId}/compliance-override`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ overrideId: params.overrideId, reason: params.reason }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `Revocation failed: ${res.status}`)
      }
      return res.json()
    },
    onSuccess: (_data, params) => {
      qc.invalidateQueries({ queryKey: overrideKeys.matter(params.matterId) })
      toast.success('Override revoked')
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to revoke override')
    },
  })
}
