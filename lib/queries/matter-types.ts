import { useQuery, useMutation, useQueryClient, QueryClient } from '@tanstack/react-query'
import { useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import type { Database } from '@/lib/types/database'
import { broadcastMutation } from '@/lib/hooks/use-cross-tab-sync'

type MatterType = Database['public']['Tables']['matter_types']['Row']
type MatterStagePipeline = Database['public']['Tables']['matter_stage_pipelines']['Row']
type MatterStage = Database['public']['Tables']['matter_stages']['Row']
type DeadlineType = Database['public']['Tables']['deadline_types']['Row']
type MatterDeadline = Database['public']['Tables']['matter_deadlines']['Row']
type MatterStageState = Database['public']['Tables']['matter_stage_state']['Row']
type MatterTypeSchema = Database['public']['Tables']['matter_type_schema']['Row']
type MatterCustomData = Database['public']['Tables']['matter_custom_data']['Row']

/** Shape of the `json_schema` column when used for mandatory-field tracking */
export interface MandatoryFieldSchema {
  sections: {
    name: string
    label: string
    fields: { key: string; label: string; required: boolean }[]
  }[]
}

// ─── Query Key Factory ──────────────────────────────────────────────────────

export const matterStageKeys = {
  all: ['matter_stage_state'] as const,
  state: (matterId: string) => [...matterStageKeys.all, matterId] as const,
}

export const gatingKeys = {
  all: ['check_gating'] as const,
  check: (matterId: string) => [...gatingKeys.all, matterId] as const,
}

// ─── Check Gating ──────────────────────────────────────────────────────────

/**
 * Pre-evaluate gating rules for all stages in a matter's pipeline.
 * Returns which stages are blocked and why.
 * Uses the exact same evaluateGatingRules logic as the server-side stage engine.
 */
export function useCheckGating(matterId: string, enabled = true) {
  return useQuery({
    queryKey: gatingKeys.check(matterId),
    queryFn: async () => {
      const res = await fetch(`/api/matters/${matterId}/check-gating`)
      if (!res.ok) return { gatingErrors: {} }
      return res.json() as Promise<{ gatingErrors: Record<string, string[]> }>
    },
    enabled: !!matterId && enabled,
    staleTime: 1000 * 30, // 30s — re-check frequently
  })
}

// ─── Matter Types ────────────────────────────────────────────────────────────

/**
 * Fetch all active matter types for a tenant.
 * Optionally filtered by practice area.
 */
export function useMatterTypes(tenantId: string, practiceAreaId?: string | null) {
  return useQuery({
    queryKey: ['matter_types', tenantId, practiceAreaId ?? 'all'],
    queryFn: async () => {
      const supabase = createClient()
      let q = supabase
        .from('matter_types')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('is_active', true)
        .order('sort_order')
        .order('name')

      if (practiceAreaId) {
        // Include both practice-area-specific and global (null) matter types
        q = q.or(`practice_area_id.eq.${practiceAreaId},practice_area_id.is.null`)
      }

      const { data, error } = await q
      if (error) throw error
      return data as MatterType[]
    },
    enabled: !!tenantId,
    staleTime: 3 * 60 * 1000,
  })
}

/**
 * Prefetch matter types into the query cache so subsequent renders are instant.
 * Call this from server components, route loaders, or layout effects to warm the cache.
 */
export function prefetchMatterTypes(queryClient: QueryClient, tenantId: string, practiceAreaId?: string) {
  return queryClient.prefetchQuery({
    queryKey: ['matter_types', tenantId, practiceAreaId ?? 'all'],
    queryFn: async () => {
      const supabase = createClient()
      let q = supabase
        .from('matter_types')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('is_active', true)
        .order('sort_order')
        .order('name')

      if (practiceAreaId) {
        q = q.or(`practice_area_id.eq.${practiceAreaId},practice_area_id.is.null`)
      }

      const { data, error } = await q
      if (error) throw error
      return data as MatterType[]
    },
    staleTime: 3 * 60 * 1000,
  })
}

/**
 * Fetch matter types grouped by practice area.
 * Useful for dropdowns that need to show practice area context.
 */
export function useMatterTypesByPractice(tenantId: string) {
  return useQuery({
    queryKey: ['matter_types', 'by_practice', tenantId],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('matter_types')
        .select(`
          *,
          practice_areas!inner(id, name, color)
        `)
        .eq('tenant_id', tenantId)
        .eq('is_active', true)
        .order('sort_order')
        .order('name')

      if (error) throw error
      return data as unknown as (MatterType & {
        practice_areas: { id: string; name: string; color: string }
      })[]
    },
    enabled: !!tenantId,
    staleTime: 3 * 60 * 1000,
  })
}

/**
 * Create a new matter type.
 */
export function useCreateMatterType() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      tenantId: string
      practiceAreaId: string
      name: string
      description?: string | null
      color?: string
      sortOrder?: number
    }) => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('matter_types')
        .insert({
          tenant_id: input.tenantId,
          practice_area_id: input.practiceAreaId,
          name: input.name,
          description: input.description,
          color: input.color ?? '#6366f1',
          sort_order: input.sortOrder ?? 0,
          is_active: true,
        })
        .select()
        .single()
      if (error) throw error
      return data as MatterType
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['matter_types', vars.tenantId] })
    },
  })
}

/**
 * Update an existing matter type.
 */
export function useUpdateMatterType() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      id: string
      tenantId: string
      updates: Partial<Pick<MatterType, 'name' | 'description' | 'color' | 'sort_order' | 'is_active' | 'practice_area_id' | 'icon' | 'matter_type_config'>>
    }) => {
      const supabase = createClient()
      const { error } = await supabase
        .from('matter_types')
        .update(input.updates)
        .eq('id', input.id)
        .eq('tenant_id', input.tenantId)
      if (error) throw error
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['matter_types', vars.tenantId] })
    },
  })
}

