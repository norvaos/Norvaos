'use client'

import { memo, useMemo } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { TaskKanbanCard } from './task-kanban-card'
import type { Database } from '@/lib/types/database'

type Task = Database['public']['Tables']['tasks']['Row']
type UserRow = Database['public']['Tables']['users']['Row']

interface TaskKanbanColumnProps {
  statusKey: string
  statusLabel: string
  statusColor: string
  tasks: Task[]
  usersMap: Record<string, UserRow>
  onTaskClick: (taskId: string) => void
}

export const TaskKanbanColumn = memo(function TaskKanbanColumn({
  statusKey,
  statusLabel,
  statusColor,
  tasks,
  usersMap,
  onTaskClick,
}: TaskKanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: statusKey,
    data: {
      type: 'status',
      status: statusKey,
    },
  })

  return (
    <div
      className={cn(
        'flex h-full w-72 flex-shrink-0 flex-col rounded-lg bg-slate-50',
        isOver && 'ring-2 ring-primary/30'
      )}
    >
      {/* Column header with colour stripe */}
      <div
        className="rounded-t-lg border-t-[3px] px-3 pb-2 pt-3"
        style={{ borderTopColor: statusColor }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-slate-900">
              {statusLabel}
            </h3>
            <Badge variant="secondary" className="text-[10px]">
              {tasks.length}
            </Badge>
          </div>
        </div>
      </div>

      {/* Scrollable card area */}
      <ScrollArea className="flex-1 px-2 pb-2">
        <div
          ref={setNodeRef}
          className="flex min-h-[120px] flex-col gap-2 py-1"
        >
          {tasks.map((task) => (
            <TaskKanbanCard
              key={task.id}
              task={task}
              user={task.assigned_to ? usersMap[task.assigned_to] : null}
              onTaskClick={onTaskClick}
            />
          ))}

          {tasks.length === 0 && (
            <div className="flex flex-1 items-center justify-center py-8 text-xs text-slate-400">
              No tasks
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  )
})
