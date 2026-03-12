import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { Database } from '@/lib/types/database'
import { toast } from 'sonner'

type MatterFolderRow = Database['public']['Tables']['matter_folders']['Row']
type MatterFolderTemplateRow = Database['public']['Tables']['matter_folder_templates']['Row']

export type { MatterFolderRow, MatterFolderTemplateRow }

// ─── Types ──────────────────────────────────────────────────────────────────────

export interface FolderTreeNode extends MatterFolderRow {
  children: FolderTreeNode[]
}

export interface FolderTemplateTreeNode extends MatterFolderTemplateRow {
  children: FolderTemplateTreeNode[]
}

// ─── Query Keys ─────────────────────────────────────────────────────────────────

export const folderKeys = {
  all: ['matter_folders'] as const,
  byMatter: (matterId: string) => [...folderKeys.all, 'matter', matterId] as const,
  templates: ['matter_folder_templates'] as const,
  templatesByMatterType: (matterTypeId: string) =>
    [...folderKeys.templates, 'matter-type', matterTypeId] as const,
}

// ─── Tree Building ──────────────────────────────────────────────────────────────

function buildTree<T extends { id: string; parent_id: string | null }>(
  items: T[]
): (T & { children: (T & { children: unknown[] })[] })[] {
  const map = new Map<string, T & { children: (T & { children: unknown[] })[] }>()
  const roots: (T & { children: (T & { children: unknown[] })[] })[] = []

  // Initialize all items with children array
  for (const item of items) {
    map.set(item.id, { ...item, children: [] })
  }

  // Build tree
  for (const item of items) {
    const node = map.get(item.id)!
    if (item.parent_id && map.has(item.parent_id)) {
      map.get(item.parent_id)!.children.push(node)
    } else {
      roots.push(node)
    }
  }

  return roots
}

// ─── useMatterFolders ───────────────────────────────────────────────────────────

export function useMatterFolders(matterId: string) {
  return useQuery({
    queryKey: folderKeys.byMatter(matterId),
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('matter_folders')
        .select('*')
        .eq('matter_id', matterId)
        .eq('is_active', true)
        .order('sort_order')
        .order('name')

      if (error) throw error
      return buildTree(data as MatterFolderRow[]) as FolderTreeNode[]
    },
    enabled: !!matterId,
    staleTime: 3 * 60 * 1000,
  })
}

// ─── useMatterFolderTemplates ───────────────────────────────────────────────────

export function useMatterFolderTemplates(matterTypeId: string) {
  return useQuery({
    queryKey: folderKeys.templatesByMatterType(matterTypeId),
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('matter_folder_templates')
        .select('*')
        .eq('matter_type_id', matterTypeId)
        .eq('is_active', true)
        .order('sort_order')
        .order('name')

      if (error) throw error
      return buildTree(data as MatterFolderTemplateRow[]) as FolderTemplateTreeNode[]
    },
    enabled: !!matterTypeId,
    staleTime: 3 * 60 * 1000,
  })
}

// ─── useCreateMatterFolderTemplate ──────────────────────────────────────────────

export function useCreateMatterFolderTemplate() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: {
      tenant_id: string
      matter_type_id: string
      parent_id?: string | null
      name: string
      slug: string
      description?: string | null
      description_translations?: Record<string, string>
      icon?: string | null
      sort_order?: number
      folder_type?: string
      auto_assign_category?: string | null
    }) => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('matter_folder_templates')
        .insert({
          tenant_id: input.tenant_id,
          matter_type_id: input.matter_type_id,
          parent_id: input.parent_id ?? null,
          name: input.name,
          slug: input.slug,
          description: input.description ?? null,
          description_translations: input.description_translations ?? {},
          icon: input.icon ?? null,
          sort_order: input.sort_order ?? 0,
          folder_type: input.folder_type ?? 'general',
          auto_assign_category: input.auto_assign_category ?? null,
        })
        .select()
        .single()

      if (error) throw error
      return data as MatterFolderTemplateRow
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: folderKeys.templatesByMatterType(data.matter_type_id),
      })
      toast.success('Folder template created')
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create folder template')
    },
  })
}

// ─── useUpdateMatterFolderTemplate ──────────────────────────────────────────────

