'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { Database } from '@/lib/types/database'
import { toast } from 'sonner'

type TemplateRow = Database['public']['Tables']['communication_templates']['Row']
type TemplateInsert = Database['public']['Tables']['communication_templates']['Insert']
type TemplateUpdate = Database['public']['Tables']['communication_templates']['Update']
type LogInsert = Database['public']['Tables']['communication_logs']['Insert']

// ── Query Key Factory ────────────────────────────────────────────────────────

export const commTemplateKeys = {
  all: ['communication-templates'] as const,
  tenant: (tenantId: string) =>
    [...commTemplateKeys.all, 'tenant', tenantId] as const,
  category: (tenantId: string, category: string) =>
    [...commTemplateKeys.all, 'tenant', tenantId, 'category', category] as const,
}

export const commLogKeys = {
  all: ['communication-logs'] as const,
  matter: (matterId: string) =>
    [...commLogKeys.all, 'matter', matterId] as const,
}

// ── Fetch templates ──────────────────────────────────────────────────────────

export function useCommunicationTemplates(
  tenantId: string,
  category?: string,
) {
  return useQuery({
    queryKey: category
      ? commTemplateKeys.category(tenantId, category)
      : commTemplateKeys.tenant(tenantId),
    queryFn: async () => {
      const supabase = createClient()
      let query = supabase
        .from('communication_templates')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('is_active', true)
        .order('name', { ascending: true })

      if (category) {
        query = query.eq('category', category)
      }

      const { data, error } = await query
      if (error) throw error
      return data as TemplateRow[]
    },
    enabled: !!tenantId,
    staleTime: 1000 * 60 * 5, // 5 min  -  reference data
  })
}

// ── Create template ──────────────────────────────────────────────────────────

export function useCreateCommunicationTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: TemplateInsert) => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('communication_templates')
        .insert(input)
        .select()
        .single()
      if (error) throw error
      return data as TemplateRow
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: commTemplateKeys.all })
      toast.success('Template created')
    },
    onError: () => {
      toast.error('Failed to create template')
    },
  })
}

// ── Update template ──────────────────────────────────────────────────────────

export function useUpdateCommunicationTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      ...updates
    }: TemplateUpdate & { id: string }) => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('communication_templates')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data as TemplateRow
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: commTemplateKeys.all })
      toast.success('Template updated')
    },
    onError: () => {
      toast.error('Failed to update template')
    },
  })
}

// ── Log a communication ──────────────────────────────────────────────────────

export function useLogCommunication() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: LogInsert) => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('communication_logs')
        .insert(input)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: commLogKeys.matter(vars.matter_id) })
    },
  })
}