// ─── Stage Pipelines + Stages ─────────────────────────────────────────────────

/**
 * Fetch stage pipelines (with their stages) for a specific matter type.
 */
export function useMatterStagePipelines(tenantId: string, matterTypeId: string | null | undefined) {
  return useQuery({
    queryKey: ['matter_stage_pipelines', tenantId, matterTypeId],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('matter_stage_pipelines')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('matter_type_id', matterTypeId!)
        .eq('is_active', true)
        .order('is_default', { ascending: false })
        .order('name')
      if (error) throw error
      return data as MatterStagePipeline[]
    },
    enabled: !!tenantId && !!matterTypeId,
    staleTime: 5 * 60 * 1000,
  })
}

/**
 * Fetch all stages for a pipeline.
 */
export function useMatterStages(pipelineId: string | null | undefined) {
  return useQuery({
    queryKey: ['matter_stages', pipelineId],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('matter_stages')
        .select('*')
        .eq('pipeline_id', pipelineId!)
        .order('sort_order')
      if (error) throw error
      return data as MatterStage[]
    },
    enabled: !!pipelineId,
    staleTime: 5 * 60 * 1000,
  })
}

// ─── Deadline Types ───────────────────────────────────────────────────────────

/**
 * Fetch deadline types for a tenant.
 * Optionally filtered by practice area.
 */
export function useDeadlineTypes(tenantId: string, practiceAreaId?: string | null) {
  return useQuery({
    queryKey: ['deadline_types', tenantId, practiceAreaId ?? 'all'],
    queryFn: async () => {
      const supabase = createClient()
      let q = supabase
        .from('deadline_types')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('is_active', true)
        .order('name')

      if (practiceAreaId) {
        // Include both practice-specific and global (null) deadline types
        q = q.or(`practice_area_id.eq.${practiceAreaId},practice_area_id.is.null`)
      }

      const { data, error } = await q
      if (error) throw error
      return data as DeadlineType[]
    },
    enabled: !!tenantId,
    staleTime: 5 * 60 * 1000,
  })
}

/**
 * Create a new deadline type.
 */
export function useCreateDeadlineType() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      tenantId: string
      name: string
      description?: string | null
      practiceAreaId?: string | null
      matterTypeId?: string | null
      color?: string
      isHard?: boolean
      defaultDaysOffset?: number | null
      sortOrder?: number
    }) => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('deadline_types')
        .insert({
          tenant_id: input.tenantId,
          name: input.name,
          description: input.description,
          practice_area_id: input.practiceAreaId,
          matter_type_id: input.matterTypeId,
          color: input.color ?? '#ef4444',
          is_hard: input.isHard ?? false,
          default_days_offset: input.defaultDaysOffset,
          sort_order: input.sortOrder ?? 0,
          is_active: true,
        })
        .select()
        .single()
      if (error) throw error
      return data as DeadlineType
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['deadline_types', vars.tenantId] })
    },
  })
}

export function useUpdateDeadlineType() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      id: string
      tenantId: string
      updates: Partial<Pick<DeadlineType,
        'name' | 'description' | 'color' | 'is_hard' | 'default_days_offset' |
        'sort_order' | 'practice_area_id' | 'matter_type_id' | 'is_active'
      >>
    }) => {
      const supabase = createClient()
      const { error } = await supabase
        .from('deadline_types')
        .update(input.updates)
        .eq('id', input.id)
        .eq('tenant_id', input.tenantId)
      if (error) throw error
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['deadline_types', vars.tenantId] })
      toast.success('Deadline type updated')
    },
    onError: () => {
      toast.error('Failed to update deadline type')
    },
  })
}

export function useDeleteDeadlineType() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { id: string; tenantId: string }) => {
      const supabase = createClient()
      const { error } = await supabase
        .from('deadline_types')
        .update({ is_active: false })
        .eq('id', input.id)
        .eq('tenant_id', input.tenantId)
      if (error) throw error
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['deadline_types', vars.tenantId] })
      toast.success('Deadline type removed')
    },
    onError: () => {
      toast.error('Failed to remove deadline type')
    },
  })
}

// ─── Workflow Templates ──────────────────────────────────────────────────────

type WorkflowTemplate = Database['public']['Tables']['workflow_templates']['Row']

export function useWorkflowTemplates(tenantId: string, matterTypeId?: string | null) {
  return useQuery({
    queryKey: ['workflow_templates', tenantId, matterTypeId ?? 'all'],
    queryFn: async () => {
      const supabase = createClient()
      let q = supabase
        .from('workflow_templates')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('is_active', true)
        .order('name')

      if (matterTypeId) {
        q = q.eq('matter_type_id', matterTypeId)
      }

      const { data, error } = await q
      if (error) throw error
      return data as WorkflowTemplate[]
    },
    enabled: !!tenantId,
    staleTime: 3 * 60 * 1000,
  })
}

export function useCreateWorkflowTemplate() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: Database['public']['Tables']['workflow_templates']['Insert']) => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('workflow_templates')
        .insert(input)
        .select()
        .single()
      if (error) throw error
      return data as WorkflowTemplate
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['workflow_templates', vars.tenant_id] })
      toast.success('Workflow template created')
    },
    onError: () => {
      toast.error('Failed to create workflow template')
    },
  })
}

export function useUpdateWorkflowTemplate() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      id: string
      tenantId: string
      updates: Partial<Pick<WorkflowTemplate,
        'name' | 'description' | 'matter_type_id' | 'stage_pipeline_id' |
        'task_template_id' | 'trigger_stage_id' | 'is_default' | 'is_active'
      >>
    }) => {
      const supabase = createClient()
      const { error } = await supabase
        .from('workflow_templates')
        .update(input.updates)
        .eq('id', input.id)
        .eq('tenant_id', input.tenantId)
      if (error) throw error
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['workflow_templates', vars.tenantId] })
      toast.success('Workflow template updated')
    },
    onError: () => {
      toast.error('Failed to update workflow template')
    },
  })
}

