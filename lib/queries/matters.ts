import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { Database } from '@/lib/types/database'
import { logAudit } from '@/lib/queries/audit-logs'
import { toast } from 'sonner'

type Matter = Database['public']['Tables']['matters']['Row']
type MatterInsert = Database['public']['Tables']['matters']['Insert']
type MatterUpdate = Database['public']['Tables']['matters']['Update']

interface MatterListParams {
  tenantId: string
  page?: number
  pageSize?: number
  search?: string
  sortBy?: string
  sortDirection?: 'asc' | 'desc'
  practiceAreaId?: string
  status?: string
  priority?: string
  responsibleLawyerId?: string
  pipelineId?: string
  stageId?: string
}

export const matterKeys = {
  all: ['matters'] as const,
  lists: () => [...matterKeys.all, 'list'] as const,
  list: (params: MatterListParams) => [...matterKeys.lists(), params] as const,
  details: () => [...matterKeys.all, 'detail'] as const,
  detail: (id: string) => [...matterKeys.details(), id] as const,
}

export function useMatters(params: MatterListParams) {
  const {
    tenantId, page = 1, pageSize = 25, search, sortBy = 'created_at',
    sortDirection = 'desc', practiceAreaId, status, priority, responsibleLawyerId, pipelineId, stageId,
  } = params

  return useQuery({
    queryKey: matterKeys.list(params),
    queryFn: async () => {
      const supabase = createClient()
      const from = (page - 1) * pageSize
      const to = from + pageSize - 1

      let query = supabase
        .from('matters')
        .select('*', { count: 'exact' })
        .eq('tenant_id', tenantId)

      if (search) {
        query = query.or(`title.ilike.%${search}%,matter_number.ilike.%${search}%`)
      }

      if (practiceAreaId) query = query.eq('practice_area_id', practiceAreaId)
      if (status) query = query.eq('status', status)
      if (priority) query = query.eq('priority', priority)
      if (responsibleLawyerId) query = query.eq('responsible_lawyer_id', responsibleLawyerId)
      if (pipelineId) query = query.eq('pipeline_id', pipelineId)
      if (stageId) query = query.eq('stage_id', stageId)

      query = query.order(sortBy, { ascending: sortDirection === 'asc' }).range(from, to)

      const { data, error, count } = await query

      if (error) throw error

      return {
        matters: data as Matter[],
        totalCount: count ?? 0,
        page,
        pageSize,
        totalPages: Math.ceil((count ?? 0) / pageSize),
      }
    },
    enabled: !!tenantId,
  })
}

export function useMatter(id: string) {
  return useQuery({
    queryKey: matterKeys.detail(id),
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('matters')
        .select('*')
        .eq('id', id)
        .single()

      if (error) throw error
      return data as Matter
    },
    enabled: !!id,
  })
}

/**
 * Create a new matter via the server-side API route.
 * Automatically activates workflow kit (pipeline + tasks) or immigration kit
 * (checklist + stages) based on matter_type_id / case_type_id.
 */
export function useCreateMatter() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (matter: MatterInsert) => {
      const response = await fetch('/api/matters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(matter),
      })

      const result = await response.json()

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to create matter')
      }

      return result.matter as Matter
    },
    onSuccess: (matter) => {
      queryClient.invalidateQueries({ queryKey: matterKeys.lists() })
      queryClient.invalidateQueries({ queryKey: ['matter_stage_state'] })
      queryClient.invalidateQueries({ queryKey: ['immigration'] })
      toast.success('Matter created successfully')

      logAudit({
        tenantId: matter.tenant_id,
        userId: matter.created_by ?? null,
        entityType: 'matter',
        entityId: matter.id,
        action: 'created',
        changes: { title: matter.title, status: matter.status, practice_area_id: matter.practice_area_id },
      })
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create matter')
    },
  })
}

export function useUpdateMatter() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, ...updates }: MatterUpdate & { id: string }) => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('matters')
        .update(updates)
        .eq('id', id)
        .select()
        .single()

      if (error) throw error
      return data as Matter
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: matterKeys.lists() })
      queryClient.setQueryData(matterKeys.detail(data.id), data)
      toast.success('Matter updated successfully')

      logAudit({
        tenantId: data.tenant_id,
        userId: data.created_by ?? null,
        entityType: 'matter',
        entityId: data.id,
        action: 'updated',
        changes: { title: data.title, status: data.status },
      })
    },
    onError: () => {
      toast.error('Failed to update matter')
    },
  })
}

export function useUpdateMatterStage() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, stageId }: { id: string; stageId: string }) => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('matters')
        .update({ stage_id: stageId })
        .eq('id', id)
        .select()
        .single()

      if (error) throw error
      return data as Matter
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: matterKeys.lists() })
      queryClient.setQueryData(matterKeys.detail(data.id), data)
      toast.success('Stage updated')

      logAudit({
        tenantId: data.tenant_id,
        userId: data.created_by ?? null,
        entityType: 'matter',
        entityId: data.id,
        action: 'stage_changed',
        changes: { stage_id: data.stage_id },
        metadata: { title: data.title },
      })
    },
    onError: () => {
      toast.error('Failed to update stage')
    },
  })
}
