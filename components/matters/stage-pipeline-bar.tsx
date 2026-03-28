'use client'

import { memo, useMemo } from 'react'
import { cn } from '@/lib/utils'
import { formatDate } from '@/lib/utils/formatters'
import { Check, Lock, Clock, User } from 'lucide-react'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import type { Database } from '@/lib/types/database'

type MatterStage = Database['public']['Tables']['matter_stages']['Row']

interface StageHistoryEntry {
  stage_id: string
  stage_name: string
  entered_at: string
  exited_at?: string
  user_id?: string
}

interface StageUser {
  id: string
  first_name: string | null
  last_name: string | null
  email: string
}

interface StagePipelineBarProps {
  stages: MatterStage[]
  currentStageId: string | null
  stageEnteredAt?: string | null
  stageHistory?: StageHistoryEntry[]
  onStageClick?: (stageId: string) => void
  disabled?: boolean
  gatingErrors?: Record<string, string[]>
  completionPercent?: number | null
  users?: StageUser[]
}

function formatDuration(enteredAt: string, exitedAt?: string): string {
  const start = new Date(enteredAt)
  const end = exitedAt ? new Date(exitedAt) : new Date()
  const diffMs = end.getTime() - start.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  const diffHours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))

  if (diffDays === 0) {
    if (diffHours === 0) return '< 1h'
    return `${diffHours}h`
  }
  if (diffDays === 1) return `1d ${diffHours}h`
  return `${diffDays}d ${diffHours}h`
}

function formatDurationShort(enteredAt: string, exitedAt?: string): string {
  const start = new Date(enteredAt)
  const end = exitedAt ? new Date(exitedAt) : new Date()
  const diffMs = end.getTime() - start.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  const diffHours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))

  if (diffDays === 0) {
    if (diffHours === 0) return '<1h'
    return `${diffHours}h`
  }
  if (diffDays === 1) return '1d'
  return `${diffDays}d`
}

function getUserName(userId: string | undefined, users: StageUser[] | undefined): string | null {
  if (!userId || !users) return null
  const user = users.find((u) => u.id === userId)
  if (!user) return null
  const name = [user.first_name, user.last_name].filter(Boolean).join(' ')
  return name || user.email
}

/**
 * Generic stage pipeline bar for any practice area.
 * Compact segmented bar design with rich tooltips.
 */