export function useDeleteWorkflowTemplate() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { id: string; tenantId: string }) => {
      const supabase = createClient()
      const { error } = await supabase
        .from('workflow_templates')
        .update({ is_active: false })
        .eq('id', input.id)
        .eq('tenant_id', input.tenantId)
      if (error) throw error
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['workflow_templates', vars.tenantId] })
      toast.success('Workflow template removed')
    },
    onError: () => {
      toast.error('Failed to remove workflow template')
    },
  })
}

// ─── Workflow Template Deadlines (Junction) ─────────────────────────────────

type WorkflowTemplateDeadline = Database['public']['Tables']['workflow_template_deadlines']['Row']

export type WorkflowTemplateDeadlineWithType = WorkflowTemplateDeadline & {
  deadline_types: { id: string; name: string; color: string } | null
}

export function useWorkflowTemplateDeadlines(workflowTemplateId: string | null | undefined) {
  return useQuery({
    queryKey: ['workflow_template_deadlines', workflowTemplateId],
    queryFn: async () => {
      const supabase = createClient()
      // Fetch junction rows
      const { data: bindings, error } = await supabase
        .from('workflow_template_deadlines')
        .select('*')
        .eq('workflow_template_id', workflowTemplateId!)
      if (error) throw error
      if (!bindings || bindings.length === 0) return [] as WorkflowTemplateDeadlineWithType[]

      // Fetch deadline type details
      const typeIds = bindings.map(b => b.deadline_type_id)
      const { data: types } = await supabase
        .from('deadline_types')
        .select('id, name, color')
        .in('id', typeIds)

      const typeMap = new Map((types ?? []).map(t => [t.id, t]))

      return bindings.map(b => ({
        ...b,
        deadline_types: typeMap.get(b.deadline_type_id) ?? null,
      })) as WorkflowTemplateDeadlineWithType[]
    },
    enabled: !!workflowTemplateId,
    staleTime: 3 * 60 * 1000,
  })
}

export function useAddWorkflowTemplateDeadline() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: Database['public']['Tables']['workflow_template_deadlines']['Insert']) => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('workflow_template_deadlines')
        .insert(input)
        .select()
        .single()
      if (error) throw error
      return data as WorkflowTemplateDeadline
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['workflow_template_deadlines', vars.workflow_template_id] })
      toast.success('Deadline type added to workflow')
    },
    onError: () => {
      toast.error('Failed to add deadline type')
    },
  })
}

export function useRemoveWorkflowTemplateDeadline() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { id: string; workflowTemplateId: string }) => {
      const supabase = createClient()
      const { error } = await supabase
        .from('workflow_template_deadlines')
        .delete()
        .eq('id', input.id)
      if (error) throw error
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['workflow_template_deadlines', vars.workflowTemplateId] })
      toast.success('Deadline type removed from workflow')
    },
    onError: () => {
      toast.error('Failed to remove deadline type')
    },
  })
}

// ─── Matter Deadlines ─────────────────────────────────────────────────────────

/**
 * Fetch all deadlines for a specific matter.
 */
export function useMatterDeadlines(tenantId: string, matterId: string | null | undefined) {
  return useQuery({
    queryKey: ['matter_deadlines', tenantId, matterId],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('matter_deadlines')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('matter_id', matterId!)
        .order('due_date', { ascending: true })
      if (error) throw error
      return data as MatterDeadline[]
    },
    enabled: !!tenantId && !!matterId,
  })
}

/**
 * Prefetch deadlines for a specific matter into the query cache.
 * Use this to warm the cache before navigating to a matter detail page.
 */
export function prefetchMatterDeadlines(queryClient: QueryClient, tenantId: string, matterId: string) {
  return queryClient.prefetchQuery({
    queryKey: ['matter_deadlines', tenantId, matterId],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('matter_deadlines')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('matter_id', matterId)
        .order('due_date', { ascending: true })
      if (error) throw error
      return data as MatterDeadline[]
    },
    staleTime: 1000 * 60 * 2,
  })
}

/**
 * Create a deadline on a matter.
 */
export function useCreateMatterDeadline() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      tenantId: string
      matterId: string
      deadlineTypeId?: string | null
      deadlineType?: string
      deadlineDate: string
      title?: string
      description?: string | null
      priority?: string
    }) => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('matter_deadlines')
        .insert({
          tenant_id: input.tenantId,
          matter_id: input.matterId,
          deadline_type_id: input.deadlineTypeId,
          deadline_type: input.deadlineType ?? 'custom',
          title: input.title ?? input.deadlineType ?? 'Deadline',
          due_date: input.deadlineDate,
          description: input.description,
          status: 'upcoming',
          priority: input.priority ?? 'medium',
        })
        .select()
        .single()
      if (error) throw error
      return data as MatterDeadline
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['matter_deadlines', vars.tenantId, vars.matterId] })
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'deadlines'] })
    },
  })
}

/**
 * Update a matter deadline (reschedule, rename, etc.).
 */
export function useUpdateMatterDeadline() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      id: string
      tenantId: string
      matterId: string
      updates: { due_date?: string; title?: string; priority?: string; description?: string | null }
    }) => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('matter_deadlines')
        .update(input.updates)
        .eq('id', input.id)
        .select()
        .single()
      if (error) throw error
      return data as MatterDeadline
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['matter_deadlines', vars.tenantId, vars.matterId] })
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'deadlines'] })
      queryClient.invalidateQueries({ queryKey: ['calendar'] })
      toast.success('Deadline rescheduled')
    },
    onError: () => {
      toast.error('Failed to reschedule deadline')
    },
  })
}

