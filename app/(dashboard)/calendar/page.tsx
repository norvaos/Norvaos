'use client'

import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useQueryClient, useQuery } from '@tanstack/react-query'
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  eachHourOfInterval,
  isSameMonth,
  isSameDay,
  isToday,
  addMonths,
  subMonths,
  addWeeks,
  subWeeks,
  addDays,
  subDays,
  parseISO,
  isWithinInterval,
  startOfDay,
  endOfDay,
  set as setDate,
} from 'date-fns'
import { formatDate } from '@/lib/utils/formatters'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  closestCenter,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  LayoutList,
  AlertCircle,
  CheckSquare,
  Clock,
  Plus,
  GripVertical,
  ChevronsUpDown,
  Check,
  FileText,
  Columns3,
  CalendarDays,
  CalendarRange,
} from 'lucide-react'

import { useTenant } from '@/lib/hooks/use-tenant'
import { useUser } from '@/lib/hooks/use-user'
import { usePracticeAreaContext } from '@/lib/hooks/use-practice-area-context'
import { useUIStore } from '@/lib/stores/ui-store'
import { useCalendarEvents, calendarKeys, type CalendarEvent } from '@/lib/queries/calendar'
import { useUpdateTask, useCreateTask } from '@/lib/queries/tasks'
import { useCreateMatterDeadline, useUpdateMatterDeadline } from '@/lib/queries/matter-types'
import { useUpdateCalendarEvent } from '@/lib/queries/calendar-events'
import { DEADLINE_STATUSES, TASK_STATUSES } from '@/lib/utils/constants'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'

import { TaskDetailSheet } from '@/components/tasks/task-detail-sheet'
import { EventCreateDialog } from '@/components/calendar/event-create-dialog'
import { EventDetailSheet } from '@/components/calendar/event-detail-sheet'
import { ContactSearch } from '@/components/shared/contact-search'
import { EmptyState } from '@/components/shared/empty-state'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Calendar } from '@/components/ui/calendar'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

// ── Constants ───────────────────────────────────────────────────────────────

const DAY_HEADERS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const
const MAX_VISIBLE_EVENTS = 3
const HOUR_HEIGHT = 60 // px per hour in time-grid views
const HOURS = Array.from({ length: 24 }, (_, i) => i) // 0..23

type ViewKey = 'calendar' | 'week' | '3day' | 'day' | 'timeline'

const VIEWS: { key: ViewKey; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: 'calendar', label: 'Month', icon: CalendarIcon },
  { key: 'week', label: 'Week', icon: CalendarDays },
  { key: '3day', label: '3 Day', icon: Columns3 },
  { key: 'day', label: 'Day', icon: CalendarRange },
  { key: 'timeline', label: 'Agenda', icon: LayoutList },
]

const TYPE_FILTERS = [
  { key: 'all' as const, label: 'All' },
  { key: 'deadline' as const, label: 'Deadlines' },
  { key: 'task' as const, label: 'Tasks' },
  { key: 'event' as const, label: 'Events' },
] as const

type TypeFilterKey = (typeof TYPE_FILTERS)[number]['key']

const STATUS_OPTIONS = [
  { value: 'all', label: 'All Statuses' },
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'at_risk', label: 'At Risk' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'not_started', label: 'Not Started' },
  { value: 'working_on_it', label: 'Working On It' },
  { value: 'stuck', label: 'Stuck' },
]

const PRIORITIES = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' },
]

const DEADLINE_TYPES = [
  { value: 'filing', label: 'Filing' },
  { value: 'hearing', label: 'Hearing' },
  { value: 'statute_of_limitations', label: 'Statute of Limitations' },
  { value: 'custom', label: 'Custom' },
]

function formatHour(hour: number): string {
  if (hour === 0) return '12 AM'
  if (hour < 12) return `${hour} AM`
  if (hour === 12) return '12 PM'
  return `${hour - 12} PM`
}

// ── Shared Draggable EventPill ──────────────────────────────────────────────

function DraggableEventPill({
  event,
  onClick,
  compact,
}: {
  event: CalendarEvent
  onClick: () => void
  compact?: boolean
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: event.id,
    data: { event },
  })

  return (
    <button
      ref={setNodeRef}
      className={cn(
        'group flex w-full items-center gap-1.5 rounded-md border-l-[3px] px-2 text-left transition-all duration-150',
        'hover:shadow-sm hover:-translate-y-[1px]',
        compact ? 'py-0.5' : 'py-1',
        isDragging && 'opacity-30'
      )}
      style={{
        borderLeftColor: event.color,
        backgroundColor: `${event.color}10`,
      }}
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      {...attributes}
      {...listeners}
    >
      <GripVertical className="h-3 w-3 flex-shrink-0 text-slate-300 opacity-0 transition-opacity group-hover:opacity-100" />
      {event.source === 'deadline' ? (
        <AlertCircle className="h-3 w-3 flex-shrink-0" style={{ color: event.color }} />
      ) : event.source === 'event' ? (
        <CalendarDays className="h-3 w-3 flex-shrink-0" style={{ color: event.color }} />
      ) : (
        <CheckSquare className="h-3 w-3 flex-shrink-0" style={{ color: event.color }} />
      )}
      <span className="truncate text-[11px] font-medium leading-tight text-slate-700">
        {event.title}
      </span>
      {!compact && event.time && (
        <span className="ml-auto flex-shrink-0 text-[10px] text-slate-400">{event.time}</span>
      )}
    </button>
  )
}

