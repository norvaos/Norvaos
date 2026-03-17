'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { DEADLINE_STATUSES, TASK_STATUSES } from '@/lib/utils/constants'
import { expandRecurrence } from '@/lib/utils/recurrence'
import { toTenantDate, toTenantTime } from '@/lib/utils/timezone'
import type { Database } from '@/lib/types/database'

type MatterDeadline = Database['public']['Tables']['matter_deadlines']['Row']
type Task = Database['public']['Tables']['tasks']['Row']
type CalendarEventRow = Database['public']['Tables']['calendar_events']['Row']

// ── Types ───────────────────────────────────────────────────────────────────

export type CalendarEventSource = 'deadline' | 'task' | 'event'

export interface CalendarEvent {
  id: string
  source: CalendarEventSource
  title: string
  date: string // 'yyyy-MM-dd'
  time: string | null // 'HH:mm' (tasks have due_time)
  startTime: string | null // full ISO start time for events
  endTime: string | null // full ISO end time for events
  status: string
  priority: string
  color: string // resolved from status constants
  matterId: string | null
  matterTitle: string | null
  contactId: string | null
  contactName: string | null
  deadlineType: string | null // deadline-specific
  eventType: string | null // event-specific (meeting, consultation, etc.)
  sourceId: string // original row id
  externalProvider: string | null // 'microsoft' if synced from Outlook
}

// ── Color Lookups ───────────────────────────────────────────────────────────

const DEADLINE_COLOR_MAP: Record<string, string> = Object.fromEntries(
  DEADLINE_STATUSES.map((s) => [s.value, s.color])
)

const TASK_COLOR_MAP: Record<string, string> = Object.fromEntries(
  TASK_STATUSES.map((s) => [s.value, s.color])
)

// ── Query Key Factory ───────────────────────────────────────────────────────

export const calendarKeys = {
  all: ['calendar'] as const,
  events: (tid: string, start: string, end: string, pa?: string) =>
    [...calendarKeys.all, 'events', tid, start, end, pa ?? 'all'] as const,
}

// ── Hook ────────────────────────────────────────────────────────────────────

export interface CalendarDateRange {
  start: string // 'yyyy-MM-dd'
  end: string // 'yyyy-MM-dd'
}

