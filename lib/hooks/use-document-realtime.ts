'use client'

import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

/**
 * Subscribes to real-time document status changes for a specific matter.
 *
 * Directive 012: "Single Tab" Persistence — when a client uploads via
 * Kiosk or Portal, the lawyer's dashboard updates instantly without refresh.
 *
 * Invalidates:
 *   - Document list caches (matter-scoped + global)
 *   - Document slot caches (for readiness tracking)
 *   - Readiness score caches
 *   - Dashboard stats (so counts update live)
 */
export function useDocumentRealtime(matterId: string | undefined) {
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!matterId) return

    const supabase = createClient()
    const channelName = `documents:${matterId}`

    const channel = supabase
      .channel(channelName)
      .on('broadcast', { event: 'document_status_changed' }, () => {
        // Invalidate document queries so the UI auto-refreshes
        queryClient.invalidateQueries({ queryKey: ['documents', matterId] })
        queryClient.invalidateQueries({ queryKey: ['documents', 'matter', matterId] })
        queryClient.invalidateQueries({ queryKey: ['matter-documents', matterId] })

        // Directive 012: Also invalidate slot + readiness caches
        queryClient.invalidateQueries({ queryKey: ['document-slots', matterId] })
        queryClient.invalidateQueries({ queryKey: ['readiness', matterId] })

        // Invalidate dashboard stats so matter document counts update
        queryClient.invalidateQueries({ queryKey: ['matters', 'detail', matterId] })
        queryClient.invalidateQueries({ queryKey: ['matter-dashboard', 'core', matterId] })

        // Directive 016: Invalidate genesis block cache so Chain-Lock button reflects changes
        queryClient.invalidateQueries({ queryKey: ['genesis-block', matterId] })
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [matterId, queryClient])
}

/**
 * Dashboard-level realtime hook — listens for document changes across
 * ALL matters. Used on the main dashboard to update stats/widgets
 * when any document is uploaded tenant-wide.
 *
 * Directive 012: Zero "waiting for the page to load" distraction.
 */
export function useDashboardDocumentRealtime(tenantId: string | undefined) {
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!tenantId) return

    const supabase = createClient()

    // Listen for postgres_changes on the documents table for this tenant
    const channel = supabase
      .channel(`dashboard-docs:${tenantId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'documents',
          filter: `tenant_id=eq.${tenantId}`,
        },
        () => {
          // Refresh dashboard-level document stats
          queryClient.invalidateQueries({ queryKey: ['documents'] })
          queryClient.invalidateQueries({ queryKey: ['documents', 'stats', tenantId] })
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [tenantId, queryClient])
}
