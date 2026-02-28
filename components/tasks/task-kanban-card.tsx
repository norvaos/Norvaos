'use client'

import { useMemo } from 'react'
import { useDraggable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { CalendarDays, GripVertical } from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { format, isPast, isToday } from 'date-fns'
import type { Database } from '@/lib/types/database'

type Task = Database['public']['Tables']['tasks']['Row']
type UserRow = Database['public']['Tables']['users']['Row']

const PRIORITY_COLORS: Record<string, string> = {
  urgent: '#e2445c',
  high: '#fdab3d',
  medium: '#579bfc',
  low: '#c3c6d4',
}

const PRIORITY_LABELS: Record<string, string> = {
  urgent: 'Urgent',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
}

interface TaskKanbanCardProps {
  task: Task
  user?: UserRow | null
  onTaskClick: (taskId: string) => void
  isDragOverlay?: boolean
}

function getUserInitials(user?: UserRow | null): string {
  if (!user) return '?'
  const first = user.first_name?.charAt(0)?.toUpperCase() ?? ''
  const last = user.last_name?.charAt(0)?.toUpperCase() ?? ''
  return first + last || '?'
}

function getUserDisplayName(user?: UserRow | null): string {
  if (!user) return 'Unassigned'
  return [user.first_name, user.last_name].filter(Boolean).join(' ') || 'Unassigned'
}

export function TaskKanbanCard({
  task,
  user,
  onTaskClick,
  isDragOverlay = false,
}: TaskKanbanCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task.id,
    data: {
      type: 'task',
      task,
    },
    disabled: isDragOverlay,
  })

  const style = useMemo(
    () => ({
      transform: CSS.Translate.toString(transform),
      opacity: isDragging ? 0.5 : undefined,
    }),
    [transform, isDragging]
  )

  const dueDateOverdue = useMemo(() => {
    if (!task.due_date) return false
    const date = new Date(task.due_date)
    return isPast(date) && !isToday(date) && task.status !== 'done' && task.status !== 'cancelled'
  }, [task.due_date, task.status])

  const formattedDueDate = useMemo(() => {
    if (!task.due_date) return null
    return format(new Date(task.due_date), 'MMM d')
  }, [task.due_date])

  return (
    <div
      ref={setNodeRef}
      style={isDragOverlay ? undefined : style}
      className={cn(
        'group cursor-pointer rounded-lg border bg-white p-3 shadow-sm transition-shadow hover:shadow-md',
        isDragging && 'shadow-lg ring-2 ring-primary/20',
        isDragOverlay && 'shadow-lg ring-2 ring-primary/20 rotate-2'
      )}
      onClick={() => onTaskClick(task.id)}
    >
      {/* Drag handle and title */}
      <div className="flex items-start gap-2">
        <button
          className="mt-0.5 flex-shrink-0 cursor-grab touch-none text-slate-300 opacity-0 transition-opacity group-hover:opacity-100 active:cursor-grabbing"
          {...attributes}
          {...listeners}
          onClick={(e) => e.stopPropagation()}
        >
          <GripVertical className="h-4 w-4" />
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {/* Priority dot */}
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  className="mt-0.5 inline-block h-2.5 w-2.5 flex-shrink-0 rounded-full"
                  style={{ backgroundColor: PRIORITY_COLORS[task.priority] ?? '#c3c6d4' }}
                />
              </TooltipTrigger>
              <TooltipContent>
                {PRIORITY_LABELS[task.priority] ?? 'Normal'} priority
              </TooltipContent>
            </Tooltip>

            <span className="truncate text-sm font-medium text-slate-900">
              {task.title}
            </span>
          </div>
        </div>
      </div>

      {/* Bottom row: due date + avatar */}
      <div className="mt-2.5 flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs text-slate-500">
          {formattedDueDate && (
            <div
              className={cn(
                'flex items-center gap-1',
                dueDateOverdue && 'font-medium text-red-600'
              )}
            >
              <CalendarDays className="h-3 w-3" />
              <span>{formattedDueDate}</span>
            </div>
          )}
        </div>

        {user && (
          <Tooltip>
            <TooltipTrigger asChild>
              <div>
                <Avatar size="sm">
                  <AvatarFallback>{getUserInitials(user)}</AvatarFallback>
                </Avatar>
              </div>
            </TooltipTrigger>
            <TooltipContent>{getUserDisplayName(user)}</TooltipContent>
          </Tooltip>
        )}
      </div>
    </div>
  )
}
