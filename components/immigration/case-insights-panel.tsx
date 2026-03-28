'use client'

import { useMemo, useState, useCallback } from 'react'
import {
  useMatterImmigration,
  useMatterDeadlines,
  useCaseStages,
} from '@/lib/queries/immigration'
import { useDocumentSlots } from '@/lib/queries/document-slots'
import {
  analyzeCaseInsightsV2,
} from '@/lib/utils/case-insights-engine'
import type {
  CaseInsights,
  InsightSeverity,
  CrsAnalysis,
  ReadinessBreakdown,
  DocumentSlotSummary,
} from '@/lib/utils/case-insights-engine'
import { cn } from '@/lib/utils'

import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import {
  AlertTriangle,
  AlertCircle,
  Info,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Lightbulb,
  TrendingUp,
  TrendingDown,
  Minus,
  FileSearch,
  Shield,
} from 'lucide-react'

// ─── Props ──────────────────────────────────────────────────────────────────────

interface CaseInsightsPanelProps {
  matterId: string
  tenantId: string
  stageEnteredAt?: string
  currentStageName?: string
}

// ─── Severity Config ────────────────────────────────────────────────────────────

const SEVERITY_CONFIG: Record<InsightSeverity, {
  icon: React.ComponentType<{ className?: string }>
  color: string
  bg: string
  border: string
  label: string
}> = {
  critical: {
    icon: AlertTriangle,
    color: 'text-red-600',
    bg: 'bg-red-950/30',
    border: 'border-red-500/20',
    label: 'Critical',
  },
  warning: {
    icon: AlertCircle,
    color: 'text-amber-600',
    bg: 'bg-amber-950/30',
    border: 'border-amber-500/30',
    label: 'Warning',
  },
  info: {
    icon: Info,
    color: 'text-blue-600',
    bg: 'bg-blue-950/30',
    border: 'border-blue-500/20',
    label: 'Info',
  },
  success: {
    icon: CheckCircle2,
    color: 'text-green-600',
    bg: 'bg-emerald-950/30',
    border: 'border-emerald-500/30',
    label: 'Good',
  },
}

// ─── Readiness Gauge ────────────────────────────────────────────────────────────

function ReadinessGauge({
  label,
  score,
  detail,
}: {
  label: string
  score: number
  detail: string
}) {
  const color =
    score >= 80
      ? 'text-green-600'
      : score >= 50
        ? 'text-amber-600'
        : 'text-red-600'

  const progressClass =
    score >= 80
      ? '[&_[data-slot=progress-indicator]]:bg-emerald-950/300'
      : score >= 50
        ? '[&_[data-slot=progress-indicator]]:bg-amber-950/300'
        : '[&_[data-slot=progress-indicator]]:bg-red-950/300'

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-slate-600">{label}</span>
        <span className={cn('text-xs font-bold tabular-nums', color)}>{score}%</span>
      </div>
      <Progress value={score} className={cn('h-1.5', progressClass)} />
      <p className="text-[10px] text-slate-400">{detail}</p>
    </div>
  )
}

// ─── CRS Competitiveness Card ───────────────────────────────────────────────────