function EventPillStatic({ event }: { event: CalendarEvent }) {
  return (
    <div
      className="flex w-48 items-center gap-1.5 rounded-md border-l-[3px] px-2 py-1 shadow-lg ring-1 ring-black/5"
      style={{
        borderLeftColor: event.color,
        backgroundColor: `${event.color}15`,
      }}
    >
      {event.source === 'deadline' ? (
        <AlertCircle className="h-3 w-3 flex-shrink-0" style={{ color: event.color }} />
      ) : event.source === 'event' ? (
        <CalendarDays className="h-3 w-3 flex-shrink-0" style={{ color: event.color }} />
      ) : (
        <CheckSquare className="h-3 w-3 flex-shrink-0" style={{ color: event.color }} />
      )}
      <span className="truncate text-[11px] font-medium leading-tight text-slate-700">
        {event.title}
      </span>
    </div>
  )
}

// ── Droppable DayCell (Month view) ──────────────────────────────────────────

function DroppableDayCell({
  day,
  dateKey,
  currentMonth,
  dayEvents,
  onEventClick,
  onDayClick,
}: {
  day: Date
  dateKey: string
  currentMonth: Date
  dayEvents: CalendarEvent[]
  onEventClick: (event: CalendarEvent) => void
  onDayClick: (date: string) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: dateKey })
  const isCurrentMonth = isSameMonth(day, currentMonth)
  const isTodayDate = isToday(day)
  const visibleEvents = dayEvents.slice(0, MAX_VISIBLE_EVENTS)
  const hiddenCount = dayEvents.length - MAX_VISIBLE_EVENTS

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'group/cell relative min-h-[110px] border-b border-r border-slate-100 p-1.5 transition-all duration-150',
        !isCurrentMonth && 'opacity-40',
        isTodayDate && 'bg-blue-50/60',
        isOver && 'bg-blue-100/60 ring-2 ring-inset ring-blue-400/40',
        isCurrentMonth && !isTodayDate && 'hover:bg-slate-50/80'
      )}
      onClick={(e) => {
        if (e.target === e.currentTarget || (e.target as HTMLElement).closest('[data-cell-bg]')) {
          onDayClick(dateKey)
        }
      }}
    >
      <div className="mb-1 flex items-center justify-between" data-cell-bg>
        <button
          className={cn(
            'flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium transition-colors',
            isTodayDate && 'bg-blue-600 font-semibold text-white shadow-sm',
            !isTodayDate && isCurrentMonth && 'text-slate-600',
            !isTodayDate && !isCurrentMonth && 'text-slate-400'
          )}
          onClick={(e) => {
            e.stopPropagation()
            onDayClick(dateKey)
          }}
        >
          {format(day, 'd')}
        </button>
        <button
          className="flex h-5 w-5 items-center justify-center rounded-full text-slate-400 opacity-0 transition-all hover:bg-blue-100 hover:text-blue-600 group-hover/cell:opacity-100"
          onClick={(e) => {
            e.stopPropagation()
            onDayClick(dateKey)
          }}
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="flex flex-col gap-0.5">
        {visibleEvents.map((event) => (
          <DraggableEventPill
            key={event.id}
            event={event}
            onClick={() => onEventClick(event)}
            compact
          />
        ))}
        {hiddenCount > 0 && (
          <span className="px-2 text-[10px] font-medium text-slate-400">
            +{hiddenCount} more
          </span>
        )}
      </div>
    </div>
  )
}

// ── MonthView ───────────────────────────────────────────────────────────────

function MonthView({
  currentMonth,
  events,
  onEventClick,
  onDayClick,
}: {
  currentMonth: Date
  events: CalendarEvent[]
  onEventClick: (event: CalendarEvent) => void
  onDayClick: (date: string) => void
}) {
  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(currentMonth)
    const monthEnd = endOfMonth(currentMonth)
    const calStart = startOfWeek(monthStart, { weekStartsOn: 0 })
    const calEnd = endOfWeek(monthEnd, { weekStartsOn: 0 })
    return eachDayOfInterval({ start: calStart, end: calEnd })
  }, [currentMonth])

  const eventsByDate = useMemo(() => {
    const map: Record<string, CalendarEvent[]> = {}
    for (const event of events) {
      const dk = event.date.split('T')[0]
      if (!map[dk]) map[dk] = []
      map[dk].push(event)
    }
    return map
  }, [events])

  return (
    <>
      {/* Day-of-week headers */}
      <div className="grid grid-cols-7 border-b border-slate-100">
        {DAY_HEADERS.map((day) => (
          <div
            key={day}
            className="px-2 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wider text-slate-400"
          >
            {day}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid flex-1 auto-rows-fr grid-cols-7 bg-slate-50/30">
        {calendarDays.map((day) => {
          const dk = format(day, 'yyyy-MM-dd')
          const dayEvents = eventsByDate[dk] ?? []

          return (
            <DroppableDayCell
              key={dk}
              day={day}
              dateKey={dk}
              currentMonth={currentMonth}
              dayEvents={dayEvents}
              onEventClick={onEventClick}
              onDayClick={onDayClick}
            />
          )
        })}
      </div>
    </>
  )
}

// ── TimeGrid (shared for Week / 3-Day / Day) ────────────────────────────────

function DroppableTimeColumn({
  dateKey,
  children,
  isTodayDate,
  isOver,
}: {
  dateKey: string
  children: React.ReactNode
  isTodayDate: boolean
  isOver: boolean
}) {
  const { setNodeRef, isOver: dropIsOver } = useDroppable({ id: dateKey })
  const over = isOver || dropIsOver

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'relative min-h-full border-r border-slate-100 transition-colors',
        isTodayDate && 'bg-blue-50/40',
        over && 'bg-blue-100/50'
      )}
    >
      {children}
    </div>
  )
}

