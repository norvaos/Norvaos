import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { Database } from '@/lib/types/database'
import { toast } from 'sonner'

// ─── Query Keys ─────────────────────────────────────────────────────────────

export const matterAccessKeys = {
  all: ['matter-access'] as const,
  breakGlass: () => [...matterAccessKeys.all, 'break-glass'] as const,
  delegations: () => [...matterAccessKeys.all, 'delegations'] as const,
  supervision: () => [...matterAccessKeys.all, 'supervision'] as const,
  accessInfo: (matterId: string) => [...matterAccessKeys.all, 'info', matterId] as const,
}

// ─── Break-glass grants ─────────────────────────────────────────────────────

export function useBreakGlassGrants() {
  return useQuery({
    queryKey: matterAccessKeys.breakGlass(),
    queryFn: async () => {
      const res = await fetch('/api/admin/break-glass')
      if (!res.ok) throw new Error('Failed to fetch break-glass grants')
      const json = await res.json()
      return json.grants as Database['public']['Tables']['break_glass_access_grants']['Row'][]
    },
  })
}

export function useGrantBreakGlass() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (params: {
      grantedTo: string
      matterId: string | null
      reason: string
      expiresAt: string
    }) => {
      const res = await fetch('/api/admin/break-glass', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to grant break-glass access')
      return json
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: matterAccessKeys.breakGlass() })
      toast.success('Break-glass access granted')
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to grant break-glass access')
    },
  })
}

export function useRevokeBreakGlass() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (grantId: string) => {
      const res = await fetch(`/api/admin/break-glass?id=${grantId}`, {
        method: 'DELETE',
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to revoke break-glass access')
      return json
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: matterAccessKeys.breakGlass() })
      toast.success('Break-glass access revoked')
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to revoke break-glass access')
    },
  })
}

// ─── Delegations ────────────────────────────────────────────────────────────

export function useDelegations() {
  return useQuery({
    queryKey: matterAccessKeys.delegations(),
    queryFn: async () => {
      const res = await fetch('/api/admin/delegations')
      if (!res.ok) throw new Error('Failed to fetch delegations')
      const json = await res.json()
      return json.delegations as Database['public']['Tables']['matter_delegations']['Row'][]
    },
  })
}

export function useCreateDelegation() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (params: {
      delegateUserId: string
      matterId: string | null
      accessLevel: 'read' | 'read_write'
      reason: string | null
      expiresAt: string | null
    }) => {
      const res = await fetch('/api/admin/delegations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to create delegation')
      return json
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: matterAccessKeys.delegations() })
      toast.success('Delegation created')
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create delegation')
    },
  })
}

export function useRevokeDelegation() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (delegationId: string) => {
      const res = await fetch(`/api/admin/delegations?id=${delegationId}`, {
        method: 'DELETE',
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to revoke delegation')
      return json
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: matterAccessKeys.delegations() })
      toast.success('Delegation revoked')
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to revoke delegation')
    },
  })
}

// ─── Supervision ────────────────────────────────────────────────────────────

export function useSupervision() {
  return useQuery({
    queryKey: matterAccessKeys.supervision(),
    queryFn: async () => {
      const res = await fetch('/api/admin/supervision')
      if (!res.ok) throw new Error('Failed to fetch supervision relationships')
      const json = await res.json()
      return json.supervision as Database['public']['Tables']['user_supervision']['Row'][]
    },
  })
}

export function useAddSupervision() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (params: {
      supervisorId: string
      superviseeId: string
    }) => {
      const res = await fetch('/api/admin/supervision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to add supervision')
      return json
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: matterAccessKeys.supervision() })
      toast.success('Supervision relationship added')
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to add supervision')
    },
  })
}

export function useRemoveSupervision() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (supervisionId: string) => {
      const res = await fetch(`/api/admin/supervision?id=${supervisionId}`, {
        method: 'DELETE',
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to remove supervision')
      return json
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: matterAccessKeys.supervision() })
      toast.success('Supervision relationship removed')
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to remove supervision')
    },
  })
}

// ─── Matter Access Info ─────────────────────────────────────────────────────

export interface MatterAccessInfoResponse {
  hasAccess: boolean
  path: string
  isRestricted: boolean
  delegationId?: string
  breakGlassId?: string
  supervisorOf?: string
}

export function useMatterAccessInfo(matterId: string) {
  return useQuery({
    queryKey: matterAccessKeys.accessInfo(matterId),
    queryFn: async (): Promise<MatterAccessInfoResponse> => {
      const res = await fetch(`/api/matters/${matterId}/access`)
      if (!res.ok) throw new Error('Failed to fetch access info')
      const json = await res.json()
      return json.access as MatterAccessInfoResponse
    },
    enabled: !!matterId,
    staleTime: 1000 * 60 * 2, // 2 min — access doesn't change frequently
  })
}
