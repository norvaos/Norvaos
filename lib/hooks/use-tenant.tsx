'use client'

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useUser } from './use-user'
import { setTenantDateFormat } from '@/lib/utils/formatters'

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
  home_province: string | null
  max_users: number
  // Firm address fields (used for compliance score)
  address_line1: string | null
  address_line2: string | null
  city: string | null
  province: string | null
  postal_code: string | null
  country: string | null
  office_phone: string | null
  office_fax: string | null
}

interface TenantContextType {
  tenant: Tenant | null
  isLoading: boolean
  error: string | null
  refreshTenant: () => Promise<void>
}

const TenantContext = createContext<TenantContextType>({
  tenant: null,
  isLoading: true,
  error: null,
  refreshTenant: async () => {},
})

export function TenantProvider({ children }: { children: ReactNode }) {
  const { appUser } = useUser()
  const [tenant, setTenant] = useState<Tenant | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Re-fetch tenant whenever the authenticated user changes (login/logout).
  // appUser?.id transitions null → string on login, triggering the re-fetch.
  const userId = appUser?.id ?? null

  async function fetchTenant() {
    if (!userId) return
    try {
      setIsLoading(true)
      setError(null)
      const res = await fetch('/api/auth/me')
      if (!res.ok) {
        if (res.status === 401) { setIsLoading(false); return }
        setError('Failed to load firm data')
        setIsLoading(false)
        return
      }
      const { data: tenantData } = await res.json()
      if (!tenantData) { setError('Failed to load firm data'); setIsLoading(false); return }
      setTenant(tenantData as Tenant)
      // Push the tenant's date format into the formatters singleton so that
      // every formatDate() / formatDateTime() call across the app reflects it.
      if (tenantData.date_format) setTenantDateFormat(tenantData.date_format)
    } catch {
      setError('An unexpected error occurred')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (!userId) {
      setTenant(null)
      setIsLoading(false)
      return
    }
    fetchTenant()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  const value = useMemo(
    () => ({ tenant, isLoading, error, refreshTenant: fetchTenant }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tenant, isLoading, error, userId]
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
