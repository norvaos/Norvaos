'use client'

import { useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { type ReadinessZoneProps, type ReadinessZoneData } from './types'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  Shield,
  FileText,
  FolderOpen,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Scale,
  Eye,
  Clock,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useLocale } from '@/lib/i18n/use-locale'
import { useUIStore } from '@/lib/stores/ui-store'

// ─── Colour Helpers ──────────────────────────────────────────────────────────

// Directive 016: Sovereign Purple = #7c3aed (violet-600), Emerald = #10b981
function scoreColour(score: number, shieldComplete?: boolean) {
  // Directive 016: Emerald Green glow ONLY when 100% of shield requirements met
  if (shieldComplete && score >= 95) return { stroke: '#10b981', text: 'text-emerald-500', bg: 'bg-emerald-500', gold: false, emerald: true }
  if (score >= 95) return { stroke: '#d4af37', text: 'text-yellow-600', bg: 'bg-yellow-500', gold: true, emerald: false }
  if (score >= 85) return { stroke: '#22c55e', text: 'text-green-600', bg: 'bg-green-500', gold: false, emerald: false }
  if (score >= 60) return { stroke: '#f59e0b', text: 'text-amber-600', bg: 'bg-amber-500', gold: false, emerald: false }
  return { stroke: '#ef4444', text: 'text-red-600', bg: 'bg-red-500', gold: false, emerald: false }
}

function riskColour(level: ReadinessZoneData['riskLevel']) {
  switch (level) {
    case 'low':
      return { badge: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400', icon: 'text-green-600' }
    case 'medium':
      return { badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400', icon: 'text-amber-600' }
    case 'high':
      return { badge: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400', icon: 'text-red-600' }
    case 'critical':
      return { badge: 'bg-red-200 text-red-900 dark:bg-red-900/60 dark:text-red-300', icon: 'text-red-700' }
  }
}

function domainBarColour(pct: number) {
  if (pct >= 85) return 'bg-green-500'
  if (pct >= 60) return 'bg-amber-500'
  return 'bg-red-500'
}

// ─── SVG Score Ring ──────────────────────────────────────────────────────────

const RING_SIZE = 64
const RING_CENTER = RING_SIZE / 2
const RING_RADIUS = 27
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS

function ScoreRing({ score, shieldComplete = false }: { score: number; shieldComplete?: boolean }) {
  const colours = scoreColour(score, shieldComplete)
  const offset = RING_CIRCUMFERENCE - (score / 100) * RING_CIRCUMFERENCE
  const hasGlowFilter = colours.gold || colours.emerald

  return (
    <div className="relative shrink-0">
      {/* Directive 016: Emerald Glow  -  only when shield requirements 100% met */}
      {colours.emerald && (
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background: 'radial-gradient(circle, rgba(16,185,129,0.35) 0%, transparent 70%)',
            animation: 'emerald-glow 2s ease-in-out infinite',
          }}
        />
      )}
      {/* Gold-Pulse glow  -  only when score >= 95 (non-shield) */}
      {colours.gold && (
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background: 'radial-gradient(circle, rgba(212,175,55,0.3) 0%, transparent 70%)',
            animation: 'gold-pulse 2s ease-in-out infinite',
          }}
        />
      )}
      <svg
        width={RING_SIZE}
        height={RING_SIZE}
        viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}
        className="relative"
        aria-hidden="true"
      >
        {/* Glow filter (gold or emerald) */}
        {hasGlowFilter && (
          <defs>
            <filter id={colours.emerald ? 'emerald-ring-glow' : 'gold-glow'}>
              <feGaussianBlur stdDeviation={colours.emerald ? 3 : 2} result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
        )}
        {/* Directive 016: Sovereign Purple background track */}
        <circle
          cx={RING_CENTER}
          cy={RING_CENTER}
          r={RING_RADIUS}
          fill="none"
          stroke="#7c3aed"
          strokeWidth={3}
          opacity={0.2}
        />
        {/* Progress arc */}
        <circle
          cx={RING_CENTER}
          cy={RING_CENTER}
          r={RING_RADIUS}
          fill="none"
          stroke={colours.stroke}
          strokeWidth={hasGlowFilter ? 4 : 3}
          strokeLinecap="round"
          strokeDasharray={RING_CIRCUMFERENCE}
          strokeDashoffset={offset}
          className="transition-all duration-500"
          filter={hasGlowFilter ? `url(#${colours.emerald ? 'emerald-ring-glow' : 'gold-glow'})` : undefined}
          style={{
            transform: 'rotate(-90deg)',
            transformOrigin: '50% 50%',
          }}
        />
        {/* Centre label */}
        <text
          x={RING_CENTER}
          y={RING_CENTER}
          textAnchor="middle"
          dominantBaseline="central"
          className={cn('fill-current font-semibold tabular-nums text-lg', colours.text)}
          style={{ fontSize: '18px' }}
        >
          {score}
        </text>
      </svg>
    </div>
  )
}

