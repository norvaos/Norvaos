'use client'

import { cn } from '@/lib/utils'
import { formatDate } from '@/lib/utils/formatters'
import { Check, Clock, Lock, User } from 'lucide-react'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

interface StageHistoryEntry {
  stage_id: string
  stage_name: string
  entered_at: string
  exited_at?: string
  entered_by?: string
}

interface StageUser {
  id: string
  first_name: string | null
  last_name: string | null
  email: string
}

interface StageProgressionBarProps {
  stages: Array<{
    id: string
    name: string
    slug: string
    sort_order: number
    color: string
    is_terminal: boolean
  }>
  currentStageId: string | null
  stageEnteredAt?: string | null
  stageHistory?: StageHistoryEntry[]
  onStageClick?: (stageId: string) => void
  disabled?: boolean
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

export function StageProgressionBar({
  stages,
  currentStageId,
  stageEnteredAt,
  stageHistory = [],
  onStageClick,
  disabled = false,
  users,
}: StageProgressionBarProps) {
  const sortedStages = [...stages].sort((a, b) => a.sort_order - b.sort_order)
  const currentIndex = sortedStages.findIndex((s) => s.id === currentStageId)

  // Build a map of stage_id -> history entry for duration lookups
  const historyByStage = new Map<string, StageHistoryEntry>()
  for (const entry of stageHistory) {
    historyByStage.set(entry.stage_id, entry)
  }

  const isClickable = !!onStageClick && !disabled

  return (
    <TooltipProvider>
      <div className="flex w-full gap-[2px]">
        {sortedStages.map((stage, index) => {
          const isCompleted = currentIndex > -1 && index < currentIndex
          const isCurrent = stage.id === currentStageId
          const isUpcoming = currentIndex > -1 ? index > currentIndex : true
          const isFirst = index === 0
          const isLast = index === sortedStages.length - 1

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
          const movedBy = getUserName(historyEntry?.entered_by, users)

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
                    isUpcoming && 'bg-slate-100 text-slate-400'
                  )}
                  style={{
                    backgroundColor: isCompleted || isCurrent ? stage.color : undefined,
                  }}
                >
                  {/* Completed: checkmark only */}
                  {isCompleted && (
                    <Check className="h-3 w-3 shrink-0" />
                  )}

                  {/* Current: name prominently */}
                  {isCurrent && (
                    <span className="flex items-center gap-1.5 min-w-0 overflow-hidden">
                      <span className="h-1.5 w-1.5 rounded-full bg-white shrink-0 animate-pulse" />
                      <span className="truncate font-semibold">{stage.name}</span>
                    </span>
                  )}

                  {/* Upcoming: no text */}
                  {isUpcoming && null}
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-[240px]">
                <div className="space-y-1.5">
                  <div>
                    <p className="font-semibold text-xs">{stage.name}</p>
                    <p className="text-[10px] opacity-80">
                      {isCompleted
                        ? '✓ Completed'
                        : isCurrent
                          ? '● Current Stage'
                          : '○ Upcoming'}
                    </p>
                  </div>

                  {(isCompleted || isCurrent) && stageDuration && (
                    <div className="pt-1 border-t border-white/20 space-y-0.5">
                      <div className="flex items-center gap-1 text-[10px]">
                        <Clock className="h-2.5 w-2.5 shrink-0" />
                        <span>
                          {isCurrent
                            ? `${stageDuration} (ongoing)`
                            : stageDuration}
                        </span>
                      </div>
                      {stageEnteredDate && (
                        <p className="text-[10px] opacity-70">
                          Entered: {stageEnteredDate}
                        </p>
                      )}
                      {isCompleted && stageExitedDate && (
                        <p className="text-[10px] opacity-70">
                          Exited: {stageExitedDate}
                        </p>
                      )}
                    </div>
                  )}

                  {movedBy && (
                    <div className="pt-1 border-t border-white/20">
                      <div className="flex items-center gap-1 text-[10px]">
                        <User className="h-2.5 w-2.5 shrink-0" />
                        <span>Moved by {movedBy}</span>
                      </div>
                    </div>
                  )}
                </div>
              </TooltipContent>
            </Tooltip>
          )
        })}
      </div>
    </TooltipProvider>
  )
}
