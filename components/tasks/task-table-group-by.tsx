'use client'

import { useState, useMemo } from 'react'
import {
  isToday,
  isTomorrow,
  isPast,
  isThisWeek,
  addWeeks,
  isWithinInterval,
  startOfWeek,
  endOfWeek,
  parseISO,
  startOfDay,
} from 'date-fns'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { TASK_STATUSES, PRIORITIES } from '@/lib/utils/constants'
import type { Database } from '@/lib/types/database'

type Task = Database['public']['Tables']['tasks']['Row']

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
interface TaskTableGroupByProps {
  tasks: Task[]
  groupBy: string
  renderTable: (tasks: Task[], groupLabel: string) => React.ReactNode
}

// ---------------------------------------------------------------------------
// Group definitions
// ---------------------------------------------------------------------------
interface GroupDefinition {
  key: string
  label: string
  color?: string
}

function getGroupDefinitions(groupBy: string): GroupDefinition[] {
  if (groupBy === 'status') {
    return TASK_STATUSES.map((s) => ({
      key: s.value,
      label: s.label,
      color: s.color,
    }))
  }

  if (groupBy === 'priority') {
    return [
      ...PRIORITIES.slice().reverse().map((p) => ({
        key: p.value,
        label: p.label,
        color: p.color,
      })),
    ]
  }

  if (groupBy === 'due_date') {
    return [
      { key: 'overdue', label: 'Overdue', color: '#ef4444' },
      { key: 'today', label: 'Today', color: '#f59e0b' },
      { key: 'tomorrow', label: 'Tomorrow', color: '#3b82f6' },
      { key: 'this_week', label: 'This Week', color: '#8b5cf6' },
      { key: 'next_week', label: 'Next Week', color: '#6366f1' },
      { key: 'later', label: 'Later', color: '#6b7280' },
      { key: 'no_date', label: 'No Date', color: '#9ca3af' },
    ]
  }

  return []
}

// ---------------------------------------------------------------------------
// Determine which group a task belongs to
// ---------------------------------------------------------------------------
function getTaskGroupKey(task: Task, groupBy: string): string {
  if (groupBy === 'status') {
    return task.status
  }

  if (groupBy === 'priority') {
    return task.priority || 'low'
  }

  if (groupBy === 'due_date') {
    if (!task.due_date) return 'no_date'

    const date = parseISO(task.due_date)
    const now = startOfDay(new Date())

    if (isPast(date) && !isToday(date)) return 'overdue'
    if (isToday(date)) return 'today'
    if (isTomorrow(date)) return 'tomorrow'

    if (isThisWeek(date, { weekStartsOn: 1 }) && !isToday(date) && !isTomorrow(date)) {
      return 'this_week'
    }

    const nextWeekStart = startOfWeek(addWeeks(now, 1), { weekStartsOn: 1 })
    const nextWeekEnd = endOfWeek(addWeeks(now, 1), { weekStartsOn: 1 })

    if (
      isWithinInterval(date, {
        start: nextWeekStart,
        end: nextWeekEnd,
      })
    ) {
      return 'next_week'
    }

    return 'later'
  }

  return 'ungrouped'
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function TaskTableGroupBy({
  tasks,
  groupBy,
  renderTable,
}: TaskTableGroupByProps) {
  const definitions = useMemo(() => getGroupDefinitions(groupBy), [groupBy])

  // Build a collapsed state map keyed by group key
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  // Group tasks into buckets
  const groupedTasks = useMemo(() => {
    const buckets: Record<string, Task[]> = {}

    // Initialize all buckets so they appear in order even if empty
    for (const def of definitions) {
      buckets[def.key] = []
    }

    for (const task of tasks) {
      const key = getTaskGroupKey(task, groupBy)
      if (!buckets[key]) {
        buckets[key] = []
      }
      buckets[key].push(task)
    }

    return buckets
  }, [tasks, groupBy, definitions])

  function toggleCollapsed(key: string) {
    setCollapsed((prev) => ({
      ...prev,
      [key]: !prev[key],
    }))
  }

  return (
    <div className="space-y-2">
      {definitions.map((def) => {
        const groupTasks = groupedTasks[def.key] ?? []
        const isCollapsed = collapsed[def.key] ?? false
        const isEmpty = groupTasks.length === 0

        return (
          <div
            key={def.key}
            className={cn('rounded-lg border', isEmpty && 'opacity-50')}
          >
            {/* Group header */}
            <button
              type="button"
              onClick={() => toggleCollapsed(def.key)}
              className="flex w-full items-center gap-2 px-3 py-2 text-sm font-semibold hover:bg-muted/50 transition-colors cursor-pointer select-none"
            >
              {/* Expand/collapse chevron */}
              {isCollapsed ? (
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
              )}

              {/* Status color dot for status and priority groups */}
              {def.color && (
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: def.color }}
                />
              )}

              {/* Group label */}
              <span className="truncate">{def.label}</span>

              {/* Count badge */}
              <span className="ml-auto inline-flex items-center justify-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                {groupTasks.length}
              </span>
            </button>

            {/* Group content */}
            {!isCollapsed && groupTasks.length > 0 && (
              <div className="border-t">
                {renderTable(groupTasks, def.label)}
              </div>
            )}

            {/* Empty state when expanded */}
            {!isCollapsed && groupTasks.length === 0 && (
              <div className="border-t px-3 py-4 text-center text-xs text-muted-foreground">
                No tasks
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Re-export helpers for external use
// ---------------------------------------------------------------------------
export { getTaskGroupKey, getGroupDefinitions }
export type { TaskTableGroupByProps }
