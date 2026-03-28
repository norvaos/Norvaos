'use client'

import { useState, useCallback } from 'react'
import { useVitalityData } from './use-vitality-data'
import { ReadinessZone } from './readiness-zone'
import { RelationshipsZone } from './relationships-zone'
import { StagesZone } from './stages-zone'
import { FinancialsZone } from './financials-zone'
import { DocumentsZone } from './documents-zone'
import type { VitalityHeaderProps, VitalityZone } from './types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { Activity, FileDown, Loader2 } from 'lucide-react'

// ─── Mini Score Ring (compact mode) ─────────────────────────────────────────

const MINI_RING_SIZE = 28
const MINI_RING_CENTER = MINI_RING_SIZE / 2
const MINI_RING_RADIUS = 10
const MINI_RING_CIRCUMFERENCE = 2 * Math.PI * MINI_RING_RADIUS

function MiniScoreRing({ score }: { score: number }) {
  const stroke =
    score >= 85 ? '#22c55e' : score >= 60 ? '#f59e0b' : '#ef4444'
  const offset =
    MINI_RING_CIRCUMFERENCE - (score / 100) * MINI_RING_CIRCUMFERENCE

  return (
    <svg
      width={MINI_RING_SIZE}
      height={MINI_RING_SIZE}
      viewBox={`0 0 ${MINI_RING_SIZE} ${MINI_RING_SIZE}`}
      className="shrink-0"
      aria-hidden="true"
    >
      <circle
        cx={MINI_RING_CENTER}
        cy={MINI_RING_CENTER}
        r={MINI_RING_RADIUS}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        className="text-muted/30"
      />
      <circle
        cx={MINI_RING_CENTER}
        cy={MINI_RING_CENTER}
        r={MINI_RING_RADIUS}
        fill="none"
        stroke={stroke}
        strokeWidth={2}
        strokeLinecap="round"
        strokeDasharray={MINI_RING_CIRCUMFERENCE}
        strokeDashoffset={offset}
        className="transition-all duration-500"
        style={{ transform: 'rotate(-90deg)', transformOrigin: '50% 50%' }}
      />
      <text
        x={MINI_RING_CENTER}
        y={MINI_RING_CENTER}
        textAnchor="middle"
        dominantBaseline="central"
        className="fill-current text-[9px] font-semibold tabular-nums"
      >
        {score}
      </text>
    </svg>
  )
}

// ─── Risk Badge Colour ──────────────────────────────────────────────────────

function riskBadgeClass(level: string): string {
  switch (level) {
    case 'low':
      return 'bg-emerald-950/30 text-emerald-400 dark:bg-green-900/40 dark:text-green-400'
    case 'medium':
      return 'bg-amber-950/30 text-amber-400 dark:bg-amber-900/40 dark:text-amber-400'
    case 'high':
      return 'bg-red-950/40 text-red-400 dark:bg-red-900/40 dark:text-red-400'
    case 'critical':
      return 'bg-red-200 text-red-900 dark:bg-red-900/60 dark:text-red-300'
    default:
      return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400'
  }
}

// ─── Format currency from cents ─────────────────────────────────────────────