export const StagePipelineBar = memo(function StagePipelineBar({
  stages,
  currentStageId,
  stageEnteredAt,
  stageHistory = [],
  onStageClick,
  disabled = false,
  gatingErrors,
  completionPercent,
  users,
}: StagePipelineBarProps) {
  const sortedStages = useMemo(
    () => [...stages].sort((a, b) => a.sort_order - b.sort_order),
    [stages]
  )
  const currentIndex = sortedStages.findIndex((s) => s.id === currentStageId)

  const historyByStage = useMemo(() => {
    const map = new Map<string, StageHistoryEntry>()
    for (const entry of stageHistory) {
      map.set(entry.stage_id, entry)
    }
    return map
  }, [stageHistory])

  const isClickable = !!onStageClick && !disabled

  return (
    <TooltipProvider>
      <div className="w-full space-y-1">
        {/* Segmented bar */}
        <div className="flex w-full gap-[2px]">
          {sortedStages.map((stage, index) => {
            const isCompleted = currentIndex > -1 && index < currentIndex
            const isCurrent = stage.id === currentStageId
            const isUpcoming = currentIndex > -1 ? index > currentIndex : true
            const isFirst = index === 0
            const isLast = index === sortedStages.length - 1
            const stageErrors = gatingErrors?.[stage.id]
            const isGated = stageErrors && stageErrors.length > 0

            // History & duration
            const historyEntry = historyByStage.get(stage.id)
            const stageDuration = historyEntry
              ? formatDuration(historyEntry.entered_at, historyEntry.exited_at)
              : null
            const stageEnteredDate = historyEntry
              ? formatDate(historyEntry.entered_at)
              : null
            const stageExitedDate = historyEntry?.exited_at
              ? formatDate(historyEntry.exited_at)
              : null
            const movedBy = getUserName(historyEntry?.user_id, users)

            return (
              <Tooltip key={stage.id}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    disabled={!isClickable}
                    onClick={() => isClickable && onStageClick(stage.id)}
                    className={cn(
                      'relative flex items-center justify-center h-5 text-[10px] font-medium transition-all duration-200 min-w-0',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
                      isFirst && 'rounded-l-full',
                      isLast && 'rounded-r-full',
                      isClickable && 'cursor-pointer',
                      !isClickable && 'cursor-default',
                      // Current stage expands to fit label
                      isCurrent ? 'flex-[3] px-3' : 'flex-1 px-0',
                      // Completed
                      isCompleted && 'text-white',
                      // Current
                      isCurrent && 'text-white ring-1 ring-offset-1 z-10 rounded-full',
                      // Upcoming
                      isUpcoming && !isGated && 'bg-slate-100 text-slate-400',
                      // Gated
                      isGated && isUpcoming && 'bg-red-950/30 text-red-400 border border-dashed border-red-500/30'
                    )}
                    style={{
                      backgroundColor: isCompleted || isCurrent ? stage.color : undefined,
                    }}
                  >
                    {/* Completed: checkmark only */}
                    {isCompleted && (
                      <Check className="h-3 w-3 shrink-0" />
                    )}

                    {/* Current: name + % prominently */}
                    {isCurrent && (
                      <span className="flex items-center gap-1.5 min-w-0 overflow-hidden">
                        <span className="h-1.5 w-1.5 rounded-full bg-white shrink-0 animate-pulse" />
                        <span className="truncate font-semibold">{stage.name}</span>
                        {stage.completion_pct !== null && stage.completion_pct !== undefined && (
                          <span className="shrink-0 text-[9px] font-bold bg-white/25 rounded px-1 py-0.5 tabular-nums">
                            {stage.completion_pct}%
                          </span>
                        )}
                      </span>
                    )}

                    {/* Upcoming: no text */}
                    {isUpcoming && !isGated && null}

                    {/* Gated upcoming: lock icon only */}
                    {isUpcoming && isGated && (
                      <Lock className="h-3 w-3 shrink-0" />
                    )}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-[300px] p-3">
                  <div className="space-y-2">
                    {/* Stage name + status badge */}
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-semibold text-xs leading-snug">{stage.name}</p>
                      <span className={cn(
                        'shrink-0 text-[9px] font-medium px-1.5 py-0.5 rounded-full',
                        isCompleted && 'bg-emerald-500/20 text-emerald-300',
                        isCurrent && 'bg-white/20 text-white',
                        isGated && 'bg-red-500/20 text-red-300',
                        isUpcoming && !isGated && 'bg-white/10 text-white/60',
                      )}>
                        {isCompleted ? '✓ Done' : isCurrent ? '● Active' : isGated ? '🔒 Blocked' : '○ Upcoming'}
                      </span>
                    </div>

                    {/* Completion % */}
                    {stage.completion_pct !== null && stage.completion_pct !== undefined && (
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1 bg-white/20 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full bg-white/70"
                            style={{ width: `${stage.completion_pct}%` }}
                          />
                        </div>
                        <span className="text-[10px] font-semibold tabular-nums text-white/90">{stage.completion_pct}%</span>
                      </div>
                    )}

                    {/* Description */}
                    {stage.description && (
                      <p className="text-[10px] leading-relaxed opacity-80 border-t border-white/15 pt-2">
                        {stage.description}
                      </p>
                    )}

                    {/* Gating errors */}
                    {isGated && (
                      <div className="space-y-0.5 border-t border-white/15 pt-1">
                        {stageErrors.map((err, i) => (
                          <p key={i} className="text-[10px] text-red-300">• {err}</p>
                        ))}
                      </div>
                    )}

                    {/* SLA + timing */}
                    <div className="flex items-center gap-3 text-[10px] opacity-60">
                      {stage.sla_days && (
                        <span>SLA: {stage.sla_days}d</span>
                      )}
                      {(isCompleted || isCurrent) && stageDuration && (
                        <div className="flex items-center gap-1">
                          <Clock className="h-2.5 w-2.5 shrink-0" />
                          <span>{isCurrent ? `${stageDuration} (ongoing)` : stageDuration}</span>
                        </div>
                      )}
                    </div>

                    {/* Entered / exited dates */}
                    {(isCompleted || isCurrent) && stageEnteredDate && (
                      <div className="text-[10px] opacity-60 space-y-0.5">
                        <p>Entered: {stageEnteredDate}</p>
                        {isCompleted && stageExitedDate && <p>Exited: {stageExitedDate}</p>}
                      </div>
                    )}

                    {/* Moved by */}
                    {movedBy && (
                      <div className="flex items-center gap-1 text-[10px] opacity-60 border-t border-white/15 pt-1">
                        <User className="h-2.5 w-2.5 shrink-0" />
                        <span>Moved by {movedBy}</span>
                      </div>
                    )}
                  </div>
                </TooltipContent>
              </Tooltip>
            )
          })}
        </div>

        {/* Completion progress bar */}
        {completionPercent !== undefined && completionPercent !== null && (
          <div className="flex items-center gap-2 pt-0.5">
            <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div
                className={cn(
                  'h-full rounded-full transition-all duration-500',
                  completionPercent >= 100
                    ? 'bg-emerald-500'
                    : completionPercent >= 70
                      ? 'bg-violet-500'
                      : completionPercent >= 40
                        ? 'bg-blue-500'
                        : 'bg-amber-500'
                )}
                style={{ width: `${Math.min(completionPercent, 100)}%` }}
              />
            </div>
            <span className={cn(
              'text-[11px] font-semibold tabular-nums shrink-0',
              completionPercent >= 100
                ? 'text-emerald-600'
                : completionPercent >= 70
                  ? 'text-violet-600'
                  : completionPercent >= 40
                    ? 'text-blue-600'
                    : 'text-amber-600'
            )}>
              {completionPercent}%
            </span>
          </div>
        )}
      </div>
    </TooltipProvider>
  )
})