export function useUpdateMatterFolderTemplate() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      id,
      matterTypeId,
      ...updates
    }: {
      id: string
      matterTypeId: string
      name?: string
      description?: string | null
      description_translations?: Record<string, string>
      icon?: string | null
      sort_order?: number
      folder_type?: string
      auto_assign_category?: string | null
    }) => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('matter_folder_templates')
        .update(updates)
        .eq('id', id)
        .select()
        .single()

      if (error) throw error
      return { ...data, _matterTypeId: matterTypeId } as MatterFolderTemplateRow & {
        _matterTypeId: string
      }
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: folderKeys.templatesByMatterType(data._matterTypeId),
      })
      toast.success('Folder template updated')
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update folder template')
    },
  })
}

// ─── useCopyFolderTemplates ──────────────────────────────────────────────────────

export function useCopyFolderTemplates() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      sourceMatterTypeId,
      targetMatterTypeId,
      tenantId,
    }: {
      sourceMatterTypeId: string
      targetMatterTypeId: string
      tenantId: string
    }) => {
      const supabase = createClient()

      // Fetch all active templates from source, ordered so parents come before children
      const { data: sourceTemplates, error: fetchError } = await supabase
        .from('matter_folder_templates')
        .select('*')
        .eq('matter_type_id', sourceMatterTypeId)
        .eq('is_active', true)
        .order('sort_order')
        .order('name')

      if (fetchError) throw fetchError
      if (!sourceTemplates?.length) {
        throw new Error('No folder templates found in the source matter type.')
      }

      // Insert level-by-level so parents exist before children.
      // idMap: old source ID → new inserted ID
      const idMap = new Map<string, string>()
      const queue = [...sourceTemplates]
      let copiedCount = 0

      for (let pass = 0; pass < 20 && queue.length > 0; pass++) {
        const deferred: typeof queue = []

        for (const tpl of queue) {
          // If this folder has a parent that hasn't been inserted yet, defer it.
          if (tpl.parent_id && !idMap.has(tpl.parent_id)) {
            deferred.push(tpl)
            continue
          }

          const newParentId = tpl.parent_id ? (idMap.get(tpl.parent_id) ?? null) : null

          const { data: inserted, error: insertError } = await supabase
            .from('matter_folder_templates')
            .insert({
              tenant_id: tenantId,
              matter_type_id: targetMatterTypeId,
              parent_id: newParentId,
              name: tpl.name,
              slug: tpl.slug,
              description: tpl.description,
              description_translations:
                (tpl.description_translations as Record<string, string>) ?? {},
              icon: tpl.icon,
              sort_order: tpl.sort_order,
              folder_type: tpl.folder_type ?? 'general',
              auto_assign_category: tpl.auto_assign_category,
            })
            .select('id')
            .single()

          if (insertError) {
            if (insertError.code === '23505') {
              // Slug already exists on target — map to the existing row so children resolve
              const { data: existing } = await supabase
                .from('matter_folder_templates')
                .select('id')
                .eq('matter_type_id', targetMatterTypeId)
                .eq('slug', tpl.slug)
                .eq('is_active', true)
                .single()
              if (existing) idMap.set(tpl.id, existing.id)
              continue
            }
            throw insertError
          }

          idMap.set(tpl.id, inserted.id)
          copiedCount++
        }

        // No progress in this pass → orphaned items, stop
        if (deferred.length === queue.length) break
        queue.splice(0, queue.length, ...deferred)
      }

      return { copiedCount, targetMatterTypeId }
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: folderKeys.templatesByMatterType(data.targetMatterTypeId),
      })
      toast.success(
        `${data.copiedCount} folder template${data.copiedCount !== 1 ? 's' : ''} copied successfully`,
      )
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to copy folder templates')
    },
  })
}

// ─── useDeleteMatterFolderTemplate ──────────────────────────────────────────────

export function useDeleteMatterFolderTemplate() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      id,
      matterTypeId,
    }: {
      id: string
      matterTypeId: string
    }) => {
      const supabase = createClient()

      // Soft-delete
      const { error } = await supabase
        .from('matter_folder_templates')
        .update({ is_active: false })
        .eq('id', id)

      if (error) throw error
      return { matterTypeId }
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: folderKeys.templatesByMatterType(data.matterTypeId),
      })
      toast.success('Folder template removed')
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to remove folder template')
    },
  })
}