function TimeGridView({
  days,
  events,
  onEventClick,
  onDayClick,
}: {
  days: Date[]
  events: CalendarEvent[]
  onEventClick: (event: CalendarEvent) => void
  onDayClick: (date: string) => void
}) {
  const colCount = days.length
  const scrollRef = useRef<HTMLDivElement>(null)
  const hasScrolled = useRef(false)

  // Auto-scroll to 8 AM (just above 9 AM working hours) on first render
  useEffect(() => {
    if (scrollRef.current && !hasScrolled.current) {
      scrollRef.current.scrollTop = 8 * HOUR_HEIGHT
      hasScrolled.current = true
    }
  }, [])

  // Reset scroll flag when days change (view switch or navigation)
  useEffect(() => {
    hasScrolled.current = false
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 8 * HOUR_HEIGHT
    }
  }, [days.length, days[0]?.getTime()])

  const eventsByDate = useMemo(() => {
    const map: Record<string, CalendarEvent[]> = {}
    for (const event of events) {
      const dk = event.date.split('T')[0]
      if (!map[dk]) map[dk] = []
      map[dk].push(event)
    }
    return map
  }, [events])

  // Separate all-day (no time) and timed events
  const getTimedEvents = (dateKey: string) =>
    (eventsByDate[dateKey] ?? []).filter((e) => e.time)
  const getAllDayEvents = (dateKey: string) =>
    (eventsByDate[dateKey] ?? []).filter((e) => !e.time)

  // Calculate position from time string
  const getTopFromTime = (time: string): number => {
    const [h, m] = time.split(':').map(Number)
    return (h + m / 60) * HOUR_HEIGHT
  }

  return (
    <>
      {/* Day headers */}
      <div className="grid border-b border-slate-100" style={{ gridTemplateColumns: `64px repeat(${colCount}, 1fr)` }}>
        <div className="border-r border-slate-100" />
        {days.map((day) => {
          const dk = format(day, 'yyyy-MM-dd')
          const isTodayDate = isToday(day)
          return (
            <button
              key={dk}
              className={cn(
                'px-2 py-2.5 text-center transition-colors hover:bg-slate-50',
                isTodayDate && 'bg-blue-50/60'
              )}
              onClick={() => onDayClick(dk)}
            >
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                {format(day, 'EEE')}
              </div>
              <div
                className={cn(
                  'mx-auto mt-0.5 flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium',
                  isTodayDate && 'bg-blue-600 text-white shadow-sm',
                  !isTodayDate && 'text-slate-700'
                )}
              >
                {format(day, 'd')}
              </div>
            </button>
          )
        })}
      </div>

      {/* All-day events row */}
      {days.some((d) => getAllDayEvents(format(d, 'yyyy-MM-dd')).length > 0) && (
        <div
          className="grid border-b border-slate-200 bg-slate-50/50"
          style={{ gridTemplateColumns: `64px repeat(${colCount}, 1fr)` }}
        >
          <div className="flex items-center justify-end border-r border-slate-100 px-2 py-1">
            <span className="text-[10px] font-medium text-slate-400">All day</span>
          </div>
          {days.map((day) => {
            const dk = format(day, 'yyyy-MM-dd')
            const allDay = getAllDayEvents(dk)
            return (
              <div key={dk} className="border-r border-slate-100 p-1 space-y-0.5">
                {allDay.slice(0, 3).map((event) => (
                  <DraggableEventPill
                    key={event.id}
                    event={event}
                    onClick={() => onEventClick(event)}
                    compact
                  />
                ))}
                {allDay.length > 3 && (
                  <span className="px-1 text-[10px] text-slate-400">+{allDay.length - 3} more</span>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Time grid body */}
      <div ref={scrollRef} className="relative overflow-auto" style={{ maxHeight: '600px' }}>
        <div
          className="grid"
          style={{
            gridTemplateColumns: `64px repeat(${colCount}, 1fr)`,
            height: `${24 * HOUR_HEIGHT}px`,
          }}
        >
          {/* Hour labels column */}
          <div className="relative border-r border-slate-100">
            {HOURS.map((hour) => (
              <div
                key={hour}
                className="absolute right-2 -translate-y-1/2 text-[10px] font-medium text-slate-400"
                style={{ top: `${hour * HOUR_HEIGHT}px` }}
              >
                {hour > 0 && formatHour(hour)}
              </div>
            ))}
          </div>

          {/* Day columns */}
          {days.map((day) => {
            const dk = format(day, 'yyyy-MM-dd')
            const isTodayDate = isToday(day)
            const timed = getTimedEvents(dk)

            return (
              <DroppableTimeColumn
                key={dk}
                dateKey={dk}
                isTodayDate={isTodayDate}
                isOver={false}
              >
                {/* Hour grid lines */}
                {HOURS.map((hour) => (
                  <div
                    key={hour}
                    className="absolute left-0 right-0 border-t border-slate-100"
                    style={{ top: `${hour * HOUR_HEIGHT}px`, height: `${HOUR_HEIGHT}px` }}
                    onClick={() => onDayClick(dk)}
                  />
                ))}

                {/* Current time indicator */}
                {isTodayDate && <CurrentTimeIndicator />}

                {/* Timed events */}
                {timed.map((event) => {
                  const top = getTopFromTime(event.time!)
                  return (
                    <div
                      key={event.id}
                      className="absolute left-1 right-1 z-10"
                      style={{ top: `${top}px` }}
                    >
                      <DraggableEventPill
                        event={event}
                        onClick={() => onEventClick(event)}
                        compact
                      />
                    </div>
                  )
                })}
              </DroppableTimeColumn>
            )
          })}
        </div>
      </div>
    </>
  )
}

// ── Current Time Indicator ──────────────────────────────────────────────────

function CurrentTimeIndicator() {
  const now = new Date()
  const minutes = now.getHours() * 60 + now.getMinutes()
  const top = (minutes / 60) * HOUR_HEIGHT

  return (
    <div className="absolute left-0 right-0 z-20 pointer-events-none" style={{ top: `${top}px` }}>
      <div className="flex items-center">
        <div className="h-2.5 w-2.5 rounded-full bg-red-500 -ml-1" />
        <div className="flex-1 h-[2px] bg-red-500" />
      </div>
    </div>
  )
}

// ── AgendaView ──────────────────────────────────────────────────────────────

function getRelativeLabel(dateStr: string): string | null {
  const d = parseISO(dateStr)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const tomorrow = addDays(today, 1)

  if (isToday(d)) return 'Today'
  if (d.getTime() >= tomorrow.getTime() && d.getTime() < addDays(tomorrow, 1).getTime())
    return 'Tomorrow'
  return null
}

function getStatusLabel(status: string): string {
  const d = DEADLINE_STATUSES.find((s) => s.value === status)
  if (d) return d.label
  const t = TASK_STATUSES.find((s) => s.value === status)
  if (t) return t.label
  return status
}

function AgendaView({
  events,
  onEventClick,
}: {
  events: CalendarEvent[]
  onEventClick: (event: CalendarEvent) => void
}) {
  const grouped = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>()
    const sorted = [...events]
      .filter(
        (e) =>
          e.status !== 'completed' &&
          e.status !== 'done' &&
          e.status !== 'dismissed' &&
          e.status !== 'cancelled'
      )
      .sort((a, b) => a.date.localeCompare(b.date))

    for (const event of sorted) {
      const key = event.date.split('T')[0]
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(event)
    }
    return map
  }, [events])

  if (grouped.size === 0) {
    return (
      <EmptyState
        icon={CalendarIcon}
        title="No upcoming events"
        description="There are no active deadlines, tasks, or events in this period."
      />
    )
  }

  return (
    <div className="space-y-3">
      {Array.from(grouped.entries()).map(([dateStr, dayEvents]) => {
        const relativeLabel = getRelativeLabel(dateStr)
        const formattedDate = format(parseISO(dateStr), 'EEEE, MMMM d')

        return (
          <div key={dateStr} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-2.5">
              <h3 className="text-sm font-semibold text-slate-900">
                {relativeLabel ? `${relativeLabel} — ` : ''}{formattedDate}
              </h3>
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                {dayEvents.length}
              </Badge>
            </div>
            <div className="divide-y divide-slate-50">
              {dayEvents.map((event) => (
                <button
                  key={event.id}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50/80"
                  onClick={() => onEventClick(event)}
                >
                  <div
                    className="h-9 w-1 flex-shrink-0 rounded-full"
                    style={{ backgroundColor: event.color }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      {event.source === 'deadline' ? (
                        <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" style={{ color: event.color }} />
                      ) : event.source === 'event' ? (
                        <CalendarDays className="h-3.5 w-3.5 flex-shrink-0" style={{ color: event.color }} />
                      ) : (
                        <CheckSquare className="h-3.5 w-3.5 flex-shrink-0" style={{ color: event.color }} />
                      )}
                      <span className="truncate text-sm font-medium text-slate-900">
                        {event.title}
                      </span>
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                      {event.matterTitle && (
                        <span className="flex items-center gap-1 truncate">
                          <FileText className="h-3 w-3" />
                          {event.matterTitle}
                        </span>
                      )}
                      {event.time && (
                        <>
                          <span>·</span>
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {event.time}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  <Badge
                    variant="outline"
                    className="text-[10px] py-0 flex-shrink-0"
                    style={{ borderColor: event.color, color: event.color }}
                  >
                    {getStatusLabel(event.status)}
                  </Badge>
                </button>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Matter Selector (Popover + Command) ─────────────────────────────────────

function MatterSelector({
  value,
  onChange,
  tenantId,
}: {
  value: string | null
  onChange: (id: string | null, title?: string) => void
  tenantId: string
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')

  const { data: mattersData } = useQuery({
    queryKey: ['matters', 'select', tenantId, search],
    queryFn: async () => {
      const supabase = createClient()
      let q = supabase
        .from('matters')
        .select('id, title, matter_number')
        .eq('tenant_id', tenantId)
        .order('updated_at', { ascending: false })
        .limit(10)

      if (search) {
        q = q.or(`title.ilike.%${search}%,matter_number.ilike.%${search}%`)
      }

      const { data, error } = await q
      if (error) throw error
      return data as { id: string; title: string; matter_number: string | null }[]
    },
    enabled: !!tenantId,
  })

  const matters = mattersData ?? []
  const selectedMatter = matters.find((m) => m.id === value)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          className="w-full justify-between text-left font-normal"
        >
          <span className="truncate">
            {selectedMatter?.title ?? (value ? 'Loading...' : 'Select matter...')}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search matters..."
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            <CommandEmpty>No matters found.</CommandEmpty>
            {matters.map((m) => (
              <CommandItem
                key={m.id}
                value={m.id}
                onSelect={() => {
                  onChange(m.id, m.title)
                  setOpen(false)
                }}
              >
                <Check
                  className={cn(
                    'mr-2 h-4 w-4',
                    value === m.id ? 'opacity-100' : 'opacity-0'
                  )}
                />
                <div className="flex-1 min-w-0">
                  <p className="truncate text-sm">{m.title}</p>
                  {m.matter_number && (
                    <p className="text-xs text-muted-foreground">{m.matter_number}</p>
                  )}
                </div>
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

// ── Quick Create Dialog ─────────────────────────────────────────────────────

function QuickCreateDialog({
  open,
  onOpenChange,
  initialDate,
  tenantId,
  userId,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialDate: string | null
  tenantId: string
  userId: string
}) {
  const queryClient = useQueryClient()
  const createTask = useCreateTask()
  const createDeadline = useCreateMatterDeadline()

  const [eventType, setEventType] = useState<'task' | 'deadline'>('task')
  const [title, setTitle] = useState('')
  const [selectedDate, setSelectedDate] = useState<string | null>(initialDate)
  const [priority, setPriority] = useState('medium')
  const [linkType, setLinkType] = useState<'none' | 'matter' | 'contact'>('none')
  const [matterId, setMatterId] = useState<string | null>(null)
  const [matterTitle, setMatterTitle] = useState<string | null>(null)
  const [contactId, setContactId] = useState<string | null>(null)
  const [deadlineType, setDeadlineType] = useState('custom')
  const [notes, setNotes] = useState('')
  const [showNotes, setShowNotes] = useState(false)
  const [datePickerOpen, setDatePickerOpen] = useState(false)

  const prevOpen = useRef(open)
  if (open && !prevOpen.current) {
    setEventType('task')
    setTitle('')
    setSelectedDate(initialDate)
    setPriority('medium')
    setLinkType('none')
    setMatterId(null)
    setMatterTitle(null)
    setContactId(null)
    setDeadlineType('custom')
    setNotes('')
    setShowNotes(false)
  }
  prevOpen.current = open

  const isSubmitting = createTask.isPending || createDeadline.isPending
  const deadlineNeedsMatter = eventType === 'deadline' && !matterId
  const canSubmit = title.trim() && selectedDate && !deadlineNeedsMatter && !isSubmitting

  async function handleSubmit() {
    if (!canSubmit) return

    if (eventType === 'task') {
      await createTask.mutateAsync({
        tenant_id: tenantId,
        title: title.trim(),
        due_date: selectedDate,
        priority,
        status: 'not_started',
        matter_id: linkType === 'matter' ? matterId : null,
        contact_id: linkType === 'contact' ? contactId : null,
        created_by: userId,
        notes: notes.trim() || null,
      })
    } else {
      await createDeadline.mutateAsync({
        tenantId,
        matterId: matterId!,
        deadlineDate: selectedDate!,
        deadlineType,
        title: title.trim(),
        priority,
        description: notes.trim() || null,
      })
    }

    queryClient.invalidateQueries({ queryKey: calendarKeys.all })
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle>Create New Entry</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Type toggle */}
          <div className="flex gap-1 rounded-lg border bg-muted/50 p-1">
            <button
              type="button"
              className={cn(
                'flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                eventType === 'task'
                  ? 'bg-white text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
              onClick={() => setEventType('task')}
            >
              <CheckSquare className="mr-1.5 inline-block h-4 w-4" />
              Task
            </button>
            <button
              type="button"
              className={cn(
                'flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                eventType === 'deadline'
                  ? 'bg-white text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
              onClick={() => {
                setEventType('deadline')
                if (linkType !== 'matter') setLinkType('matter')
              }}
            >
              <AlertCircle className="mr-1.5 inline-block h-4 w-4" />
              Deadline
            </button>
          </div>

          {/* Title */}
          <div className="space-y-1.5">
            <Label htmlFor="quick-title">Title</Label>
            <Input
              id="quick-title"
              placeholder={eventType === 'task' ? 'e.g., Draft motion response' : 'e.g., Filing deadline'}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
            />
          </div>

          {/* Date + Priority row */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Date</Label>
              <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start text-left font-normal">
                    <CalendarIcon className="mr-2 h-4 w-4 text-muted-foreground" />
                    {selectedDate
                      ? format(parseISO(selectedDate), 'MMM d, yyyy')
                      : 'Pick a date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={selectedDate ? parseISO(selectedDate) : undefined}
                    onSelect={(date) => {
                      setSelectedDate(date ? format(date, 'yyyy-MM-dd') : null)
                      setDatePickerOpen(false)
                    }}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-1.5">
              <Label>Priority</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Deadline type */}
          {eventType === 'deadline' && (
            <div className="space-y-1.5">
              <Label>Deadline Type</Label>
              <Select value={deadlineType} onValueChange={setDeadlineType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DEADLINE_TYPES.map((dt) => (
                    <SelectItem key={dt.value} value={dt.value}>
                      {dt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Link To */}
          <div className="space-y-2">
            <Label>Link to</Label>
            <div className="flex gap-1 rounded-lg border bg-muted/50 p-1">
              {eventType === 'task' && (
                <button
                  type="button"
                  className={cn(
                    'flex-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                    linkType === 'none'
                      ? 'bg-white text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                  onClick={() => setLinkType('none')}
                >
                  Standalone
                </button>
              )}
              <button
                type="button"
                className={cn(
                  'flex-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                  linkType === 'matter'
                    ? 'bg-white text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
                onClick={() => setLinkType('matter')}
              >
                Matter
              </button>
              {eventType === 'task' && (
                <button
                  type="button"
                  className={cn(
                    'flex-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                    linkType === 'contact'
                      ? 'bg-white text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                  onClick={() => setLinkType('contact')}
                >
                  Contact
                </button>
              )}
            </div>

            {linkType === 'matter' && (
              <MatterSelector
                value={matterId}
                onChange={(id, t) => {
                  setMatterId(id)
                  setMatterTitle(t ?? null)
                }}
                tenantId={tenantId}
              />
            )}

            {linkType === 'contact' && (
              <ContactSearch
                value={contactId ?? undefined}
                onChange={(id) => setContactId(id ?? null)}
                tenantId={tenantId}
                placeholder="Search contacts..."
              />
            )}

            {eventType === 'deadline' && !matterId && (
              <p className="text-xs text-amber-600">
                Deadlines must be linked to a matter.
              </p>
            )}
          </div>

          {/* Notes */}
          {showNotes ? (
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea
                placeholder="Add any notes..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
              />
            </div>
          ) : (
            <button
              type="button"
              className="text-xs font-medium text-blue-600 hover:text-blue-700"
              onClick={() => setShowNotes(true)}
            >
              + Add notes
            </button>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {isSubmitting ? 'Creating...' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Loading Skeleton ────────────────────────────────────────────────────────

function CalendarSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-8 w-24" />
      </div>
      <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
        <div className="grid grid-cols-7 border-b">
          {Array.from({ length: 7 }).map((_, i) => (
            <Skeleton key={`h-${i}`} className="h-10" />
          ))}
        </div>
        <div className="grid grid-cols-7">
          {Array.from({ length: 35 }).map((_, i) => (
            <Skeleton key={`c-${i}`} className="h-[110px]" />
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Navigation Header ───────────────────────────────────────────────────────

function CalendarNavHeader({
  currentView,
  currentDate,
  onPrev,
  onNext,
  onToday,
}: {
  currentView: ViewKey
  currentDate: Date
  onPrev: () => void
  onNext: () => void
  onToday: () => void
}) {
  const label = useMemo(() => {
    switch (currentView) {
      case 'calendar':
        return format(currentDate, 'MMMM yyyy')
      case 'week': {
        const ws = startOfWeek(currentDate, { weekStartsOn: 0 })
        const we = endOfWeek(currentDate, { weekStartsOn: 0 })
        if (ws.getMonth() === we.getMonth()) {
          return `${format(ws, 'MMMM d')} – ${format(we, 'd, yyyy')}`
        }
        return `${formatDate(ws)} – ${formatDate(we)}`
      }
      case '3day': {
        const end = addDays(currentDate, 2)
        if (currentDate.getMonth() === end.getMonth()) {
          return `${format(currentDate, 'MMMM d')} – ${format(end, 'd, yyyy')}`
        }
        return `${formatDate(currentDate)} – ${formatDate(end)}`
      }
      case 'day':
        return formatDate(currentDate)
      case 'timeline':
        return format(currentDate, 'MMMM yyyy')
      default:
        return ''
    }
  }, [currentView, currentDate])

  return (
    <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
      <div className="flex items-center gap-4">
        <h2 className="text-xl font-bold tracking-tight text-slate-900">{label}</h2>
        <Button
          variant="outline"
          size="sm"
          className="h-7 rounded-full px-3 text-xs font-medium"
          onClick={onToday}
        >
          Today
        </Button>
      </div>
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={onPrev}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={onNext}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}

// ── Main Page ───────────────────────────────────────────────────────────────

export default function CalendarPage() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { tenant } = useTenant()
  const { appUser } = useUser()
  const tenantId = tenant?.id ?? ''
  const userId = appUser?.id ?? ''
  const { effectiveId: practiceAreaId } = usePracticeAreaContext()

  // View preference
  const viewPreferences = useUIStore((s) => s.viewPreferences)
  const setViewPreference = useUIStore((s) => s.setViewPreference)
  const currentView = (viewPreferences.calendar ?? 'calendar') as ViewKey

  // State — single `currentDate` drives all views
  const [currentDate, setCurrentDate] = useState(new Date())
  const [typeFilter, setTypeFilter] = useState<TypeFilterKey>('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [taskDetailOpen, setTaskDetailOpen] = useState(false)

  // Quick create
  const [quickCreateOpen, setQuickCreateOpen] = useState(false)
  const [quickCreateDate, setQuickCreateDate] = useState<string | null>(null)

  // Event create/detail
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null)
  const [eventDetailOpen, setEventDetailOpen] = useState(false)
  const [eventCreateOpen, setEventCreateOpen] = useState(false)

  // DnD
  const [activeEvent, setActiveEvent] = useState<CalendarEvent | null>(null)
  const updateTask = useUpdateTask()
  const updateDeadline = useUpdateMatterDeadline()
  const updateCalendarEvent = useUpdateCalendarEvent()
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor)
  )

  // ── Compute date range based on current view ──────────────────────────────
  const dateRange = useMemo(() => {
    switch (currentView) {
      case 'calendar':
      case 'timeline': {
        const monthStart = startOfMonth(currentDate)
        const monthEnd = endOfMonth(currentDate)
        const calStart = startOfWeek(monthStart, { weekStartsOn: 0 })
        const calEnd = endOfWeek(monthEnd, { weekStartsOn: 0 })
        return {
          start: format(calStart, 'yyyy-MM-dd'),
          end: format(calEnd, 'yyyy-MM-dd'),
        }
      }
      case 'week': {
        const ws = startOfWeek(currentDate, { weekStartsOn: 0 })
        const we = endOfWeek(currentDate, { weekStartsOn: 0 })
        return {
          start: format(ws, 'yyyy-MM-dd'),
          end: format(we, 'yyyy-MM-dd'),
        }
      }
      case '3day': {
        return {
          start: format(currentDate, 'yyyy-MM-dd'),
          end: format(addDays(currentDate, 2), 'yyyy-MM-dd'),
        }
      }
      case 'day': {
        const d = format(currentDate, 'yyyy-MM-dd')
        return { start: d, end: d }
      }
      default: {
        return {
          start: format(currentDate, 'yyyy-MM-dd'),
          end: format(currentDate, 'yyyy-MM-dd'),
        }
      }
    }
  }, [currentView, currentDate])

  // Days array for time-grid views
  const viewDays = useMemo(() => {
    switch (currentView) {
      case 'week': {
        const ws = startOfWeek(currentDate, { weekStartsOn: 0 })
        return eachDayOfInterval({ start: ws, end: addDays(ws, 6) })
      }
      case '3day':
        return eachDayOfInterval({ start: currentDate, end: addDays(currentDate, 2) })
      case 'day':
        return [currentDate]
      default:
        return []
    }
  }, [currentView, currentDate])

  // Fetch events
  const { data: events, isLoading } = useCalendarEvents(tenantId, dateRange, {
    practiceAreaId,
    timezone: tenant?.timezone,
  })

  // Client-side filtering
  const filteredEvents = useMemo(() => {
    let result = events ?? []
    if (typeFilter !== 'all') {
      result = result.filter((e) => e.source === typeFilter)
    }
    if (statusFilter !== 'all') {
      result = result.filter((e) => e.status === statusFilter)
    }
    return result
  }, [events, typeFilter, statusFilter])

  // Stats — computed from filteredEvents so it respects type/status filters
  const stats = useMemo(() => {
    const all = filteredEvents
    return {
      active: all.filter(
        (e) =>
          e.status !== 'completed' &&
          e.status !== 'done' &&
          e.status !== 'dismissed' &&
          e.status !== 'cancelled'
      ).length,
      overdue: all.filter(
        (e) => e.status === 'overdue' || e.status === 'stuck'
      ).length,
    }
  }, [filteredEvents])

  // View-specific label for the counter badge
  const viewCountLabel = useMemo(() => {
    switch (currentView) {
      case 'day':
        return 'today'
      case '3day':
        return 'in 3 days'
      case 'week':
        return 'this week'
      case 'calendar':
      case 'timeline':
        return 'this month'
      default:
        return ''
    }
  }, [currentView])

  // ── Navigation handlers ───────────────────────────────────────────────────
  const goToPrev = useCallback(() => {
    switch (currentView) {
      case 'calendar':
      case 'timeline':
        setCurrentDate((prev) => subMonths(prev, 1))
        break
      case 'week':
        setCurrentDate((prev) => subWeeks(prev, 1))
        break
      case '3day':
        setCurrentDate((prev) => subDays(prev, 3))
        break
      case 'day':
        setCurrentDate((prev) => subDays(prev, 1))
        break
    }
  }, [currentView])

  const goToNext = useCallback(() => {
    switch (currentView) {
      case 'calendar':
      case 'timeline':
        setCurrentDate((prev) => addMonths(prev, 1))
        break
      case 'week':
        setCurrentDate((prev) => addWeeks(prev, 1))
        break
      case '3day':
        setCurrentDate((prev) => addDays(prev, 3))
        break
      case 'day':
        setCurrentDate((prev) => addDays(prev, 1))
        break
    }
  }, [currentView])

  const goToToday = useCallback(() => setCurrentDate(new Date()), [])

  // Event click
  const handleEventClick = useCallback(
    (event: CalendarEvent) => {
      if (event.source === 'deadline' && event.matterId) {
        router.push(`/matters/${event.matterId}`)
      } else if (event.source === 'task') {
        setSelectedTaskId(event.sourceId)
        setTaskDetailOpen(true)
      } else if (event.source === 'event') {
        setSelectedEventId(event.sourceId)
        setEventDetailOpen(true)
      }
    },
    [router]
  )

  // Day click → quick create
  const handleDayClick = useCallback((date: string) => {
    setQuickCreateDate(date)
    setQuickCreateOpen(true)
  }, [])

  // DnD handlers
  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveEvent(event.active.data.current?.event as CalendarEvent)
  }, [])

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveEvent(null)
      const { active, over } = event
      if (!over) return

      const calEvent = active.data.current?.event as CalendarEvent
      const newDate = over.id as string
      if (calEvent.date === newDate) return

      if (calEvent.source === 'task') {
        updateTask.mutate(
          { id: calEvent.sourceId, due_date: newDate },
          {
            onSuccess: () => {
              queryClient.invalidateQueries({ queryKey: calendarKeys.all })
            },
          }
        )
      } else if (calEvent.source === 'deadline' && calEvent.matterId) {
        updateDeadline.mutate({
          id: calEvent.sourceId,
          tenantId,
          matterId: calEvent.matterId,
          updates: { due_date: newDate },
        })
      } else if (calEvent.source === 'event') {
        // Move event to new date, preserving time offsets
        const oldDatePart = calEvent.date
        const startAt = calEvent.startTime ?? `${oldDatePart}T00:00:00`
        const endAt = calEvent.endTime ?? `${oldDatePart}T23:59:59`
        const newStartAt = startAt.replace(oldDatePart, newDate)
        const newEndAt = endAt.replace(oldDatePart, newDate)
        updateCalendarEvent.mutate({
          id: calEvent.sourceId,
          start_at: newStartAt,
          end_at: newEndAt,
        })
      }
    },
    [tenantId, updateTask, updateDeadline, updateCalendarEvent, queryClient]
  )

  const handleDragCancel = useCallback(() => setActiveEvent(null), [])

  // ── Determine if current view is a time-grid view ─────────────────────────
  const isTimeGrid = currentView === 'week' || currentView === '3day' || currentView === 'day'

  return (
    <div className="space-y-4 p-6">
      {/* ── Header ── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Calendar</h1>
          <p className="text-sm text-muted-foreground">
            View deadlines, tasks, and events across all matters
          </p>
        </div>

        <div className="flex items-center gap-3">
          {!isLoading && (
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-xs">
                {stats.active} {viewCountLabel}
              </Badge>
              {stats.overdue > 0 && (
                <Badge variant="destructive" className="text-xs">
                  {stats.overdue} overdue
                </Badge>
              )}
            </div>
          )}

          <div className="flex items-center gap-1">
            <Button
              size="sm"
              className="gap-1.5"
              onClick={() => {
                setQuickCreateDate(format(new Date(), 'yyyy-MM-dd'))
                setQuickCreateOpen(true)
              }}
            >
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">Task / Deadline</span>
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={() => {
                setQuickCreateDate(format(new Date(), 'yyyy-MM-dd'))
                setEventCreateOpen(true)
              }}
            >
              <CalendarDays className="h-4 w-4" />
              <span className="hidden sm:inline">Event</span>
            </Button>
          </div>

          {/* View switcher */}
          <TooltipProvider>
            <div className="flex items-center gap-0.5 rounded-lg border bg-muted/50 p-1">
              {VIEWS.map((view) => (
                <Tooltip key={view.key}>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => setViewPreference('calendar', view.key)}
                      className={cn(
                        'flex items-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors',
                        currentView === view.key
                          ? 'bg-background text-foreground shadow-sm'
                          : 'text-muted-foreground hover:text-foreground'
                      )}
                    >
                      <view.icon className="h-3.5 w-3.5" />
                      <span className="hidden lg:inline">{view.label}</span>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>{view.label} view</TooltipContent>
                </Tooltip>
              ))}
            </div>
          </TooltipProvider>
        </div>
      </div>

      {/* ── Filter Bar ── */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 rounded-lg border bg-muted/50 p-1">
          {TYPE_FILTERS.map((tf) => (
            <button
              key={tf.key}
              onClick={() => setTypeFilter(tf.key)}
              className={cn(
                'rounded-md px-3 py-1 text-xs font-medium transition-colors',
                typeFilter === tf.key
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {tf.label}
            </button>
          ))}
        </div>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-8 w-[160px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {!isLoading && (
          <span className="text-xs text-muted-foreground">
            {filteredEvents.length} event{filteredEvents.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* ── Content ── */}
      {isLoading ? (
        <CalendarSkeleton />
      ) : currentView === 'timeline' ? (
        <AgendaView events={filteredEvents} onEventClick={handleEventClick} />
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragCancel={handleDragCancel}
        >
          <div className="flex h-full flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <CalendarNavHeader
              currentView={currentView}
              currentDate={currentDate}
              onPrev={goToPrev}
              onNext={goToNext}
              onToday={goToToday}
            />

            {currentView === 'calendar' ? (
              <MonthView
                currentMonth={currentDate}
                events={filteredEvents}
                onEventClick={handleEventClick}
                onDayClick={handleDayClick}
              />
            ) : isTimeGrid ? (
              <TimeGridView
                days={viewDays}
                events={filteredEvents}
                onEventClick={handleEventClick}
                onDayClick={handleDayClick}
              />
            ) : null}
          </div>

          <DragOverlay dropAnimation={null}>
            {activeEvent ? <EventPillStatic event={activeEvent} /> : null}
          </DragOverlay>
        </DndContext>
      )}

      {/* ── Quick Create Dialog ── */}
      <QuickCreateDialog
        open={quickCreateOpen}
        onOpenChange={setQuickCreateOpen}
        initialDate={quickCreateDate}
        tenantId={tenantId}
        userId={userId}
      />

      {/* ── Task Detail Sheet ── */}
      <TaskDetailSheet
        taskId={selectedTaskId}
        open={taskDetailOpen}
        onOpenChange={(open) => {
          setTaskDetailOpen(open)
          if (!open) setSelectedTaskId(null)
        }}
      />

      {/* ── Event Create Dialog ── */}
      <EventCreateDialog
        open={eventCreateOpen}
        onOpenChange={setEventCreateOpen}
        initialDate={quickCreateDate}
        tenantId={tenantId}
        userId={userId}
      />

      {/* ── Event Detail Sheet ── */}
      <EventDetailSheet
        eventId={selectedEventId}
        open={eventDetailOpen}
        onOpenChange={(open) => {
          setEventDetailOpen(open)
          if (!open) setSelectedEventId(null)
        }}
      />
    </div>
  )
}
