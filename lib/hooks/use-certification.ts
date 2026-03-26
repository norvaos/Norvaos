'use client'

/**
 * useCertification  -  Directive 029: Norva Sovereign Academy
 *
 * Checks whether the current auth user has completed the Academy
 * and earned norva_certified: true in their user_metadata.
 *
 * Used by the sidebar to conditionally render the Gold Sparkle
 * border around the user's avatar.
 */

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

interface CertificationStatus {
  isCertified: boolean
  certifiedAt: string | null
  completedModules: string[]
}

export function useCertification() {
  return useQuery<CertificationStatus>({
    queryKey: ['norva-certification'],
    queryFn: async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        return { isCertified: false, certifiedAt: null, completedModules: [] }
      }

      const metadata = user.user_metadata ?? {}

      return {
        isCertified: metadata.norva_certified === true,
        certifiedAt: (metadata.norva_certified_at as string) ?? null,
        completedModules: (metadata.academy_completed_modules as string[]) ?? [],
      }
    },
    staleTime: 1000 * 60 * 5, // 5 min  -  certification rarely changes
  })
}
