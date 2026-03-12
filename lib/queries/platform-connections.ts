import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

// ─── Query Keys ──────────────────────────────────────────────────────────────

export const connectionKeys = {
  all: ['platform-connections'] as const,
  ghl: (tenantId: string) => [...connectionKeys.all, 'ghl', tenantId] as const,
  clio: (tenantId: string) => [...connectionKeys.all, 'clio', tenantId] as const,
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface PlatformConnection {
  id: string
  platformUserId: string | null
  platformUserName: string | null
  locationId: string | null
  isActive: boolean
  errorCount: number
  lastError: string | null
  createdAt: string
}

// ─── GHL Connection ──────────────────────────────────────────────────────────

export function useGhlConnection(tenantId: string) {
  return useQuery({
    queryKey: connectionKeys.ghl(tenantId),
    queryFn: async (): Promise<PlatformConnection | null> => {
      const res = await fetch('/api/integrations/ghl/status')
      if (!res.ok) throw new Error('Failed to fetch GHL status')
      const json = await res.json()
      if (!json.data) return null
      return {
        id: json.data.id,
        platformUserId: json.data.platform_user_id,
        platformUserName: json.data.platform_user_name,
        locationId: json.data.location_id,
        isActive: json.data.is_active,
        errorCount: json.data.error_count,
        lastError: json.data.last_error,
        createdAt: json.data.created_at,
      }
    },
    enabled: !!tenantId,
    staleTime: 1000 * 60,
  })
}

export function useDisconnectGhl() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/integrations/ghl/disconnect', { method: 'POST' })
      if (!res.ok) throw new Error('Failed to disconnect GHL')
      return res.json()
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: connectionKeys.all })
      toast.success('Go High Level disconnected.')
    },
    onError: (err: Error) => {
      toast.error(err.message)
    },
  })
}

// ─── Clio Connection ─────────────────────────────────────────────────────────

export function useClioConnection(tenantId: string) {
  return useQuery({
    queryKey: connectionKeys.clio(tenantId),
    queryFn: async (): Promise<PlatformConnection | null> => {
      const res = await fetch('/api/integrations/clio/status')
      if (!res.ok) throw new Error('Failed to fetch Clio status')
      const json = await res.json()
      if (!json.data) return null
      return {
        id: json.data.id,
        platformUserId: json.data.platform_user_id,
        platformUserName: json.data.platform_user_name,
        locationId: null,
        isActive: json.data.is_active,
        errorCount: json.data.error_count,
        lastError: json.data.last_error,
        createdAt: json.data.created_at,
      }
    },
    enabled: !!tenantId,
    staleTime: 1000 * 60,
  })
}

export function useDisconnectClio() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/integrations/clio/disconnect', { method: 'POST' })
      if (!res.ok) throw new Error('Failed to disconnect Clio')
      return res.json()
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: connectionKeys.all })
      toast.success('Clio disconnected.')
    },
    onError: (err: Error) => {
      toast.error(err.message)
    },
  })
}
