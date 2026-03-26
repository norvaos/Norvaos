'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  ArrowLeft,
  ArrowUpRight,
  Activity,
  PenTool,
  Languages,
  Clock,
  RefreshCw,
  Zap,
  Users,
  FileText,
  Globe,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { useFirstHourMetrics, type FirstHourMetrics } from '@/lib/queries/first-hour-metrics'

/**
 * Directive 26.1  -  "First-Hour" Command Centre
 *
 * Real-time dashboard tracking the first 60 minutes of firm onboarding:
 *   Panel 1: Clio-to-Norva Sync Velocity (matters + contacts imported/min)
 *   Panel 2: Ghost-Writer Usage (AI drafts generated, unique matters/users)
 *   Panel 3: Language Toggle Distribution (Norva Ear sessions by locale)
 *
 * Goal: See how many of the first 25 firms use Urdu/Punjabi/Hindi
 * Fact-Anchors in their first 60 minutes.
 */

// ── Sparkline (lightweight inline SVG) ──────────────────────────────────────

function Sparkline({
  data,
  color = '#10b981',
  height = 40,
  width = 200,
}: {
  data: number[]
  color?: string
  height?: number
  width?: number
}) {
  if (data.length === 0) return null
  const max = Math.max(...data, 1)
  const step = width / Math.max(data.length - 1, 1)
  const points = data.map((v, i) => `${i * step},${height - (v / max) * height}`).join(' ')
  return (
    <svg width={width} height={height} className="shrink-0">
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

// ── Locale colour mapping ───────────────────────────────────────────────────

const LOCALE_COLORS: Record<string, string> = {
  en: '#6b7280', fr: '#3b82f6', es: '#f59e0b', pa: '#8b5cf6',
  zh: '#ef4444', ar: '#14b8a6', ur: '#ec4899', hi: '#f97316',
  pt: '#22c55e', tl: '#06b6d4', fa: '#a855f7', vi: '#84cc16',
  ko: '#e11d48', uk: '#0ea5e9', bn: '#d946ef',
}

const SOUTH_ASIAN_LABEL = 'Urdu / Punjabi / Hindi'

// ── Stat Card ───────────────────────────────────────────────────────────────

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  accent,
}: {
  icon: typeof Activity
  label: string
  value: string | number
  sub?: string
  accent?: string
}) {
  return (
    <div className="flex items-start gap-3">
      <div
        className="flex size-9 shrink-0 items-center justify-center rounded-lg"
        style={{ backgroundColor: `${accent ?? '#6b7280'}20` }}
      >
        <Icon className="size-4" style={{ color: accent ?? '#6b7280' }} />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-xl font-bold tabular-nums tracking-tight">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

// ── Sync Velocity Panel ─────────────────────────────────────────────────────

function SyncVelocityPanel({ sync }: { sync: FirstHourMetrics['sync'] }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-3 border-b border-slate-100 bg-gradient-to-r from-emerald-50 to-white">
        <Activity className="size-4 text-emerald-600" />
        <h3 className="font-semibold text-sm text-slate-900">Clio-to-Norva Sync Velocity</h3>
        <Badge variant="outline" className="ml-auto text-[10px] border-emerald-200 text-emerald-700">
          Live
        </Badge>
      </div>
      <div className="p-5 space-y-5">
        <div className="grid grid-cols-2 gap-5">
          <StatCard
            icon={FileText}
            label="Matters Imported"
            value={sync.mattersImported}
            sub={`${sync.mattersPerMinute}/min`}
            accent="#10b981"
          />
          <StatCard
            icon={Users}
            label="Contacts Imported"
            value={sync.contactsImported}
            sub={`${sync.contactsPerMinute}/min`}
            accent="#3b82f6"
          />
        </div>

        {/* Sparkline */}
        <div>
          <p className="text-xs text-muted-foreground mb-2">Import velocity (per minute)</p>
          <div className="flex items-end gap-4">
            <div className="flex-1">
              <Sparkline data={sync.timeline.map((t) => t.matters)} color="#10b981" width={280} />
              <div className="flex justify-between mt-1">
                <span className="text-[10px] text-muted-foreground">min 1</span>
                <span className="text-[10px] text-muted-foreground">min {sync.timeline.length}</span>
              </div>
            </div>
            <div className="flex flex-col gap-1 text-[10px]">
              <span className="flex items-center gap-1">
                <span className="size-2 rounded-full bg-emerald-500" /> Matters
              </span>
              <span className="flex items-center gap-1">
                <span className="size-2 rounded-full bg-blue-500" /> Contacts
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Ghost-Writer Panel ──────────────────────────────────────────────────────

function GhostWriterPanel({ gw }: { gw: FirstHourMetrics['ghostWriter'] }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-3 border-b border-slate-100 bg-gradient-to-r from-violet-50 to-white">
        <PenTool className="size-4 text-violet-600" />
        <h3 className="font-semibold text-sm text-slate-900">Ghost-Writer Usage</h3>
        <Badge variant="outline" className="ml-auto text-[10px] border-violet-200 text-violet-700">
          AI Drafts
        </Badge>
      </div>
      <div className="p-5 space-y-5">
        <div className="grid grid-cols-2 gap-5">
          <StatCard
            icon={Zap}
            label="Drafts Generated"
            value={gw.draftsGenerated}
            sub={`${gw.draftsPerMinute}/min`}
            accent="#8b5cf6"
          />
          <StatCard
            icon={FileText}
            label="Matters with Drafts"
            value={gw.uniqueMattersWithDrafts}
            accent="#a855f7"
          />
        </div>
        <div className="flex items-center gap-3 rounded-lg bg-violet-50 px-4 py-3">
          <Users className="size-4 text-violet-600 shrink-0" />
          <div>
            <p className="text-sm font-medium text-violet-900">
              {gw.uniqueUsersWithDrafts} lawyer{gw.uniqueUsersWithDrafts !== 1 ? 's' : ''} active
            </p>
            <p className="text-xs text-violet-600">
              Generated at least one AI draft in this window
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Language Distribution Panel ─────────────────────────────────────────────

function LanguagePanel({ lang }: { lang: FirstHourMetrics['language'] }) {
  const topLocales = lang.distribution.slice(0, 8)
  const remaining = lang.distribution.slice(8)
  const remainingCount = remaining.reduce((sum, l) => sum + l.count, 0)

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-3 border-b border-slate-100 bg-gradient-to-r from-sky-50 to-white">
        <Languages className="size-4 text-sky-600" />
        <h3 className="font-semibold text-sm text-slate-900">Language Toggle Distribution</h3>
        <Badge variant="outline" className="ml-auto text-[10px] border-sky-200 text-sky-700">
          Norva Ear
        </Badge>
      </div>
      <div className="p-5 space-y-5">
        {/* South-Asian highlight */}
        <div className="flex items-center gap-3 rounded-lg bg-gradient-to-r from-orange-50 to-pink-50 px-4 py-3 border border-orange-100">
          <Globe className="size-5 text-orange-500 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-orange-900">
              {lang.southAsianCount} {SOUTH_ASIAN_LABEL} sessions
            </p>
            <p className="text-xs text-orange-600">
              {lang.southAsianPercentage}% of all Fact-Anchors
              {lang.southAsianFirmCount > 0 && ` across ${lang.southAsianFirmCount} firm${lang.southAsianFirmCount !== 1 ? 's' : ''}`}
            </p>
          </div>
          <span className="text-2xl font-bold tabular-nums text-orange-600">
            {lang.southAsianPercentage}%
          </span>
        </div>

        {/* Distribution bars */}
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground font-medium">
            {lang.totalEarSessions} total Ear session{lang.totalEarSessions !== 1 ? 's' : ''}
          </p>
          {topLocales.map((l) => (
            <div key={l.locale} className="flex items-center gap-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="w-16 text-xs font-medium truncate text-slate-700">
                    {l.label}
                  </span>
                </TooltipTrigger>
                <TooltipContent>{l.count} session{l.count !== 1 ? 's' : ''}</TooltipContent>
              </Tooltip>
              <div className="flex-1 h-3 rounded-full bg-slate-100 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${l.percentage}%`,
                    backgroundColor: LOCALE_COLORS[l.locale] ?? '#6b7280',
                  }}
                />
              </div>
              <span className="w-10 text-right text-xs font-medium tabular-nums text-slate-600">
                {l.percentage}%
              </span>
            </div>
          ))}
          {remaining.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="w-16 text-xs text-muted-foreground">Others</span>
              <div className="flex-1 h-3 rounded-full bg-slate-100 overflow-hidden">
                <div
                  className="h-full rounded-full bg-slate-400 transition-all duration-500"
                  style={{
                    width: `${lang.totalEarSessions > 0 ? Math.round((remainingCount / lang.totalEarSessions) * 100) : 0}%`,
                  }}
                />
              </div>
              <span className="w-10 text-right text-xs font-medium tabular-nums text-slate-600">
                {lang.totalEarSessions > 0 ? Math.round((remainingCount / lang.totalEarSessions) * 100) : 0}%
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Loading Skeleton ────────────────────────────────────────────────────────

function MetricsSkeleton() {
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {[1, 2, 3].map((i) => (
        <div key={i} className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-4 w-32" />
        </div>
      ))}
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function FirstHourPage() {
  const { data: metrics, isLoading, error, dataUpdatedAt, refetch, isFetching } = useFirstHourMetrics()
  const [isRefreshing, setIsRefreshing] = useState(false)

  async function handleRefresh() {
    setIsRefreshing(true)
    await refetch()
    setIsRefreshing(false)
  }

  const lastUpdated = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : null

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href="/admin/front-desk-kpis">
            <Button variant="ghost" size="icon" className="size-8">
              <ArrowLeft className="size-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-xl font-bold tracking-tight">First-Hour Command Centre</h1>
            <p className="text-sm text-muted-foreground">
              Real-time onboarding metrics  -  Directive 26.1
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Activation timer */}
          {metrics && (
            <div className="flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5">
              <Clock className="size-3.5 text-muted-foreground" />
              <span className="text-xs font-medium tabular-nums">
                {metrics.minutesSinceActivation <= 60
                  ? `${metrics.minutesSinceActivation}m since activation`
                  : 'Rolling 60-minute window'}
              </span>
            </div>
          )}

          {/* Last updated */}
          {lastUpdated && (
            <span className="text-xs text-muted-foreground">
              Updated {lastUpdated}
            </span>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isFetching}
            className="gap-1.5"
          >
            <RefreshCw className={cn('size-3.5', (isFetching || isRefreshing) && 'animate-spin')} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Live pulse indicator */}
      <div className="flex items-center gap-2">
        <span className="relative flex size-2.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex size-2.5 rounded-full bg-emerald-500" />
        </span>
        <span className="text-xs font-medium text-emerald-700">Live  -  polling every 15 seconds</span>
      </div>

      {/* Error state */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3">
          <p className="text-sm text-red-800">
            Failed to load metrics: {error.message}
          </p>
        </div>
      )}

      {/* Metrics panels */}
      {isLoading ? (
        <MetricsSkeleton />
      ) : metrics ? (
        <div className="grid gap-6 lg:grid-cols-3">
          <SyncVelocityPanel sync={metrics.sync} />
          <GhostWriterPanel gw={metrics.ghostWriter} />
          <LanguagePanel lang={metrics.language} />
        </div>
      ) : null}

      {/* Goal callout */}
      {metrics && (
        <div className="rounded-xl border border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50 px-5 py-4">
          <div className="flex items-start gap-3">
            <ArrowUpRight className="size-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <h4 className="text-sm font-semibold text-amber-900">Launch Goal</h4>
              <p className="text-sm text-amber-700 mt-0.5">
                Track how many of the first 25 firms utilise{' '}
                <span className="font-semibold">{SOUTH_ASIAN_LABEL}</span> Fact-Anchors in their
                first 60 minutes.
              </p>
              <div className="mt-3 flex items-center gap-4">
                <div className="text-center">
                  <p className="text-2xl font-bold tabular-nums text-amber-900">
                    {metrics.language.southAsianFirmCount}
                  </p>
                  <p className="text-[10px] text-amber-600 font-medium">FIRMS</p>
                </div>
                <div className="h-8 w-px bg-amber-200" />
                <div className="text-center">
                  <p className="text-2xl font-bold tabular-nums text-amber-900">
                    {metrics.language.southAsianCount}
                  </p>
                  <p className="text-[10px] text-amber-600 font-medium">SESSIONS</p>
                </div>
                <div className="h-8 w-px bg-amber-200" />
                <div className="text-center">
                  <p className="text-2xl font-bold tabular-nums text-amber-900">
                    {metrics.language.southAsianPercentage}%
                  </p>
                  <p className="text-[10px] text-amber-600 font-medium">OF TOTAL</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
