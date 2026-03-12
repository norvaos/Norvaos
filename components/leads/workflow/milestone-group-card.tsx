'use client'

import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { MilestoneTaskRow } from './milestone-task-row'
import type { MilestoneGroupWithTasks, UserRow } from './lead-workflow-types'

// ─── Component ──────────────────────────────────────────────────────────────

interface MilestoneGroupCardProps {
  group: MilestoneGroupWithTasks
  users: UserRow[] | undefined
  isReadOnly: boolean
  onCompleteTask?: (taskId: string) => void
  onSkipTask?: (taskId: string) => void
  updatingTaskId?: string | null
  /** Start expanded? Defaults to true if group has pending tasks */
  defaultExpanded?: boolean
}

export function MilestoneGroupCard({
  group,
  users,
  isReadOnly,
  onCompleteTask,
  onSkipTask,
  updatingTaskId,
  defaultExpanded,
}: MilestoneGroupCardProps) {
  const totalTasks = group.tasks.length
  const completedTasks = group.tasks.filter((t) => t.status === 'completed').length
  const pendingTasks = group.tasks.filter((t) => t.status === 'pending').length
  const hasPending = pendingTasks > 0
  const completionPercent = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0
  const isFullyComplete = completionPercent === 100

  const [expanded, setExpanded] = useState(defaultExpanded ?? hasPending)

  return (
    <div className="rounded-lg border">
      {/* Group Header — always visible, clickable to expand/collapse */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted/50 transition-colors"
      >
        {expanded ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
        )}

        <span className={`text-sm font-medium flex-1 ${isFullyComplete ? 'text-green-700' : 'text-foreground'}`}>
          {group.title}
        </span>

        {/* Task count badge */}
        <Badge
          variant="outline"
          size="xs"
          className={
            isFullyComplete
              ? 'bg-green-50 text-green-700 border-green-200'
              : hasPending
                ? 'bg-slate-100 text-slate-600 border-slate-200'
                : 'bg-slate-50 text-slate-400 border-slate-200'
          }
        >
          {completedTasks}/{totalTasks}
        </Badge>
      </button>

      {/* Progress bar */}
      <div className="px-3 pb-1">
        <div className="h-1 w-full rounded-full bg-slate-100 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${isFullyComplete ? 'bg-green-500' : 'bg-primary'}`}
            style={{ width: `${completionPercent}%` }}
          />
        </div>
      </div>

      {/* Tasks list — collapsible */}
      {expanded && (
        <div className="px-2 pb-2 space-y-0.5">
          {group.tasks.map((task) => (
            <MilestoneTaskRow
              key={task.id}
              task={task}
              users={users}
              isReadOnly={isReadOnly}
              onComplete={onCompleteTask}
              onSkip={onSkipTask}
              isUpdating={updatingTaskId === task.id}
            />
          ))}
        </div>
      )}
    </div>
  )
}
