'use client'

import { useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

/**
 * Realtime subscription for kiosk check-in events.
 *
 * Rule #16: Realtime is additive, never the only channel.
 * Every check-in also creates durable activity + notification.
 * This hook provides immediate toast feedback in the Command Centre.
 *
 * Listens for INSERT events on `check_in_sessions` where status = 'completed'
 * and the contact matches the current Command Centre entity.
 */
export function useCheckinRealtime(
  tenantId: string | undefined,
  contactId: string | undefined,
  enabled: boolean = true
) {
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!tenantId || !enabled) return

    const supabase = createClient()

    // Subscribe to check_in_sessions inserts/updates for this tenant
    let channel: ReturnType<typeof supabase.channel> | null = null

    try {
      channel = supabase
        .channel(`checkin-realtime-${tenantId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'check_in_sessions',
            filter: `tenant_id=eq.${tenantId}`,
          },
          (payload) => {
            const record = payload.new as Record<string, unknown>

            // Only notify for completed check-ins
            if (record.status !== 'completed') return

            const guestName = (record.guest_name as string) ?? 'A client'

            // If we have a contactId and it matches, show specific notification
            if (contactId && record.contact_id === contactId) {
              toast.success(`${guestName} has checked in`, {
                description: 'Your client has arrived at the office.',
                duration: 10_000,
              })
            } else {
              // General check-in notification
              toast.info(`${guestName} has checked in`, {
                description: 'A client has checked in at the kiosk.',
                duration: 5_000,
              })
            }

            // Invalidate relevant queries
            queryClient.invalidateQueries({ queryKey: ['check-in-sessions'] })
            queryClient.invalidateQueries({ queryKey: ['front-desk'] })
            queryClient.invalidateQueries({ queryKey: ['activities'] })
          }
        )
        .subscribe()
    } catch (err) {
      // WebSocket may fail in insecure contexts (e.g. HTTP in dev).
      // Degrade gracefully  -  check-in events still arrive via polling.
      console.warn('[useCheckinRealtime] Subscription failed:', err)
    }

    return () => {
      if (channel) {
        supabase.removeChannel(channel)
      }
    }
  }, [tenantId, contactId, enabled, queryClient])
}
