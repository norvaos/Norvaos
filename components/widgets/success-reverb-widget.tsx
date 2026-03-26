'use client'

/**
 * SuccessReverbWidget — Embeddable approval-stats widget.
 *
 * Fetches anonymised firm stats from /api/public/success-reverb and displays
 * them as a compact card with animated counters. Designed for embedding on
 * the firm's marketing website.
 *
 * Usage (on the firm's website or NorvaOS landing page):
 *   <SuccessReverbWidget tenantSlug="rana-law" />
 *
 * Performance: no external libs, requestAnimationFrame counter, 0ms TBT.
 */

import { useEffect, useState, useRef, useCallback } from 'react'
import { TrendingUp, Users, Briefcase, Award } from 'lucide-react'

// ── Types ────────────────────────────────────────────────────────────────────

interface ReverbStats {
  total_cases_handled: number
  active_cases: number
  approval_rate_pct: number | null
  total_decided: number
}

interface ReverbPayload {
  firm: string
  stats: ReverbStats
  computed_at: string
}

interface SuccessReverbWidgetProps {
  /** Tenant slug — identifies the firm */
  tenantSlug: string
  /** Override API base URL (defaults to current origin) */
  apiBaseUrl?: string
  /** Compact mode for sidebar embedding */
  compact?: boolean
}

// ── Animated counter hook ────────────────────────────────────────────────────

function useAnimatedNumber(target: number, durationMs = 1200) {
  const [current, setCurrent] = useState(0)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    if (target === 0) { setCurrent(0); return }
    const start = performance.now()
    const from = 0

    function tick(now: number) {
      const elapsed = now - start
      const progress = Math.min(elapsed / durationMs, 1)
      // Ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3)
      setCurrent(Math.round(from + (target - from) * eased))
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick)
      }
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [target, durationMs])

  return current
}

// ── Component ───────────────────────────────────────────────────────────────

export function SuccessReverbWidget({ tenantSlug, apiBaseUrl, compact = false }: SuccessReverbWidgetProps) {
  const [data, setData] = useState<ReverbPayload | null>(null)
  const [error, setError] = useState(false)

  const fetchStats = useCallback(async () => {
    try {
      const base = apiBaseUrl ?? ''
      const res = await fetch(`${base}/api/public/success-reverb?tenant=${encodeURIComponent(tenantSlug)}`)
      if (!res.ok) throw new Error('fetch failed')
      const json = await res.json()
      setData(json)
    } catch {
      setError(true)
    }
  }, [tenantSlug, apiBaseUrl])

  useEffect(() => { fetchStats() }, [fetchStats])

  const totalCases = useAnimatedNumber(data?.stats.total_cases_handled ?? 0)
  const activeCases = useAnimatedNumber(data?.stats.active_cases ?? 0)
  const approvalRate = useAnimatedNumber(data?.stats.approval_rate_pct ?? 0)

  if (error || !data) {
    // Graceful degradation — show nothing if the API is unreachable
    return null
  }

  if (compact) {
    return (
      <div className="rounded-lg border bg-card p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Award className="h-4 w-4 text-indigo-600" />
          <span className="text-xs font-semibold">{data.firm}</span>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <StatMini label="Cases" value={totalCases} />
          <StatMini label="Active" value={activeCases} />
          {data.stats.approval_rate_pct !== null && (
            <StatMini label="Success" value={`${approvalRate}%`} highlight />
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-xl border bg-gradient-to-br from-indigo-50 to-white dark:from-indigo-950/20 dark:to-card p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <NorvaInlineMark />
        <div>
          <h3 className="text-sm font-bold text-foreground">{data.firm}</h3>
          <p className="text-[10px] text-muted-foreground">Verified case statistics</p>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-3 gap-4">
        <StatCard icon={Briefcase} label="Cases Handled" value={totalCases} />
        <StatCard icon={Users} label="Active Cases" value={activeCases} />
        {data.stats.approval_rate_pct !== null && (
          <StatCard icon={TrendingUp} label="Approval Rate" value={`${approvalRate}%`} highlight />
        )}
      </div>

      {/* Footer */}
      <p className="text-[9px] text-muted-foreground text-center">
        Powered by NorvaOS — Updated {new Date(data.computed_at).toLocaleDateString()}
      </p>
    </div>
  )
}

// ── Sub-components ──────────────────────────────────────────────────────────

function NorvaInlineMark() {
  return (
    <svg width="28" height="28" viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <rect width="32" height="32" rx="7.5" fill="#4f46e5" />
      <rect x="6.5" y="7" width="3.5" height="18" rx="1" fill="white" />
      <polygon points="10,7 13.5,7 22,25 18.5,25" fill="white" />
      <rect x="22" y="7" width="3.5" height="18" rx="1" fill="white" />
    </svg>
  )
}

function StatCard({
  icon: Icon,
  label,
  value,
  highlight = false,
}: {
  icon: React.ElementType
  label: string
  value: string | number
  highlight?: boolean
}) {
  return (
    <div className="text-center space-y-1">
      <Icon className={`h-5 w-5 mx-auto ${highlight ? 'text-emerald-500' : 'text-indigo-500'}`} />
      <p className={`text-2xl font-bold ${highlight ? 'text-emerald-600 dark:text-emerald-400' : 'text-foreground'}`}>
        {value}
      </p>
      <p className="text-[10px] text-muted-foreground">{label}</p>
    </div>
  )
}

function StatMini({
  label,
  value,
  highlight = false,
}: {
  label: string
  value: string | number
  highlight?: boolean
}) {
  return (
    <div>
      <p className={`text-lg font-bold ${highlight ? 'text-emerald-600' : 'text-foreground'}`}>{value}</p>
      <p className="text-[9px] text-muted-foreground">{label}</p>
    </div>
  )
}
