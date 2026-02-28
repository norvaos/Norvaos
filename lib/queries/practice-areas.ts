import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { Database } from '@/lib/types/database'

type PracticeArea = Database['public']['Tables']['practice_areas']['Row']
export type EnabledPracticeArea = Pick<PracticeArea, 'id' | 'name' | 'color' | 'is_enabled'>

export const practiceAreaKeys = {
  all: ['practice_areas'] as const,
  enabled: (tenantId: string | undefined) =>
    ['practice_areas', 'enabled', tenantId] as const,
}

/**
 * Fetches enabled practice areas for the tenant.
 * Only areas where is_active = true AND is_enabled = true are returned.
 * Shared across header, dashboard, leads, and any component needing practice area data.
 */
export function useEnabledPracticeAreas(tenantId: string | undefined) {
  return useQuery({
    queryKey: practiceAreaKeys.enabled(tenantId),
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('practice_areas')
        .select('id, name, color, is_enabled')
        .eq('tenant_id', tenantId!)
        .eq('is_active', true)
        .eq('is_enabled', true)
        .order('name')
      if (error) throw error
      return data as EnabledPracticeArea[]
    },
    enabled: !!tenantId,
    staleTime: 5 * 60 * 1000, // 5 min — practice areas rarely change
  })
}
