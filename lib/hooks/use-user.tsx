'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useUIStore } from '@/lib/stores/ui-store'
import type { User as AuthUser } from '@supabase/supabase-js'

const ACTIVE_TENANT_KEY = 'norvaos-active-tenant'
const ACTIVE_TENANT_COOKIE = 'norvaos-active-tenant'

/** Write the active tenant ID to both localStorage and a cookie so server
 *  components (Front Desk layout, auth guards) can resolve the right row when
 *  a user belongs to multiple tenants. */
function persistActiveTenant(tenantId: string) {
  if (typeof window === 'undefined') return
  localStorage.setItem(ACTIVE_TENANT_KEY, tenantId)
  document.cookie = `${ACTIVE_TENANT_COOKIE}=${tenantId}; path=/; SameSite=Lax; max-age=31536000`
}

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
  locale_preference?: string | null
}

interface UserContextType {
  authUser: AuthUser | null
  appUser: AppUser | null
  isLoading: boolean
  error: string | null
  fullName: string
  /** All tenants this auth user belongs to */
  allTenants: AppUser[]
  /** Switch the active tenant (persists to localStorage) */
  switchTenant: (tenantId: string) => void
}

const UserContext = createContext<UserContextType>({
  authUser: null,
  appUser: null,
  isLoading: true,
  error: null,
  fullName: '',
  allTenants: [],
  switchTenant: () => {},
})

export function UserProvider({ children }: { children: ReactNode }) {
  const [authUser, setAuthUser] = useState<AuthUser | null>(null)
  const [appUser, setAppUser] = useState<AppUser | null>(null)
  const [allTenants, setAllTenants] = useState<AppUser[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchUser = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        setAuthUser(null)
        setAppUser(null)
        setAllTenants([])
        setIsLoading(false)
        return
      }

      setAuthUser(user)

      // Fetch ALL user rows for this auth account (one per tenant they belong to)
      const { data: rows, error: userError } = await supabase
        .from('users')
        .select('*')
        .eq('auth_user_id', user.id)
        .eq('is_active', true)
        .order('created_at', { ascending: false })

      if (userError || !rows || rows.length === 0) {
        setError('Failed to load user profile')
        setIsLoading(false)
        return
      }

      setAllTenants(rows as AppUser[])

      // Pick active tenant: prefer the one stored in localStorage, else newest.
      // If the stored ID no longer matches any row (tenant deleted / wrong session),
      // fall back to the newest row and update the persisted value so the cookie
      // stays in sync for server-side layouts.
      const stored = typeof window !== 'undefined'
        ? localStorage.getItem(ACTIVE_TENANT_KEY)
        : null
      const activeRow = (stored ? rows.find((r) => r.tenant_id === stored) : null) ?? rows[0]
      const activeUser = activeRow as AppUser
      // Ensure cookie is always in sync with the resolved active tenant
      persistActiveTenant(activeUser.tenant_id)

      // Update last_login_at for the active tenant row
      await supabase
        .from('users')
        .update({ last_login_at: new Date().toISOString() })
        .eq('id', activeUser.id)

      // Client-side deactivation detection
      if (activeUser.is_active === false) {
        await supabase.auth.signOut()
        window.location.href = '/login?error=account_deactivated'
        return
      }

      setAppUser(activeUser)

      // Sync DB practice preference → Zustand on first load
      const uiStored = typeof window !== 'undefined'
        ? localStorage.getItem('norvaos-ui')
        : null
      if (!uiStored && activeUser.practice_filter_preference) {
        useUIStore.getState().setActivePracticeFilter(activeUser.practice_filter_preference!)
      }
    } catch {
      setError('An unexpected error occurred')
    } finally {
      setIsLoading(false)
    }
  }, [])

  const switchTenant = useCallback((tenantId: string) => {
    persistActiveTenant(tenantId)
    fetchUser()
  }, [fetchUser])

  useEffect(() => {
    fetchUser()
  }, [fetchUser])

  useEffect(() => {
    const supabase = createClient()
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        fetchUser()
      }
      if (event === 'SIGNED_OUT') {
        setAuthUser(null)
        setAppUser(null)
        setAllTenants([])
        setError(null)
      }
    })
    return () => { subscription.unsubscribe() }
  }, [fetchUser])

  const fullName = useMemo(
    () =>
      appUser
        ? [appUser.first_name, appUser.last_name].filter(Boolean).join(' ') || appUser.email
        : '',
    [appUser]
  )

  const value = useMemo(
    () => ({ authUser, appUser, isLoading, error, fullName, allTenants, switchTenant }),
    [authUser, appUser, isLoading, error, fullName, allTenants, switchTenant]
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

/** Store the preferred active tenant (called from signup page after creating a new tenant) */
export function setActiveTenant(tenantId: string) {
  persistActiveTenant(tenantId)
}
