'use client'

/**
 * useVerificationRealtime — Listens for verification_update broadcasts
 * on the intake:{matterId} Supabase Realtime channel.
 *
 * When a lawyer verifies or rejects a field/document, the verify API endpoint
 * broadcasts an event. This hook receives it and invalidates the relevant
 * TanStack Query caches so the UI updates without a page refresh.
 *
 * Used by both:
 *   - Dashboard (staff sees verification changes from other staff)
 *   - Client Portal (client sees fields lock/unlock in real time)
 */

import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { fieldVerificationKeys } from '@/lib/queries/field-verifications'

interface VerificationBroadcast {
  action: 'verify' | 'reject'
  targets: Array<{ type: 'field' | 'document'; id: string }>
  verification_status: string
  user_id: string
  timestamp: string
}

export function useVerificationRealtime(
  matterId: string | null,
  options?: {
    /** Called when a verification update is received. */
    onUpdate?: (payload: VerificationBroadcast) => void
  },
) {
  const qc = useQueryClient()
  const onUpdateRef = useRef(options?.onUpdate)
  onUpdateRef.current = options?.onUpdate

  useEffect(() => {
    if (!matterId) return

    const supabase = createClient()
    const channel = supabase.channel(`intake:${matterId}`)

    channel
      .on('broadcast', { event: 'verification_update' }, (payload) => {
        const data = payload.payload as VerificationBroadcast

        // Invalidate field verifications cache
        qc.invalidateQueries({
          queryKey: fieldVerificationKeys.matter(matterId),
        })

        // Invalidate document slots if any document targets were affected
        const hasDocTargets = data.targets.some((t) => t.type === 'document')
        if (hasDocTargets) {
          // Portal document components typically use a portal-specific query key;
          // invalidate broadly to catch any document slot queries for this matter.
          qc.invalidateQueries({
            predicate: (query) => {
              const key = query.queryKey
              return (
                Array.isArray(key) &&
                key.some((k) => typeof k === 'string' && k.includes('document'))
              )
            },
          })
        }

        // Notify the consumer
        onUpdateRef.current?.(data)
      })
      .subscribe()

    return () => {
      channel.unsubscribe()
    }
  }, [matterId, qc])
}
