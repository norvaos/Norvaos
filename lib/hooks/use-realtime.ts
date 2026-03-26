'use client'

import { useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js'

interface UseRealtimeOptions<T extends Record<string, unknown>> {
  table: string
  schema?: string
  event?: 'INSERT' | 'UPDATE' | 'DELETE' | '*'
  filter?: string
  onInsert?: (payload: T) => void
  onUpdate?: (payload: { old: T; new: T }) => void
  onDelete?: (payload: T) => void
  onChange?: (payload: RealtimePostgresChangesPayload<T>) => void
  enabled?: boolean
}

/**
 * useRealtime  -  Supabase Realtime subscription hook.
 *
 * Key design choices:
 *  1. Callbacks (onInsert/onUpdate/onDelete/onChange) are stored in refs so
 *     they NEVER appear in the useEffect deps array. This prevents the
 *     subscription from tearing down and recreating every render (which was
 *     causing notifications to be missed because the channel was killed before
 *     the INSERT event arrived).
 *  2. The channel name includes the filter string to avoid collisions when
 *     multiple components subscribe to the same table with different filters.
 *  3. Only `table`, `schema`, `event`, `filter`, and `enabled` control
 *     whether the channel is recreated.
 */
export function useRealtime<T extends Record<string, unknown>>({
  table,
  schema = 'public',
  event = '*',
  filter,
  onInsert,
  onUpdate,
  onDelete,
  onChange,
  enabled = true,
}: UseRealtimeOptions<T>) {
  const channelRef = useRef<RealtimeChannel | null>(null)

  // Store callbacks in refs so the subscription never restarts due to a new
  // function reference being passed from the parent component.
  const onInsertRef  = useRef(onInsert)
  const onUpdateRef  = useRef(onUpdate)
  const onDeleteRef  = useRef(onDelete)
  const onChangeRef  = useRef(onChange)

  // Keep refs up-to-date on every render  -  this is safe because the effect
  // only reads from them inside the callback (not during subscription setup).
  onInsertRef.current  = onInsert
  onUpdateRef.current  = onUpdate
  onDeleteRef.current  = onDelete
  onChangeRef.current  = onChange

  useEffect(() => {
    if (!enabled) return

    const supabase = createClient()

    const channelConfig: Record<string, string> = {
      event,
      schema,
      table,
    }
    if (filter) {
      channelConfig.filter = filter
    }

    // Unique channel name: include filter so multiple subscribers on the same
    // table with different filters don't collide.
    const channelName = `${schema}:${table}:${event}:${filter ?? 'all'}`

    let channel: RealtimeChannel | null = null

    try {
      channel = supabase
        .channel(channelName)
        .on(
          'postgres_changes' as never,
          channelConfig,
          (payload: RealtimePostgresChangesPayload<T>) => {
            // Read from refs  -  always latest callback, no stale closures
            onChangeRef.current?.(payload)

            if (payload.eventType === 'INSERT' && onInsertRef.current) {
              onInsertRef.current(payload.new as T)
            }
            if (payload.eventType === 'UPDATE' && onUpdateRef.current) {
              onUpdateRef.current({ old: payload.old as T, new: payload.new as T })
            }
            if (payload.eventType === 'DELETE' && onDeleteRef.current) {
              onDeleteRef.current(payload.old as T)
            }
          }
        )
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            // Channel is live  -  any INSERT events will now fire
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            console.warn(`[useRealtime] Channel ${channelName} error: ${status}`)
          }
        })

      channelRef.current = channel
    } catch (err) {
      // WebSocket may fail in insecure contexts or when the browser blocks
      // the connection. Degrade gracefully.
      console.warn('[useRealtime] Subscription failed, real-time disabled:', err)
    }

    return () => {
      if (channel) {
        supabase.removeChannel(channel)
        channelRef.current = null
      }
    }
    // Callbacks intentionally excluded  -  stored in refs above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table, schema, event, filter, enabled])

  return channelRef.current
}
