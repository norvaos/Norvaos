'use client'

import { type StagesZoneProps, type StageInfo } from './types'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  Activity,
  CheckCircle2,
  Lock,
  Clock,
  ArrowRight,
  AlertTriangle,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// ─── SLA Helpers ────────────────────────────────────────────────────────────

function parseDurationToDays(timeInStage: string): number {
  const dayMatch = timeInStage.match(/(\d+)d/)
  const hourMatch = timeInStage.match(/(\d+)h/)
  const days = dayMatch ? parseInt(dayMatch[1], 10) : 0
  const hours = hourMatch ? parseInt(hourMatch[1], 10) : 0
  return days + hours / 24
}

function slaStatus(
  timeInStage: string,
  slaDays: number | null
): 'ok' | 'warning' | 'exceeded' {
  if (!slaDays) return 'ok'
  const elapsed = parseDurationToDays(timeInStage)
  if (elapsed > slaDays) return 'exceeded'
  if (elapsed > slaDays * 0.75) return 'warning'
  return 'ok'
}

function slaColour(status: 'ok' | 'warning' | 'exceeded') {
  switch (status) {
    case 'ok':
      return {
        text: 'text-green-600 dark:text-green-400',
        bg: 'bg-green-100 dark:bg-green-900/40',
        badge: 'bg-emerald-950/30 text-emerald-400 dark:bg-green-900/40 dark:text-green-400',
      }
    case 'warning':
      return {
        text: 'text-amber-600 dark:text-amber-400',
        bg: 'bg-amber-100 dark:bg-amber-900/40',
        badge: 'bg-amber-950/30 text-amber-400 dark:bg-amber-900/40 dark:text-amber-400',
      }
    case 'exceeded':
      return {
        text: 'text-red-600 dark:text-red-400',
        bg: 'bg-red-950/40 dark:bg-red-900/40',
        badge: 'bg-red-950/40 text-red-400 dark:bg-red-900/40 dark:text-red-400',
      }
  }
}

// ─── Chevron Clip Paths ─────────────────────────────────────────────────────

const CHEVRON_FIRST = 'polygon(0% 0%, calc(100% - 12px) 0%, 100% 50%, calc(100% - 12px) 100%, 0% 100%)'
const CHEVRON_MIDDLE = 'polygon(0% 0%, calc(100% - 12px) 0%, 100% 50%, calc(100% - 12px) 100%, 0% 100%, 12px 50%)'
const CHEVRON_LAST = 'polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%, 12px 50%)'

function chevronClipPath(index: number, total: number): string {
  if (index === 0) return CHEVRON_FIRST
  if (index === total - 1) return CHEVRON_LAST
  return CHEVRON_MIDDLE
}

// ─── Skeleton ───────────────────────────────────────────────────────────────

function StagesZoneSkeleton() {
  return (
    <div className="space-y-3" role="status" aria-label="Loading stages">
      {/* Progress bar skeleton */}
      <Skeleton className="h-1.5 w-full rounded-full" />

      {/* Chevron stepper skeleton  -  5 segments */}
      <div className="flex w-full gap-[3px]">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton
            key={i}
            className="h-10 flex-1"
            style={{
              clipPath: chevronClipPath(i, 5),
            }}
          />
        ))}
      </div>

      {/* Info strip skeleton */}
      <div className="flex items-center gap-4">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-4 w-16" />
      </div>
    </div>
  )
}

// ─── Empty State ────────────────────────────────────────────────────────────

function StagesZoneEmpty() {
  return (
    <div className="flex flex-col items-center justify-center py-6 text-muted-foreground gap-2">
      <Activity className="h-8 w-8 opacity-40" />
      <p className="text-sm font-medium">No pipeline configured</p>
      <p className="text-xs opacity-60">
        Assign a pipeline to this matter type to track stage progress.
      </p>
    </div>
  )
}

// ─── Main Component ─────────────────────────────────────────────────────────

