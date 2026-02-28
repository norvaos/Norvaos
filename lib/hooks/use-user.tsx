'use client'

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useUIStore } from '@/lib/stores/ui-store'
import type { User as AuthUser } from '@supabase/supabase-js'

interface AppUser {
  id: string
  tenant_id: string
  auth_user_id: string
  email: string
  first_name: string | null
  last_name: string | null
  phone: string | null
  avatar_url: string | null
  role_id: string | null
  is_active: boolean
  notification_prefs: Record<string, boolean>
  settings: Record<string, unknown>
  practice_filter_preference?: string | null
}

interface UserContextType {
  authUser: AuthUser | null
  appUser: AppUser | null
  isLoading: boolean
  error: string | null
  fullName: string
}

const UserContext = createContext<UserContextType>({
  authUser: null,
  appUser: null,
  isLoading: true,
  error: null,
  fullName: '',
})

export function UserProvider({ children }: { children: ReactNode }) {
  const [authUser, setAuthUser] = useState<AuthUser | null>(null)
  const [appUser, setAppUser] = useState<AppUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchUser() {
      try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
          setIsLoading(false)
          return
        }

        setAuthUser(user)

        const { data: userData, error: userError } = await supabase
          .from('users')
          .select('*')
          .eq('auth_user_id', user.id)
          .single()

        if (userError || !userData) {
          setError('Failed to load user profile')
          setIsLoading(false)
          return
        }

        setAppUser(userData as AppUser)

        // Sync DB practice preference → Zustand on first load
        // Only when localStorage has no saved state (fresh browser/device)
        const stored = localStorage.getItem('norvaos-ui')
        if (!stored && (userData as AppUser).practice_filter_preference) {
          useUIStore.getState().setActivePracticeFilter(
            (userData as AppUser).practice_filter_preference!
          )
        }
      } catch {
        setError('An unexpected error occurred')
      } finally {
        setIsLoading(false)
      }
    }

    fetchUser()
  }, [])

  const fullName = useMemo(
    () =>
      appUser
        ? [appUser.first_name, appUser.last_name].filter(Boolean).join(' ') || appUser.email
        : '',
    [appUser]
  )

  const value = useMemo(
    () => ({ authUser, appUser, isLoading, error, fullName }),
    [authUser, appUser, isLoading, error, fullName]
  )

  return (
    <UserContext.Provider value={value}>
      {children}
    </UserContext.Provider>
  )
}

export function useUser() {
  const context = useContext(UserContext)
  if (context === undefined) {
    throw new Error('useUser must be used within a UserProvider')
  }
  return context
}
