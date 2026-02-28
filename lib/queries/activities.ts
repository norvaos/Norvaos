import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { Database } from '@/lib/types/database'
import { toast } from 'sonner'

type Activity = Database['public']['Tables']['activities']['Row']
type ActivityInsert = Database['public']['Tables']['activities']['Insert']

interface ActivityListParams {
  tenantId: string
  matterId?: string
  contactId?: string
  limit?: number
}

export const activityKeys = {
  all: ['activities'] as const,
  lists: () => [...activityKeys.all, 'list'] as const,
  list: (params: ActivityListParams) => [...activityKeys.lists(), params] as const,
  byMatter: (matterId: string) => [...activityKeys.all, 'matter', matterId] as const,
  byContact: (contactId: string) => [...activityKeys.all, 'contact', contactId] as const,
  recent: (tenantId: string) => [...activityKeys.all, 'recent', tenantId] as const,
}

export function useActivities(params: ActivityListParams) {
  const { tenantId, matterId, contactId, limit = 50 } = params

  return useQuery({
    queryKey: activityKeys.list(params),
    queryFn: async () => {
      const supabase = createClient()

      let query = supabase
        .from('activities')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(limit)

      if (matterId) query = query.eq('matter_id', matterId)
      if (contactId) query = query.eq('contact_id', contactId)

      const { data, error } = await query

      if (error) throw error
      return data as Activity[]
    },
    enabled: !!tenantId,
  })
}

export function useRecentActivities(tenantId: string, limit = 15) {
  return useQuery({
    queryKey: activityKeys.recent(tenantId),
    queryFn: async () => {
      const supabase = createClient()

      const { data, error } = await supabase
        .from('activities')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(limit)

      if (error) throw error
      return data as Activity[]
    },
    enabled: !!tenantId,
  })
}

export function useTaskActivities(taskId: string, tenantId: string) {
  return useQuery({
    queryKey: [...activityKeys.all, 'task', taskId],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('activities')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('entity_type', 'task')
        .eq('entity_id', taskId)
        .order('created_at', { ascending: false })
        .limit(100)
      if (error) throw error
      return data as Activity[]
    },
    enabled: !!taskId && !!tenantId,
  })
}

export function useCreateActivity() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (activity: ActivityInsert) => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('activities')
        .insert(activity)
        .select()
        .single()

      if (error) throw error
      return data as Activity
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: activityKeys.lists() })
      queryClient.invalidateQueries({ queryKey: activityKeys.all })
    },
    onError: () => {
      toast.error('Failed to log activity')
    },
  })
}