export function StagesZone({ data, isLoading, onDrillDown }: StagesZoneProps) {
  if (isLoading) return <StagesZoneSkeleton />
  if (!data || data.stages.length === 0) return <StagesZoneEmpty />

  const {
    stages,
    currentStageId,
    currentStageName,
    timeInStage,
    pipelineProgress,
  } = data

  const sortedStages = [...stages].sort((a, b) => a.sortOrder - b.sortOrder)
  const currentIndex = sortedStages.findIndex((s) => s.id === currentStageId)
  const currentStage = currentIndex >= 0 ? sortedStages[currentIndex] : null
  const sla = currentStage
    ? slaStatus(timeInStage, currentStage.slaDays)
    : 'ok'
  const slaColours = slaColour(sla)

  return (
    <div
      role="region"
      aria-label="Stage pipeline"
      className="space-y-3 transition-all duration-300"
      onClick={onDrillDown}
      onKeyDown={(e) => {
        if (onDrillDown && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault()
          onDrillDown()
        }
      }}
      tabIndex={onDrillDown ? 0 : undefined}
      style={{ cursor: onDrillDown ? 'pointer' : undefined }}
    >
      {/* ── 1. Pipeline Progress Bar ─────────────────────────────────────── */}
      <div className="w-full h-1.5 rounded-full bg-muted/40 overflow-hidden">
        <div
          className={cn(
            'h-full rounded-full transition-all duration-500 ease-out',
            pipelineProgress >= 100
              ? 'bg-emerald-500'
              : pipelineProgress >= 70
                ? 'bg-violet-500'
                : pipelineProgress >= 40
                  ? 'bg-blue-500'
                  : 'bg-amber-500'
          )}
          style={{ width: `${Math.min(pipelineProgress, 100)}%` }}
        />
      </div>

      {/* ── 2. Chevron Stage Stepper ─────────────────────────────────────── */}
      <TooltipProvider delayDuration={200}>
        <div className="flex w-full gap-[3px]" role="list">
          {sortedStages.map((stage, index) => {
            const isCompleted = currentIndex > -1 && index < currentIndex
            const isCurrent = stage.id === currentStageId
            const isUpcoming = currentIndex > -1 ? index > currentIndex : true
            const isGated = stage.gatingErrors.length > 0
            const stageSlaDays = stage.slaDays

            return (
              <Tooltip key={stage.id}>
                <TooltipTrigger asChild>
                  <div
                    role="listitem"
                    aria-current={isCurrent ? 'step' : undefined}
                    aria-label={`${stage.name}${isCompleted ? ' (completed)' : isCurrent ? ' (current)' : isGated ? ' (blocked)' : ' (upcoming)'}`}
                    className={cn(
                      'relative flex items-center justify-center h-10 flex-1 text-xs font-medium transition-all duration-300 select-none',
                      // Gated upcoming
                      isGated && isUpcoming &&
                        'border-2 border-dashed border-red-400 dark:border-red-500 bg-red-950/30 dark:bg-red-950/30 text-red-500 dark:text-red-400',
                      // Upcoming (not gated)
                      isUpcoming && !isGated &&
                        'bg-muted/50 text-muted-foreground/50',
                      // Completed
                      isCompleted && 'text-white',
                      // Current
                      isCurrent && 'text-white',
                    )}
                    style={{
                      clipPath: chevronClipPath(index, sortedStages.length),
                      backgroundColor:
                        isCompleted || isCurrent
                          ? stage.color
                          : undefined,
                    }}
                  >
                    {/* Completed: white check */}
                    {isCompleted && (
                      <CheckCircle2 className="h-4 w-4 shrink-0 drop-shadow-sm" />
                    )}

                    {/* Current: pulse ring + name */}
                    {isCurrent && (
                      <span className="flex items-center gap-1.5 min-w-0 overflow-hidden px-3">
                        <span className="relative flex h-2.5 w-2.5 shrink-0">
                          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white/60" />
                          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-white" />
                        </span>
                        <span className="truncate font-semibold text-xs">
                          {stage.name}
                        </span>
                      </span>
                    )}

                    {/* Upcoming gated: lock icon */}
                    {isUpcoming && isGated && (
                      <Lock className="h-3.5 w-3.5 shrink-0" />
                    )}
                  </div>
                </TooltipTrigger>

                <TooltipContent
                  side="top"
                  className="max-w-[280px] p-3 space-y-2"
                >
                  {/* Stage name + status */}
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold text-xs">{stage.name}</p>
                    <Badge
                      variant="secondary"
                      className={cn(
                        'text-[10px] px-1.5 py-0',
                        isCompleted && 'bg-emerald-950/40 text-emerald-400 dark:bg-emerald-900/40 dark:text-emerald-400',
                        isCurrent && 'bg-blue-950/40 text-blue-400 dark:bg-blue-900/40 dark:text-blue-400',
                        isGated && 'bg-red-950/40 text-red-400 dark:bg-red-900/40 dark:text-red-400',
                        isUpcoming && !isGated && 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                      )}
                    >
                      {isCompleted ? 'Completed' : isCurrent ? 'Active' : isGated ? 'Blocked' : 'Upcoming'}
                    </Badge>
                  </div>

                  {/* SLA days */}
                  {stageSlaDays !== null && (
                    <p className="text-[11px] text-muted-foreground">
                      SLA: {stageSlaDays} day{stageSlaDays !== 1 ? 's' : ''}
                    </p>
                  )}

                  {/* Time in stage (current only) */}
                  {isCurrent && timeInStage && (
                    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      <Clock className="h-3 w-3 shrink-0" />
                      <span>Time in stage: {timeInStage}</span>
                    </div>
                  )}

                  {/* Gating errors */}
                  {isGated && stage.gatingErrors.length > 0 && (
                    <div className="space-y-1 border-t pt-2">
                      <div className="flex items-center gap-1 text-[11px] font-medium text-red-600 dark:text-red-400">
                        <AlertTriangle className="h-3 w-3 shrink-0" />
                        <span>Gating Errors</span>
                      </div>
                      {stage.gatingErrors.map((err, i) => (
                        <p key={i} className="text-[10px] text-red-500 dark:text-red-400 pl-4">
                          {err}
                        </p>
                      ))}
                    </div>
                  )}
                </TooltipContent>
              </Tooltip>
            )
          })}
        </div>
      </TooltipProvider>

      {/* ── 3. Current Stage Info Strip ───────────────────────────────────── */}
      {currentStage && (
        <div className="flex items-center gap-4 text-sm flex-wrap">
          {/* Current stage name */}
          <span className="font-semibold text-foreground flex items-center gap-1.5">
            <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
            {currentStageName ?? currentStage.name}
          </span>

          {/* Time in stage */}
          {timeInStage && (
            <span className="flex items-center gap-1 text-muted-foreground text-xs">
              <Clock className="h-3.5 w-3.5 shrink-0" />
              {timeInStage}
            </span>
          )}

          {/* SLA indicator */}
          {currentStage.slaDays !== null && (
            <Badge
              variant="secondary"
              className={cn('text-[11px] font-medium px-2 py-0.5', slaColours.badge)}
            >
              {sla === 'ok' && `SLA: ${currentStage.slaDays}d`}
              {sla === 'warning' && (
                <span className="flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  SLA: {currentStage.slaDays}d
                </span>
              )}
              {sla === 'exceeded' && (
                <span className="flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  SLA exceeded
                </span>
              )}
            </Badge>
          )}

          {/* Pipeline progress */}
          <span className="ml-auto text-xs font-semibold tabular-nums text-muted-foreground">
            {pipelineProgress}% complete
          </span>
        </div>
      )}
    </div>
  )
}
