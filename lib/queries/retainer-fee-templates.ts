import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import type { Database } from '@/lib/types/database'

type RetainerFeeTemplate = Database['public']['Tables']['retainer_fee_templates']['Row']

// ─── Query Key Factory ──────────────────────────────────────────────────────

export const retainerFeeTemplateKeys = {
  all: ['retainer_fee_templates'] as const,
  list: (tenantId: string, matterTypeId?: string | null, personScope?: string | null) =>
    [...retainerFeeTemplateKeys.all, tenantId, matterTypeId ?? 'all', personScope ?? 'all'] as const,
  default: (tenantId: string, matterTypeId: string, personScope: string) =>
    [...retainerFeeTemplateKeys.all, 'default', tenantId, matterTypeId, personScope] as const,
  detail: (id: string) =>
    [...retainerFeeTemplateKeys.all, 'detail', id] as const,
}

// ─── Fee Template Types (JSONB shapes) ──────────────────────────────────────

export interface ProfessionalFeeItem {
  description: string
  quantity: number
  unitPrice: number // dollars
}

export interface GovernmentFeeItem {
  description: string
  amount: number // dollars
}

export interface DisbursementItem {
  description: string
  amount: number // dollars
}

// ─── Hooks ──────────────────────────────────────────────────────────────────

/**
 * Fetch all active fee templates for a tenant.
 * Optionally filtered by matter type and person scope.
 */
export function useRetainerFeeTemplates(
  tenantId: string,
  matterTypeId?: string | null,
  personScope?: string | null
) {
  return useQuery({
    queryKey: retainerFeeTemplateKeys.list(tenantId, matterTypeId, personScope),
    queryFn: async () => {
      const supabase = createClient()
      let q = supabase
        .from('retainer_fee_templates')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('is_active', true)
        .order('is_default', { ascending: false })
        .order('sort_order')
        .order('name')

      if (matterTypeId) {
        q = q.eq('matter_type_id', matterTypeId)
      }
      if (personScope) {
        q = q.eq('person_scope', personScope)
      }

      const { data, error } = await q
      if (error) throw error
      return data as RetainerFeeTemplate[]
    },
    enabled: !!tenantId,
    staleTime: 5 * 60 * 1000,
  })
}

/**
 * Fetch the single default fee template for a specific matter type + person scope.
 * Returns null if no default template is configured.
 * Auto-fires when both matterTypeId and personScope are set.
 */
export function useDefaultRetainerFeeTemplate(
  tenantId: string,
  matterTypeId: string | null | undefined,
  personScope: string | null | undefined
) {
  return useQuery({
    queryKey: retainerFeeTemplateKeys.default(
      tenantId,
      matterTypeId ?? '',
      personScope ?? ''
    ),
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('retainer_fee_templates')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('matter_type_id', matterTypeId!)
        .eq('person_scope', personScope!)
        .eq('is_default', true)
        .eq('is_active', true)
        .maybeSingle()

      if (error) throw error
      return data as RetainerFeeTemplate | null
    },
    enabled: !!tenantId && !!matterTypeId && !!personScope,
    staleTime: 5 * 60 * 1000,
  })
}

/**
 * Create a new retainer fee template.
 */
export function useCreateRetainerFeeTemplate() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (
      input: Database['public']['Tables']['retainer_fee_templates']['Insert']
    ) => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('retainer_fee_templates')
        .insert(input)
        .select()
        .single()
      if (error) throw error
      return data as RetainerFeeTemplate
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({
        queryKey: retainerFeeTemplateKeys.list(vars.tenant_id),
      })
      toast.success('Fee template created')
    },
    onError: () => {
      toast.error('Failed to create fee template')
    },
  })
}

/**
 * Update an existing retainer fee template.
 */
export function useUpdateRetainerFeeTemplate() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      id: string
      tenantId: string
      updates: Database['public']['Tables']['retainer_fee_templates']['Update']
    }) => {
      const supabase = createClient()
      const { error } = await supabase
        .from('retainer_fee_templates')
        .update(input.updates)
        .eq('id', input.id)
        .eq('tenant_id', input.tenantId)
      if (error) throw error
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({
        queryKey: retainerFeeTemplateKeys.list(vars.tenantId),
      })
      toast.success('Fee template updated')
    },
    onError: () => {
      toast.error('Failed to update fee template')
    },
  })
}