/**
 * Toggle a matter deadline's completed status.
 */
export function useToggleMatterDeadline() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      id: string
      tenantId: string
      matterId: string
      isCompleted: boolean
    }) => {
      const supabase = createClient()
      const updateData = input.isCompleted
        ? { status: 'completed', completed_at: new Date().toISOString() }
        : { status: 'upcoming', completed_at: null }
      const { error } = await supabase
        .from('matter_deadlines')
        .update(updateData)
        .eq('id', input.id)
        .eq('tenant_id', input.tenantId)
      if (error) throw error
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['matter_deadlines', vars.tenantId, vars.matterId] })
    },
  })
}

/**
 * Delete a matter deadline.
 */
export function useDeleteMatterDeadline() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      id: string
      tenantId: string
      matterId: string
    }) => {
      const supabase = createClient()
      const { error } = await supabase
        .from('matter_deadlines')
        .delete()
        .eq('id', input.id)
        .eq('tenant_id', input.tenantId)
      if (error) throw error
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['matter_deadlines', vars.tenantId, vars.matterId] })
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'deadlines'] })
    },
  })
}

/**
 * Fetch upcoming deadlines across all matters within the next N days.
 * Used by dashboard and global deadline views.
 */
export function useUpcomingMatterDeadlines(
  tenantId: string,
  options?: {
    practiceAreaId?: string | null
    days?: number
    limit?: number
  }
) {
  const days = options?.days ?? 14
  const limit = options?.limit ?? 10
  const practiceAreaId = options?.practiceAreaId

  return useQuery({
    queryKey: ['matter_deadlines', 'upcoming', tenantId, practiceAreaId ?? 'all', days],
    queryFn: async () => {
      const supabase = createClient()

      const today = new Date()
      const future = new Date(today)
      future.setDate(today.getDate() + days)

      const todayStr = today.toISOString().split('T')[0]
      const futureStr = future.toISOString().split('T')[0]

      // Build matter_ids filter if practice area is active
      let matterIds: string[] | null = null
      if (practiceAreaId && practiceAreaId !== 'all') {
        const { data: filteredMatters } = await supabase
          .from('matters')
          .select('id')
          .eq('tenant_id', tenantId)
          .eq('practice_area_id', practiceAreaId)
          .in('status', ['active', 'intake'])

        matterIds = (filteredMatters ?? []).map((m: { id: string }) => m.id)
        if (matterIds.length === 0) return []
      }

      let q = supabase
        .from('matter_deadlines')
        .select(`
          *,
          matters!inner(id, title, practice_area_id, status)
        `)
        .eq('tenant_id', tenantId)
        .not('status', 'in', '("completed","dismissed")')
        .gte('due_date', todayStr)
        .lte('due_date', futureStr)
        .order('due_date', { ascending: true })
        .limit(limit)

      if (matterIds) {
        q = q.in('matter_id', matterIds)
      }

      const { data, error } = await q
      if (error) throw error

      return data as unknown as (MatterDeadline & {
        matters: { id: string; title: string; practice_area_id: string | null; status: string }
      })[]
    },
    enabled: !!tenantId,
    staleTime: 2 * 60 * 1000,
  })
}

// ─── Matter Stage Pipeline Mutations ─────────────────────────────────────────

export function useCreateMatterStagePipeline() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      tenantId: string
      matterTypeId: string
      name: string
      description?: string | null
      isDefault?: boolean
    }) => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('matter_stage_pipelines')
        .insert({
          tenant_id: input.tenantId,
          matter_type_id: input.matterTypeId,
          name: input.name,
          description: input.description,
          is_default: input.isDefault ?? false,
          is_active: true,
        })
        .select()
        .single()
      if (error) throw error
      return data as MatterStagePipeline
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['matter_stage_pipelines', vars.tenantId, vars.matterTypeId] })
      toast.success('Pipeline created')
    },
    onError: () => {
      toast.error('Failed to create pipeline')
    },
  })
}

export function useUpdateMatterStagePipeline() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      id: string
      tenantId: string
      matterTypeId: string
      updates: Partial<Pick<MatterStagePipeline, 'name' | 'description' | 'is_default' | 'is_active'>>
    }) => {
      const supabase = createClient()
      const { error } = await supabase
        .from('matter_stage_pipelines')
        .update(input.updates)
        .eq('id', input.id)
        .eq('tenant_id', input.tenantId)
      if (error) throw error
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['matter_stage_pipelines', vars.tenantId, vars.matterTypeId] })
      toast.success('Pipeline updated')
    },
    onError: () => {
      toast.error('Failed to update pipeline')
    },
  })
}

// ─── Matter Stage Mutations ─────────────────────────────────────────────────

export function useCreateMatterStage() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      tenantId: string
      pipelineId: string
      name: string
      color?: string
      sortOrder?: number
      isTerminal?: boolean
      autoCloseMatter?: boolean
      slaDays?: number | null
      description?: string | null
      completionPct?: number | null
    }) => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('matter_stages')
        .insert({
          tenant_id: input.tenantId,
          pipeline_id: input.pipelineId,
          name: input.name,
          color: input.color ?? '#6366f1',
          sort_order: input.sortOrder ?? 0,
          is_terminal: input.isTerminal ?? false,
          auto_close_matter: input.autoCloseMatter ?? false,
          sla_days: input.slaDays,
          description: input.description,
          completion_pct: input.completionPct ?? undefined,
        })
        .select()
        .single()
      if (error) throw error
      return data as MatterStage
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['matter_stages', data.pipeline_id] })
      toast.success('Stage added')
    },
    onError: () => {
      toast.error('Failed to add stage')
    },
  })
}

