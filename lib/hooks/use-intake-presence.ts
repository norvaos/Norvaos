'use client'

/**
 * useIntakePresence  -  Supabase Realtime presence hook for intake monitoring.
 *
 * Staff-side: subscribes to the intake:{matterId} channel to detect
 * when a client is actively editing their intake forms.
 *
 * Returns: { clientOnline, lastFieldEdited, clientTyping }
 */

import { useEffect, useState, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

interface ClientPresence {
  user_type: 'client'
  contact_id: string
  online_at: string
  last_field: string | null
  typing?: boolean
}

interface VerificationEvent {
  action: 'verify' | 'reject'
  targets: Array<{ type: 'field' | 'document'; id: string }>
  verification_status: string
  user_id: string
  timestamp: string
}

interface IntakePresenceState {
  /** Whether any client is currently online in the intake portal */
  clientOnline: boolean
  /** The last field the client edited (profile_path) */
  lastFieldEdited: string | null
  /** Whether the client is actively typing (within last 5 seconds) */
  clientTyping: boolean
  /** Contact ID of the connected client */
  clientContactId: string | null
  /** When the client came online */
  clientOnlineSince: string | null
  /** Most recent verification event broadcast (verify or reject) */
  lastVerificationEvent: VerificationEvent | null
}

export function useIntakePresence(matterId: string | null): IntakePresenceState {
  const [state, setState] = useState<IntakePresenceState>({
    clientOnline: false,
    lastFieldEdited: null,
    clientTyping: false,
    clientContactId: null,
    clientOnlineSince: null,
    lastVerificationEvent: null,
  })

  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handlePresenceSync = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (presenceState: Record<string, any[]>) => {
      // Find any client presence
      let foundClient: ClientPresence | null = null

      for (const presences of Object.values(presenceState)) {
        for (const p of presences) {
          if (p.user_type === 'client') {
            foundClient = p as ClientPresence
            break
          }
        }
        if (foundClient) break
      }

      if (foundClient) {
        setState((prev) => ({
          ...prev,
          clientOnline: true,
          lastFieldEdited: foundClient!.last_field ?? prev.lastFieldEdited,
          clientTyping: foundClient!.typing ?? false,
          clientContactId: foundClient!.contact_id,
          clientOnlineSince: foundClient!.online_at,
        }))

        // Auto-clear typing after 5 seconds
        if (foundClient.typing) {
          if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
          typingTimeoutRef.current = setTimeout(() => {
            setState((prev) => ({ ...prev, clientTyping: false }))
          }, 5000)
        }
      } else {
        setState((prev) => ({
          clientOnline: false,
          lastFieldEdited: null,
          clientTyping: false,
          clientContactId: null,
          clientOnlineSince: null,
          lastVerificationEvent: prev.lastVerificationEvent,
        }))
      }
    },
    [],
  )

  useEffect(() => {
    if (!matterId) return

    const supabase = createClient()
    const channel = supabase.channel(`intake:${matterId}`, {
      config: { presence: { key: 'staff' } },
    })

    channel
      .on('presence', { event: 'sync' }, () => {
        handlePresenceSync(channel.presenceState())
      })
      .on('broadcast', { event: 'verification_update' }, (payload) => {
        const event = payload.payload as VerificationEvent
        setState((prev) => ({ ...prev, lastVerificationEvent: event }))
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({
            user_type: 'staff',
            online_at: new Date().toISOString(),
          })
        }
      })

    return () => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
      channel.unsubscribe()
    }
  }, [matterId, handlePresenceSync])

  return state
}
