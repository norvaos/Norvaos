'use client'

import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import {
  format,
  differenceInDays,
  addDays,
  startOfDay,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  eachWeekOfInterval,
  startOfMonth,
  endOfMonth,
  isToday,
} from 'date-fns'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { TASK_STATUSES } from '@/lib/utils/constants'
import type { Database } from '@/lib/types/database'

type Task = Database['public']['Tables']['tasks']['Row']

interface TaskGanttViewProps {
  tasks: Task[]
  onTaskClick: (taskId: string) => void
}

// Build a quick lookup from status value -> colour
const STATUS_COLOR_MAP: Record<string, string> = Object.fromEntries(
  TASK_STATUSES.map((s) => [s.value, s.color])
)

const PRIORITY_COLORS: Record<string, string> = {
  urgent: '#e2445c',
  high: '#fdab3d',
  medium: '#579bfc',
  low: '#c3c6d4',
}

type ZoomLevel = 'day' | 'week' | 'month'

const ZOOM_CONFIG: Record<ZoomLevel, { dayWidth: number; label: string }> = {
  day: { dayWidth: 40, label: 'Day' },
  week: { dayWidth: 18, label: 'Week' },
  month: { dayWidth: 6, label: 'Month' },
}

const ROW_HEIGHT = 40
const TASK_LIST_WIDTH = 200
const HEADER_HEIGHT = 50

// ---------------------------------------------------------------------------
// TaskGanttView (main export)
// ---------------------------------------------------------------------------

