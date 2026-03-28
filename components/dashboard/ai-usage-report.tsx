'use client'

/**
 * Sovereign AI Usage Report  -  Directive 037
 *
 * Bento-card dashboard showing AI efficiency metrics:
 *   - Human Hours Saved
 *   - Cost Efficiency Ratio (ROI)
 *   - Total AI Spend
 *   - Intelligence Breakdown table
 *
 * Glassmorphism aesthetic with Emerald Glow indicators.
 */

import { useTenant } from '@/lib/hooks/use-tenant'
import { useAIUsageMetrics } from '@/lib/queries/ai-metrics'
import {
  Brain,
  Clock,
  TrendingUp,
  DollarSign,
  Sparkles,
  Eye,
  Mic,
  PenLine,
  FileText,
  Layers,
  Zap,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// ── Icon resolver ────────────────────────────────────────────────────────────

const FEATURE_ICONS: Record<string, typeof Brain> = {
  document_ocr: Eye,
  transcription: Mic,
  draft_generation: PenLine,
  summarisation: FileText,
  classification: Layers,
  extraction: Zap,
}

// ── Component ────────────────────────────────────────────────────────────────

export function AIUsageReport() {
  const { tenant } = useTenant()
  const { data: metrics, isLoading } = useAIUsageMetrics(tenant?.id ?? '')

  const hoursSaved = metrics?.humanHoursSaved ?? 0
  const roi = metrics?.costEfficiencyRatio ?? 0
  const spendDollars = (metrics?.totalSpendCents ?? 0) / 100
  const breakdown = metrics?.breakdown ?? []

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600">
          <Brain className="h-5 w-5 text-white" />
        </div>
        <div>
          <h2 className="text-lg font-bold tracking-tight">Sovereign AI Usage Report</h2>
          <p className="text-xs text-muted-foreground">This month&rsquo;s intelligence performance</p>
        </div>
      </div>

      {/* ── Efficiency Metrics (3 Bento Cards) ─────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {/* Hours Saved */}
        <div className="relative overflow-hidden rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-emerald-50 to-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-emerald-600">
                Human Hours Saved
              </p>
              <p className="mt-1 text-3xl font-bold tabular-nums text-emerald-900">
                {isLoading ? ' - ' : `${hoursSaved}`}
              </p>
              <p className="mt-0.5 text-xs text-emerald-600/70">This month</p>
            </div>
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-950/40">
              <Clock className="h-5 w-5 text-emerald-400" />
            </div>
          </div>
          {/* Glow */}
          <div className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-emerald-400/20 blur-2xl" />
        </div>

        {/* ROI */}
        <div className="relative overflow-hidden rounded-2xl border border-indigo-200/60 bg-gradient-to-br from-indigo-50 to-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-indigo-600">
                Cost Efficiency Ratio
              </p>
              <p className="mt-1 text-3xl font-bold tabular-nums text-indigo-900">
                {isLoading ? ' - ' : `${roi}x`}
              </p>
              <p className="mt-0.5 text-xs text-indigo-600/70">ROI</p>
            </div>
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-100">
              <TrendingUp className="h-5 w-5 text-indigo-700" />
            </div>
          </div>
          <div className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-indigo-400/20 blur-2xl" />
        </div>

        {/* Total Spend */}
        <div className="relative overflow-hidden rounded-2xl border border-violet-200/60 bg-gradient-to-br from-violet-50 to-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-violet-600">
                Total AI Spend
              </p>
              <p className="mt-1 text-3xl font-bold tabular-nums text-violet-900">
                {isLoading ? ' - ' : `$${spendDollars.toFixed(2)}`}
              </p>
              <p className="mt-0.5 text-xs text-violet-600/70">Infrastructure cost</p>
            </div>
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-violet-100">
              <DollarSign className="h-5 w-5 text-violet-700" />
            </div>
          </div>
          <div className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-violet-400/20 blur-2xl" />
        </div>
      </div>

      {/* ── Intelligence Breakdown Table ───────────────────────────────────── */}
      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="flex items-center gap-2 border-b border-gray-100 px-5 py-3.5">
          <Sparkles className="h-4 w-4 text-indigo-500" />
          <h3 className="text-sm font-semibold">Intelligence Breakdown</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left">
                <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-gray-400">
                  Feature
                </th>
                <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-gray-400 text-right">
                  Volume
                </th>
                <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-gray-400 text-right">
                  Accuracy
                </th>
                <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-gray-400 text-right">
                  Time Saved
                </th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={4} className="px-5 py-8 text-center text-muted-foreground">
                    Loading intelligence data...
                  </td>
                </tr>
              ) : breakdown.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-5 py-8 text-center text-muted-foreground">
                    No AI interactions this period.
                  </td>
                </tr>
              ) : (
                breakdown.map((row) => {
                  const Icon = FEATURE_ICONS[row.feature] ?? Brain
                  return (
                    <tr
                      key={row.feature}
                      className="border-b border-gray-50 last:border-0 transition-colors hover:bg-gray-50/60"
                    >
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-50">
                            <Icon className="h-3.5 w-3.5 text-indigo-600" />
                          </div>
                          <span className="font-medium text-gray-900">{row.label}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums font-medium text-gray-700">
                        {row.volume.toLocaleString()}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <span
                          className={cn(
                            'inline-flex rounded-full px-2 py-0.5 text-xs font-bold tabular-nums',
                            row.accuracy >= 99
                              ? 'bg-emerald-950/30 text-emerald-400'
                              : row.accuracy >= 95
                                ? 'bg-amber-950/30 text-amber-400'
                                : 'bg-red-950/30 text-red-400'
                          )}
                        >
                          {row.accuracy.toFixed(1)}%
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums font-semibold text-emerald-400">
                        {row.hoursSaved} hrs
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Monthly Auto-Report Note */}
      <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 px-4 py-3">
        <p className="text-xs text-indigo-700">
          <strong>Sovereign Productivity Report:</strong> A branded PDF summary is automatically
          generated and sent to the Principal Lawyer at the end of each month.
        </p>
      </div>
    </div>
  )
}
