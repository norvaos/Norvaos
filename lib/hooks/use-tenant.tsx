'use client'

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useUser } from './use-user'

interface Tenant {
  id: string
  name: string
  slug: string
  logo_url: string | null
  primary_color: string
  secondary_color: string
  accent_color: string
  timezone: string
  currency: string
  date_format: string
  subscription_tier: string
  subscription_status: string
  trial_ends_at: string | null
  feature_flags: Record<string, boolean>
  settings: Record<string, unknown>
  jurisdiction_code: string
  max_users: number
}

interface TenantContextType {
  tenant: Tenant | null
  isLoading: boolean
  error: string | null
}

const TenantContext = createContext<TenantContextType>({
  tenant: null,
  isLoading: true,
  error: null,
})

export function TenantProvider({ children }: { children: ReactNode }) {
  const { appUser } = useUser()
  const [tenant, setTenant] = useState<Tenant | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Re-fetch tenant whenever the authenticated user changes (login/logout).
  // appUser?.id transitions null → string on login, triggering the re-fetch.
  const userId = appUser?.id ?? null

  useEffect(() => {
    // No user yet — reset tenant state but keep loading true
    // only if we haven't loaded before (avoids flicker on logout)
    if (!userId) {
      setTenant(null)
      setIsLoading(false)
      return
    }

    async function fetchTenant() {
      try {
        setIsLoading(true)
        setError(null)
        // Use the server-side API route which bypasses RLS via the admin client.
        // This is more reliable than direct client-side Supabase queries which
        // depend on RLS policies being correctly configured for every tenant.
        const res = await fetch('/api/auth/me')
        if (!res.ok) {
          if (res.status === 401) {
            // Not logged in — leave tenant null
            setIsLoading(false)
            return
          }
          setError('Failed to load firm data')
          setIsLoading(false)
          return
        }

        const { data: tenantData } = await res.json()
        if (!tenantData) {
          setError('Failed to load firm data')
          setIsLoading(false)
          return
        }

        setTenant(tenantData as Tenant)
      } catch {
        setError('An unexpected error occurred')
      } finally {
        setIsLoading(false)
      }
    }

    fetchTenant()
  }, [userId])

  const value = useMemo(
    () => ({ tenant, isLoading, error }),
    [tenant, isLoading, error]
  )

  return (
    <TenantContext.Provider value={value}>
      {children}
    </TenantContext.Provider>
  )
}

export function useTenant() {
  const context = useContext(TenantContext)
  if (context === undefined) {
    throw new Error('useTenant must be used within a TenantProvider')
  }
  return context
}
