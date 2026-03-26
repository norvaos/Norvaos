import { useQuery, useMutation, useQueryClient, QueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { Database } from '@/lib/types/database'
import { createTaskNotification } from '@/lib/queries/notifications'
import { logAudit } from '@/lib/queries/audit-logs'
import { toast } from 'sonner'

type Task = Database['public']['Tables']['tasks']['Row']
type TaskInsert = Database['public']['Tables']['tasks']['Insert']
type TaskUpdate = Database['public']['Tables']['tasks']['Update']

interface TaskListParams {
  tenantId: string
  page?: number
  pageSize?: number
  assignedTo?: string
  matterId?: string
  contactId?: string
  status?: string
  priority?: string
  search?: string
  showCompleted?: boolean
  sortBy?: string
  sortDirection?: 'asc' | 'desc'
}

export const taskKeys = {
  all: ['tasks'] as const,
  lists: () => [...taskKeys.all, 'list'] as const,
  list: (params: TaskListParams) => [...taskKeys.lists(), params] as const,
  details: () => [...taskKeys.all, 'detail'] as const,
  detail: (id: string) => [...taskKeys.details(), id] as const,
  myTasks: (userId: string) => [...taskKeys.all, 'my', userId] as const,
}

const TASK_LIST_COLUMNS = 'id, tenant_id, title, description, status, priority, due_date, due_time, start_date, estimated_minutes, assigned_to, assigned_by, matter_id, contact_id, created_at, created_by, completed_at, completed_by, notes, follow_up_days, parent_task_id, created_via, is_deleted, deleted_at, deleted_by, timeline_end, task_type, category, is_billable, visibility, reminder_date, completion_note' as const

export function useTasks(params: TaskListParams) {
  const {
    tenantId, page = 1, pageSize = 50, assignedTo, matterId, contactId,
    status, priority, search, showCompleted = true,
    sortBy = 'due_date', sortDirection = 'asc',
  } = params

  return useQuery({
    queryKey: taskKeys.list(params),
    queryFn: async () => {
      const supabase = createClient()
      const from = (page - 1) * pageSize
      const to = from + pageSize - 1

      let query = supabase
        .from('tasks')
        .select(TASK_LIST_COLUMNS, { count: 'exact' })
        .eq('tenant_id', tenantId)
        .eq('is_deleted', false)

      if (assignedTo) query = query.eq('assigned_to', assignedTo)
      if (matterId) query = query.eq('matter_id', matterId)
      if (contactId) query = query.eq('contact_id', contactId)
      if (status) query = query.eq('status', status)
      if (priority) query = query.eq('priority', priority)

      // Hide completed/cancelled unless explicitly shown
      if (!showCompleted) {
        query = query.not('status', 'in', '("done","cancelled")')
      }

      // Server-side text search
      if (search?.trim()) {
        query = query.or(`title.ilike.%${search.trim()}%,description.ilike.%${search.trim()}%,notes.ilike.%${search.trim()}%`)
      }

      query = query.order(sortBy, { ascending: sortDirection === 'asc', nullsFirst: false }).range(from, to)

      const { data, error, count } = await query

      if (error) throw error

      return {
        tasks: data as Task[],
        totalCount: count ?? 0,
        page,
        pageSize,
        totalPages: Math.ceil((count ?? 0) / pageSize),
      }
    },
    enabled: !!tenantId,
  })
}

export function useMyTasks(tenantId: string, userId: string) {
  return useQuery({
    queryKey: taskKeys.myTasks(userId),
    queryFn: async () => {
      const supabase = createClient()

      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('assigned_to', userId)
        .in('status', ['not_started', 'working_on_it', 'stuck'])
        .order('due_date', { ascending: true, nullsFirst: false })

      if (error) throw error
      return data as Task[]
    },
    enabled: !!tenantId && !!userId,
  })
}

export function useTask(id: string) {
  return useQuery({
    queryKey: taskKeys.detail(id),
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .eq('id', id)
        .single()

      if (error) throw error
      return data as Task
    },
    enabled: !!id,
  })
}

