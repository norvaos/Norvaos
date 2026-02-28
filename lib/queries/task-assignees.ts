import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { Database } from '@/lib/types/database'
import { toast } from 'sonner'

type TaskAssignee = Database['public']['Tables']['task_assignees']['Row']

export const taskAssigneeKeys = {
  all: ['task-assignees'] as const,
  byTask: (taskId: string) => [...taskAssigneeKeys.all, 'task', taskId] as const,
  byUser: (userId: string) => [...taskAssigneeKeys.all, 'user', userId] as const,
}

export function useTaskAssignees(taskId: string) {
  return useQuery({
    queryKey: taskAssigneeKeys.byTask(taskId),
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('task_assignees')
        .select('*')
        .eq('task_id', taskId)
        .order('assigned_at', { ascending: true })

      if (error) {
        // Table may not exist yet, return empty
        console.warn('task_assignees query failed:', error.message)
        return []
      }
      return data as TaskAssignee[]
    },
    enabled: !!taskId,
  })
}

export function useAddTaskAssignee() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      tenantId,
      taskId,
      userId,
      assignedBy,
      role = 'assignee',
    }: {
      tenantId: string
      taskId: string
      userId: string
      assignedBy: string
      role?: string
    }) => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('task_assignees')
        .insert({
          tenant_id: tenantId,
          task_id: taskId,
          user_id: userId,
          assigned_by: assignedBy,
          role,
        })
        .select()
        .single()

      if (error) throw error
      return data as TaskAssignee
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: taskAssigneeKeys.byTask(data.task_id) })
    },
    onError: () => {
      toast.error('Failed to add assignee')
    },
  })
}

export function useRemoveTaskAssignee() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, taskId }: { id: string; taskId: string }) => {
      const supabase = createClient()
      const { error } = await supabase
        .from('task_assignees')
        .delete()
        .eq('id', id)

      if (error) throw error
      return { id, taskId }
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: taskAssigneeKeys.byTask(data.taskId) })
    },
    onError: () => {
      toast.error('Failed to remove assignee')
    },
  })
}

export function useBulkSetTaskAssignees() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      tenantId,
      taskId,
      userIds,
      assignedBy,
    }: {
      tenantId: string
      taskId: string
      userIds: string[]
      assignedBy: string
    }) => {
      const supabase = createClient()

      // Delete existing assignees
      await supabase
        .from('task_assignees')
        .delete()
        .eq('task_id', taskId)

      if (userIds.length === 0) return []

      // Insert new assignees
      const rows = userIds.map((userId) => ({
        tenant_id: tenantId,
        task_id: taskId,
        user_id: userId,
        assigned_by: assignedBy,
        role: 'assignee' as const,
      }))

      const { data, error } = await supabase
        .from('task_assignees')
        .insert(rows)
        .select()

      if (error) throw error
      return data as TaskAssignee[]
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: taskAssigneeKeys.byTask(variables.taskId) })
      toast.success('Task assignees updated')
    },
    onError: () => {
      toast.error('Failed to update assignees')
    },
  })
}
