'use client'

/**
 * useMatterPresence — Supabase Realtime Presence for matter-level viewer tracking.
 *
 * Tracks which users are currently viewing a specific matter. Each user's
 * presence includes their name, avatar, and tenant_id. The hook filters
 * presence by tenant to enforce SENTINEL boundaries — one tenant never
 * sees another's presence.
 *
 * Channel: `matter:{matterId}`
 * Presence key: user's DB id (ensures one entry per user per matter)
 */

import { useEffect, useState, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { RealtimeChannel } from '@supabase/supabase-js'

// ── Types ──────────────────────────────────────────────────────────────────────

export interface MatterPresenceUser {
  userId: string
  firstName: string | null
  lastName: string | null
  email: string
  avatarUrl: string | null
  tenantId: string
  onlineSince: string
}

interface MatterPresenceState {
  /** All users currently viewing this matter (same tenant only) */
  viewers: MatterPresenceUser[]
  /** Whether the channel is connected */
  isConnected: boolean
  /** The Realtime channel (for advanced use / field lock integration) */
  channel: RealtimeChannel | null
}

interface UseMatterPresenceOptions {
  matterId: string | null
  userId: string | null
  tenantId: string | null
  firstName: string | null
  lastName: string | null
  email: string | null
  avatarUrl: string | null
  enabled?: boolean
}

// ── Hook ───────────────────────────────────────────────────────────────────────

export function useMatterPresence({
  matterId,
  userId,
  tenantId,
  firstName,
  lastName,
  email,
  avatarUrl,
  enabled = true,
}: UseMatterPresenceOptions): MatterPresenceState {
  const [viewers, setViewers] = useState<MatterPresenceUser[]>([])
  const [isConnected, setIsConnected] = useState(false)
  const channelRef = useRef<RealtimeChannel | null>(null)

  const handlePresenceSync = useCallback(
    (presenceState: Record<string, { userId: string; tenantId: string; firstName: string | null; lastName: string | null; email: string; avatarUrl: string | null; onlineSince: string }[]>) => {
      if (!tenantId) return

      const allUsers: MatterPresenceUser[] = []
      const seenIds = new Set<string>()

      for (const presences of Object.values(presenceState)) {
        for (const p of presences) {
          // SENTINEL boundary: only show users from the same tenant
          if (p.tenantId !== tenantId) continue
          // Deduplicate (a user might appear in multiple presence entries)
          if (seenIds.has(p.userId)) continue
          seenIds.add(p.userId)

          allUsers.push({
            userId: p.userId,
            firstName: p.firstName,
            lastName: p.lastName,
            email: p.email,
            avatarUrl: p.avatarUrl,
            tenantId: p.tenantId,
            onlineSince: p.onlineSince,
          })
        }
      }

      setViewers(allUsers)
    },
    [tenantId],
  )

  useEffect(() => {
    if (!enabled || !matterId || !userId || !tenantId || !email) return

    let channel: RealtimeChannel | null = null

    try {
      const supabase = createClient()
      channel = supabase.channel(`matter:${matterId}`, {
        config: { presence: { key: userId } },
      })

      channel
        .on('presence', { event: 'sync' }, () => {
          handlePresenceSync(channel!.presenceState() as Record<string, MatterPresenceUser[]>)
        })
        .subscribe(async (status) => {
          if (status === 'SUBSCRIBED') {
            setIsConnected(true)
            // Track this user's presence
            await channel!.track({
              userId,
              tenantId,
              firstName,
              lastName,
              email,
              avatarUrl,
              onlineSince: new Date().toISOString(),
            })
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            setIsConnected(false)
            console.warn(`[useMatterPresence] Channel error for matter:${matterId}: ${status}`)
          }
        })

      channelRef.current = channel
    } catch (err) {
      console.warn('[useMatterPresence] Subscription failed:', err)
    }

    return () => {
      if (channel) {
        channel.unsubscribe()
        channelRef.current = null
        setIsConnected(false)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matterId, userId, tenantId, enabled])

  return { viewers, isConnected, channel: channelRef.current }
}
