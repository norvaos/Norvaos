/**
 * useGhostWriterTrigger  -  Automatically triggers Ghost-Writer draft generation
 * when a new inbound email arrives on a matter-associated thread.
 *
 * Listens to Supabase Realtime inserts on `email_messages` and fires the
 * Ghost-Writer API for inbound messages on threads associated to the current matter.
 */

import { useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useGenerateGhostDraft } from '@/lib/queries/ghost-writer'

interface UseGhostWriterTriggerOptions {
  /** The current matter ID being viewed */
  matterId: string
  /** Tenant ID for Realtime channel scoping */
  tenantId: string
  /** Whether the trigger is enabled (disable when not viewing email tab) */
  enabled?: boolean
}

export function useGhostWriterTrigger({
  matterId,
  tenantId,
  enabled = true,
}: UseGhostWriterTriggerOptions) {
  const generateDraft = useGenerateGhostDraft()
  const processedRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (!enabled || !matterId || !tenantId) return

    const supabase = createClient()

    const channel = supabase
      .channel(`ghost-writer:${matterId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'email_messages',
          filter: `tenant_id=eq.${tenantId}`,
        },
        async (payload) => {
          const message = payload.new as Record<string, unknown>

          // Only process inbound messages
          if (message.direction !== 'inbound') return

          // Deduplicate  -  don't process the same message twice
          const msgId = message.id as string
          if (processedRef.current.has(msgId)) return
          processedRef.current.add(msgId)

          // Look up the thread to check if it's associated with our matter
          const threadId = message.thread_id as string
          if (!threadId) return

          const { data: thread } = await supabase
            .from('email_threads')
            .select('matter_id')
            .eq('id', threadId)
            .single()

          if (!thread || thread.matter_id !== matterId) return

          // Fire Ghost-Writer
          generateDraft.mutate({
            matterId,
            threadId,
            messageId: msgId,
            inboundSubject: (message.subject as string) ?? '(No subject)',
            inboundBody: (message.body_text as string) ?? '',
            fromAddress: (message.from_address as string) ?? '',
            fromName: (message.from_name as string) ?? undefined,
          })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [matterId, tenantId, enabled, generateDraft])
}
