'use client'

import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'

/**
 * Cross-Tab Sync via BroadcastChannel.
 *
 * When a mutation (matter update, stage change, etc.) succeeds in one tab,
 * it broadcasts a lightweight message to all other tabs. Those tabs then
 * invalidate the relevant TanStack Query caches, causing an automatic
 * refetch — no manual refresh needed.
 *
 * Usage: call `useCrossTabSync()` once in the root provider.
 * Call `broadcastMutation(type, payload)` from any mutation's onSuccess.
 */

const CHANNEL_NAME = 'norvaos-sync'

export type SyncMessageType =
  | 'matter:updated'
  | 'matter:created'
  | 'matter:deleted'
  | 'matter:stage-advanced'
  | 'contact:updated'
  | 'trust:updated'
  | 'task:updated'
  | 'document:uploaded'

interface SyncMessage {
  type: SyncMessageType
  matterId?: string
  contactId?: string
  timestamp: number
  /** Tab ID that sent the message — used to skip self-echo */
  senderId: string
}

// Stable tab ID for the lifetime of this tab
const TAB_ID = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
  ? crypto.randomUUID()
  : Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2)

let channel: BroadcastChannel | null = null

function getChannel(): BroadcastChannel | null {
  if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') return null
  if (!channel) {
    channel = new BroadcastChannel(CHANNEL_NAME)
  }
  return channel
}

/**
 * Broadcast a mutation event to other tabs.
 * Call this from onSuccess of any mutation.
 */
export function broadcastMutation(
  type: SyncMessageType,
  payload?: { matterId?: string; contactId?: string }
) {
  const ch = getChannel()
  if (!ch) return
  const msg: SyncMessage = {
    type,
    matterId: payload?.matterId,
    contactId: payload?.contactId,
    timestamp: Date.now(),
    senderId: TAB_ID,
  }
  try {
    ch.postMessage(msg)
  } catch {
    // Channel may be closed — ignore
  }
}

/**
 * Hook: listens for cross-tab sync messages and invalidates relevant caches.
 * Mount once in the app root (e.g. inside Providers).
 */
export function useCrossTabSync() {
  const queryClient = useQueryClient()
  const listenerRef = useRef(false)

  useEffect(() => {
    if (listenerRef.current) return
    const ch = getChannel()
    if (!ch) return
    listenerRef.current = true

    function handleMessage(event: MessageEvent<SyncMessage>) {
      const msg = event.data
      // Skip messages from this same tab
      if (msg.senderId === TAB_ID) return

      switch (msg.type) {
        case 'matter:updated':
        case 'matter:created':
        case 'matter:deleted':
          // Invalidate matter list + detail caches
          queryClient.invalidateQueries({ queryKey: ['matters'] })
          if (msg.matterId) {
            queryClient.invalidateQueries({ queryKey: ['matters', 'detail', msg.matterId] })
            queryClient.invalidateQueries({ queryKey: ['matter-dashboard', 'core', msg.matterId] })
          }
          break

        case 'matter:stage-advanced':
          queryClient.invalidateQueries({ queryKey: ['matters'] })
          if (msg.matterId) {
            queryClient.invalidateQueries({ queryKey: ['matters', 'detail', msg.matterId] })
            queryClient.invalidateQueries({ queryKey: ['matter-dashboard', 'core', msg.matterId] })
            queryClient.invalidateQueries({ queryKey: ['matter_stage_state', msg.matterId] })
            queryClient.invalidateQueries({ queryKey: ['gating', 'check', msg.matterId] })
            queryClient.invalidateQueries({ queryKey: ['activities'] })
          }
          break

        case 'contact:updated':
          queryClient.invalidateQueries({ queryKey: ['contacts'] })
          if (msg.contactId) {
            queryClient.invalidateQueries({ queryKey: ['contacts', msg.contactId] })
          }
          if (msg.matterId) {
            queryClient.invalidateQueries({ queryKey: ['matter-dashboard', 'contact', msg.matterId] })
          }
          break

        case 'trust:updated':
          if (msg.matterId) {
            queryClient.invalidateQueries({ queryKey: ['matter-dashboard', 'trust', msg.matterId] })
          }
          queryClient.invalidateQueries({ queryKey: ['trust_transactions'] })
          break

        case 'task:updated':
          queryClient.invalidateQueries({ queryKey: ['tasks'] })
          break

        case 'document:uploaded':
          queryClient.invalidateQueries({ queryKey: ['documents'] })
          if (msg.matterId) {
            queryClient.invalidateQueries({ queryKey: ['documents', 'matter', msg.matterId] })
            queryClient.invalidateQueries({ queryKey: ['document-slots', msg.matterId] })
            queryClient.invalidateQueries({ queryKey: ['readiness', msg.matterId] })
            queryClient.invalidateQueries({ queryKey: ['matter-dashboard', 'core', msg.matterId] })
          }
          break
      }
    }

    ch.addEventListener('message', handleMessage)

    return () => {
      ch.removeEventListener('message', handleMessage)
      listenerRef.current = false
    }
  }, [queryClient])
}