export function useUpdateMatterStage() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      id: string
      pipelineId: string
      updates: Partial<Pick<MatterStage, 'name' | 'color' | 'sort_order' | 'is_terminal' | 'auto_close_matter' | 'sla_days' | 'description' | 'completion_pct'>>
    }) => {
      const supabase = createClient()
      const { error } = await supabase
        .from('matter_stages')
        .update(input.updates)
        .eq('id', input.id)
      if (error) throw error
      return input.pipelineId
    },
    onSuccess: (pipelineId) => {
      queryClient.invalidateQueries({ queryKey: ['matter_stages', pipelineId] })
      toast.success('Stage updated')
    },
    onError: () => {
      toast.error('Failed to update stage')
    },
  })
}

export function useDeleteMatterStage() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { id: string; pipelineId: string }) => {
      const supabase = createClient()
      const { error } = await supabase
        .from('matter_stages')
        .delete()
        .eq('id', input.id)
      if (error) throw error
      return input.pipelineId
    },
    onSuccess: (pipelineId) => {
      queryClient.invalidateQueries({ queryKey: ['matter_stages', pipelineId] })
      toast.success('Stage deleted')
    },
    onError: () => {
      toast.error('Failed to delete stage')
    },
  })
}

export function useDeleteMatterStagePipeline() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { id: string; matterTypeId: string }) => {
      const supabase = createClient()
      const { error } = await supabase
        .from('matter_stage_pipelines')
        .delete()
        .eq('id', input.id)
      if (error) throw error
      return input.matterTypeId
    },
    onSuccess: (matterTypeId) => {
      queryClient.invalidateQueries({ queryKey: ['matter_stage_pipelines', matterTypeId] })
      toast.success('Pipeline deleted')
    },
    onError: () => {
      toast.error('Failed to delete pipeline')
    },
  })
}

export function useReorderMatterStages() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { pipelineId: string; stages: { id: string; sort_order: number }[] }) => {
      const supabase = createClient()
      const updates = input.stages.map((s) =>
        supabase
          .from('matter_stages')
          .update({ sort_order: s.sort_order })
          .eq('id', s.id)
      )
      await Promise.all(updates)
      return input.pipelineId
    },
    onSuccess: (pipelineId) => {
      queryClient.invalidateQueries({ queryKey: ['matter_stages', pipelineId] })
    },
    onError: () => {
      toast.error('Failed to reorder stages')
    },
  })
}

// ─── Matter Stage State ──────────────────────────────────────────────────────

/**
 * Fetch the current stage state for a matter.
 * Returns null if no stage state exists yet (matter not yet activated in a pipeline).
 */
export function useMatterStageState(matterId: string | null | undefined) {
  return useQuery({
    queryKey: matterStageKeys.state(matterId ?? ''),
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('matter_stage_state')
        .select('*')
        .eq('matter_id', matterId!)
        .maybeSingle()
      if (error) throw error
      return data as MatterStageState | null
    },
    enabled: !!matterId,
    staleTime: 1000 * 60 * 2, // 2 min — avoid refetch on every mount when navigating matter pages
  })
}

/**
 * Prefetch the current stage state for a matter into the given QueryClient cache.
 * Call this ahead of navigation to avoid a loading spinner on the matter detail page.
 */
export function prefetchMatterStageState(queryClient: QueryClient, matterId: string) {
  return queryClient.prefetchQuery({
    queryKey: matterStageKeys.state(matterId),
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('matter_stage_state')
        .select('*')
        .eq('matter_id', matterId)
        .maybeSingle()
      if (error) throw error
      return data as MatterStageState | null
    },
    staleTime: 1000 * 60 * 2, // 2 min
  })
}

/**
 * Advance a matter's stage via the server-side enforcement engine.
 * Works for both generic (Real Estate, etc.) and immigration stage systems.
 * The API route validates gating rules, logs activity, and triggers automations.
 */
