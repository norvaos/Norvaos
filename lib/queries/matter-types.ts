import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import type { Database } from '@/lib/types/database'

type MatterType = Database['public']['Tables']['matter_types']['Row']
type MatterStagePipeline = Database['public']['Tables']['matter_stage_pipelines']['Row']
type MatterStage = Database['public']['Tables']['matter_stages']['Row']
type DeadlineType = Database['public']['Tables']['deadline_types']['Row']
type MatterDeadline = Database['public']['Tables']['matter_deadlines']['Row']
type MatterStageState = Database['public']['Tables']['matter_stage_state']['Row']

// ─── Query Key Factory ──────────────────────────────────────────────────────

export const matterStageKeys = {
  all: ['matter_stage_state'] as const,
  state: (matterId: string) => [...matterStageKeys.all, matterId] as const,
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
        q = q.eq('practice_area_id', practiceAreaId)
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
      updates: Partial<Pick<MatterType, 'name' | 'description' | 'color' | 'sort_order' | 'is_active'>>
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
        .order('sort_order')
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
      updates: Partial<Pick<MatterStage, 'name' | 'color' | 'sort_order' | 'is_terminal' | 'auto_close_matter' | 'sla_days' | 'description'>>
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
    onSuccess: (result, variables) => {
      // Invalidate all related queries
      queryClient.invalidateQueries({ queryKey: matterStageKeys.state(variables.matterId) })
      queryClient.invalidateQueries({ queryKey: ['immigration', 'matter', variables.matterId] })
      queryClient.invalidateQueries({ queryKey: ['immigration', 'checklist', variables.matterId] })
      queryClient.invalidateQueries({ queryKey: ['tasks', 'list'] })
      queryClient.invalidateQueries({ queryKey: ['activities'] })
      queryClient.invalidateQueries({ queryKey: ['immigration', 'deadlines', variables.matterId] })
      toast.success(`Stage advanced to ${result.stageName}`)
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to advance stage')
    },
  })
}
