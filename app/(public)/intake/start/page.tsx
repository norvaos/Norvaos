'use client'

/**
 * Intake Start  -  Journey Initializer (Directive 33.0 §A)
 *
 * Public entry point for new client intake. Creates a ClientSession with
 * the preferred_language pre-set from the concierge globe selection,
 * then redirects to the intake flow with the session token.
 */

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Sparkles } from 'lucide-react'
import { NorvaLogo } from '@/components/landing/norva-logo'
import { getPersistedLocale, DEFAULT_LOCALE } from '@/lib/i18n/config'

export default function IntakeStartPage() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function createSession() {
      try {
        const preferredLanguage = getPersistedLocale() ?? DEFAULT_LOCALE

        const res = await fetch('/api/intake/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            preferred_language: preferredLanguage,
            source: 'concierge',
          }),
        })

        if (!res.ok) {
          const data = await res.json().catch(() => ({ error: 'Failed to start intake' }))
          throw new Error(data.error ?? 'Failed to create session')
        }

        const { token } = await res.json()
        if (cancelled) return

        // Redirect to the intake flow with the session token
        router.replace(`/intake/${token}`)
      } catch (err) {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Something went wrong')
        setIsCreating(false)
      }
    }

    createSession()
    return () => { cancelled = true }
  }, [router])

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6">
      <NorvaLogo size={48} id="intake-start" />

      {isCreating && !error && (
        <div className="mt-6 text-center">
          <Loader2 className="h-8 w-8 text-primary animate-spin mx-auto mb-3" />
          <p className="text-sm font-medium text-foreground">Preparing your intake...</p>
          <p className="text-[11px] text-muted-foreground mt-1">
            Setting up a secure session for you.
          </p>
        </div>
      )}

      {error && (
        <div className="mt-6 text-center max-w-sm">
          <p className="text-sm font-medium text-destructive mb-2">Unable to start intake</p>
          <p className="text-[11px] text-muted-foreground mb-4">{error}</p>
          <button
            onClick={() => {
              setError(null)
              setIsCreating(true)
              router.refresh()
            }}
            className="text-xs text-primary underline"
          >
            Try again
          </button>
        </div>
      )}
    </div>
  )
}
