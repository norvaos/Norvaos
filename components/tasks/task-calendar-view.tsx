'use client'

import { useState, useMemo, useCallback } from 'react'
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  isToday,
  addMonths,
  subMonths,
} from 'date-fns'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { TASK_STATUSES } from '@/lib/utils/constants'
import type { Database } from '@/lib/types/database'

type Task = Database['public']['Tables']['tasks']['Row']

interface TaskCalendarViewProps {
  tasks: Task[]
  onTaskClick: (taskId: string) => void
}

// Build a quick lookup map from status value -> colour
const STATUS_COLOR_MAP: Record<string, string> = Object.fromEntries(
  TASK_STATUSES.map((s) => [s.value, s.color])
)

const DAY_HEADERS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const
const MAX_VISIBLE_TASKS = 3

// ---------------------------------------------------------------------------
// TaskPill  (a single task rendered inside a day cell)
// ---------------------------------------------------------------------------

interface TaskPillProps {
  task: Task
  onClick: () => void
}

function TaskPill({ task, onClick }: TaskPillProps) {
  const color = STATUS_COLOR_MAP[task.status] ?? '#6b7280'

  return (
    <button
      className="flex w-full items-center gap-1.5 rounded px-1 py-0.5 text-left transition-colors hover:bg-slate-100"
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
    >
      <span
        className="inline-block h-2 w-2 flex-shrink-0 rounded-sm"
        style={{ backgroundColor: color }}
      />
      <span className="truncate text-[11px] leading-tight text-slate-700">
        {task.title}
      </span>
    </button>
  )
}

// ---------------------------------------------------------------------------
// DayCell  (one cell in the calendar grid)
// ---------------------------------------------------------------------------

interface DayCellProps {
  day: Date
  currentMonth: Date
  dayTasks: Task[]
  onTaskClick: (taskId: string) => void
}

function DayCell({ day, currentMonth, dayTasks, onTaskClick }: DayCellProps) {
  const isCurrentMonth = isSameMonth(day, currentMonth)
  const isTodayDate = isToday(day)
  const visibleTasks = dayTasks.slice(0, MAX_VISIBLE_TASKS)
  const hiddenCount = dayTasks.length - MAX_VISIBLE_TASKS

  return (
    <div
      className={cn(
        'min-h-[100px] border-b border-r p-1.5',
        !isCurrentMonth && 'bg-slate-50/60',
        isTodayDate && 'ring-2 ring-inset ring-blue-400/50'
      )}
    >
      {/* Day number */}
      <div className="mb-1 flex items-center justify-end">
        <span
          className={cn(
            'flex h-6 w-6 items-center justify-center rounded-full text-xs',
            isTodayDate && 'bg-blue-600 font-semibold text-white',
            !isTodayDate && isCurrentMonth && 'text-slate-700',
            !isTodayDate && !isCurrentMonth && 'text-slate-400'
          )}
        >
          {format(day, 'd')}
        </span>
      </div>

      {/* Task pills */}
      <div className="flex flex-col gap-0.5">
        {visibleTasks.map((task) => (
          <TaskPill
            key={task.id}
            task={task}
            onClick={() => onTaskClick(task.id)}
          />
        ))}

        {hiddenCount > 0 && (
          <span className="px-1 text-[10px] font-medium text-slate-500">
            +{hiddenCount} more
          </span>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// TaskCalendarView (main export)
// ---------------------------------------------------------------------------

export function TaskCalendarView({ tasks, onTaskClick }: TaskCalendarViewProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date())

  // Navigation handlers
  const goToPrevMonth = useCallback(() => {
    setCurrentMonth((prev) => subMonths(prev, 1))
  }, [])

  const goToNextMonth = useCallback(() => {
    setCurrentMonth((prev) => addMonths(prev, 1))
  }, [])

  const goToToday = useCallback(() => {
    setCurrentMonth(new Date())
  }, [])

  // Generate all calendar days (Sunday start)
  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(currentMonth)
    const monthEnd = endOfMonth(currentMonth)
    const calStart = startOfWeek(monthStart, { weekStartsOn: 0 })
    const calEnd = endOfWeek(monthEnd, { weekStartsOn: 0 })
    return eachDayOfInterval({ start: calStart, end: calEnd })
  }, [currentMonth])

  // Build a map of date-string -> tasks for that date
  const tasksByDate = useMemo(() => {
    const map: Record<string, Task[]> = {}
    for (const task of tasks) {
      if (task.due_date) {
        // Handle both ISO datetime and date-only strings
        const dateKey = task.due_date.split('T')[0]
        if (!map[dateKey]) map[dateKey] = []
        map[dateKey].push(task)
      }
    }
    return map
  }, [tasks])

  return (
    <div className="flex h-full flex-col">
      {/* Header: month/year + navigation */}
      <div className="flex items-center justify-between border-b bg-white px-4 py-3">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-slate-900">
            {format(currentMonth, 'MMMM yyyy')}
          </h2>
          <Button variant="outline" size="sm" onClick={goToToday}>
            Today
          </Button>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={goToPrevMonth}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={goToNextMonth}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Day-of-week headers */}
      <div className="grid grid-cols-7 border-b bg-slate-50">
        {DAY_HEADERS.map((day) => (
          <div
            key={day}
            className="px-2 py-2 text-center text-xs font-medium text-slate-500"
          >
            {day}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid flex-1 auto-rows-fr grid-cols-7">
        {calendarDays.map((day) => {
          const dateKey = format(day, 'yyyy-MM-dd')
          const dayTasks = tasksByDate[dateKey] ?? []

          return (
            <DayCell
              key={dateKey}
              day={day}
              currentMonth={currentMonth}
              dayTasks={dayTasks}
              onTaskClick={onTaskClick}
            />
          )
        })}
      </div>
    </div>
  )
}
