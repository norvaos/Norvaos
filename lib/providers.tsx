'use client'

import { useState, useCallback, type ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider } from 'next-themes'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Toaster } from '@/components/ui/sonner'
import { TenantProvider } from '@/lib/hooks/use-tenant'
import { UserProvider, useUser } from '@/lib/hooks/use-user'
import { useCrossTabSync } from '@/lib/hooks/use-cross-tab-sync'
import { I18nProvider } from '@/lib/i18n/i18n-provider'
import { createClient } from '@/lib/supabase/client'

/** Invisible component that activates cross-tab query sync via BroadcastChannel. */
function CrossTabSync() {
  useCrossTabSync()
  return null
}

/**
 * I18nDbBridge — Connects I18nProvider to the user's DB locale_preference.
 *
 * NUCLEAR FIX: UserProvider is now OUTSIDE I18nProvider so that:
 *   1. User data loads first (including locale_preference)
 *   2. I18nProvider receives DB preference as prop (Supreme Commander)
 *   3. On locale change, the bridge persists to DB immediately
 *
 * This eliminates the "stateless toggle" bug where locale was only in localStorage.
 */
function I18nDbBridge({ children }: { children: ReactNode }) {
  const { appUser, isLoading } = useUser()

  // Persist locale to DB when user changes it
  const handleLocaleChange = useCallback(
    async (code: string) => {
      if (!appUser?.id) return
      const supabase = createClient()
      const { error } = await supabase
        .from('users')
        .update({ locale_preference: code })
        .eq('id', appUser.id)
      if (error) {
        console.error('[I18nDbBridge] Failed to persist locale to DB:', error.message, error.details)
      } else {
        console.info('[I18nDbBridge] Locale persisted to DB:', code, 'for user', appUser.id)
      }
    },
    [appUser?.id],
  )

  return (
    <I18nProvider
      userLocalePreference={appUser?.locale_preference ?? null}
      userLoading={isLoading}
      onLocaleChange={handleLocaleChange}
    >
      {children}
    </I18nProvider>
  )
}

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 2 * 60 * 1000,   // 2 minutes (was 1min — reduces refetches on tab switch)
            gcTime: 10 * 60 * 1000,      // 10 minutes garbage collection
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      })
  )

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme="light" disableTransitionOnChange>
        <TooltipProvider>
          {/* NUCLEAR FIX: UserProvider is now OUTSIDE I18nProvider
              so DB locale_preference loads BEFORE i18n hydrates */}
          <UserProvider>
            <I18nDbBridge>
              <TenantProvider>
                <CrossTabSync />
                {children}
                <Toaster position="top-right" richColors closeButton />
              </TenantProvider>
            </I18nDbBridge>
          </UserProvider>
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  )
}