function formatCents(cents: number): string {
  const abs = Math.abs(cents)
  if (abs >= 100_000) {
    return `$${(cents / 100).toLocaleString('en-CA', { maximumFractionDigits: 0 })}`
  }
  return `$${(cents / 100).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

// ─── Compact Mode Strip ─────────────────────────────────────────────────────

function CompactStrip({
  data,
  onExpand,
  onZoneDrillDown,
}: {
  data: ReturnType<typeof useVitalityData>
  onExpand: () => void
  onZoneDrillDown?: (zone: VitalityZone) => void
}) {
  const { readinessZone, stagesZone, financialsZone, documentsZone } = data

  return (
    <div
      role="region"
      aria-label="Matter vitality summary"
      className="flex items-center gap-4 rounded-lg border bg-card px-4 py-2 shadow-sm"
    >
      {/* Readiness score mini ring */}
      <button
        type="button"
        onClick={() => onZoneDrillDown?.('readiness') ?? onExpand()}
        className="flex items-center gap-1.5 rounded-md px-1.5 py-1 transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label="Readiness score"
      >
        {readinessZone ? (
          <MiniScoreRing score={readinessZone.overallScore} />
        ) : (
          <Skeleton className="size-7 rounded-full" />
        )}
      </button>

      {/* Risk badge */}
      <button
        type="button"
        onClick={() => onZoneDrillDown?.('readiness') ?? onExpand()}
        className="flex items-center rounded-md px-1.5 py-1 transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label="Risk level"
      >
        {readinessZone ? (
          <span
            className={cn(
              'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium',
              riskBadgeClass(readinessZone.riskLevel),
            )}
          >
            {readinessZone.riskLevel.charAt(0).toUpperCase() +
              readinessZone.riskLevel.slice(1)}{' '}
            Risk
          </span>
        ) : (
          <Skeleton className="h-5 w-16 rounded-full" />
        )}
      </button>

      {/* Separator */}
      <div className="h-5 w-px bg-border" aria-hidden="true" />

      {/* Current stage */}
      <button
        type="button"
        onClick={() => onZoneDrillDown?.('stages') ?? onExpand()}
        className="flex items-center gap-1 rounded-md px-1.5 py-1 transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label="Current stage"
      >
        {stagesZone ? (
          <span className="text-xs font-medium text-foreground truncate max-w-[140px]">
            {stagesZone.currentStageName ?? 'No stage'}
          </span>
        ) : (
          <Skeleton className="h-4 w-24" />
        )}
      </button>

      {/* Separator */}
      <div className="h-5 w-px bg-border" aria-hidden="true" />

      {/* Trust balance */}
      <button
        type="button"
        onClick={() => onZoneDrillDown?.('financials') ?? onExpand()}
        className="flex items-center gap-1 rounded-md px-1.5 py-1 transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label="Trust balance"
      >
        {financialsZone ? (
          <span
            className={cn(
              'text-xs font-medium tabular-nums',
              financialsZone.financialHealth === 'critical'
                ? 'text-red-600 dark:text-red-400'
                : financialsZone.financialHealth === 'warning'
                  ? 'text-amber-600 dark:text-amber-400'
                  : 'text-green-600 dark:text-green-400',
            )}
          >
            {formatCents(financialsZone.trustBalanceCents)}
          </span>
        ) : (
          <Skeleton className="h-4 w-16" />
        )}
      </button>

      {/* Separator */}
      <div className="h-5 w-px bg-border" aria-hidden="true" />

      {/* Doc completion % */}
      <button
        type="button"
        onClick={() => onZoneDrillDown?.('documents') ?? onExpand()}
        className="flex items-center gap-1 rounded-md px-1.5 py-1 transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label="Document completion"
      >
        {documentsZone ? (
          <span className="text-xs font-medium tabular-nums text-muted-foreground">
            Docs {documentsZone.completionPct}%
          </span>
        ) : (
          <Skeleton className="h-4 w-16" />
        )}
      </button>

      {/* Expand button */}
      <button
        type="button"
        onClick={onExpand}
        className={cn(
          'ml-auto shrink-0 rounded-md p-1.5 transition-colors',
          'text-muted-foreground hover:text-foreground hover:bg-muted/60',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        )}
        aria-label="Expand vitality header"
      >
        <Activity className="size-4" />
      </button>
    </div>
  )
}

// ─── Skeleton ───────────────────────────────────────────────────────────────

export function VitalityHeaderSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      {/* Top bar skeleton */}
      <div className="flex items-center gap-2 px-1">
        <Skeleton className="h-4 w-4" />
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-4 w-24 ml-auto" />
      </div>

      {/* Grid skeleton matching exact layout */}
      <div
        className="grid gap-3"
        style={{
          gridTemplateColumns: '1fr 2fr 1fr',
          gridTemplateRows: 'auto 1fr auto',
        }}
      >
        {/* Row 1: Readiness  -  spans 3 cols */}
        <Card className="col-span-3 overflow-hidden">
          <CardContent className="p-3" style={{ minHeight: 80 }}>
            <div className="flex items-center gap-3">
              <Skeleton className="size-16 rounded-full" />
              <div className="flex flex-col gap-1.5 flex-1">
                <Skeleton className="h-5 w-24 rounded-full" />
                <Skeleton className="h-4 w-16" />
                <div className="flex gap-1.5">
                  <Skeleton className="h-5 w-16 rounded-full" />
                  <Skeleton className="h-5 w-14 rounded-full" />
                  <Skeleton className="h-5 w-20 rounded-full" />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Row 2, Col 1: Relationships */}
        <Card className="overflow-hidden" style={{ minHeight: 240 }}>
          <CardHeader className="p-3 pb-1">
            <Skeleton className="h-4 w-24" />
          </CardHeader>
          <CardContent className="p-3 pt-0">
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <Skeleton className="size-10 rounded-full" />
                <div className="flex flex-col gap-1">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-4 w-20 rounded-full" />
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-4 w-44" />
                <Skeleton className="h-4 w-40" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Row 2, Col 2: Stages */}
        <Card className="overflow-hidden" style={{ minHeight: 240 }}>
          <CardHeader className="p-3 pb-1">
            <Skeleton className="h-4 w-20" />
          </CardHeader>
          <CardContent className="p-3 pt-0">
            <div className="flex flex-col gap-3">
              <Skeleton className="h-8 w-full rounded-lg" />
              <div className="flex items-center justify-between">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-16" />
              </div>
              <div className="flex gap-1">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-8 flex-1 rounded" />
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Row 2, Col 3: Financials */}
        <Card className="overflow-hidden" style={{ minHeight: 240 }}>
          <CardHeader className="p-3 pb-1">
            <Skeleton className="h-4 w-20" />
          </CardHeader>
          <CardContent className="p-3 pt-0">
            <div className="flex flex-col gap-3">
              <Skeleton className="h-8 w-24" />
              <div className="grid grid-cols-2 gap-2">
                <Skeleton className="h-12 rounded" />
                <Skeleton className="h-12 rounded" />
                <Skeleton className="h-12 rounded" />
                <Skeleton className="h-12 rounded" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Row 3: Documents  -  spans 3 cols */}
        <Card className="col-span-3 overflow-hidden">
          <CardContent className="p-3" style={{ minHeight: 60 }}>
            <div className="flex items-center gap-4">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-2 flex-1 rounded-full" />
              <Skeleton className="h-4 w-12" />
              <div className="flex gap-1.5 ml-auto">
                <Skeleton className="h-5 w-16 rounded-full" />
                <Skeleton className="h-5 w-16 rounded-full" />
                <Skeleton className="h-5 w-16 rounded-full" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

// ─── Main Component ─────────────────────────────────────────────────────────

export function VitalityHeader({
  matterId,
  tenantId,
  userId,
  compact: compactProp = false,
  onZoneDrillDown,
}: VitalityHeaderProps) {
  const [isCompact, setIsCompact] = useState(compactProp)

  const data = useVitalityData(matterId)
  const {
    isLoading,
    stagesLoading,
    readinessZone,
    relationshipsZone,
    stagesZone,
    financialsZone,
    documentsZone,
    matter,
  } = data

  const handleZoneDrillDown = useCallback(
    (zone: VitalityZone) => {
      onZoneDrillDown?.(zone)
    },
    [onZoneDrillDown],
  )

  const handleToggleCompact = useCallback(() => {
    setIsCompact((prev) => !prev)
  }, [])

  const [reportLoading, setReportLoading] = useState(false)
  const handleGenerateReport = useCallback(async () => {
    if (reportLoading) return
    setReportLoading(true)
    try {
      const res = await fetch(`/api/matters/${matterId}/health-report`)
      if (!res.ok) throw new Error('Failed to generate report')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `health-report-${matter?.matter_number ?? matterId}.pdf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('[VitalityHeader] Report generation failed:', err)
    } finally {
      setReportLoading(false)
    }
  }, [matterId, matter?.matter_number, reportLoading])

  // ── Full loading state ──────────────────────────────────────────────────
  if (isLoading && !matter) {
    return <VitalityHeaderSkeleton />
  }

  // ── Compact mode ────────────────────────────────────────────────────────
  if (isCompact) {
    return (
      <div
        className={cn(
          'transition-all duration-300 ease-in-out',
          'overflow-hidden',
        )}
        style={{ maxHeight: isCompact ? 60 : 1200 }}
      >
        <CompactStrip
          data={data}
          onExpand={handleToggleCompact}
          onZoneDrillDown={onZoneDrillDown}
        />
      </div>
    )
  }

  // ── Full mode ───────────────────────────────────────────────────────────
  return (
    <div
      className={cn(
        'flex flex-col gap-2 transition-all duration-300 ease-in-out',
        'overflow-hidden',
      )}
    >
      {/* ── Top Bar: Matter Title + Number ─────────────────────────────── */}
      <div className="flex items-center gap-2 px-1">
        <button
          type="button"
          onClick={handleToggleCompact}
          className={cn(
            'shrink-0 rounded-md p-1 transition-colors',
            'text-muted-foreground hover:text-foreground hover:bg-muted/60',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          )}
          aria-label="Collapse to compact view"
        >
          <Activity className="size-4" />
        </button>
        <h2 className="text-sm font-semibold text-foreground truncate">
          {matter?.title ?? 'Untitled Matter'}
        </h2>
        {matter?.matter_number && (
          <span className="shrink-0 text-xs font-mono tabular-nums text-muted-foreground">
            {matter.matter_number}
          </span>
        )}
        <button
          type="button"
          onClick={handleGenerateReport}
          disabled={reportLoading}
          className={cn(
            'ml-auto shrink-0 inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
            'bg-primary/10 text-primary hover:bg-primary/20',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            'disabled:opacity-50 disabled:cursor-not-allowed',
          )}
          aria-label="Generate health report PDF"
        >
          {reportLoading ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <FileDown className="size-3.5" />
          )}
          {reportLoading ? 'Generating…' : 'Health Report'}
        </button>
      </div>

      {/* ── Grid: 3-col x 3-row layout ────────────────────────────────── */}
      <div
        className="grid gap-3"
        style={{
          gridTemplateColumns: '1fr 2fr 1fr',
          gridTemplateRows: 'auto 1fr auto',
        }}
      >
        {/* Row 1: Readiness Zone  -  spans all 3 columns */}
        <Card className="col-span-3 overflow-hidden">
          <CardContent className="p-0" style={{ minHeight: 80 }}>
            <ReadinessZone
              data={readinessZone}
              isLoading={isLoading}
              onDrillDown={() => handleZoneDrillDown('readiness')}
            />
          </CardContent>
        </Card>

        {/* Row 2, Col 1: Relationships Zone (left rail, scrollable) */}
        <Card className="overflow-hidden" style={{ minHeight: 240 }}>
          <CardHeader className="p-3 pb-0">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Relationships
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 overflow-y-auto" style={{ maxHeight: 400 }}>
            <RelationshipsZone
              data={relationshipsZone}
              isLoading={isLoading}
              tenantId={tenantId}
              userId={userId}
              matterId={matterId}
              onDrillDown={() => handleZoneDrillDown('relationships')}
            />
          </CardContent>
        </Card>

        {/* Row 2, Col 2: Stages Zone (centre, full width) */}
        <Card className="overflow-hidden" style={{ minHeight: 240 }}>
          <CardHeader className="p-3 pb-0">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Pipeline
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <StagesZone
              data={stagesZone}
              isLoading={isLoading || stagesLoading}
              onDrillDown={() => handleZoneDrillDown('stages')}
            />
          </CardContent>
        </Card>

        {/* Row 2, Col 3: Financials Zone (right rail, scrollable) */}
        <Card className="overflow-hidden" style={{ minHeight: 240 }}>
          <CardHeader className="p-3 pb-0">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Financials
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 overflow-y-auto" style={{ maxHeight: 400 }}>
            <FinancialsZone
              data={financialsZone}
              isLoading={isLoading}
              onDrillDown={() => handleZoneDrillDown('financials')}
            />
          </CardContent>
        </Card>

        {/* Row 3: Documents Zone  -  spans all 3 columns */}
        <Card className="col-span-3 overflow-hidden">
          <CardContent className="p-0" style={{ minHeight: 60 }}>
            <DocumentsZone
              data={documentsZone}
              isLoading={isLoading}
              onDrillDown={() => handleZoneDrillDown('documents')}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
