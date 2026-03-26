'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useUser } from '@/lib/hooks/use-user'

/**
 * PII Masking configuration per user role.
 *
 * Masking levels:
 *   - 'none': No masking (admin)
 *   - 'partial': Masked by default, can reveal with reason (lawyer, paralegal)
 *   - 'full': Always masked, can reveal with reason
 *   - 'write_only': Always masked, CANNOT reveal (freelancer, outsourced, clerk)
 *     → Can still fill/edit PII fields (write-only), but never see existing values
 */
export interface PiiMaskingConfig {
  maskingLevel: 'none' | 'partial' | 'full' | 'write_only'
  canReveal: boolean
  revealTimeoutSeconds: number
  maxRevealsPerHour: number
  roleName: string
}

const DEFAULT_CONFIG: PiiMaskingConfig = {
  maskingLevel: 'partial',
  canReveal: true,
  revealTimeoutSeconds: 60,
  maxRevealsPerHour: 50,
  roleName: 'unknown',
}

/**
 * Hook to fetch the current user's PII masking configuration.
 * Calls the `get_user_pii_masking` RPC which returns role-based config.
 */
export function usePiiMaskingConfig(): {
  config: PiiMaskingConfig
  isLoading: boolean
} {
  const { appUser } = useUser()

  const { data, isLoading } = useQuery({
    queryKey: ['pii-masking-config', appUser?.id],
    queryFn: async () => {
      if (!appUser?.id) return null
      const supabase = createClient()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: result } = await (supabase as any).rpc('get_user_pii_masking', {
        p_user_id: appUser.id,
      })
      return result as {
        masking_level: string
        can_reveal: boolean
        reveal_timeout_seconds: number
        max_reveals_per_hour: number
        role_name: string
      } | null
    },
    enabled: !!appUser?.id,
    staleTime: 1000 * 60 * 10, // 10 min  -  role doesn't change often
    refetchOnWindowFocus: false,
  })

  if (!data) {
    return { config: DEFAULT_CONFIG, isLoading }
  }

  return {
    config: {
      maskingLevel: data.masking_level as PiiMaskingConfig['maskingLevel'],
      canReveal: data.can_reveal,
      revealTimeoutSeconds: data.reveal_timeout_seconds,
      maxRevealsPerHour: data.max_reveals_per_hour,
      roleName: data.role_name,
    },
    isLoading,
  }
}
