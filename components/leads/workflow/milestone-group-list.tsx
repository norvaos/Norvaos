'use client'

import { ListChecks } from 'lucide-react'
import { MilestoneGroupCard } from './milestone-group-card'
import type { MilestoneGroupWithTasks, UserRow } from './lead-workflow-types'

// ─── Component ──────────────────────────────────────────────────────────────

interface MilestoneGroupListProps {
  milestones: MilestoneGroupWithTasks[]
  users: UserRow[] | undefined
  isReadOnly: boolean
  onCompleteTask?: (taskId: string) => void
  onSkipTask?: (taskId: string) => void
  updatingTaskId?: string | null
}

export function MilestoneGroupList({
  milestones,
  users,
  isReadOnly,
  onCompleteTask,
  onSkipTask,
  updatingTaskId,
}: MilestoneGroupListProps) {
  if (milestones.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <ListChecks className="h-8 w-8 text-muted-foreground/40 mb-2" />
        <p className="text-sm text-muted-foreground">No milestones yet</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Milestones are created as the lead progresses through stages
        </p>
      </div>
    )
  }

  // Calculate overall progress
  const totalTasks = milestones.reduce((sum, g) => sum + g.tasks.length, 0)
  const completedTasks = milestones.reduce(
    (sum, g) => sum + g.tasks.filter((t) => t.status === 'completed').length,
    0
  )
  const overallPercent = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0

  return (
    <div className="space-y-3">
      {/* Overall progress header */}
      <div className="flex items-center justify-between px-1">
        <span className="text-xs font-medium text-muted-foreground">
          {completedTasks} of {totalTasks} tasks complete
        </span>
        <span className="text-xs font-medium text-muted-foreground">
          {overallPercent}%
        </span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${overallPercent === 100 ? 'bg-green-500' : 'bg-primary'}`}
          style={{ width: `${overallPercent}%` }}
        />
      </div>

      {/* Milestone groups */}
      <div className="space-y-2">
        {milestones.map((group) => (
          <MilestoneGroupCard
            key={group.id}
            group={group}
            users={users}
            isReadOnly={isReadOnly}
            onCompleteTask={onCompleteTask}
            onSkipTask={onSkipTask}
            updatingTaskId={updatingTaskId}
          />
        ))}
      </div>
    </div>
  )
}
