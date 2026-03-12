import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { Database } from '@/lib/types/database'
import { toast } from 'sonner'

type Notification = Database['public']['Tables']['notifications']['Row']
type NotificationInsert = Database['public']['Tables']['notifications']['Insert']

export const notificationKeys = {
  all: ['notifications'] as const,
  list: (userId: string) => [...notificationKeys.all, 'list', userId] as const,
  unreadCount: (userId: string) => [...notificationKeys.all, 'unread', userId] as const,
}

export function useNotifications(userId: string) {
  return useQuery({
    queryKey: notificationKeys.list(userId),
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(50)

      if (error) throw error
      return data as Notification[]
    },
    enabled: !!userId,
  })
}

export function useUnreadNotificationCount(userId: string) {
  return useQuery({
    queryKey: notificationKeys.unreadCount(userId),
    queryFn: async () => {
      const supabase = createClient()
      // Use a lightweight SELECT id with count instead of HEAD (HEAD can 503 on some RLS configs)
      const { data, error } = await supabase
        .from('notifications')
        .select('id')
        .eq('user_id', userId)
        .eq('is_read', false)
        .limit(100)

      if (error) throw error
      return data?.length ?? 0
    },
    enabled: !!userId,
    staleTime: 30_000, // 30s — avoid hammering on every re-render
    retry: 1, // Don't retry aggressively if notifications fail
  })
}

export function useMarkNotificationAsRead() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, userId }: { id: string; userId: string }) => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('notifications')
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single()

      if (error) throw error
      return { notification: data as Notification, userId }
    },
    onSuccess: ({ userId }) => {
      queryClient.invalidateQueries({ queryKey: notificationKeys.list(userId) })
      queryClient.invalidateQueries({ queryKey: notificationKeys.unreadCount(userId) })
    },
  })
}

export function useMarkAllNotificationsAsRead() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (userId: string) => {
      const supabase = createClient()
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq('user_id', userId)
        .eq('is_read', false)

      if (error) throw error
      return userId
    },
    onSuccess: (userId) => {
      queryClient.invalidateQueries({ queryKey: notificationKeys.list(userId) })
      queryClient.invalidateQueries({ queryKey: notificationKeys.unreadCount(userId) })
      toast.success('All notifications marked as read')
    },
    onError: () => {
      toast.error('Failed to mark notifications as read')
    },
  })
}

export function useCreateNotification() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (notification: NotificationInsert) => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('notifications')
        .insert(notification)
        .select()
        .single()

      if (error) throw error
      return data as Notification
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: notificationKeys.list(data.user_id) })
      queryClient.invalidateQueries({ queryKey: notificationKeys.unreadCount(data.user_id) })
    },
  })
}

// Helper function to create task-related notifications
export async function createTaskNotification({
  tenantId,
  recipientId,
  title,
  message,
  taskId,
  type,
}: {
  tenantId: string
  recipientId: string
  title: string
  message?: string
  taskId: string
  type: 'task_assigned' | 'task_completed' | 'task_updated'
}) {
  const supabase = createClient()
  await supabase.from('notifications').insert({
    tenant_id: tenantId,
    user_id: recipientId,
    title,
    message: message ?? null,
    notification_type: type,
    entity_type: 'task',
    entity_id: taskId,
    channels: ['in_app'],
    priority: type === 'task_assigned' ? 'high' : 'normal',
  })
}
