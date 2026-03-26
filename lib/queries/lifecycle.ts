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
  guardianTimeline: (tenantId: string) => [...lifecycleKeys.all, 'guardian-timeline', tenantId] as const,
  guardianBirthdays: (tenantId: string) => [...lifecycleKeys.all, 'guardian-birthdays', tenantId] as const,
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

// ─── useGuardianTimeline ────────────────────────────────────────────────────
// 10-year post-matter timeline: all expiry dates (passports, permits, visas)

export interface GuardianTimelineEntry {
  id: string
  contact_id: string
  contact_name: string
  contact_email: string | null
  status_type: string
  expiry_date: string
  document_reference: string | null
  matter_id: string | null
  days_until_expiry: number
  year: number
}

export function useGuardianTimeline(tenantId: string) {
  return useQuery({
    queryKey: lifecycleKeys.guardianTimeline(tenantId),
    queryFn: async () => {
      const supabase = createClient()
      const today = new Date()
      const tenYearsOut = new Date()
      tenYearsOut.setFullYear(tenYearsOut.getFullYear() + 10)

      const { data, error } = await supabase
        .from('contact_status_records')
        .select('id, contact_id, status_type, expiry_date, document_reference, matter_id, contacts!inner(first_name, last_name, email_primary)')
        .eq('tenant_id', tenantId)
        .gte('expiry_date', today.toISOString().split('T')[0])
        .lte('expiry_date', tenYearsOut.toISOString().split('T')[0])
        .order('expiry_date', { ascending: true })
        .limit(2000)

      if (error) throw error

      const todayMs = today.getTime()
      return (data ?? []).map((record: any): GuardianTimelineEntry => {
        const expiry = new Date(record.expiry_date)
        const diffDays = Math.ceil((expiry.getTime() - todayMs) / (1000 * 60 * 60 * 24))
        const contact = record.contacts as any
        return {
          id: record.id,
          contact_id: record.contact_id,
          contact_name: `${contact?.first_name ?? ''} ${contact?.last_name ?? ''}`.trim(),
          contact_email: contact?.email_primary ?? null,
          status_type: record.status_type,
          expiry_date: record.expiry_date,
          document_reference: record.document_reference,
          matter_id: record.matter_id,
          days_until_expiry: diffDays,
          year: expiry.getFullYear(),
        }
      })
    },
    enabled: !!tenantId,
    staleTime: 1000 * 60 * 5,
  })
}

// ─── useGuardianBirthdays ──────────────────────────────────────────────────
// Upcoming birthdays/anniversaries for engagement

export interface GuardianBirthdayEntry {
  contact_id: string
  contact_name: string
  date_of_birth: string
  next_birthday: string
  days_until: number
  age_turning: number
}

export function useGuardianBirthdays(tenantId: string) {
  return useQuery({
    queryKey: lifecycleKeys.guardianBirthdays(tenantId),
    queryFn: async () => {
      const supabase = createClient()

      const { data, error } = await supabase
        .from('contacts')
        .select('id, first_name, last_name, date_of_birth')
        .eq('tenant_id', tenantId)
        .eq('is_active', true)
        .not('date_of_birth', 'is', null)
        .limit(5000)

      if (error) throw error

      const today = new Date()
      const thisYear = today.getFullYear()

      const entries: GuardianBirthdayEntry[] = []

      for (const c of data ?? []) {
        if (!c.date_of_birth) continue
        const dob = new Date(c.date_of_birth)
        if (isNaN(dob.getTime())) continue

        // Calculate next birthday
        let nextBirthday = new Date(thisYear, dob.getMonth(), dob.getDate())
        if (nextBirthday < today) {
          nextBirthday = new Date(thisYear + 1, dob.getMonth(), dob.getDate())
        }

        const diffDays = Math.ceil((nextBirthday.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))

        // Only include upcoming 90 days
        if (diffDays > 90) continue

        entries.push({
          contact_id: c.id,
          contact_name: `${c.first_name ?? ''} ${c.last_name ?? ''}`.trim(),
          date_of_birth: c.date_of_birth,
          next_birthday: nextBirthday.toISOString().split('T')[0],
          days_until: diffDays,
          age_turning: nextBirthday.getFullYear() - dob.getFullYear(),
        })
      }

      return entries.sort((a, b) => a.days_until - b.days_until)
    },
    enabled: !!tenantId,
    staleTime: 1000 * 60 * 10,
  })
}
