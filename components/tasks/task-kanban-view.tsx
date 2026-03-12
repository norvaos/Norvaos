'use client'

import { useState, useMemo, useCallback } from 'react'
import {
  DndContext,
  DragOverlay,
  closestCorners,
  type DragEndEvent,
  type DragStartEvent,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { useDroppable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { isPast, isToday } from 'date-fns'
import { formatDate } from '@/lib/utils/formatters'
import { Calendar, GripVertical } from 'lucide-react'
import { cn } from '@/lib/utils'
import { TASK_STATUSES } from '@/lib/utils/constants'
import type { Database } from '@/lib/types/database'

type Task = Database['public']['Tables']['tasks']['Row']
type UserRow = Database['public']['Tables']['users']['Row']

interface TaskKanbanViewProps {
  tasks: Task[]
  users: UserRow[] | undefined
  onTaskClick: (taskId: string) => void
  onStatusChange: (taskId: string, newStatus: string) => void
}

const KANBAN_STATUSES = TASK_STATUSES.filter((s) => s.value !== 'cancelled')

const PRIORITY_COLORS: Record<string, string> = {
  urgent: '#e2445c',
  high: '#fdab3d',
  medium: '#579bfc',
  low: '#c3c6d4',
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// SortableCard  (individual draggable task card)
// ---------------------------------------------------------------------------

interface SortableCardProps {
  task: Task
  user: UserRow | null
  onTaskClick: (taskId: string) => void
  isOverlay?: boolean
}

function SortableCard({ task, user, onTaskClick, isOverlay = false }: SortableCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: task.id,
    data: { type: 'task', task },
    disabled: isOverlay,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : undefined,
  }

  const dueDateOverdue = useMemo(() => {
    if (!task.due_date) return false
    const date = new Date(task.due_date)
    return isPast(date) && !isToday(date) && task.status !== 'done' && task.status !== 'cancelled'
  }, [task.due_date, task.status])

  const formattedDueDate = useMemo(() => {
    if (!task.due_date) return null
    return formatDate(task.due_date)
  }, [task.due_date])

  return (
    <div
      ref={isOverlay ? undefined : setNodeRef}
      style={isOverlay ? undefined : style}
      className={cn(
        'group cursor-pointer rounded-lg border bg-white p-3 shadow-sm transition-shadow hover:shadow-md',
        isDragging && 'shadow-lg ring-2 ring-primary/20',
        isOverlay && 'shadow-lg ring-2 ring-primary/20 rotate-2'
      )}
      onClick={() => onTaskClick(task.id)}
    >
      {/* Drag handle + title */}
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
            <span
              className="mt-0.5 inline-block h-2.5 w-2.5 flex-shrink-0 rounded-full"
              style={{ backgroundColor: PRIORITY_COLORS[task.priority] ?? '#c3c6d4' }}
              title={`${task.priority} priority`}
            />
            <span className="truncate text-sm font-medium text-slate-900">
              {task.title}
            </span>
          </div>
        </div>
      </div>

      {/* Bottom row: due date + assignee avatar */}
      <div className="mt-2.5 flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs text-slate-500">
          {formattedDueDate && (
            <div
              className={cn(
                'flex items-center gap-1',
                dueDateOverdue && 'font-medium text-red-600'
              )}
            >
              <Calendar className="h-3 w-3" />
              <span>{formattedDueDate}</span>
            </div>
          )}
        </div>

        {user && (
          <div
            className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-slate-200 text-[10px] font-semibold text-slate-600"
            title={getUserDisplayName(user)}
          >
            {getUserInitials(user)}
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// KanbanColumn  (droppable column per status)
// ---------------------------------------------------------------------------

interface KanbanColumnProps {
  statusKey: string
  statusLabel: string
  statusColor: string
  tasks: Task[]
  usersMap: Record<string, UserRow>
  onTaskClick: (taskId: string) => void
}

function KanbanColumn({
  statusKey,
  statusLabel,
  statusColor,
  tasks,
  usersMap,
  onTaskClick,
}: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: statusKey,
    data: { type: 'status', status: statusKey },
  })

  const taskIds = useMemo(() => tasks.map((t) => t.id), [tasks])

  return (
    <div
      className={cn(
        'flex h-full w-72 flex-shrink-0 flex-col rounded-lg bg-slate-50',
        isOver && 'ring-2 ring-primary/30'
      )}
    >
      {/* Column header with status colour stripe */}
      <div
        className="rounded-t-lg border-t-4 px-3 pb-2 pt-3"
        style={{ borderTopColor: statusColor }}
      >
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-slate-900">{statusLabel}</h3>
          <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-slate-200 px-1.5 text-[10px] font-semibold text-slate-600">
            {tasks.length}
          </span>
        </div>
      </div>

      {/* Scrollable card area */}
      <div ref={setNodeRef} className="flex-1 overflow-y-auto px-2 pb-2">
        <SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
          <div className="flex min-h-[120px] flex-col gap-2 py-1">
            {tasks.map((task) => (
              <SortableCard
                key={task.id}
                task={task}
                user={task.assigned_to ? usersMap[task.assigned_to] ?? null : null}
                onTaskClick={onTaskClick}
              />
            ))}

            {tasks.length === 0 && (
              <div className="flex flex-1 items-center justify-center py-8 text-xs text-slate-400">
                No tasks
              </div>
            )}
          </div>
        </SortableContext>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// TaskKanbanView (main export)
// ---------------------------------------------------------------------------

export function TaskKanbanView({
  tasks,
  users,
  onTaskClick,
  onStatusChange,
}: TaskKanbanViewProps) {
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null)

  // Build a user lookup map
  const usersMap = useMemo(() => {
    const map: Record<string, UserRow> = {}
    if (users) {
      for (const u of users) {
        map[u.id] = u
      }
    }
    return map
  }, [users])

  // Group tasks by status
  const tasksByStatus = useMemo(() => {
    const map: Record<string, Task[]> = {}
    for (const s of KANBAN_STATUSES) {
      map[s.value] = []
    }
    for (const task of tasks) {
      if (map[task.status]) {
        map[task.status].push(task)
      }
    }
    return map
  }, [tasks])

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor)
  )

  // Active task for the drag overlay
  const activeTask = useMemo(
    () => (activeTaskId ? tasks.find((t) => t.id === activeTaskId) ?? null : null),
    [activeTaskId, tasks]
  )

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveTaskId(event.active.id as string)
  }, [])

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveTaskId(null)

      const { active, over } = event
      if (!over) return

      const taskId = active.id as string
      const task = tasks.find((t) => t.id === taskId)
      if (!task) return

      // Determine target status: the droppable id is the status key
      const targetStatus = over.id as string
      // Only fire when we are dropping onto a column (status key), not another card
      const validStatuses: string[] = KANBAN_STATUSES.map((s) => s.value)
      if (!validStatuses.includes(targetStatus)) return
      if (task.status === targetStatus) return

      onStatusChange(taskId, targetStatus)
    },
    [tasks, onStatusChange]
  )

  const handleDragCancel = useCallback(() => {
    setActiveTaskId(null)
  }, [])

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div className="flex h-full gap-4 overflow-x-auto p-4">
        {KANBAN_STATUSES.map((status) => (
          <KanbanColumn
            key={status.value}
            statusKey={status.value}
            statusLabel={status.label}
            statusColor={status.color}
            tasks={tasksByStatus[status.value] ?? []}
            usersMap={usersMap}
            onTaskClick={onTaskClick}
          />
        ))}
      </div>

      {/* Drag overlay - floating card while dragging */}
      <DragOverlay dropAnimation={null}>
        {activeTask ? (
          <div className="w-72">
            <SortableCard
              task={activeTask}
              user={activeTask.assigned_to ? usersMap[activeTask.assigned_to] ?? null : null}
              onTaskClick={onTaskClick}
              isOverlay
            />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}
