'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

// ─── Query Key Factory ───────────────────────────────────────────────────────

export const microsoftKeys = {
  all: ['microsoft'] as const,
  connection: (userId: string) => [...microsoftKeys.all, 'connection', userId] as const,
  syncHistory: (userId: string) => [...microsoftKeys.all, 'sync-history', userId] as const,
  onedrive: (userId: string, path?: string) =>
    [...microsoftKeys.all, 'onedrive', userId, path ?? 'root'] as const,
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface MicrosoftConnectionStatus {
  id: string
  microsoft_email: string
  microsoft_display_name: string | null
  calendar_sync_enabled: boolean
  tasks_sync_enabled: boolean
  onedrive_enabled: boolean
  last_calendar_sync_at: string | null
  last_tasks_sync_at: string | null
  is_active: boolean
  error_count: number
  last_error: string | null
  created_at: string
}

export interface SyncHistoryEntry {
  id: string
  sync_type: string
  direction: string
  status: string
  items_created: number
  items_updated: number
  items_deleted: number
  error_message: string | null
  started_at: string
  completed_at: string | null
}

export interface OneDriveItem {
  id: string
  name: string
  size: number | null
  mimeType: string | null
  webUrl: string
  isFolder: boolean
  lastModifiedDateTime: string
  createdBy: { displayName: string } | null
}

// ─── Connection Status ───────────────────────────────────────────────────────

export function useMicrosoftConnection(userId: string) {
  return useQuery({
    queryKey: microsoftKeys.connection(userId),
    queryFn: async () => {
      const res = await fetch('/api/integrations/microsoft/status')
      if (!res.ok) throw new Error('Failed to fetch connection status')
      const { data } = await res.json()
      return data as MicrosoftConnectionStatus | null
    },
    enabled: !!userId,
    staleTime: 1000 * 60 * 5,
  })
}

// ─── Disconnect ──────────────────────────────────────────────────────────────

export function useDisconnectMicrosoft() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/integrations/microsoft/disconnect', { method: 'POST' })
      if (!res.ok) throw new Error('Failed to disconnect')
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: microsoftKeys.all })
      toast.success('Microsoft account disconnected')
    },
    onError: () => toast.error('Failed to disconnect Microsoft account'),
  })
}

// ─── Update Sync Settings ────────────────────────────────────────────────────

export function useUpdateMicrosoftSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (settings: {
      calendar_sync_enabled?: boolean
      tasks_sync_enabled?: boolean
      onedrive_enabled?: boolean
    }) => {
      const res = await fetch('/api/integrations/microsoft/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      })
      if (!res.ok) throw new Error('Failed to update settings')
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: microsoftKeys.all })
      toast.success('Sync settings updated')
    },
    onError: () => toast.error('Failed to update sync settings'),
  })
}

// ─── Trigger Manual Sync ─────────────────────────────────────────────────────

export function useTriggerSync() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (syncType: 'calendar' | 'tasks' | 'all') => {
      const res = await fetch('/api/integrations/microsoft/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sync_type: syncType }),
      })
      if (!res.ok) throw new Error('Sync failed')
      return res.json()
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: microsoftKeys.all })
      qc.invalidateQueries({ queryKey: ['calendar'] })
      qc.invalidateQueries({ queryKey: ['calendar-events'] })
      qc.invalidateQueries({ queryKey: ['tasks'] })
      toast.success(`Sync completed: ${data.created} created, ${data.updated} updated`)
    },
    onError: () => toast.error('Sync failed. Please try again.'),
  })
}

// ─── Sync History ────────────────────────────────────────────────────────────

export function useSyncHistory(userId: string) {
  return useQuery({
    queryKey: microsoftKeys.syncHistory(userId),
    queryFn: async () => {
      const res = await fetch('/api/integrations/microsoft/sync-history')
      if (!res.ok) throw new Error('Failed to fetch sync history')
      const { data } = await res.json()
      return data as SyncHistoryEntry[]
    },
    enabled: !!userId,
  })
}

// ─── Sync Matter Folders to OneDrive ─────────────────────────────────────────

export function useSyncMatterOneDrive(matterId: string) {
  return useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/matters/${matterId}/sync-onedrive`, {
        method: 'POST',
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Sync failed')
      return data as { folderPath: string }
    },
    onSuccess: (data) => {
      toast.success(`OneDrive folders synced — ${data.folderPath}`)
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to sync OneDrive folders')
    },
  })
}

// ─── OneDrive Browse ─────────────────────────────────────────────────────────

export function useOneDriveBrowse(userId: string, path?: string, enabled = true) {
  return useQuery({
    queryKey: microsoftKeys.onedrive(userId, path),
    queryFn: async () => {
      const params = new URLSearchParams()
      if (path) params.set('path', path)
      const res = await fetch(`/api/integrations/microsoft/onedrive/browse?${params}`)
      if (!res.ok) throw new Error('Failed to browse OneDrive')
      const { data } = await res.json()
      return data as OneDriveItem[]
    },
    enabled: !!userId && enabled,
  })
}

// ─── Link OneDrive File ─────────────────────────────────────────────────────

export function useLinkOneDriveFile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (params: {
      oneDriveItemId: string
      matterId?: string
      contactId?: string
      category?: string
    }) => {
      const res = await fetch('/api/integrations/microsoft/onedrive/link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      })
      if (!res.ok) throw new Error('Failed to link file')
      return res.json()
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['documents'] })
      toast.success('OneDrive file linked')
    },
    onError: () => toast.error('Failed to link OneDrive file'),
  })
}
