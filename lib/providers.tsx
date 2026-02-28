'use client'

import { useState, type ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Toaster } from '@/components/ui/sonner'
import { TenantProvider } from '@/lib/hooks/use-tenant'
import { UserProvider } from '@/lib/hooks/use-user'

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
      <TooltipProvider>
        <UserProvider>
          <TenantProvider>
            {children}
            <Toaster position="bottom-right" richColors closeButton />
          </TenantProvider>
        </UserProvider>
      </TooltipProvider>
    </QueryClientProvider>
  )
}
