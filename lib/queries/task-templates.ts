import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { Database } from '@/lib/types/database'
import { toast } from 'sonner'

type TaskTemplate = Database['public']['Tables']['task_templates']['Row']
type TaskTemplateItem = Database['public']['Tables']['task_template_items']['Row']

export const taskTemplateKeys = {
  all: ['task-templates'] as const,
  lists: () => [...taskTemplateKeys.all, 'list'] as const,
  list: (tenantId: string) => [...taskTemplateKeys.lists(), tenantId] as const,
  details: () => [...taskTemplateKeys.all, 'detail'] as const,
  detail: (id: string) => [...taskTemplateKeys.details(), id] as const,
  items: (templateId: string) => [...taskTemplateKeys.all, 'items', templateId] as const,
}

export function useTaskTemplates(tenantId: string) {
  return useQuery({
    queryKey: taskTemplateKeys.list(tenantId),
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('task_templates')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('is_active', true)
        .order('name', { ascending: true })

      if (error) {
        console.warn('task_templates query failed:', error.message)
        return []
      }
      return data as TaskTemplate[]
    },
    enabled: !!tenantId,
  })
}

export function useTaskTemplate(id: string) {
  return useQuery({
    queryKey: taskTemplateKeys.detail(id),
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('task_templates')
        .select('*')
        .eq('id', id)
        .single()

      if (error) throw error
      return data as TaskTemplate
    },
    enabled: !!id,
  })
}

export function useTaskTemplateItems(templateId: string) {
  return useQuery({
    queryKey: taskTemplateKeys.items(templateId),
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('task_template_items')
        .select('*')
        .eq('template_id', templateId)
        .order('sort_order', { ascending: true })

      if (error) throw error
      return data as TaskTemplateItem[]
    },
    enabled: !!templateId,
  })
}

export function useCreateTaskTemplate() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (template: {
      tenant_id: string
      name: string
      description?: string
      practice_area_id?: string | null
      created_by?: string
    }) => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('task_templates')
        .insert(template)
        .select()
        .single()

      if (error) throw error
      return data as TaskTemplate
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: taskTemplateKeys.lists() })
      toast.success('Task template created')
    },
    onError: () => {
      toast.error('Failed to create task template')
    },
  })
}

export function useUpdateTaskTemplate() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, ...updates }: {
      id: string
      name?: string
      description?: string | null
      practice_area_id?: string | null
      is_active?: boolean
    }) => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('task_templates')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single()

      if (error) throw error
      return data as TaskTemplate
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: taskTemplateKeys.lists() })
      queryClient.setQueryData(taskTemplateKeys.detail(data.id), data)
      toast.success('Task template updated')
    },
    onError: () => {
      toast.error('Failed to update task template')
    },
  })
}

export function useDeleteTaskTemplate() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient()
      const { error } = await supabase
        .from('task_templates')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('id', id)

      if (error) throw error
      return id
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: taskTemplateKeys.lists() })
      toast.success('Task template deleted')
    },
    onError: () => {
      toast.error('Failed to delete task template')
    },
  })
}

export function useCreateTemplateItem() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (item: {
      tenant_id: string
      template_id: string
      title: string
      description?: string
      priority?: string
      due_days_offset?: number | null
      sort_order?: number
      assigned_role?: string | null
    }) => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('task_template_items')
        .insert(item)
        .select()
        .single()

      if (error) throw error
      return data as TaskTemplateItem
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: taskTemplateKeys.items(data.template_id) })
      toast.success('Template item added')
    },
    onError: () => {
      toast.error('Failed to add template item')
    },
  })
}

export function useUpdateTemplateItem() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, templateId, ...updates }: {
      id: string
      templateId: string
      title?: string
      description?: string | null
      priority?: string
      due_days_offset?: number | null
      sort_order?: number
      assigned_role?: string | null
    }) => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('task_template_items')
        .update(updates)
        .eq('id', id)
        .select()
        .single()

      if (error) throw error
      return { item: data as TaskTemplateItem, templateId }
    },
    onSuccess: ({ templateId }) => {
      queryClient.invalidateQueries({ queryKey: taskTemplateKeys.items(templateId) })
      toast.success('Template item updated')
    },
    onError: () => {
      toast.error('Failed to update template item')
    },
  })
}

export function useDeleteTemplateItem() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, templateId }: { id: string; templateId: string }) => {
      const supabase = createClient()
      const { error } = await supabase
        .from('task_template_items')
        .delete()
        .eq('id', id)

      if (error) throw error
      return { id, templateId }
    },
    onSuccess: ({ templateId }) => {
      queryClient.invalidateQueries({ queryKey: taskTemplateKeys.items(templateId) })
      toast.success('Template item removed')
    },
    onError: () => {
      toast.error('Failed to remove template item')
    },
  })
}

// Apply a task template to a matter (create tasks from template items)
export function useApplyTemplate() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      tenantId,
      matterId,
      templateId,
      assignedTo,
      createdBy,
    }: {
      tenantId: string
      matterId: string
      templateId: string
      assignedTo?: string
      createdBy: string
    }) => {
      const supabase = createClient()

      // Fetch template items
      const { data: items, error: itemsError } = await supabase
        .from('task_template_items')
        .select('*')
        .eq('template_id', templateId)
        .order('sort_order', { ascending: true })

      if (itemsError) throw itemsError
      if (!items || items.length === 0) throw new Error('Template has no items')

      const typedItems = items as TaskTemplateItem[]
      const today = new Date()

      // Create tasks from template items
      const tasksToCreate = typedItems.map((item) => {
        const dueDate = item.days_offset
          ? new Date(today.getTime() + item.days_offset * 86400000)
              .toISOString()
              .split('T')[0]
          : null

        return {
          tenant_id: tenantId,
          matter_id: matterId,
          title: item.title,
          description: item.description ?? undefined,
          priority: item.priority,
          due_date: dueDate ?? undefined,
          assigned_to: assignedTo ?? undefined,
          assigned_by: createdBy,
          created_by: createdBy,
          created_via: 'template' as const,
        }
      })

      const { data, error } = await supabase
        .from('tasks')
        .insert(tasksToCreate)
        .select()

      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      toast.success('Task template applied successfully')
    },
    onError: (error) => {
      toast.error(`Failed to apply template: ${error.message}`)
    },
  })
}
