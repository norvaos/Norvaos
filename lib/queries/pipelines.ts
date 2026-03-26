import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { Database } from '@/lib/types/database'
import { toast } from 'sonner'

type Pipeline = Database['public']['Tables']['pipelines']['Row']
type PipelineStage = Database['public']['Tables']['pipeline_stages']['Row']
type PipelineInsert = Database['public']['Tables']['pipelines']['Insert']
type StageInsert = Database['public']['Tables']['pipeline_stages']['Insert']
type StageUpdate = Database['public']['Tables']['pipeline_stages']['Update']

export const pipelineKeys = {
  all: ['pipelines'] as const,
  lists: () => [...pipelineKeys.all, 'list'] as const,
  list: (tenantId: string, type?: string) => [...pipelineKeys.lists(), tenantId, type] as const,
  details: () => [...pipelineKeys.all, 'detail'] as const,
  detail: (id: string) => [...pipelineKeys.details(), id] as const,
  stages: (pipelineId: string) => [...pipelineKeys.all, 'stages', pipelineId] as const,
}

export function usePipelines(tenantId: string, type?: string) {
  return useQuery({
    queryKey: pipelineKeys.list(tenantId, type),
    queryFn: async () => {
      const supabase = createClient()

      let query = supabase
        .from('pipelines')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('is_active', true)
        .order('name')

      if (type) {
        query = query.eq('pipeline_type', type)
      }

      const { data, error } = await query

      if (error) throw error
      return data as Pipeline[]
    },
    enabled: !!tenantId,
    staleTime: 5 * 60 * 1000, // 5 min  -  pipelines rarely change
  })
}

export function usePipeline(id: string) {
  return useQuery({
    queryKey: pipelineKeys.detail(id),
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('pipelines')
        .select('*')
        .eq('id', id)
        .single()

      if (error) throw error
      return data as Pipeline
    },
    enabled: !!id,
  })
}

export function usePipelineStages(pipelineId: string) {
  return useQuery({
    queryKey: pipelineKeys.stages(pipelineId),
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('pipeline_stages')
        .select('*')
        .eq('pipeline_id', pipelineId)
        .order('sort_order')

      if (error) throw error
      return data as PipelineStage[]
    },
    enabled: !!pipelineId,
    staleTime: 5 * 60 * 1000, // 5 min  -  stages rarely change
  })
}

export function useCreatePipeline() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (pipeline: PipelineInsert) => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('pipelines')
        .insert(pipeline)
        .select()
        .single()

      if (error) throw error
      return data as Pipeline
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: pipelineKeys.lists() })
      toast.success('Pipeline created successfully')
    },
    onError: () => {
      toast.error('Failed to create pipeline')
    },
  })
}

export function useCreateStage() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (stage: StageInsert) => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('pipeline_stages')
        .insert(stage)
        .select()
        .single()

      if (error) throw error
      return data as PipelineStage
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: pipelineKeys.stages(data.pipeline_id) })
      toast.success('Stage added')
    },
    onError: () => {
      toast.error('Failed to add stage')
    },
  })
}

export function useUpdateStage() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, pipelineId, ...updates }: StageUpdate & { id: string; pipelineId: string }) => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('pipeline_stages')
        .update(updates)
        .eq('id', id)
        .select()
        .single()

      if (error) throw error
      return { stage: data as PipelineStage, pipelineId }
    },
    onSuccess: ({ pipelineId }) => {
      queryClient.invalidateQueries({ queryKey: pipelineKeys.stages(pipelineId) })
      toast.success('Stage updated')
    },
    onError: () => {
      toast.error('Failed to update stage')
    },
  })
}

export function useReorderStages() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ pipelineId, stages }: { pipelineId: string; stages: { id: string; sort_order: number }[] }) => {
      const supabase = createClient()

      const updates = stages.map((s) =>
        supabase
          .from('pipeline_stages')
          .update({ sort_order: s.sort_order })
          .eq('id', s.id)
      )

      await Promise.all(updates)
      return pipelineId
    },
    onSuccess: (pipelineId) => {
      queryClient.invalidateQueries({ queryKey: pipelineKeys.stages(pipelineId) })
    },
    onError: () => {
      toast.error('Failed to reorder stages')
    },
  })
}

export function useDeleteStage() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, pipelineId }: { id: string; pipelineId: string }) => {
      const supabase = createClient()
      const { error } = await supabase
        .from('pipeline_stages')
        .delete()
        .eq('id', id)

      if (error) throw error
      return pipelineId
    },
    onSuccess: (pipelineId) => {
      queryClient.invalidateQueries({ queryKey: pipelineKeys.stages(pipelineId) })
      toast.success('Stage deleted')
    },
    onError: () => {
      toast.error('Failed to delete stage. It may still contain items.')
    },
  })
}