function CrsCompetitivenessCard({ analysis }: { analysis: CrsAnalysis }) {
  const statusConfig = {
    competitive: {
      label: 'Competitive',
      color: 'text-green-600',
      bg: 'bg-emerald-950/30 border-emerald-500/30',
      icon: TrendingUp,
    },
    borderline: {
      label: 'Borderline',
      color: 'text-amber-600',
      bg: 'bg-amber-950/30 border-amber-500/30',
      icon: Minus,
    },
    needs_improvement: {
      label: 'Below Cutoff',
      color: 'text-red-600',
      bg: 'bg-red-950/30 border-red-500/20',
      icon: TrendingDown,
    },
  }

  const config = statusConfig[analysis.status]
  const StatusIcon = config.icon

  return (
    <div className={cn('rounded-lg border p-3 space-y-2', config.bg)}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <StatusIcon className={cn('h-4 w-4', config.color)} />
          <span className="text-xs font-medium text-slate-700">CRS Competitiveness</span>
        </div>
        <Badge variant="outline" className={cn('text-[10px]', config.color)}>
          {config.label}
        </Badge>
      </div>

      <div className="flex items-baseline gap-4 text-xs">
        <div>
          <span className="text-slate-500">Score: </span>
          <span className={cn('font-bold', config.color)}>{analysis.score}</span>
        </div>
        <div>
          <span className="text-slate-500">Cutoff: </span>
          <span className="font-medium text-slate-700">~{analysis.recentCutoff}</span>
        </div>
        <div>
          <span className="text-slate-500">Gap: </span>
          <span className={cn('font-medium', analysis.gap >= 0 ? 'text-green-600' : 'text-red-600')}>
            {analysis.gap >= 0 ? '+' : ''}{analysis.gap}
          </span>
        </div>
      </div>

      {analysis.quickWins.length > 0 && analysis.status !== 'competitive' && (
        <div className="text-[10px] text-slate-500">
          <span className="font-medium">Quick wins: </span>
          {analysis.quickWins.slice(0, 3).map((w, i) => (
            <span key={w.label}>
              {i > 0 && ' · '}
              {w.label} <span className="text-green-600">(+{w.points})</span>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Insight Row ────────────────────────────────────────────────────────────────

function InsightRow({
  severity,
  title,
  description,
  action,
}: {
  severity: InsightSeverity
  title: string
  description: string
  action?: string
}) {
  const config = SEVERITY_CONFIG[severity]
  const Icon = config.icon

  return (
    <div className={cn('flex gap-2.5 py-2 px-3 rounded-md border', config.bg, config.border)}>
      <Icon className={cn('h-4 w-4 mt-0.5 shrink-0', config.color)} />
      <div className="min-w-0 space-y-0.5">
        <p className="text-xs font-medium text-slate-800">{title}</p>
        <p className="text-[11px] text-slate-500 leading-snug">{description}</p>
        {action && (
          <p className="text-[11px] text-slate-600 font-medium flex items-center gap-1">
            <Lightbulb className="h-3 w-3 text-amber-500" />
            {action}
          </p>
        )}
      </div>
    </div>
  )
}

// ─── Collapsible Section ────────────────────────────────────────────────────────

function InsightSection({
  title,
  icon: Icon,
  count,
  expanded,
  onToggle,
  children,
}: {
  title: string
  icon: React.ComponentType<{ className?: string }>
  count?: number
  expanded: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between py-2 text-left"
      >
        <div className="flex items-center gap-1.5">
          {expanded ? (
            <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
          )}
          <Icon className="h-3.5 w-3.5 text-slate-500" />
          <span className="text-xs font-semibold text-slate-700">{title}</span>
          {count !== undefined && count > 0 && (
            <Badge variant="secondary" className="text-[10px] h-4 px-1.5 ml-1">
              {count}
            </Badge>
          )}
        </div>
      </button>
      {expanded && <div className="space-y-1.5 pb-2">{children}</div>}
    </div>
  )
}

// ─── Main Component ─────────────────────────────────────────────────────────────

export function CaseInsightsPanel({ matterId, tenantId, stageEnteredAt, currentStageName }: CaseInsightsPanelProps) {
  const { data: immigration, isLoading: loadingImmigration } = useMatterImmigration(matterId)
  const { data: documentSlots, isLoading: loadingSlots } = useDocumentSlots(matterId)
  const { data: deadlines, isLoading: loadingDeadlines } = useMatterDeadlines(matterId)

  const caseTypeId = immigration?.case_type_id ?? ''
  const { data: stages } = useCaseStages(caseTypeId)

  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(['attention', 'recommendations'])
  )

  const toggleSection = useCallback((section: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev)
      if (next.has(section)) next.delete(section)
      else next.add(section)
      return next
    })
  }, [])

  const isLoading = loadingImmigration || loadingSlots || loadingDeadlines

  // Map document slots to lightweight summaries for the insights engine
  const slotSummaries: DocumentSlotSummary[] = useMemo(() => {
    if (!documentSlots) return []
    return documentSlots.map((s) => ({
      id: s.id,
      slot_name: s.slot_name,
      is_required: s.is_required,
      status: s.status,
      current_version: s.current_version,
      created_at: s.created_at,
    }))
  }, [documentSlots])

  // Compute insights using V2 (document-slot-based) engine
  const insights: CaseInsights | null = useMemo(() => {
    if (!immigration) return null
    return analyzeCaseInsightsV2({
      immigration,
      documentSlots: slotSummaries,
      deadlines: deadlines ?? [],
      stages: stages ?? [],
    })
  }, [immigration, slotSummaries, deadlines, stages])

  if (isLoading) {
    return (
      <div className="border border-slate-200 rounded-lg p-4 space-y-3">
        <Skeleton className="h-5 w-40" />
        <div className="grid grid-cols-4 gap-4">
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
        </div>
        <Skeleton className="h-20" />
      </div>
    )
  }

  if (!immigration || !insights) return null

  // Split insights by severity
  const criticalAndWarning = insights.insights.filter(
    (i) => i.severity === 'critical' || i.severity === 'warning'
  )
  const infoAndSuccess = insights.insights.filter(
    (i) => i.severity === 'info' || i.severity === 'success'
  )

  const overallColor =
    insights.readiness.overall >= 80
      ? 'text-green-600'
      : insights.readiness.overall >= 50
        ? 'text-amber-600'
        : 'text-red-600'

  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-slate-50 border-b border-slate-200">
        <div className="flex items-center gap-2">
          <FileSearch className="h-4 w-4 text-slate-500" />
          <h3 className="text-sm font-semibold text-slate-800">Smart Case Insights</h3>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-slate-500">Readiness:</span>
          <span className={cn('text-sm font-bold tabular-nums', overallColor)}>
            {insights.readiness.overall}%
          </span>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Stage Duration */}
        {currentStageName && stageEnteredAt && (() => {
          const daysInStage = Math.floor((Date.now() - new Date(stageEnteredAt).getTime()) / (1000 * 60 * 60 * 24))
          const isBottleneck = daysInStage > 30
          const isWarning = daysInStage > 14
          return (
            <div className={cn(
              'flex items-center justify-between rounded-lg border px-3 py-2',
              isBottleneck ? 'bg-red-950/30 border-red-500/20' : isWarning ? 'bg-amber-950/30 border-amber-500/30' : 'bg-slate-50 border-slate-200'
            )}>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-600">Current Stage:</span>
                <span className="text-xs font-medium text-slate-800">{currentStageName}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className={cn(
                  'text-xs font-bold tabular-nums',
                  isBottleneck ? 'text-red-600' : isWarning ? 'text-amber-600' : 'text-slate-700'
                )}>
                  {daysInStage} days
                </span>
                {isBottleneck && <AlertTriangle className="h-3 w-3 text-red-500" />}
              </div>
            </div>
          )
        })()}

        {/* Readiness Gauges */}
        <div className="grid grid-cols-3 gap-4">
          <ReadinessGauge
            label="Documents"
            score={insights.readiness.documents.score}
            detail={insights.readiness.documents.detail}
          />
          <ReadinessGauge
            label="Deadlines"
            score={insights.readiness.deadlines.score}
            detail={insights.readiness.deadlines.detail}
          />
          <ReadinessGauge
            label="Profile"
            score={insights.readiness.profile.score}
            detail={insights.readiness.profile.detail}
          />
        </div>

        {/* CRS Competitiveness */}
        {insights.crsAnalysis && (
          <CrsCompetitivenessCard analysis={insights.crsAnalysis} />
        )}

        <Separator />

        {/* Attention Required */}
        {criticalAndWarning.length > 0 && (
          <InsightSection
            title="Attention Required"
            icon={Shield}
            count={criticalAndWarning.length}
            expanded={expandedSections.has('attention')}
            onToggle={() => toggleSection('attention')}
          >
            {criticalAndWarning.map((insight) => (
              <InsightRow
                key={insight.id}
                severity={insight.severity}
                title={insight.title}
                description={insight.description}
                action={insight.action}
              />
            ))}
          </InsightSection>
        )}

        {/* Recommendations & Status */}
        {infoAndSuccess.length > 0 && (
          <InsightSection
            title="Recommendations"
            icon={Lightbulb}
            count={infoAndSuccess.length}
            expanded={expandedSections.has('recommendations')}
            onToggle={() => toggleSection('recommendations')}
          >
            {infoAndSuccess.map((insight) => (
              <InsightRow
                key={insight.id}
                severity={insight.severity}
                title={insight.title}
                description={insight.description}
                action={insight.action}
              />
            ))}
          </InsightSection>
        )}

        {/* All clear */}
        {insights.insights.length === 0 && (
          <div className="flex items-center gap-2 py-3 px-4 bg-emerald-950/30 border border-emerald-500/30 rounded-lg">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <span className="text-xs font-medium text-emerald-400">
              No issues found  -  case is on track
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