export function useCreateTask() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (task: TaskInsert) => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('tasks')
        .insert(task)
        .select()
        .single()

      if (error) throw error
      return data as Task
    },
    onSuccess: (task) => {
      queryClient.invalidateQueries({ queryKey: taskKeys.lists() })
      toast.success('Task created successfully')

      logAudit({
        tenantId: task.tenant_id,
        userId: task.created_by ?? 'system',
        entityType: 'task',
        entityId: task.id,
        action: 'created',
        changes: { title: task.title, status: task.status, priority: task.priority },
        metadata: { matter_id: task.matter_id, contact_id: task.contact_id },
      })

      // Notify the assignee (if different from creator)
      if (task.assigned_to && task.assigned_to !== task.created_by) {
        createTaskNotification({
          tenantId: task.tenant_id,
          recipientId: task.assigned_to,
          title: `New task assigned: ${task.title}`,
          message: task.description?.slice(0, 100) ?? undefined,
          taskId: task.id,
          type: 'task_assigned',
        }).catch(() => {}) // Don't fail if notification fails
      }
    },
    onError: () => {
      toast.error('Failed to create task')
    },
  })
}

export function useUpdateTask() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, _prevAssignedTo, ...updates }: TaskUpdate & { id: string; _prevAssignedTo?: string | null }) => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('tasks')
        .update(updates)
        .eq('id', id)
        .select()
        .single()

      if (error) throw error
      return { task: data as Task, prevAssignedTo: _prevAssignedTo }
    },
    onSuccess: ({ task: data, prevAssignedTo }) => {
      queryClient.invalidateQueries({ queryKey: taskKeys.lists() })
      queryClient.setQueryData(taskKeys.detail(data.id), data)
      toast.success('Task updated')

      logAudit({
        tenantId: data.tenant_id,
        userId: data.created_by ?? 'system',
        entityType: 'task',
        entityId: data.id,
        action: 'updated',
        changes: { title: data.title, status: data.status, priority: data.priority },
      })

      // Fire assignment notification if the assignee changed
      if (
        data.assigned_to &&
        data.assigned_to !== data.created_by &&
        data.assigned_to !== prevAssignedTo
      ) {
        createTaskNotification({
          tenantId: data.tenant_id,
          recipientId: data.assigned_to,
          title: `Task assigned to you: ${data.title}`,
          message: data.description?.slice(0, 100) ?? undefined,
          taskId: data.id,
          type: 'task_assigned',
        }).catch(() => {})
      }
    },
    onError: () => {
      toast.error('Failed to update task')
    },
  })
}

export function useCompleteTask() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, userId }: { id: string; userId: string }) => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('tasks')
        .update({
          status: 'done',
          completed_at: new Date().toISOString(),
          completed_by: userId,
        })
        .eq('id', id)
        .select()
        .single()

      if (error) throw error

      // Check if task has follow_up_days, and auto-create follow-up
      const task = data as Task
      if (task.follow_up_days) {
        const followUpDate = new Date()
        followUpDate.setDate(followUpDate.getDate() + task.follow_up_days)

        await supabase.from('tasks').insert({
          tenant_id: task.tenant_id,
          title: `Follow-up: ${task.title}`,
          description: task.description,
          matter_id: task.matter_id,
          contact_id: task.contact_id,
          assigned_to: task.assigned_to,
          due_date: followUpDate.toISOString().split('T')[0],
          priority: task.priority,
          parent_task_id: task.id,
          created_via: 'automation',
          created_by: userId,
        })
      }

      return task
    },
    onSuccess: (task) => {
      queryClient.invalidateQueries({ queryKey: taskKeys.lists() })
      toast.success('Task completed')

      logAudit({
        tenantId: task.tenant_id,
        userId: task.completed_by ?? 'system',
        entityType: 'task',
        entityId: task.id,
        action: 'completed',
        changes: { status: 'done', completed_at: task.completed_at },
        metadata: { title: task.title },
      })

      // Recompute next action for the matter (fire-and-forget)
      if (task.matter_id) {
        fetch(`/api/matters/${task.matter_id}/next-action`, { method: 'POST' })
          .then(() => queryClient.invalidateQueries({ queryKey: ['matter', task.matter_id] }))
          .catch(() => {}) // Non-fatal
      }

      // Notify the person who assigned the task
      if (task.assigned_by && task.assigned_by !== task.completed_by) {
        createTaskNotification({
          tenantId: task.tenant_id,
          recipientId: task.assigned_by,
          title: `Task completed: ${task.title}`,
          message: 'This task has been marked as completed.',
          taskId: task.id,
          type: 'task_completed',
        }).catch(() => {}) // Don't fail if notification fails
      }
    },
    onError: () => {
      toast.error('Failed to complete task')
    },
  })
}

