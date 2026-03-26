'use client'

/**
 * Norva Whisper Welcome Banner — Migration Audit Summary
 *
 * Greets newly onboarded lawyers with a personalised migration summary:
 * "Welcome, [Name]. We've successfully imported 42 matters.
 *  3 require a Drift-Sentry review. 8 are ready for Audit-Mirror optimisation."
 *
 * Displays in the HUD header area and auto-dismisses after 7 days or manual close.
 */

import { useState, useEffect } from 'react'
import { useMigrationAuditSummary } from '@/lib/queries/migration-audit'
import { useTenant } from '@/lib/hooks/use-tenant'
import { useUser } from '@/lib/hooks/use-user'
import {
  Sparkles,
  ShieldAlert,
  Gauge,
  X,
  ChevronRight,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const DISMISS_KEY = 'norva-welcome-dismissed'

export function NorvaWelcomeBanner() {
  const { tenant } = useTenant()
  const tenantId = tenant?.id ?? ''
  const { appUser } = useUser()

  const { data: audit } = useMigrationAuditSummary(tenantId)

  const [dismissed, setDismissed] = useState(false)

  // Check localStorage for previous dismissal
  useEffect(() => {
    try {
      const stored = localStorage.getItem(DISMISS_KEY)
      if (stored) {
        const parsed = JSON.parse(stored)
        if (parsed.tenantId === tenantId) {
          setDismissed(true)
        }
      }
    } catch {
      // ignore
    }
  }, [tenantId])

  const handleDismiss = () => {
    setDismissed(true)
    try {
      localStorage.setItem(DISMISS_KEY, JSON.stringify({
        tenantId,
        dismissedAt: new Date().toISOString(),
      }))
    } catch {
      // ignore
    }
  }

  if (dismissed || !audit?.showWelcome || !appUser) return null

  const firstName = appUser.first_name || appUser.email?.split('@')[0] || 'Counsellor'

  return (
    <div className="relative overflow-hidden rounded-xl border border-violet-500/20 bg-gradient-to-r from-violet-950/60 via-blue-950/60 to-slate-950/60 backdrop-blur-md px-5 py-3.5 mb-4">
      {/* Decorative glow */}
      <div className="absolute -top-12 -left-12 h-32 w-32 rounded-full bg-violet-500/10 blur-3xl" />
      <div className="absolute -bottom-8 -right-8 h-24 w-24 rounded-full bg-blue-500/10 blur-2xl" />

      <div className="relative flex items-start gap-4">
        {/* Icon */}
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-blue-500 text-white shadow-lg shadow-violet-500/20 shrink-0 mt-0.5">
          <Sparkles className="h-5 w-5" />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Greeting */}
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-violet-300/60">
              Norva Whisper
            </span>
          </div>

          <p className="text-sm text-white/90 leading-relaxed">
            Welcome, <span className="font-semibold text-white">{firstName}</span>.
            {audit.totalMatters > 0 && (
              <>
                {' '}We&apos;ve successfully imported{' '}
                <span className="font-semibold text-violet-300">{audit.totalMatters} matter{audit.totalMatters !== 1 ? 's' : ''}</span>.
              </>
            )}
          </p>

          {/* Stats row */}
          {(audit.driftReviewNeeded > 0 || audit.auditReady > 0) && (
            <div className="flex flex-wrap items-center gap-3 mt-2">
              {audit.driftReviewNeeded > 0 && (
                <div className="flex items-center gap-1.5 rounded-lg bg-red-500/10 border border-red-500/20 px-2.5 py-1">
                  <ShieldAlert className="h-3.5 w-3.5 text-red-400" />
                  <span className="text-[11px] text-red-300">
                    <span className="font-semibold">{audit.driftReviewNeeded}</span> require Drift-Sentry review
                  </span>
                  <ChevronRight className="h-3 w-3 text-red-400/50" />
                </div>
              )}

              {audit.auditReady > 0 && (
                <div className="flex items-center gap-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20 px-2.5 py-1">
                  <Gauge className="h-3.5 w-3.5 text-blue-400" />
                  <span className="text-[11px] text-blue-300">
                    <span className="font-semibold">{audit.auditReady}</span> ready for Audit-Mirror optimisation
                  </span>
                  <ChevronRight className="h-3 w-3 text-blue-400/50" />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Dismiss */}
        <button
          onClick={handleDismiss}
          className="rounded-lg p-1.5 text-white/30 hover:bg-white/10 hover:text-white/60 transition-colors shrink-0"
          aria-label="Dismiss welcome banner"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
