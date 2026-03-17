'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { MatterSLATrackingRow } from '@/lib/types/database'

export function useMatterSLA(matterId: string) {
  const supabase = createClient()

  return useQuery<MatterSLATrackingRow[]>({
    queryKey: ['sla-tracking', matterId],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any)
        .from('matter_sla_tracking')
        .select('*')
        .eq('matter_id', matterId)
        .in('status', ['running', 'breached'])
        .order('due_at', { ascending: true })
      return (data ?? []) as MatterSLATrackingRow[]
    },
    enabled: !!matterId,
    staleTime: 60000,
    refetchInterval: 60000,
  })
}
