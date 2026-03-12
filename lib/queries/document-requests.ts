import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { Database } from '@/lib/types/database'
import { slotKeys } from '@/lib/queries/document-slots'
import { toast } from 'sonner'

type DocumentRequest = Database['public']['Tables']['document_requests']['Row']

export type { DocumentRequest }

// ─── Query Keys ──────────────────────────────────────────────────────────────

export const documentRequestKeys = {
  all: ['document_requests'] as const,
  list: (matterId: string) => [...documentRequestKeys.all, matterId] as const,
}

// ─── useDocumentRequests ─────────────────────────────────────────────────────

/**
 * Fetch past document requests for a matter.
 */
export function useDocumentRequests(matterId: string | undefined) {
  return useQuery({
    queryKey: documentRequestKeys.list(matterId ?? ''),
    queryFn: async () => {
      const res = await fetch(`/api/matters/${matterId}/document-request`)
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to fetch document requests')
      }
      const data = await res.json()
      return data.requests as DocumentRequest[]
    },
    enabled: !!matterId,
  })
}

// ─── useSendDocumentRequest ──────────────────────────────────────────────────

/**
 * Send a document request to the primary client contact.
 * Posts to /api/matters/[id]/document-request with selected slot IDs.
 */
export function useSendDocumentRequest() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (params: {
      matterId: string
      slotIds: string[]
      message?: string
      language?: string
    }) => {
      const res = await fetch(`/api/matters/${params.matterId}/document-request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slot_ids: params.slotIds,
          message: params.message,
          language: params.language,
        }),
      })

      const data = await res.json()
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to send document request')
      }
      return data as { success: true; request_id: string; slots_requested: number }
    },
    onSuccess: (data, variables) => {
      toast.success(
        `Document request sent (${data.slots_requested} document${data.slots_requested === 1 ? '' : 's'})`
      )
      queryClient.invalidateQueries({ queryKey: documentRequestKeys.list(variables.matterId) })
      queryClient.invalidateQueries({ queryKey: slotKeys.list(variables.matterId) })
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to send document request')
    },
  })
}
