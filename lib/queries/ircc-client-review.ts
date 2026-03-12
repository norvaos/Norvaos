import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'

// ─── Query Keys ──────────────────────────────────────────────────────────────

export const clientReviewKeys = {
  all: ['ircc_client_reviews'] as const,
  byMatter: (matterId: string) => [...clientReviewKeys.all, matterId] as const,
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface IrccClientReview {
  id: string
  tenant_id: string
  matter_id: string
  signing_request_id: string | null
  status: 'pending' | 'sent' | 'signed' | 'declined' | 'expired'
  sent_at: string | null
  sent_by: string | null
  signed_at: string | null
  declined_at: string | null
  download_token: string | null
  summary_pdf_path: string | null
  created_at: string
  updated_at: string
}

// ─── Hooks ───────────────────────────────────────────────────────────────────

/**
 * Fetch the latest IRCC client review for a matter.
 * Returns null if none has been initiated yet.
 */
export function useIrccClientReview(matterId: string | null | undefined) {
  return useQuery({
    queryKey: clientReviewKeys.byMatter(matterId ?? ''),
    queryFn: async () => {
      const supabase = createClient()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('ircc_client_reviews')
        .select('*')
        .eq('matter_id', matterId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error) throw error
      return data as IrccClientReview | null
    },
    enabled: !!matterId,
    staleTime: 15_000,
  })
}

/**
 * Create a new IRCC client review record (initiates the review flow).
 * Returns the created review row.
 */
export function useCreateIrccClientReview() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { matterId: string }) => {
      const res = await fetch(`/api/matters/${input.matterId}/ircc-review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create' }),
      })
      if (!res.ok) {
        const json = await res.json()
        throw new Error(json.error || 'Failed to initiate client review')
      }
      return res.json() as Promise<{ review: IrccClientReview }>
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: clientReviewKeys.byMatter(vars.matterId) })
      toast.success('Client review initiated')
    },
    onError: (err) => {
      toast.error('Failed to initiate review', { description: (err as Error).message })
    },
  })
}

/**
 * Mark the client review as sent (e.g., after staff manually sends the PDF).
 */
export function useMarkIrccReviewSent() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { reviewId: string; matterId: string; signingRequestId?: string }) => {
      const res = await fetch(`/api/matters/${input.matterId}/ircc-review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'mark_sent', reviewId: input.reviewId, signingRequestId: input.signingRequestId }),
      })
      if (!res.ok) {
        const json = await res.json()
        throw new Error(json.error || 'Failed to update review status')
      }
      return res.json()
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: clientReviewKeys.byMatter(vars.matterId) })
      toast.success('Review marked as sent')
    },
    onError: () => {
      toast.error('Failed to mark as sent')
    },
  })
}

/**
 * Mark the client review as signed (staff confirmation after receiving signed document).
 */
export function useMarkIrccReviewSigned() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { reviewId: string; matterId: string }) => {
      const res = await fetch(`/api/matters/${input.matterId}/ircc-review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'mark_signed', reviewId: input.reviewId }),
      })
      if (!res.ok) {
        const json = await res.json()
        throw new Error(json.error || 'Failed to mark review as signed')
      }
      return res.json()
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: clientReviewKeys.byMatter(vars.matterId) })
      // Also invalidate form packs so the gate updates
      queryClient.invalidateQueries({ queryKey: ['immigration_readiness', vars.matterId] })
      toast.success('Client review signed — file unlocked for final form pack generation')
    },
    onError: () => {
      toast.error('Failed to mark review as signed')
    },
  })
}

/**
 * Mark the client review as declined.
 */
export function useMarkIrccReviewDeclined() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { reviewId: string; matterId: string }) => {
      const res = await fetch(`/api/matters/${input.matterId}/ircc-review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'mark_declined', reviewId: input.reviewId }),
      })
      if (!res.ok) {
        const json = await res.json()
        throw new Error(json.error || 'Failed')
      }
      return res.json()
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: clientReviewKeys.byMatter(vars.matterId) })
      toast.success('Review marked as declined — please follow up with client')
    },
    onError: () => {
      toast.error('Failed to mark as declined')
    },
  })
}