export function useCalendarEvents(
  tenantId: string,
  dateRange: CalendarDateRange,
  options?: { practiceAreaId?: string; timezone?: string }
) {
  const practiceAreaId = options?.practiceAreaId
  const timezone = options?.timezone

  return useQuery({
    queryKey: calendarKeys.events(tenantId, dateRange.start, dateRange.end, practiceAreaId),
    queryFn: async (): Promise<CalendarEvent[]> => {
      const supabase = createClient()

      // If practice area filter is active, pre-fetch matching matter IDs
      let matterIds: string[] | null = null
      if (practiceAreaId && practiceAreaId !== 'all') {
        const { data: filteredMatters } = await supabase
          .from('matters')
          .select('id')
          .eq('tenant_id', tenantId)
          .eq('practice_area_id', practiceAreaId)
        matterIds = (filteredMatters ?? []).map((m: { id: string }) => m.id)
        if (matterIds.length === 0) return []
      }

      // Fetch deadlines, tasks, and calendar events in parallel
      const [deadlinesRes, tasksRes, calEventsRes, recurringEventsRes] = await Promise.all([
        // Deadlines — exclude completed/dismissed
        (() => {
          let q = supabase
            .from('matter_deadlines')
            .select('*, matters!inner(id, title)')
            .eq('tenant_id', tenantId)
            .not('status', 'in', '("completed","dismissed")')
            .gte('due_date', dateRange.start)
            .lte('due_date', dateRange.end)
            .order('due_date', { ascending: true })
            .limit(200)

          if (matterIds) q = q.in('matter_id', matterIds)
          return q
        })(),

        // Tasks — exclude deleted, must have due_date
        (() => {
          let q = supabase
            .from('tasks')
            .select('*, matters(id, title), contacts(id, first_name, last_name)')
            .eq('tenant_id', tenantId)
            .eq('is_deleted', false)
            .not('due_date', 'is', null)
            .gte('due_date', dateRange.start)
            .lte('due_date', dateRange.end)
            .order('due_date', { ascending: true })
            .limit(200)

          if (matterIds) q = q.in('matter_id', matterIds)
          return q
        })(),

        // Calendar events — only active, within date range (non-recurring)
        (() => {
          let q = supabase
            .from('calendar_events')
            .select('*')
            .eq('tenant_id', tenantId)
            .eq('is_active', true)
            .is('recurrence_rule', null)
            .gte('start_at', dateRange.start)
            .lte('start_at', dateRange.end + 'T23:59:59')
            .order('start_at', { ascending: true })
            .limit(200)

          if (matterIds) q = q.in('matter_id', matterIds)
          return q
        })(),

        // Recurring calendar events — fetch all active recurring events
        // Their start_at may be before rangeStart, but occurrences recur into range
        (() => {
          let q = supabase
            .from('calendar_events')
            .select('*')
            .eq('tenant_id', tenantId)
            .eq('is_active', true)
            .not('recurrence_rule', 'is', null)
            .lte('start_at', dateRange.end + 'T23:59:59')
            .order('start_at', { ascending: true })
            .limit(100)

          if (matterIds) q = q.in('matter_id', matterIds)
          return q
        })(),
      ])

      if (deadlinesRes.error) throw deadlinesRes.error
      if (tasksRes.error) throw tasksRes.error
      if (calEventsRes.error) throw calEventsRes.error
      if (recurringEventsRes.error) throw recurringEventsRes.error

      // Normalize deadlines
      const deadlineEvents: CalendarEvent[] = (
        deadlinesRes.data as unknown as (MatterDeadline & {
          matters: { id: string; title: string }
        })[]
      ).map((d) => ({
        id: `deadline-${d.id}`,
        source: 'deadline' as const,
        title: d.title,
        date: d.due_date,
        time: null,
        startTime: null,
        endTime: null,
        status: d.status,
        priority: d.priority,
        color: DEADLINE_COLOR_MAP[d.status] ?? '#6b7280',
        matterId: d.matter_id,
        matterTitle: d.matters?.title ?? null,
        contactId: null,
        contactName: null,
        deadlineType: d.deadline_type,
        eventType: null,
        sourceId: d.id,
        externalProvider: null,
      }))

      // Normalize tasks
      const taskEvents: CalendarEvent[] = (
        tasksRes.data as unknown as (Task & {
          matters: { id: string; title: string } | null
          contacts: { id: string; first_name: string | null; last_name: string | null } | null
        })[]
      ).map((t) => ({
        id: `task-${t.id}`,
        source: 'task' as const,
        title: t.title,
        date: t.due_date ? toTenantDate(t.due_date, timezone) : '',
        time: t.due_time ?? null,
        startTime: null,
        endTime: null,
        status: t.status ?? '',
        priority: t.priority ?? 'medium',
        color: TASK_COLOR_MAP[t.status ?? ''] ?? '#6b7280',
        matterId: t.matter_id,
        matterTitle: t.matters?.title ?? null,
        contactId: t.contacts?.id ?? null,
        contactName: t.contacts
          ? `${t.contacts.first_name ?? ''} ${t.contacts.last_name ?? ''}`.trim() || null
          : null,
        deadlineType: null,
        eventType: null,
        sourceId: t.id,
        externalProvider: (t as unknown as { external_provider: string | null }).external_provider ?? null,
      }))

      // Expand recurring events into virtual instances within the date range
      const recurringRows = recurringEventsRes.data as unknown as CalendarEventRow[]
      const expandedRecurring: CalendarEventRow[] = recurringRows.flatMap((event) =>
        expandRecurrence(event, dateRange.start, dateRange.end)
      )

      // Combine non-recurring + expanded recurring events
      const allCalendarEventRows: CalendarEventRow[] = [
        ...(calEventsRes.data as unknown as CalendarEventRow[]),
        ...expandedRecurring,
      ]

      // Normalize calendar events (no FK joins — types not registered)
      const calendarEventItems: CalendarEvent[] = allCalendarEventRows.map((row) => ({
        id: `event-${row.id}`,
        source: 'event' as const,
        title: row.title,
        date: toTenantDate(row.start_at, timezone),
        time: row.all_day ? null : toTenantTime(row.start_at, timezone),
        startTime: row.all_day ? null : row.start_at,
        endTime: row.all_day ? null : row.end_at,
        status: row.status,
        priority: 'medium',
        color: row.color ?? '#3b82f6',
        matterId: row.matter_id,
        matterTitle: null,
        contactId: row.contact_id,
        contactName: null,
        deadlineType: null,
        eventType: row.event_type,
        sourceId: row.id,
        externalProvider: row.external_provider ?? null,
      }))

      // Merge and sort by date
      return [...deadlineEvents, ...taskEvents, ...calendarEventItems].sort((a, b) =>
        a.date.localeCompare(b.date)
      )
    },
    enabled: !!tenantId && !!dateRange.start && !!dateRange.end,
    staleTime: 2 * 60 * 1000,
  })
}
