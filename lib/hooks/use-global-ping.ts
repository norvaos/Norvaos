'use client'

/**
 * useGlobalPing — Notification toasts for system-wide events.
 *
 * Subscribes to a tenant-scoped Supabase Realtime channel and fires
 * toast notifications when COMMAND or TITAN events occur:
 *
 * COMMAND events (user actions visible to the team):
 *  - client_upload     → "New document uploaded by {contact} on {matter}"
 *  - matter_created    → "New matter created: {title}"
 *  - status_changed    → "{matter} status changed to {status}"
 *  - intake_submitted  → "Intake submitted for {matter}"
 *
 * TITAN events (system-generated):
 *  - auto_fee          → "Auto-fee generated: ${amount} on {matter}"
 *  - deadline_warning  → "Deadline approaching: {matter} — {deadline}"
 *  - stage_advanced    → "{matter} advanced to {stage}"
 *
 * Channel: `tenant:{tenantId}:pings`
 * SENTINEL: channel is scoped to tenant_id — no cross-tenant leaks.
 */

import { useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import type { RealtimeChannel } from '@supabase/supabase-js'

// ── Types ──────────────────────────────────────────────────────────────────────

export type PingEventType =
  | 'client_upload'
  | 'matter_created'
  | 'status_changed'
  | 'intake_submitted'
  | 'auto_fee'
  | 'deadline_warning'
  | 'stage_advanced'

export interface PingPayload {
  event: PingEventType
  title: string
  description?: string
  matterId?: string
  matterTitle?: string
  /** The user who triggered the event (null for TITAN events) */
  triggeredBy?: string
  /** ISO timestamp */
  timestamp: string
}

interface UseGlobalPingOptions {
  tenantId: string | null
  /** Current user's DB id — used to suppress self-triggered pings */
  userId: string | null
  enabled?: boolean
}

// ── Event → Toast mapping ──────────────────────────────────────────────────────

function pingToToast(payload: PingPayload) {
  const isTitan = ['auto_fee', 'deadline_warning', 'stage_advanced'].includes(payload.event)

  if (payload.event === 'deadline_warning') {
    toast.warning(payload.title, { description: payload.description, duration: 8000 })
  } else if (isTitan) {
    toast.info(payload.title, { description: payload.description, duration: 6000 })
  } else {
    toast(payload.title, { description: payload.description, duration: 5000 })
  }
}

// ── Hook ───────────────────────────────────────────────────────────────────────

export function useGlobalPing({ tenantId, userId, enabled = true }: UseGlobalPingOptions) {
  const channelRef = useRef<RealtimeChannel | null>(null)

  useEffect(() => {
    if (!enabled || !tenantId || !userId) return

    let channel: RealtimeChannel | null = null

    try {
      const supabase = createClient()
      channel = supabase.channel(`tenant:${tenantId}:pings`)

      channel
        .on('broadcast', { event: 'ping' }, (msg) => {
          const payload = msg.payload as PingPayload

          // Don't toast for events the current user triggered
          if (payload.triggeredBy === userId) return

          pingToToast(payload)
        })
        .subscribe((status) => {
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            console.warn(`[useGlobalPing] Channel error for tenant:${tenantId}:pings: ${status}`)
          }
        })

      channelRef.current = channel
    } catch (err) {
      console.warn('[useGlobalPing] Subscription failed:', err)
    }

    return () => {
      if (channel) {
        channel.unsubscribe()
        channelRef.current = null
      }
    }
  }, [tenantId, userId, enabled])

  return channelRef.current
}

// ── Broadcast helper (call from mutations) ─────────────────────────────────────

/**
 * Send a ping to all users in the tenant.
 * Call this from mutation onSuccess handlers.
 *
 * @example
 * onSuccess: () => {
 *   broadcastPing(tenantId, {
 *     event: 'status_changed',
 *     title: 'Status Updated',
 *     description: `${matterTitle} changed to ${newStatus}`,
 *     matterId,
 *     matterTitle,
 *     triggeredBy: userId,
 *     timestamp: new Date().toISOString(),
 *   })
 * }
 */
export function broadcastPing(tenantId: string, payload: PingPayload) {
  try {
    const supabase = createClient()
    const channel = supabase.channel(`tenant:${tenantId}:pings`)

    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        channel.send({ type: 'broadcast', event: 'ping', payload })
        // Unsubscribe after sending — this is a fire-and-forget
        setTimeout(() => channel.unsubscribe(), 500)
      }
    })
  } catch (err) {
    console.warn('[broadcastPing] Failed to send ping:', err)
  }
}