// ─── Status Badge ────────────────────────────────────────────────────────────

function StatusBadge({
  label,
  ready,
  blockerCount,
}: {
  label: string
  ready: boolean
  blockerCount?: number
}) {
  const tooltip = ready
    ? `${label}: ready`
    : `${label}: blocked${blockerCount ? ` (${blockerCount} blocker${blockerCount > 1 ? 's' : ''})` : ''}`

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge
          variant="outline"
          size="xs"
          className={cn(
            'gap-1 cursor-default',
            ready
              ? 'border-green-300 bg-green-50 text-green-700 dark:border-green-700 dark:bg-green-900/30 dark:text-green-400'
              : 'border-red-300 bg-red-50 text-red-700 dark:border-red-700 dark:bg-red-900/30 dark:text-red-400'
          )}
        >
          {ready ? (
            <CheckCircle2 className="size-2.5" />
          ) : (
            <XCircle className="size-2.5" />
          )}
          {label}
        </Badge>
      </TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  )
}

// ─── Completion Pill ─────────────────────────────────────────────────────────

function CompletionPill({
  label,
  pct,
  icon: Icon,
}: {
  label: string
  pct: number
  icon: React.ComponentType<{ className?: string }>
}) {
  const colours = scoreColour(pct)

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex items-center gap-1.5 rounded-full bg-muted/50 px-2 py-0.5 cursor-default">
          <Icon className="size-3 text-muted-foreground" />
          <div className="relative h-1.5 w-14 overflow-hidden rounded-full bg-muted">
            <div
              className={cn('h-full rounded-full transition-all duration-500', colours.bg)}
              style={{ width: `${Math.min(pct, 100)}%` }}
            />
          </div>
          <span className="text-[10px] font-medium tabular-nums text-muted-foreground">
            {pct}%
          </span>
        </div>
      </TooltipTrigger>
      <TooltipContent>{label}: {pct}% complete</TooltipContent>
    </Tooltip>
  )
}

// ─── Skeleton State ──────────────────────────────────────────────────────────

function ReadinessZoneSkeleton() {
  return (
    <div
      role="region"
      aria-label="Readiness overview"
      aria-busy="true"
      className="flex flex-col gap-3 p-3"
    >
      {/* Score ring + risk badge row */}
      <div className="flex items-center gap-3">
        <Skeleton className="size-16 rounded-full" />
        <div className="flex flex-col gap-1.5">
          <Skeleton className="h-5 w-24 rounded-full" />
          <Skeleton className="h-4 w-16" />
        </div>
      </div>

      {/* Status indicators row */}
      <div className="flex flex-wrap gap-1.5">
        <Skeleton className="h-5 w-16 rounded-full" />
        <Skeleton className="h-5 w-14 rounded-full" />
        <Skeleton className="h-5 w-20 rounded-full" />
        <Skeleton className="h-5 w-18 rounded-full" />
      </div>

      {/* Domain breakdown */}
      <div className="flex flex-col gap-1.5">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center gap-2">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-1.5 w-full rounded-full" />
            <Skeleton className="h-3 w-8" />
          </div>
        ))}
      </div>

      {/* Completion meters */}
      <div className="flex gap-2">
        <Skeleton className="h-6 w-24 rounded-full" />
        <Skeleton className="h-6 w-24 rounded-full" />
      </div>
    </div>
  )
}

// ─── Main Component ──────────────────────────────────────────────────────────

// H&C Playbook deep-link target
const HC_PLAYBOOK_ID = 'a0000001-0000-4000-a000-000000000001'
const HC_WP_SECTION = 'work-permit-restoration-hc-overlap'

