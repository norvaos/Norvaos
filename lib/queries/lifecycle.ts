import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'

// ─── Query Keys ─────────────────────────────────────────────────────────────

export const lifecycleKeys = {
  all: ['lifecycle'] as const,
  postSubDocTypes: (tenantId: string) => [...lifecycleKeys.all, 'post-sub-doc-types', tenantId] as const,
  outcomes: (matterId: string) => [...lifecycleKeys.all, 'outcomes', matterId] as const,
  expiryReminders: (tenantId: string) => [...lifecycleKeys.all, 'expiry-reminders', tenantId] as const,
  contactStatus: (contactId: string) => [...lifecycleKeys.all, 'contact-status', contactId] as const,
  draftingQuestions: (matterTypeId?: string) => [...lifecycleKeys.all, 'drafting-questions', matterTypeId] as const,
  draftingResponses: (matterId: string) => [...lifecycleKeys.all, 'drafting-responses', matterId] as const,
}

// ─── usePostSubmissionDocTypes ───────────────────────────────────────────────

export function usePostSubmissionDocTypes(tenantId: string) {
  return useQuery({
    queryKey: lifecycleKeys.postSubDocTypes(tenantId),
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('post_submission_document_types')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('is_active', true)
        .order('sort_order')

      if (error) throw error
      return data
    },
    enabled: !!tenantId,
    staleTime: 1000 * 60 * 5,
  })
}

// ─── useMatterOutcomes ──────────────────────────────────────────────────────

export function useMatterOutcomes(matterId: string) {
  return useQuery({
    queryKey: lifecycleKeys.outcomes(matterId),
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('matter_outcome_events')
        .select('*')
        .eq('matter_id', matterId)
        .order('created_at', { ascending: false })

      if (error) throw error
      return data
    },
    enabled: !!matterId,
  })
}

// ─── useRecordOutcome ───────────────────────────────────────────────────────

export function useRecordOutcome() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (input: {
      matterId: string
      eventType: string
      outcomeData: Record<string, unknown>
    }) => {
      const res = await fetch(`/api/matters/${input.matterId}/outcome`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_type: input.eventType,
          outcome_data: input.outcomeData,
        }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || 'Failed to record outcome')
      }

      return res.json()
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: lifecycleKeys.outcomes(variables.matterId) })
      qc.invalidateQueries({ queryKey: ['matters'] })
    },
  })
}

// ─── useClassifyDocument ────────────────────────────────────────────────────

export function useClassifyDocument() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (input: {
      matterId: string
      documentId?: string
      typeKey: string
    }) => {
      const res = await fetch(`/api/matters/${input.matterId}/classify-document`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          document_id: input.documentId ?? null,
          type_key: input.typeKey,
        }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || 'Failed to classify document')
      }

      return res.json()
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: lifecycleKeys.outcomes(variables.matterId) })
      qc.invalidateQueries({ queryKey: ['matters'] })
      qc.invalidateQueries({ queryKey: ['tasks'] })
    },
  })
}

// ─── useExpiryReminders ─────────────────────────────────────────────────────

export function useExpiryReminders(tenantId: string, days: number = 90) {
  return useQuery({
    queryKey: [...lifecycleKeys.expiryReminders(tenantId), days],
    queryFn: async () => {
      const supabase = createClient()
      const today = new Date()
      const futureDate = new Date()
      futureDate.setDate(futureDate.getDate() + days)

      const { data, error } = await supabase
        .from('contact_status_records')
        .select('*, contacts!inner(first_name, last_name, email_primary)')
        .eq('tenant_id', tenantId)
        .gte('expiry_date', today.toISOString().split('T')[0])
        .lte('expiry_date', futureDate.toISOString().split('T')[0])
        .order('expiry_date', { ascending: true })

      if (error) throw error
      return data
    },
    enabled: !!tenantId,
    staleTime: 1000 * 60 * 5,
  })
}

// ─── useContactStatusRecords ────────────────────────────────────────────────

export function useContactStatusRecords(contactId: string) {
  return useQuery({
    queryKey: lifecycleKeys.contactStatus(contactId),
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('contact_status_records')
        .select('*')
        .eq('contact_id', contactId)
        .order('expiry_date', { ascending: false })

      if (error) throw error
      return data
    },
    enabled: !!contactId,
  })
}

// ─── useDraftingPrepQuestions ───────────────────────────────────────────────

export function useDraftingPrepQuestions(tenantId: string, matterTypeId?: string) {
  return useQuery({
    queryKey: lifecycleKeys.draftingQuestions(matterTypeId),
    queryFn: async () => {
      const supabase = createClient()
      let query = supabase
        .from('drafting_prep_questions')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('display_order')

      if (matterTypeId) {
        query = query.or(`matter_type_id.eq.${matterTypeId},matter_type_id.is.null`)
      }

      const { data, error } = await query

      if (error) throw error
      return data
    },
    enabled: !!tenantId,
    staleTime: 1000 * 60 * 5,
  })
}

// ─── useDraftingPrepResponses ───────────────────────────────────────────────

export function useDraftingPrepResponses(matterId: string) {
  return useQuery({
    queryKey: lifecycleKeys.draftingResponses(matterId),
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('drafting_prep_responses')
        .select('*, drafting_prep_questions(question_key, question_text)')
        .eq('matter_id', matterId)

      if (error) throw error
      return data
    },
    enabled: !!matterId,
  })
}

// ─── useSaveDraftingPrepResponse ────────────────────────────────────────────

export function useSaveDraftingPrepResponse() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (input: {
      tenantId: string
      matterId: string
      questionId: string
      response: string
      respondedBy: string
    }) => {
      const supabase = createClient()

      const { data, error } = await supabase
        .from('drafting_prep_responses')
        .upsert(
          {
            tenant_id: input.tenantId,
            matter_id: input.matterId,
            question_id: input.questionId,
            response: input.response,
            responded_by: input.respondedBy,
            responded_at: new Date().toISOString(),
          },
          { onConflict: 'matter_id,question_id' }
        )
        .select()
        .single()

      if (error) throw error
      return data
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: lifecycleKeys.draftingResponses(variables.matterId) })
      toast.success('Response saved')
    },
    onError: () => {
      toast.error('Failed to save response')
    },
  })
}
