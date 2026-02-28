import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { Database } from '@/lib/types/database'
import { toast } from 'sonner'

type IntakeForm = Database['public']['Tables']['intake_forms']['Row']
type IntakeFormInsert = Database['public']['Tables']['intake_forms']['Insert']
type IntakeFormUpdate = Database['public']['Tables']['intake_forms']['Update']
type IntakeSubmission = Database['public']['Tables']['intake_submissions']['Row']

export const intakeFormKeys = {
  all: ['intake-forms'] as const,
  lists: () => [...intakeFormKeys.all, 'list'] as const,
  list: (tenantId: string) => [...intakeFormKeys.lists(), tenantId] as const,
  details: () => [...intakeFormKeys.all, 'detail'] as const,
  detail: (id: string) => [...intakeFormKeys.details(), id] as const,
  submissions: (formId: string) => [...intakeFormKeys.all, 'submissions', formId] as const,
}

export function useIntakeForms(tenantId: string) {
  return useQuery({
    queryKey: intakeFormKeys.list(tenantId),
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('intake_forms')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('is_active', true)
        .order('created_at', { ascending: false })

      if (error) throw error
      return data as IntakeForm[]
    },
    enabled: !!tenantId,
  })
}

export function useIntakeForm(formId: string) {
  return useQuery({
    queryKey: intakeFormKeys.detail(formId),
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('intake_forms')
        .select('*')
        .eq('id', formId)
        .single()

      if (error) throw error
      return data as IntakeForm
    },
    enabled: !!formId,
  })
}

export function useCreateIntakeForm() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (form: IntakeFormInsert) => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('intake_forms')
        .insert(form)
        .select()
        .single()

      if (error) throw error
      return data as IntakeForm
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: intakeFormKeys.lists() })
      toast.success('Form created successfully')
    },
    onError: () => {
      toast.error('Failed to create form')
    },
  })
}

export function useUpdateIntakeForm() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, ...updates }: IntakeFormUpdate & { id: string }) => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('intake_forms')
        .update(updates)
        .eq('id', id)
        .select()
        .single()

      if (error) throw error
      return data as IntakeForm
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: intakeFormKeys.lists() })
      queryClient.invalidateQueries({ queryKey: intakeFormKeys.detail(data.id) })
    },
    onError: () => {
      toast.error('Failed to update form')
    },
  })
}

export function useDeleteIntakeForm() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient()
      const { error } = await supabase
        .from('intake_forms')
        .update({ is_active: false })
        .eq('id', id)

      if (error) throw error
      return id
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: intakeFormKeys.lists() })
      toast.success('Form deleted')
    },
    onError: () => {
      toast.error('Failed to delete form')
    },
  })
}

export function usePublishIntakeForm() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, publish }: { id: string; publish: boolean }) => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('intake_forms')
        .update({ status: publish ? 'published' : 'draft' })
        .eq('id', id)
        .select()
        .single()

      if (error) throw error
      return data as IntakeForm
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: intakeFormKeys.lists() })
      queryClient.invalidateQueries({ queryKey: intakeFormKeys.detail(data.id) })
      toast.success(data.status === 'published' ? 'Form published' : 'Form unpublished')
    },
    onError: () => {
      toast.error('Failed to update form status')
    },
  })
}

export function useIntakeSubmissions(formId: string) {
  return useQuery({
    queryKey: intakeFormKeys.submissions(formId),
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('intake_submissions')
        .select('*')
        .eq('form_id', formId)
        .order('created_at', { ascending: false })

      if (error) throw error
      return data as IntakeSubmission[]
    },
    enabled: !!formId,
  })
}

export function useLeadIntakeSubmission(leadId: string) {
  return useQuery({
    queryKey: [...intakeFormKeys.all, 'lead-submission', leadId] as const,
    queryFn: async () => {
      const supabase = createClient()

      const { data, error } = await supabase
        .from('intake_submissions')
        .select('*, intake_forms!inner(id, name, fields, settings, slug)')
        .eq('lead_id', leadId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (error) throw error
      return data as unknown as
        | (IntakeSubmission & {
            intake_forms: {
              id: string
              name: string
              fields: unknown
              settings: unknown
              slug: string
            }
          })
        | null
    },
    enabled: !!leadId,
  })
}

export function useContactIntakeSubmissions(contactId: string) {
  return useQuery({
    queryKey: [...intakeFormKeys.all, 'contact-submissions', contactId] as const,
    queryFn: async () => {
      const supabase = createClient()

      // Fetch submissions for this contact, join with form to get name + field definitions
      const { data, error } = await supabase
        .from('intake_submissions')
        .select('*, intake_forms!inner(id, name, fields, slug)')
        .eq('contact_id', contactId)
        .order('created_at', { ascending: false })

      if (error) throw error
      return data as unknown as (IntakeSubmission & {
        intake_forms: { id: string; name: string; fields: unknown; slug: string }
      })[]
    },
    enabled: !!contactId,
  })
}