export function ReadinessZone({ data, isLoading, onDrillDown }: ReadinessZoneProps) {
  const router = useRouter()
  const { t, locale } = useLocale()
  const openCommandPaletteWith = useUIStore((s) => s.openCommandPaletteWith)

  /** Navigate directly to the Work Permit Restoration section of the H&C Playbook */
  const jumpToPlaybookSection = useCallback(() => {
    router.push(`/wiki/playbooks/${HC_PLAYBOOK_ID}#${HC_WP_SECTION}`)
  }, [router])

  const riskStyles = useMemo(
    () => (data ? riskColour(data.riskLevel) : null),
    [data?.riskLevel]
  )

  // Directive 016: Shield complete = all "shield" domains (Documents, Review, Compliance) at 100%
  const shieldComplete = useMemo(() => {
    if (!data) return false
    const shieldDomains = ['Documents', 'Review', 'Compliance']
    return shieldDomains.every((key) => {
      const domain = data.domains.find((d) => d.key === key)
      return domain ? domain.pct >= 100 : false
    })
  }, [data])

  if (isLoading || !data) {
    return <ReadinessZoneSkeleton />
  }

  const {
    overallScore,
    riskLevel,
    draftingReady,
    draftingBlockerCount,
    filingReady,
    filingBlockerCount,
    lawyerReviewRequired,
    stalePacks,
    contradictionCount,
    domains,
    formsPct,
    docsPct,
    topBlockers,
  } = data

  // Directive 016: Critical pulse when readiness < 35
  const isCriticalPulse = overallScore < 35

  return (
    <TooltipProvider>
      <div
        role="region"
        aria-label="Readiness overview"
        className={cn(
          'flex flex-col gap-3 p-3 transition-colors rounded-lg border',
          isCriticalPulse && 'animate-emerald-pulse-critical bg-violet-950/5 dark:bg-violet-950/20',
          !isCriticalPulse && 'border-transparent',
          onDrillDown && 'cursor-pointer hover:bg-muted/40'
        )}
        onClick={onDrillDown}
        onKeyDown={(e) => {
          if (onDrillDown && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault()
            onDrillDown()
          }
        }}
        tabIndex={onDrillDown ? 0 : undefined}
      >
        {/* ── Row 1: Score Ring + Risk Badge ────────────────────────────── */}
        <div className="flex items-center gap-3">
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="shrink-0">
                <ScoreRing score={overallScore} shieldComplete={shieldComplete} />
              </div>
            </TooltipTrigger>
            <TooltipContent>Overall readiness score: {overallScore}/100</TooltipContent>
          </Tooltip>

          <div className="flex flex-col gap-1 min-w-0">
            <Badge
              variant="outline"
              size="sm"
              className={cn('gap-1 w-fit', riskStyles?.badge)}
            >
              <Shield className={cn('size-3', riskStyles?.icon)} />
              {riskLevel.charAt(0).toUpperCase() + riskLevel.slice(1)} Risk
            </Badge>

            {overallScore >= 95 && shieldComplete && (
              <Badge
                variant="outline"
                size="sm"
                className="gap-1 w-fit border-emerald-400 bg-gradient-to-r from-emerald-50 to-green-50 text-emerald-800 dark:from-emerald-900/30 dark:to-green-900/30 dark:text-emerald-300 dark:border-emerald-600"
                style={{ animation: 'emerald-glow 2s ease-in-out infinite' }}
              >
                <Shield className="size-3 text-emerald-600" />
                Shield Complete
              </Badge>
            )}
            {overallScore >= 95 && !shieldComplete && (
              <Badge
                variant="outline"
                size="sm"
                className="gap-1 w-fit border-yellow-400 bg-gradient-to-r from-yellow-50 to-amber-50 text-yellow-800 dark:from-yellow-900/30 dark:to-amber-900/30 dark:text-yellow-300 dark:border-yellow-600"
                style={{ animation: 'gold-pulse 2s ease-in-out infinite' }}
              >
                <CheckCircle2 className="size-3 text-yellow-600" />
                Ready for Fast-Track
              </Badge>
            )}

            {topBlockers.length > 0 && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="text-[10px] text-muted-foreground truncate cursor-default">
                    <AlertTriangle className="inline size-2.5 mr-0.5 text-amber-500" />
                    {topBlockers.length} blocker{topBlockers.length > 1 ? 's' : ''}
                  </span>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-xs p-2">
                  <p className="text-[10px] text-muted-foreground mb-1">Click a blocker to search the Wiki</p>
                  <ul className="space-y-0.5">
                    {topBlockers.map((b, i) => (
                      <li key={i} className="text-xs">
                        <button
                          type="button"
                          className="text-left hover:text-primary hover:underline transition-colors w-full rounded px-1 py-0.5 hover:bg-primary/5"
                          onClick={() => {
                            // Compliance blockers jump directly to the H&C Playbook section
                            if (b.type === 'compliance') jumpToPlaybookSection()
                            else openCommandPaletteWith(b.label)
                          }}
                        >
                          <span className="font-medium capitalize">{b.type}:</span> {b.label}
                        </button>
                      </li>
                    ))}
                  </ul>
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        </div>

        {/* ── Row 2: Status Indicators ──────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-1.5">
          <StatusBadge
            label="Drafting"
            ready={draftingReady}
            blockerCount={draftingBlockerCount}
          />
          <StatusBadge
            label="Filing"
            ready={filingReady}
            blockerCount={filingBlockerCount}
          />

          {lawyerReviewRequired && (
            <Badge
              variant="outline"
              size="xs"
              className="gap-1 border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
            >
              <Eye className="size-2.5" />
              Review Req.
            </Badge>
          )}

          {stalePacks > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge
                  variant="outline"
                  size="xs"
                  className="gap-1 border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                >
                  <AlertTriangle className="size-2.5" />
                  {stalePacks} Stale
                </Badge>
              </TooltipTrigger>
              <TooltipContent>
                {stalePacks} stale pack{stalePacks > 1 ? 's' : ''} need refreshing
              </TooltipContent>
            </Tooltip>
          )}

          {contradictionCount > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge
                  variant="outline"
                  size="xs"
                  className="gap-1 border-red-300 bg-red-50 text-red-700 dark:border-red-700 dark:bg-red-900/30 dark:text-red-400"
                >
                  <Scale className="size-2.5" />
                  {contradictionCount} Contradiction{contradictionCount > 1 ? 's' : ''}
                </Badge>
              </TooltipTrigger>
              <TooltipContent>
                {contradictionCount} data contradiction{contradictionCount > 1 ? 's' : ''} detected
              </TooltipContent>
            </Tooltip>
          )}

          {/* ── Compliance Alert Badge (Directive 27.1) ──────────────────── */}
          {(() => {
            const complianceDomain = domains.find(d => d.key === 'Compliance')
            if (!complianceDomain || complianceDomain.pct >= 70) return null
            const detail = complianceDomain.pct <= 0
              ? t('status.document_expired', 'DOCUMENT EXPIRED')
              : `${t('status.document_expiry', 'DOCUMENT EXPIRY')} (${Math.round((complianceDomain.pct / 60) * 90)}D)`
            return (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge
                    variant="outline"
                    size="xs"
                    data-locale={locale}
                    className={cn(
                      'gap-1 cursor-pointer animate-pulse',
                      complianceDomain.pct <= 0
                        ? 'border-red-400 bg-red-100 text-red-800 dark:border-red-600 dark:bg-red-900/40 dark:text-red-300'
                        : 'border-amber-400 bg-amber-100 text-amber-800 dark:border-amber-600 dark:bg-amber-900/40 dark:text-amber-300'
                    )}
                    onClick={(e) => {
                      e.stopPropagation()
                      // Deep-link: jump directly to the "Work Permit Restoration
                      // & H&C Overlap" section of the H&C Playbook.
                      jumpToPlaybookSection()
                    }}
                  >
                    <Clock className="size-2.5" />
                    {detail}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  Compliance score: {complianceDomain.pct}%  -  Click to view expiring documents
                </TooltipContent>
              </Tooltip>
            )
          })()}
        </div>

        {/* ── Row 3: Domain Breakdown ───────────────────────────────────── */}
        {domains.length > 0 && (
          <div className="flex flex-col gap-1.5">
            {domains.map((domain) => (
              <Tooltip key={domain.key}>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-2 cursor-default group">
                    <span className="w-24 shrink-0 truncate text-[10px] text-muted-foreground group-hover:text-foreground transition-colors">
                      {domain.label}
                    </span>
                    <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                      <div
                        className={cn(
                          'h-full rounded-full transition-all duration-500',
                          domainBarColour(domain.pct)
                        )}
                        style={{ width: `${Math.min(domain.pct, 100)}%` }}
                      />
                    </div>
                    <span className="w-8 shrink-0 text-right text-[10px] font-medium tabular-nums text-muted-foreground">
                      {domain.pct}%
                    </span>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  {domain.label}: {domain.satisfied}/{domain.total} satisfied ({domain.pct}%)
                </TooltipContent>
              </Tooltip>
            ))}
          </div>
        )}

        {/* ── Row 4: Completion Meters ──────────────────────────────────── */}
        <div className="flex items-center gap-2">
          <CompletionPill label="Forms" pct={formsPct} icon={FileText} />
          <CompletionPill label="Docs" pct={docsPct} icon={FolderOpen} />
        </div>
      </div>
    </TooltipProvider>
  )
}
