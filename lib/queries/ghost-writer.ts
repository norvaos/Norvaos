/**
 * Ghost-Writer query hooks — fetch and manage AI-generated email reply drafts.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { Database } from '@/lib/types/database'

type GhostDraft = Database['public']['Tables']['email_ghost_drafts']['Row']

// ─── Fetch ghost drafts for a thread ────────────────────────────────────────

interface GhostDraftSummary {
  id: string
  email_thread_id: string
  email_message_id: string | null
  draft_subject: string | null
  draft_body_text: string
  draft_body_html: string | null
  status: GhostDraft['status']
  model: string
  duration_ms: number | null
  created_at: string
  reviewed_by: string | null
  reviewed_at: string | null
}

export function useGhostDrafts(matterId: string, threadId?: string) {
  return useQuery({
    queryKey: ['ghost-drafts', matterId, threadId],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (threadId) params.set('threadId', threadId)

      const res = await fetch(`/api/matters/${matterId}/ghost-writer?${params}`)
      if (!res.ok) throw new Error('Failed to fetch ghost drafts')
      const json = await res.json()
      return json.drafts as GhostDraftSummary[]
    },
    enabled: !!matterId,
    staleTime: 1000 * 30, // 30 seconds — drafts are time-sensitive
  })
}

// ─── Trigger ghost draft generation ─────────────────────────────────────────

interface GenerateGhostDraftInput {
  matterId: string
  threadId: string
  messageId?: string
  inboundSubject: string
  inboundBody: string
  fromAddress: string
  fromName?: string
}

export function useGenerateGhostDraft() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (input: GenerateGhostDraftInput) => {
      const res = await fetch(`/api/matters/${input.matterId}/ghost-writer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          threadId: input.threadId,
          messageId: input.messageId,
          inboundSubject: input.inboundSubject,
          inboundBody: input.inboundBody,
          fromAddress: input.fromAddress,
          fromName: input.fromName,
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error ?? 'Ghost-Writer generation failed')
      }
      return res.json()
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({
        queryKey: ['ghost-drafts', variables.matterId, variables.threadId],
      })
    },
  })
}

// ─── Update draft status ────────────────────────────────────────────────────

interface UpdateGhostDraftInput {
  matterId: string
  draftId: string
  status: 'reviewed' | 'sent' | 'discarded'
}

export function useUpdateGhostDraft() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (input: UpdateGhostDraftInput) => {
      const res = await fetch(`/api/matters/${input.matterId}/ghost-writer`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          draftId: input.draftId,
          status: input.status,
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error ?? 'Failed to update draft')
      }
      return res.json()
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({
        queryKey: ['ghost-drafts', variables.matterId],
      })
    },
  })
}