/**
 * @deprecated Use `useTasks()` with pagination params instead.
 * This function loads all tasks into memory and should not be used
 * for list views. Kept temporarily for components that haven't migrated.
 */
export function useAllTasks(tenantId: string) {
  return useQuery({
    queryKey: [...taskKeys.all, 'all-table', tenantId],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('tasks')
        .select(TASK_LIST_COLUMNS)
        .eq('tenant_id', tenantId)
        .eq('is_deleted', false)
        .order('created_at', { ascending: false })
        .limit(1000) // Safety cap  -  use useTasks() with pagination instead

      if (error) throw error
      return data as Task[]
    },
    enabled: !!tenantId,
  })
}

/**
 * Get document counts for specific task IDs (scoped to current page).
 * Much more efficient than loading all 5000+ documents for the tenant.
 */
export function useTaskDocumentCounts(tenantId: string, taskIds?: string[]) {
  return useQuery({
    queryKey: ['task-document-counts', tenantId, taskIds],
    queryFn: async () => {
      if (!taskIds || taskIds.length === 0) return {}

      const supabase = createClient()
      const { data, error } = await supabase
        .from('documents')
        .select('task_id')
        .eq('tenant_id', tenantId)
        .in('task_id', taskIds)

      if (error) throw error
      const counts: Record<string, number> = {}
      data?.forEach((doc: { task_id: string | null }) => {
        if (doc.task_id) counts[doc.task_id] = (counts[doc.task_id] || 0) + 1
      })
      return counts
    },
    enabled: !!tenantId && !!taskIds && taskIds.length > 0,
    staleTime: 3 * 60 * 1000, // 3 minutes  -  doc counts don't change frequently
  })
}

// Soft-delete a task (keeps activity log intact)
export function useDeleteTask() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, userId }: { id: string; userId: string }) => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('tasks')
        .update({
          is_deleted: true,
          deleted_at: new Date().toISOString(),
          deleted_by: userId,
          status: 'cancelled',
        })
        .eq('id', id)
        .select()
        .single()

      if (error) throw error
      return data as Task
    },
    onSuccess: (task) => {
      queryClient.invalidateQueries({ queryKey: taskKeys.lists() })
      toast.success('Task deleted')

      logAudit({
        tenantId: task.tenant_id,
        userId: task.deleted_by ?? 'system',
        entityType: 'task',
        entityId: task.id,
        action: 'deleted',
        metadata: { title: task.title },
      })
    },
    onError: () => {
      toast.error('Failed to delete task')
    },
  })
}

/**
 * Prefetch tasks for a specific matter into the query cache.
 * Call this on hover / route prefetch to warm the cache before navigation.
 */
export function prefetchMatterTasks(queryClient: QueryClient, matterId: string, tenantId: string) {
  const params: TaskListParams = {
    tenantId,
    matterId,
    page: 1,
    pageSize: 50,
    sortBy: 'due_date',
    sortDirection: 'asc',
    showCompleted: true,
  }

  return queryClient.prefetchQuery({
    queryKey: taskKeys.list(params),
    queryFn: async () => {
      const supabase = createClient()

      const { data, error, count } = await supabase
        .from('tasks')
        .select(TASK_LIST_COLUMNS, { count: 'exact' })
        .eq('tenant_id', tenantId)
        .eq('is_deleted', false)
        .eq('matter_id', matterId)
        .order('due_date', { ascending: true, nullsFirst: false })
        .range(0, 49)

      if (error) throw error

      return {
        tasks: data as Task[],
        totalCount: count ?? 0,
        page: 1,
        pageSize: 50,
        totalPages: Math.ceil((count ?? 0) / 50),
      }
    },
    staleTime: 1000 * 60,
  })
}
