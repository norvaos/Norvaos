'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { DEADLINE_STATUSES, TASK_STATUSES } from '@/lib/utils/constants'
import type { Database } from '@/lib/types/database'

type MatterDeadline = Database['public']['Tables']['matter_deadlines']['Row']
type Task = Database['public']['Tables']['tasks']['Row']

// ── Types ───────────────────────────────────────────────────────────────────

export type CalendarEventSource = 'deadline' | 'task'

export interface CalendarEvent {
  id: string
  source: CalendarEventSource
  title: string
  date: string // 'yyyy-MM-dd'
  time: string | null // 'HH:mm' (tasks have due_time)
  status: string
  priority: string
  color: string // resolved from status constants
  matterId: string | null
  matterTitle: string | null
  contactId: string | null
  contactName: string | null
  deadlineType: string | null // deadline-specific
  sourceId: string // original row id
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
  options?: { practiceAreaId?: string }
) {
  const practiceAreaId = options?.practiceAreaId

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

      // Fetch deadlines and tasks in parallel
      const [deadlinesRes, tasksRes] = await Promise.all([
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
      ])

      if (deadlinesRes.error) throw deadlinesRes.error
      if (tasksRes.error) throw tasksRes.error

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
        status: d.status,
        priority: d.priority,
        color: DEADLINE_COLOR_MAP[d.status] ?? '#6b7280',
        matterId: d.matter_id,
        matterTitle: d.matters?.title ?? null,
        contactId: null,
        contactName: null,
        deadlineType: d.deadline_type,
        sourceId: d.id,
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
        date: (t.due_date ?? '').split('T')[0],
        time: t.due_time ?? null,
        status: t.status,
        priority: t.priority ?? 'medium',
        color: TASK_COLOR_MAP[t.status] ?? '#6b7280',
        matterId: t.matter_id,
        matterTitle: t.matters?.title ?? null,
        contactId: t.contacts?.id ?? null,
        contactName: t.contacts
          ? `${t.contacts.first_name ?? ''} ${t.contacts.last_name ?? ''}`.trim() || null
          : null,
        deadlineType: null,
        sourceId: t.id,
      }))

      // Merge and sort by date
      return [...deadlineEvents, ...taskEvents].sort((a, b) =>
        a.date.localeCompare(b.date)
      )
    },
    enabled: !!tenantId && !!dateRange.start && !!dateRange.end,
    staleTime: 2 * 60 * 1000,
  })
}
