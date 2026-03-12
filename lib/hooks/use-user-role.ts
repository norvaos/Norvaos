'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useUser } from '@/lib/hooks/use-user'

interface UserRole {
  id: string
  name: string
  permissions: Record<string, Record<string, boolean>>
  is_system: boolean
}

/**
 * Resolve the current user's role from their role_id.
 * Returns the full role object (name, permissions, is_system).
 * Cached for 5 minutes — roles rarely change within a session.
 */
export function useUserRole() {
  const { appUser } = useUser()
  const roleId = appUser?.role_id

  const { data: role, isLoading } = useQuery({
    queryKey: ['user_role', roleId],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('roles')
        .select('id, name, permissions, is_system')
        .eq('id', roleId!)
        .single()

      if (error) throw error
      return data as UserRole
    },
    enabled: !!roleId,
    staleTime: 5 * 60 * 1000,
  })

  return { role: role ?? null, isLoading: isLoading && !!roleId }
}
