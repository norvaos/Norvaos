import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { Database } from '@/lib/types/database'

type ClientNotification = Database['public']['Tables']['client_notifications']['Row']

export const clientNotificationKeys = {
  all: ['client-notifications'] as const,
  byMatter: (matterId: string) => [...clientNotificationKeys.all, 'matter', matterId] as const,
}

/**
 * Fetch client notification emails sent for a specific matter.
 * Used in the matter detail page so lawyers can see what emails went out.
 */
export function useClientNotifications(matterId: string) {
  return useQuery({
    queryKey: clientNotificationKeys.byMatter(matterId),
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('client_notifications')
        .select('*')
        .eq('matter_id', matterId)
        .order('created_at', { ascending: false })
        .limit(50)

      if (error) throw error
      return data as ClientNotification[]
    },
    enabled: !!matterId,
  })
}
