import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { Database } from '@/lib/types/database'
import { toast } from 'sonner'

type Tag = Database['public']['Tables']['tags']['Row']
type TagInsert = Database['public']['Tables']['tags']['Insert']
type EntityTag = Database['public']['Tables']['entity_tags']['Row']
type EntityTagInsert = Database['public']['Tables']['entity_tags']['Insert']

interface TagListParams {
  tenantId: string
  entityType?: string
}

export const tagKeys = {
  all: ['tags'] as const,
  lists: () => [...tagKeys.all, 'list'] as const,
  list: (params: TagListParams) => [...tagKeys.lists(), params] as const,
  forEntity: (entityType: string, entityId: string) => [...tagKeys.all, 'entity', entityType, entityId] as const,
}

export function useTags(params: TagListParams) {
  const { tenantId, entityType } = params

  return useQuery({
    queryKey: tagKeys.list(params),
    queryFn: async () => {
      const supabase = createClient()

      let query = supabase
        .from('tags')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('name')

      if (entityType) query = query.eq('entity_type', entityType)

      const { data, error } = await query
      if (error) throw error
      return data as Tag[]
    },
    enabled: !!tenantId,
  })
}

export function useEntityTags(entityType: string, entityId: string, tenantId: string) {
  return useQuery({
    queryKey: tagKeys.forEntity(entityType, entityId),
    queryFn: async () => {
      const supabase = createClient()

      // Get entity_tags for this entity
      const { data: entityTags, error: etError } = await supabase
        .from('entity_tags')
        .select('*')
        .eq('entity_type', entityType)
        .eq('entity_id', entityId)
        .eq('tenant_id', tenantId)

      if (etError) throw etError

      if (!entityTags?.length) return []

      // Get the actual tags
      const tagIds = entityTags.map((et: EntityTag) => et.tag_id)
      const { data: tags, error: tagError } = await supabase
        .from('tags')
        .select('*')
        .in('id', tagIds)

      if (tagError) throw tagError
      return tags as Tag[]
    },
    enabled: !!entityId && !!tenantId,
  })
}

export function useCreateTag() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (tag: TagInsert) => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('tags')
        .insert(tag)
        .select()
        .single()

      if (error) throw error
      return data as Tag
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: tagKeys.all })
      toast.success('Label created')
    },
    onError: () => {
      toast.error('Failed to create label')
    },
  })
}

export function useAddTagToEntity() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (entityTag: EntityTagInsert) => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('entity_tags')
        .insert(entityTag)
        .select()
        .single()

      if (error) throw error
      return data as EntityTag
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: tagKeys.forEntity(variables.entity_type, variables.entity_id),
      })
    },
    onError: () => {
      toast.error('Failed to add label')
    },
  })
}

export function useRemoveTagFromEntity() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      entityType,
      entityId,
      tagId,
      tenantId,
    }: {
      entityType: string
      entityId: string
      tagId: string
      tenantId: string
    }) => {
      const supabase = createClient()
      const { error } = await supabase
        .from('entity_tags')
        .delete()
        .eq('entity_type', entityType)
        .eq('entity_id', entityId)
        .eq('tag_id', tagId)
        .eq('tenant_id', tenantId)

      if (error) throw error
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: tagKeys.forEntity(variables.entityType, variables.entityId),
      })
    },
    onError: () => {
      toast.error('Failed to remove label')
    },
  })
}