export function useAdvanceMatterStage() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      matterId,
      targetStageId,
      system,
    }: {
      matterId: string
      targetStageId: string
      system: 'immigration' | 'generic'
    }) => {
      const response = await fetch(`/api/matters/${matterId}/advance-stage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetStageId, system }),
      })

      const data = await response.json()

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to advance stage')
      }

      return data as { success: true; stageName: string; failedRules?: string[] }
    },
    // ── Optimistic UI: advance stage instantly in cache ──
    onMutate: async ({ matterId, targetStageId }) => {
      await queryClient.cancelQueries({ queryKey: matterStageKeys.state(matterId) })
      await queryClient.cancelQueries({ queryKey: ['matters', 'detail', matterId] })

      // Snapshot stage state for rollback
      const previousState = queryClient.getQueryData(matterStageKeys.state(matterId))

      // Optimistically update stage state
      if (previousState && typeof previousState === 'object') {
        queryClient.setQueryData(matterStageKeys.state(matterId), {
          ...(previousState as Record<string, unknown>),
          current_stage_id: targetStageId,
          updated_at: new Date().toISOString(),
        })
      }

      // Optimistically update the matter detail cache's stage_id
      const detailKey = ['matters', 'detail', matterId]
      const previousDetail = queryClient.getQueryData(detailKey)
      if (previousDetail && typeof previousDetail === 'object') {
        queryClient.setQueryData(detailKey, {
          ...(previousDetail as Record<string, unknown>),
          stage_id: targetStageId,
          stage_entered_at: new Date().toISOString(),
        })
      }

      return { previousState, previousDetail }
    },
    onSuccess: (result, variables) => {
      // Invalidate all related queries to get real server data
      queryClient.invalidateQueries({ queryKey: matterStageKeys.state(variables.matterId) })
      queryClient.invalidateQueries({ queryKey: ['immigration', 'matter', variables.matterId] })
      queryClient.invalidateQueries({ queryKey: ['immigration', 'checklist', variables.matterId] })
      queryClient.invalidateQueries({ queryKey: ['tasks', 'list'] })
      queryClient.invalidateQueries({ queryKey: ['activities'] })
      queryClient.invalidateQueries({ queryKey: ['immigration', 'deadlines', variables.matterId] })
      queryClient.invalidateQueries({ queryKey: gatingKeys.check(variables.matterId) })
      queryClient.invalidateQueries({ queryKey: ['matters', 'detail'] })
      toast.success(`Stage advanced to ${result.stageName}`)

      // Broadcast to other tabs
      broadcastMutation('matter:stage-advanced', { matterId: variables.matterId })
    },
    onError: (error: Error, variables, context) => {
      // Rollback on failure
      if (context?.previousState) {
        queryClient.setQueryData(matterStageKeys.state(variables.matterId), context.previousState)
      }
      if (context?.previousDetail) {
        queryClient.setQueryData(['matters', 'detail', variables.matterId], context.previousDetail)
      }
      toast.error(error.message || 'Failed to advance stage')
    },
  })
}

// ─── IRCC Question Set Codes per Matter Type ──────────────────────────────

/**
 * Fetch the configured IRCC form codes for a matter type.
 * Returns the ircc_question_set_codes array from the matter_types table.
 */
export function useMatterTypeFormCodes(matterTypeId: string | null) {
  return useQuery({
    queryKey: ['matter-type-form-codes', matterTypeId] as const,
    queryFn: async () => {
      if (!matterTypeId) return []
      const supabase = createClient()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('matter_types')
        .select('ircc_question_set_codes')
        .eq('id', matterTypeId)
        .single()

      if (error) throw error
      return (data?.ircc_question_set_codes ?? []) as string[]
    },
    enabled: !!matterTypeId,
    staleTime: 60_000,
  })
}

// ─── Intake Question Schema ───────────────────────────────────────────────────

export interface IntakeQuestion {
  key: string
  label: string
  type: 'text' | 'select' | 'date' | 'boolean'
  required: boolean
  options?: string[]       // for select type
  placeholder?: string
  help_text?: string
  show_if?: {              // conditional display: show this question only if...
    question_key: string
    equals: string
  }
}

/**
 * Fetch the intake question schema for a matter type.
 */
export function useMatterTypeIntakeSchema(matterTypeId: string | null | undefined) {
  return useQuery({
    queryKey: ['matter-type-intake-schema', matterTypeId] as const,
    queryFn: async () => {
      if (!matterTypeId) return [] as IntakeQuestion[]
      const supabase = createClient()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('matter_types')
        .select('intake_question_schema')
        .eq('id', matterTypeId)
        .single()
      if (error) throw error
      return (data?.intake_question_schema ?? []) as IntakeQuestion[]
    },
    enabled: !!matterTypeId,
    staleTime: 30_000,
  })
}

/**
 * Save the full intake question schema for a matter type.
 */
export function useUpdateMatterTypeIntakeSchema() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { matterTypeId: string; schema: IntakeQuestion[] }) => {
      const supabase = createClient()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from('matter_types')
        .update({ intake_question_schema: input.schema })
        .eq('id', input.matterTypeId)
      if (error) throw error
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['matter-type-intake-schema', vars.matterTypeId] })
      toast.success('Intake questions saved')
    },
    onError: () => {
      toast.error('Failed to save intake questions')
    },
  })
}

// ─── Phase 4: Matter Custom Fields ──────────────────────────────────────────

/**
 * Fetch the active JSON schema for a matter type.
 */
export function useMatterTypeSchema(matterTypeId: string | null | undefined) {
  return useQuery({
    queryKey: ['matter_type_schema', matterTypeId],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('matter_type_schema')
        .select('*')
        .eq('matter_type_id', matterTypeId!)
        .eq('is_active', true)
        .order('schema_version', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error) throw error
      return data as MatterTypeSchema | null
    },
    enabled: !!matterTypeId,
    staleTime: 1000 * 60 * 10, // 10 min — schema rarely changes
  })
}

/**
 * Upsert (create or bump version) a matter type schema.
 */
export function useUpsertMatterTypeSchema() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      tenantId: string
      matterTypeId: string
      jsonSchema: Record<string, unknown>
      uiSchema: Record<string, unknown>
      currentVersion?: number
    }) => {
      const supabase = createClient()
      const nextVersion = (input.currentVersion ?? 0) + 1

      // Deactivate previous versions
      if (input.currentVersion) {
        await supabase
          .from('matter_type_schema')
          .update({ is_active: false })
          .eq('matter_type_id', input.matterTypeId)
          .eq('is_active', true)
      }

      const { data, error } = await supabase
        .from('matter_type_schema')
        .insert({
          tenant_id: input.tenantId,
          matter_type_id: input.matterTypeId,
          schema_version: nextVersion,
          json_schema: input.jsonSchema as unknown as Database['public']['Tables']['matter_type_schema']['Insert']['json_schema'],
          ui_schema: input.uiSchema as unknown as Database['public']['Tables']['matter_type_schema']['Insert']['ui_schema'],
          is_active: true,
        })
        .select()
        .single()
      if (error) throw error
      return data as MatterTypeSchema
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['matter_type_schema', vars.matterTypeId] })
      toast.success('Custom field schema saved')
    },
    onError: () => {
      toast.error('Failed to save custom field schema')
    },
  })
}

/**
 * Fetch custom field data for a specific matter.
 */
export function useMatterCustomData(matterId: string | null | undefined) {
  return useQuery({
    queryKey: ['matter_custom_data', matterId],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('matter_custom_data')
        .select('*')
        .eq('matter_id', matterId!)
        .maybeSingle()
      if (error) throw error
      return data as MatterCustomData | null
    },
    enabled: !!matterId,
    staleTime: 1 * 60 * 1000,
  })
}

/**
 * Upsert custom field data for a matter. Creates or updates the single row.
 */
export function useUpsertMatterCustomData() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      tenantId: string
      matterId: string
      matterTypeId: string
      schemaVersion: number
      data: Record<string, unknown>
    }) => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('matter_custom_data')
        .upsert(
          {
            tenant_id: input.tenantId,
            matter_id: input.matterId,
            matter_type_id: input.matterTypeId,
            schema_version: input.schemaVersion,
            data: input.data as unknown as Database['public']['Tables']['matter_custom_data']['Insert']['data'],
            is_valid: true,
          },
          { onConflict: 'matter_id' }
        )
        .select()
        .single()
      if (error) throw error
      return data as MatterCustomData
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['matter_custom_data', vars.matterId] })
      toast.success('Custom fields saved')
    },
    onError: () => {
      toast.error('Failed to save custom fields')
    },
  })
}

/**
 * Fetch the document_naming_template for a single matter type.
 * Used by DocumentsTab to auto-name uploaded files.
 */
export function useMatterTypeNamingTemplate(matterTypeId: string | null | undefined) {
  return useQuery({
    queryKey: ['matter_type_naming_template', matterTypeId],
    queryFn: async () => {
      if (!matterTypeId) return null
      const supabase = createClient()
      const { data, error } = await supabase
        .from('matter_types')
        .select('document_naming_template')
        .eq('id', matterTypeId)
        .single()
      if (error) throw error
      return data?.document_naming_template ?? null
    },
    enabled: !!matterTypeId,
    staleTime: 5 * 60 * 1000,
  })
}

// ─── Admin: Matter Type Config Engine ────────────────────────────────────────

export type MatterTypeWithPracticeArea = MatterType & {
  practice_areas: { id: string; name: string; color: string }
  stage_count: number
}

/**
 * Fetch all matter types (active + archived) with practice area join.
 * Used by the admin matter-types list page.
 */
export function useAdminMatterTypes(tenantId: string, practiceAreaFilter?: string | null) {
  return useQuery({
    queryKey: ['admin_matter_types', tenantId, practiceAreaFilter ?? 'all'],
    queryFn: async () => {
      const supabase = createClient()
      let q = supabase
        .from('matter_types')
        .select(`
          *,
          practice_areas!inner(id, name, color)
        `)
        .eq('tenant_id', tenantId)
        .order('sort_order')
        .order('name')

      if (practiceAreaFilter && practiceAreaFilter !== 'all') {
        q = q.eq('practice_area_id', practiceAreaFilter)
      }

      const { data, error } = await q
      if (error) throw error

      // Fetch stage counts for each matter type via pipelines
      const matterTypeIds = (data ?? []).map((mt) => mt.id)
      let stageCounts: Record<string, number> = {}

      if (matterTypeIds.length > 0) {
        const { data: pipelines } = await supabase
          .from('matter_stage_pipelines')
          .select('matter_type_id, id')
          .in('matter_type_id', matterTypeIds)
          .eq('is_active', true)

        const pipelineIds = (pipelines ?? []).map((p) => p.id)

        if (pipelineIds.length > 0) {
          const { data: stages } = await supabase
            .from('matter_stages')
            .select('pipeline_id')
            .in('pipeline_id', pipelineIds)

          const pipelineToMatterType = new Map(
            (pipelines ?? []).map((p) => [p.id, p.matter_type_id])
          )

          for (const stage of stages ?? []) {
            const mtId = pipelineToMatterType.get(stage.pipeline_id)
            if (mtId) {
              stageCounts[mtId] = (stageCounts[mtId] ?? 0) + 1
            }
          }
        }
      }

      return (data ?? []).map((mt) => ({
        ...mt,
        stage_count: stageCounts[mt.id] ?? 0,
      })) as MatterTypeWithPracticeArea[]
    },
    enabled: !!tenantId,
    staleTime: 60 * 1000,
  })
}

/**
 * Fetch a single matter type with full config, practice area, and stages.
 */
export function useAdminMatterType(id: string | null | undefined) {
  return useQuery({
    queryKey: ['admin_matter_type', id],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('matter_types')
        .select(`
          *,
          practice_areas!inner(id, name, color)
        `)
        .eq('id', id!)
        .single()
      if (error) throw error
      return data as MatterType & {
        practice_areas: { id: string; name: string; color: string }
      }
    },
    enabled: !!id,
    staleTime: 30 * 1000,
  })
}

/**
 * Archive (soft-delete) or restore a matter type by toggling is_active.
 */
export function useArchiveMatterType() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { id: string; tenantId: string; archive: boolean }) => {
      const supabase = createClient()
      const { error } = await supabase
        .from('matter_types')
        .update({ is_active: !input.archive })
        .eq('id', input.id)
        .eq('tenant_id', input.tenantId)
      if (error) throw error
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['admin_matter_types', vars.tenantId] })
      queryClient.invalidateQueries({ queryKey: ['admin_matter_type', vars.id] })
      queryClient.invalidateQueries({ queryKey: ['matter_types', vars.tenantId] })
      toast.success(vars.archive ? 'Matter type archived' : 'Matter type restored')
    },
    onError: () => {
      toast.error('Failed to update matter type')
    },
  })
}

// ─── Document Slot Templates (Tab 2 — Document Checklist) ────────────────────

type DocumentSlotTemplate = Database['public']['Tables']['document_slot_templates']['Row']

export function useDocumentSlotsForMatterType(matterTypeId: string | null | undefined) {
  return useQuery({
    queryKey: ['doc_slot_templates', 'matter_type', matterTypeId],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('document_slot_templates')
        .select('*')
        .eq('matter_type_id', matterTypeId!)
        .eq('is_active', true)
        .order('sort_order')
        .order('slot_name')
      if (error) throw error
      return data as DocumentSlotTemplate[]
    },
    enabled: !!matterTypeId,
    staleTime: 30 * 1000,
  })
}

export function useCreateDocumentSlot() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      tenantId: string
      matterTypeId: string
      slotName: string
      description?: string | null
      category?: string
      isRequired?: boolean
      sortOrder?: number
    }) => {
      const supabase = createClient()
      const slug = input.slotName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_|_$/g, '')
      const { data, error } = await supabase
        .from('document_slot_templates')
        .insert({
          tenant_id: input.tenantId,
          matter_type_id: input.matterTypeId,
          slot_name: input.slotName,
          slot_slug: slug,
          description: input.description ?? null,
          category: input.category ?? 'general',
          is_required: input.isRequired ?? false,
          sort_order: input.sortOrder ?? 0,
          is_active: true,
        })
        .select()
        .single()
      if (error) throw error
      return data as DocumentSlotTemplate
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['doc_slot_templates', 'matter_type', vars.matterTypeId] })
      toast.success('Document slot added')
    },
    onError: () => {
      toast.error('Failed to add document slot')
    },
  })
}

export function useUpdateDocumentSlot() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      id: string
      matterTypeId: string
      updates: Partial<Pick<DocumentSlotTemplate, 'slot_name' | 'description' | 'category' | 'is_required' | 'sort_order'>>
    }) => {
      const supabase = createClient()
      const { error } = await supabase
        .from('document_slot_templates')
        .update(input.updates)
        .eq('id', input.id)
      if (error) throw error
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['doc_slot_templates', 'matter_type', vars.matterTypeId] })
      toast.success('Document slot updated')
    },
    onError: () => {
      toast.error('Failed to update document slot')
    },
  })
}

export function useDeleteDocumentSlot() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { id: string; matterTypeId: string }) => {
      const supabase = createClient()
      const { error } = await supabase
        .from('document_slot_templates')
        .update({ is_active: false })
        .eq('id', input.id)
      if (error) throw error
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['doc_slot_templates', 'matter_type', vars.matterTypeId] })
      toast.success('Document slot removed')
    },
    onError: () => {
      toast.error('Failed to remove document slot')
    },
  })
}

// ─── Task Templates per Matter Type (Tab 3) ──────────────────────────────────
// task_templates does not have matter_type_id; we use workflow_templates
// linked to the matter type, and task_template_items within them.
// For the admin editor we surface template items directly from the
// workflow_template that is bound to this matter type.

type TaskTemplateItem = Database['public']['Tables']['task_template_items']['Row']

export type AdminTaskTemplateItem = TaskTemplateItem & {
  workflow_template_id: string
}

export function useTaskTemplatesForMatterType(tenantId: string, matterTypeId: string | null | undefined) {
  return useQuery({
    queryKey: ['admin_task_template_items', tenantId, matterTypeId],
    queryFn: async () => {
      const supabase = createClient()
      // Get the default workflow template for this matter type
      const { data: wts } = await supabase
        .from('workflow_templates')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('matter_type_id', matterTypeId!)
        .eq('is_active', true)
        .order('is_default', { ascending: false })
        .limit(1)

      const wtId = wts?.[0]?.id ?? null
      if (!wtId) return [] as AdminTaskTemplateItem[]

      const { data: items, error } = await supabase
        .from('task_template_items')
        .select('*')
        .eq('template_id', wtId)
        .order('sort_order')
      if (error) throw error
      return (items ?? []).map((i) => ({ ...i, workflow_template_id: wtId })) as AdminTaskTemplateItem[]
    },
    enabled: !!tenantId && !!matterTypeId,
    staleTime: 30 * 1000,
  })
}

export function useCreateTaskTemplateItem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      tenantId: string
      matterTypeId: string
      workflowTemplateId: string   // the parent workflow_template.id
      title: string
      description?: string | null
      assignedRole?: string | null
      dueDaysOffset?: number | null
      sortOrder?: number
    }) => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('task_template_items')
        .insert({
          template_id: input.workflowTemplateId,
          title: input.title,
          description: input.description ?? null,
          assign_to_role: input.assignedRole ?? null,
          days_offset: input.dueDaysOffset ?? null,
          sort_order: input.sortOrder ?? 0,
          priority: 'medium',
        })
        .select()
        .single()
      if (error) throw error
      return data as TaskTemplateItem
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['admin_task_template_items', vars.tenantId, vars.matterTypeId] })
      toast.success('Task template added')
    },
    onError: () => {
      toast.error('Failed to add task template')
    },
  })
}

export function useUpdateTaskTemplateItem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      id: string
      tenantId: string
      matterTypeId: string
      updates: Partial<Pick<TaskTemplateItem, 'title' | 'description' | 'assign_to_role' | 'days_offset' | 'sort_order' | 'priority'>>
    }) => {
      const supabase = createClient()
      const { error } = await supabase
        .from('task_template_items')
        .update(input.updates)
        .eq('id', input.id)
      if (error) throw error
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['admin_task_template_items', vars.tenantId, vars.matterTypeId] })
      toast.success('Task template updated')
    },
    onError: () => {
      toast.error('Failed to update task template')
    },
  })
}

export function useDeleteTaskTemplateItem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { id: string; tenantId: string; matterTypeId: string }) => {
      const supabase = createClient()
      const { error } = await supabase
        .from('task_template_items')
        .delete()
        .eq('id', input.id)
      if (error) throw error
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['admin_task_template_items', vars.tenantId, vars.matterTypeId] })
      toast.success('Task template removed')
    },
    onError: () => {
      toast.error('Failed to remove task template')
    },
  })
}
