'use client'

import { Circle, CheckCircle2, MinusCircle, XCircle, MoreHorizontal, Loader2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { formatRelativeDate } from '@/lib/utils/formatters'
import { getTaskStatusConfig, getCompletionSourceBadge, getOverdueDays, getActorDisplay } from './lead-workflow-helpers'
import type { LeadMilestoneTaskRow, UserRow } from './lead-workflow-types'

const STATUS_ICONS: Record<string, React.ElementType> = {
  circle: Circle, 'check-circle-2': CheckCircle2, 'minus-circle': MinusCircle, 'x-circle': XCircle,
}

interface MilestoneTaskRowProps {
  task: LeadMilestoneTaskRow
  users: UserRow[] | undefined
  isReadOnly: boolean
  onComplete?: (taskId: string) => void
  onSkip?: (taskId: string) => void
  isUpdating?: boolean
}

export function MilestoneTaskRow({ task, users, isReadOnly, onComplete, onSkip, isUpdating }: MilestoneTaskRowProps) {
  const statusConfig = getTaskStatusConfig(task.status, task.due_at)
  const StatusIcon = STATUS_ICONS[statusConfig.iconName] ?? Circle
  const completionBadge = task.status === 'completed' ? getCompletionSourceBadge(task.completion_source) : null
  const overdueDays = getOverdueDays(task.due_at)
  const ownerDisplay = task.owner_user_id
    ? getActorDisplay('user', task.owner_user_id, users)
    : null

  const isPending = task.status === 'pending'
  const showActions = isPending && !isReadOnly

  return (
    <div className={`flex items-center gap-2 px-2 py-1.5 rounded-md transition-colors ${statusConfig.bgClass}`}>
      {/* Status icon / complete button */}
      {showActions ? (
        <button
          type="button"
          onClick={() => onComplete?.(task.id)}
          disabled={isUpdating}
          className="flex shrink-0 items-center justify-center rounded-full hover:bg-emerald-950/40 transition-colors disabled:opacity-50"
          title="Mark complete"
        >
          {isUpdating ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : (
            <Circle className="h-4 w-4 text-muted-foreground/70 hover:text-green-600" />
          )}
        </button>
      ) : (
        <StatusIcon className={`h-4 w-4 shrink-0 ${statusConfig.iconClass}`} />
      )}

      {/* Title + metadata */}
      <div className="min-w-0 flex-1">
        <span className={`text-sm ${statusConfig.textClass}`}>
          {task.title}
        </span>

        {/* Due date / completion info */}
        <div className="flex items-center gap-1.5 mt-0.5">
          {/* Overdue badge */}
          {statusConfig.isOverdue && overdueDays != null && (
            <Badge variant="outline" size="xs" className="bg-red-950/30 text-red-600 border-red-500/20">
              {overdueDays}d overdue
            </Badge>
          )}

          {/* Due date (only for pending non-overdue) */}
          {isPending && !statusConfig.isOverdue && task.due_at && (
            <span className="text-xs text-muted-foreground">
              Due {formatRelativeDate(task.due_at)}
            </span>
          )}

          {/* Completion source badge */}
          {completionBadge && (
            <Badge variant="outline" size="xs" className={completionBadge.className}>
              {completionBadge.label}
            </Badge>
          )}

          {/* Completed timestamp */}
          {task.completed_at && (
            <span className="text-xs text-muted-foreground">
              {formatRelativeDate(task.completed_at)}
            </span>
          )}

          {/* Skip reason */}
          {task.status === 'skipped' && task.skip_reason && (
            <span className="text-xs text-muted-foreground/70 italic truncate max-w-[120px]" title={task.skip_reason}>
              {task.skip_reason}
            </span>
          )}

          {/* Owner (small) */}
          {ownerDisplay && isPending && (
            <span className="text-xs text-muted-foreground ml-auto truncate max-w-[80px]">
              {ownerDisplay.label}
            </span>
          )}
        </div>
      </div>

      {/* Action dropdown (pending only, non-read-only) */}
      {showActions && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0 shrink-0">
              <MoreHorizontal className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onComplete?.(task.id)}>
              <CheckCircle2 className="mr-2 h-4 w-4 text-green-600" />
              Complete
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onSkip?.(task.id)}>
              <MinusCircle className="mr-2 h-4 w-4 text-muted-foreground/70" />
              Skip
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  )
}