export function TaskGanttView({ tasks, onTaskClick }: TaskGanttViewProps) {
  const [zoom, setZoom] = useState<ZoomLevel>('week')
  const timelineRef = useRef<HTMLDivElement>(null)
  const headerRef = useRef<HTMLDivElement>(null)

  const dayWidth = ZOOM_CONFIG[zoom].dayWidth

  // Filter tasks that have at least one date (otherwise we render a gray dot at today)
  const sortedTasks = useMemo(() => {
    // Sort: tasks with dates first, then alphabetically
    return [...tasks].sort((a, b) => {
      const aHasDate = a.start_date || a.due_date
      const bHasDate = b.start_date || b.due_date
      if (aHasDate && !bHasDate) return -1
      if (!aHasDate && bHasDate) return 1
      return a.title.localeCompare(b.title)
    })
  }, [tasks])

  // Calculate the overall date range for the timeline
  const { rangeStart, rangeEnd, allDays } = useMemo(() => {
    const today = startOfDay(new Date())

    // Collect all dates from tasks
    const dates: Date[] = [today]
    for (const task of tasks) {
      if (task.start_date) dates.push(startOfDay(new Date(task.start_date)))
      if (task.due_date) dates.push(startOfDay(new Date(task.due_date)))
    }

    let earliest = dates[0]
    let latest = dates[0]
    for (const d of dates) {
      if (d < earliest) earliest = d
      if (d > latest) latest = d
    }

    // Add padding on both sides
    const paddedStart = addDays(earliest, -14)
    const paddedEnd = addDays(latest, 14)

    return {
      rangeStart: paddedStart,
      rangeEnd: paddedEnd,
      allDays: eachDayOfInterval({ start: paddedStart, end: paddedEnd }),
    }
  }, [tasks])

  const totalWidth = allDays.length * dayWidth

  // Position of the "today" line
  const todayOffset = useMemo(() => {
    const today = startOfDay(new Date())
    return differenceInDays(today, rangeStart) * dayWidth + dayWidth / 2
  }, [rangeStart, dayWidth])

  // Group days into month labels for the header
  const monthLabels = useMemo(() => {
    const labels: { label: string; startIndex: number; span: number }[] = []
    let currentLabel = ''
    let startIdx = 0

    allDays.forEach((day, i) => {
      const label = format(day, 'MMM yyyy')
      if (label !== currentLabel) {
        if (currentLabel) {
          labels.push({ label: currentLabel, startIndex: startIdx, span: i - startIdx })
        }
        currentLabel = label
        startIdx = i
      }
    })
    if (currentLabel) {
      labels.push({ label: currentLabel, startIndex: startIdx, span: allDays.length - startIdx })
    }

    return labels
  }, [allDays])

  // Sync horizontal scroll between header and body
  const handleScroll = useCallback(() => {
    if (timelineRef.current && headerRef.current) {
      headerRef.current.scrollLeft = timelineRef.current.scrollLeft
    }
  }, [])

  // Scroll to center on "today" on mount and when zoom changes
  useEffect(() => {
    if (timelineRef.current) {
      const containerWidth = timelineRef.current.clientWidth
      timelineRef.current.scrollLeft = todayOffset - containerWidth / 3
    }
  }, [todayOffset])

  // Navigate: scroll left/right by a screenful
  const scrollLeft = useCallback(() => {
    if (timelineRef.current) {
      timelineRef.current.scrollBy({ left: -300, behavior: 'smooth' })
    }
  }, [])

  const scrollRight = useCallback(() => {
    if (timelineRef.current) {
      timelineRef.current.scrollBy({ left: 300, behavior: 'smooth' })
    }
  }, [])

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar: zoom controls + navigation */}
      <div className="flex items-center justify-between border-b bg-white px-4 py-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-slate-500">Zoom:</span>
          {(Object.keys(ZOOM_CONFIG) as ZoomLevel[]).map((level) => (
            <Button
              key={level}
              variant={zoom === level ? 'default' : 'outline'}
              size="sm"
              className="h-7 px-3 text-xs"
              onClick={() => setZoom(level)}
            >
              {ZOOM_CONFIG[level].label}
            </Button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={scrollLeft}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={scrollRight}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Main Gantt area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left side: fixed task title list */}
        <div
          className="flex flex-shrink-0 flex-col border-r bg-white"
          style={{ width: TASK_LIST_WIDTH }}
        >
          {/* Task list header */}
          <div
            className="flex items-center border-b bg-slate-50 px-3 text-xs font-medium text-slate-500"
            style={{ height: HEADER_HEIGHT }}
          >
            Task
          </div>

          {/* Task list rows */}
          <div className="flex-1 overflow-y-auto">
            {sortedTasks.map((task) => (
              <div
                key={task.id}
                className="flex cursor-pointer items-center gap-2 border-b px-3 transition-colors hover:bg-slate-50"
                style={{ height: ROW_HEIGHT }}
                onClick={() => onTaskClick(task.id)}
              >
                {/* Priority dot */}
                <span
                  className="inline-block h-2 w-2 flex-shrink-0 rounded-full"
                  style={{ backgroundColor: PRIORITY_COLORS[task.priority] ?? '#c3c6d4' }}
                />
                {/* Title */}
                <span className="min-w-0 flex-1 truncate text-xs font-medium text-slate-800">
                  {task.title}
                </span>
              </div>
            ))}

            {sortedTasks.length === 0 && (
              <div className="flex items-center justify-center py-10 text-xs text-slate-400">
                No tasks
              </div>
            )}
          </div>
        </div>

        {/* Right side: scrollable timeline */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Timeline header */}
          <div
            ref={headerRef}
            className="overflow-hidden border-b bg-slate-50"
            style={{ height: HEADER_HEIGHT }}
          >
            <div style={{ width: totalWidth }} className="relative h-full">
              {/* Month labels row */}
              <div className="flex h-1/2">
                {monthLabels.map((m) => (
                  <div
                    key={`${m.label}-${m.startIndex}`}
                    className="flex items-center border-r px-2 text-[10px] font-semibold text-slate-600"
                    style={{ width: m.span * dayWidth }}
                  >
                    {m.span * dayWidth > 40 ? m.label : ''}
                  </div>
                ))}
              </div>

              {/* Day numbers row */}
              <div className="flex h-1/2">
                {allDays.map((day, i) => {
                  const dayNum = format(day, 'd')
                  const isTodayDay = isToday(day)
                  const isFirstOfMonth = day.getDate() === 1
                  return (
                    <div
                      key={i}
                      className={cn(
                        'flex items-center justify-center text-[9px]',
                        isTodayDay && 'font-bold text-blue-600',
                        !isTodayDay && 'text-slate-400',
                        isFirstOfMonth && 'border-l border-slate-200'
                      )}
                      style={{ width: dayWidth }}
                    >
                      {dayWidth >= 14 ? dayNum : i % 7 === 0 ? dayNum : ''}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Timeline body */}
          <div
            ref={timelineRef}
            className="flex-1 overflow-x-auto overflow-y-auto"
            onScroll={handleScroll}
          >
            <div style={{ width: totalWidth, position: 'relative' }}>
              {/* Grid lines (first of each month) */}
              <div className="pointer-events-none absolute inset-0">
                {allDays.map((day, i) => {
                  const isFirstOfMonth = day.getDate() === 1
                  return isFirstOfMonth ? (
                    <div
                      key={i}
                      className="absolute bottom-0 top-0 border-l border-slate-200"
                      style={{ left: i * dayWidth }}
                    />
                  ) : null
                })}
              </div>

              {/* Row background stripes */}
              {sortedTasks.map((_, rowIndex) => (
                <div
                  key={rowIndex}
                  className={cn(
                    'absolute w-full border-b border-slate-100',
                    rowIndex % 2 === 1 && 'bg-slate-50/40'
                  )}
                  style={{
                    top: rowIndex * ROW_HEIGHT,
                    height: ROW_HEIGHT,
                  }}
                />
              ))}

              {/* Today line - vertical red dashed */}
              {todayOffset >= 0 && todayOffset <= totalWidth && (
                <div
                  className="pointer-events-none absolute bottom-0 top-0 z-10 border-l-2 border-dashed border-red-400"
                  style={{ left: todayOffset }}
                />
              )}

              {/* Task bars */}
              {sortedTasks.map((task, rowIndex) => {
                const taskStart = task.start_date
                  ? startOfDay(new Date(task.start_date))
                  : null
                const taskEnd = task.due_date
                  ? startOfDay(new Date(task.due_date))
                  : null
                const statusColor = STATUS_COLOR_MAP[task.status] ?? '#6b7280'

                // Case 1: Both start_date and due_date -- render a full bar
                if (taskStart && taskEnd) {
                  const startOffset =
                    differenceInDays(taskStart, rangeStart) * dayWidth
                  const duration = differenceInDays(taskEnd, taskStart) + 1
                  const barWidth = Math.max(duration * dayWidth, dayWidth)

                  return (
                    <div
                      key={task.id}
                      className="absolute cursor-pointer rounded transition-opacity hover:opacity-80"
                      style={{
                        left: startOffset,
                        top: rowIndex * ROW_HEIGHT + 10,
                        width: barWidth,
                        height: ROW_HEIGHT - 20,
                        backgroundColor: statusColor,
                      }}
                      onClick={() => onTaskClick(task.id)}
                      title={`${task.title}\n${format(taskStart, 'MMM d')} - ${format(taskEnd, 'MMM d')}`}
                    >
                      {barWidth > 60 && (
                        <span className="block truncate px-2 text-[10px] font-medium leading-5 text-white">
                          {task.title}
                        </span>
                      )}
                    </div>
                  )
                }

                // Case 2: Only due_date (no start_date) -- render diamond marker
                if (taskEnd && !taskStart) {
                  const offset =
                    differenceInDays(taskEnd, rangeStart) * dayWidth + dayWidth / 2

                  return (
                    <div
                      key={task.id}
                      className="absolute cursor-pointer"
                      style={{
                        left: offset - 6,
                        top: rowIndex * ROW_HEIGHT + ROW_HEIGHT / 2 - 6,
                      }}
                      onClick={() => onTaskClick(task.id)}
                      title={`${task.title}\nDue: ${format(taskEnd, 'MMM d, yyyy')}`}
                    >
                      <div
                        className="h-3 w-3 rotate-45 rounded-sm"
                        style={{ backgroundColor: statusColor }}
                      />
                    </div>
                  )
                }

                // Case 3: Only start_date (no due_date) -- render diamond marker at start
                if (taskStart && !taskEnd) {
                  const offset =
                    differenceInDays(taskStart, rangeStart) * dayWidth + dayWidth / 2

                  return (
                    <div
                      key={task.id}
                      className="absolute cursor-pointer"
                      style={{
                        left: offset - 6,
                        top: rowIndex * ROW_HEIGHT + ROW_HEIGHT / 2 - 6,
                      }}
                      onClick={() => onTaskClick(task.id)}
                      title={`${task.title}\nStart: ${format(taskStart, 'MMM d, yyyy')}`}
                    >
                      <div
                        className="h-3 w-3 rotate-45 rounded-sm"
                        style={{ backgroundColor: statusColor }}
                      />
                    </div>
                  )
                }

                // Case 4: No dates at all -- gray dot at today
                return (
                  <div
                    key={task.id}
                    className="absolute cursor-pointer"
                    style={{
                      left: todayOffset - 4,
                      top: rowIndex * ROW_HEIGHT + ROW_HEIGHT / 2 - 4,
                    }}
                    onClick={() => onTaskClick(task.id)}
                    title={`${task.title}\nNo dates set`}
                  >
                    <div className="h-2 w-2 rounded-full bg-slate-400" />
                  </div>
                )
              })}

              {/* Ensure the container has enough height for all rows */}
              <div style={{ height: sortedTasks.length * ROW_HEIGHT }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
