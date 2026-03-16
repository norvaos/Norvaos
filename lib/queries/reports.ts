'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { DateRange } from '@/lib/hooks/use-period-filter'
import { BILLING_TYPES, TASK_STATUSES } from '@/lib/utils/constants'
import { IMPORT_REVERTED_STATUS } from '@/lib/utils/matter-status'

// ── Helpers ──────────────────────────────────────────────────────────────────────

function toDateString(date: Date): string {
  return date.toISOString().split('T')[0]
}

function toISO(date: Date): string {
  return date.toISOString()
}

async function fetchUserNameMap(
  supabase: ReturnType<typeof createClient>,
  tenantId: string,
  userIds: string[]
): Promise<Record<string, string>> {
  if (userIds.length === 0) return {}
  const { data } = await supabase
    .from('users')
    .select('id, first_name, last_name')
    .eq('tenant_id', tenantId)
    .in('id', userIds)
  if (!data) return {}
  return Object.fromEntries(
    data.map((u) => [
      u.id,
      [u.first_name, u.last_name].filter(Boolean).join(' ') || 'Unknown',
    ])
  )
}

async function fetchPracticeAreaMap(
  supabase: ReturnType<typeof createClient>,
  tenantId: string,
  paIds: string[]
): Promise<Record<string, { name: string; color: string }>> {
  if (paIds.length === 0) return {}
  const { data } = await supabase
    .from('practice_areas')
    .select('id, name, color')
    .eq('tenant_id', tenantId)
    .in('id', paIds)
  if (!data) return {}
  return Object.fromEntries(data.map((pa) => [pa.id, { name: pa.name, color: pa.color ?? '#6366f1' }]))
}

// ── Report Filters ──────────────────────────────────────────────────────────────

export interface ReportFilters {
  practiceAreaId?: string
  lawyerId?: string
  billingType?: string
}

/** Stable serialisation of filters for query keys. */
function serializeFilters(filters?: ReportFilters): string {
  if (!filters) return '{}'
  return JSON.stringify(
    Object.fromEntries(
      Object.entries(filters)
        .filter(([, v]) => v !== undefined && v !== '')
        .sort(([a], [b]) => a.localeCompare(b))
    )
  )
}

/**
 * Apply matter-level filters to a Supabase query builder.
 * Used by all matter-based reports.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyMatterFilters(query: any, filters?: ReportFilters) {
  if (!filters) return query
  if (filters.practiceAreaId) query = query.eq('practice_area_id', filters.practiceAreaId)
  if (filters.lawyerId) query = query.eq('responsible_lawyer_id', filters.lawyerId)
  if (filters.billingType) query = query.eq('billing_type', filters.billingType)
  return query
}

/**
 * Get filtered matter IDs for task-based reports that need to join through matters.
 * Returns null if no matter-level filters are applied (meaning no restriction needed).
 */
async function getFilteredMatterIds(
  supabase: ReturnType<typeof createClient>,
  tenantId: string,
  filters?: ReportFilters
): Promise<string[] | null> {
  if (!filters) return null
  const hasMatterFilter = filters.practiceAreaId || filters.billingType
  if (!hasMatterFilter) return null

  // Exclude import-reverted matters so that task-level reports joining through
  // this function never include tasks belonging to rolled-back import artifacts.
  let query = supabase.from('matters').select('id').eq('tenant_id', tenantId)
    .neq('status', IMPORT_REVERTED_STATUS)
  if (filters.practiceAreaId) query = query.eq('practice_area_id', filters.practiceAreaId)
  if (filters.billingType) query = query.eq('billing_type', filters.billingType)

  const { data, error } = await query
  if (error) throw error
  return (data ?? []).map((m) => m.id)
}

// ── Query Key Factory ────────────────────────────────────────────────────────────

export const reportKeys = {
  all: ['reports'] as const,
  matterStats: (tid: string, s: string, e: string, f: string) => [...reportKeys.all, 'matter-stats', tid, s, e, f] as const,
  taskStats: (tid: string, s: string, e: string, f: string) => [...reportKeys.all, 'task-stats', tid, s, e, f] as const,
  mattersByPA: (tid: string, s: string, e: string, f: string) => [...reportKeys.all, 'matters-by-pa', tid, s, e, f] as const,
  mattersTrend: (tid: string, f: string) => [...reportKeys.all, 'matters-trend', tid, f] as const,
  tasksByAssignee: (tid: string, s: string, e: string, f: string) => [...reportKeys.all, 'tasks-by-assignee', tid, s, e, f] as const,
  revenueByPA: (tid: string, s: string, e: string, f: string) => [...reportKeys.all, 'revenue-by-pa', tid, s, e, f] as const,
  revenueByBilling: (tid: string, s: string, e: string, f: string) => [...reportKeys.all, 'revenue-by-billing', tid, s, e, f] as const,
  revenueTrend: (tid: string, f: string) => [...reportKeys.all, 'revenue-trend', tid, f] as const,
  mattersByLawyer: (tid: string, s: string, e: string, f: string) => [...reportKeys.all, 'matters-by-lawyer', tid, s, e, f] as const,
  taskCompletionByUser: (tid: string, s: string, e: string, f: string) => [...reportKeys.all, 'task-completion', tid, s, e, f] as const,
  teamMembers: (tid: string) => [...reportKeys.all, 'team-members', tid] as const,
}

// ── Types ────────────────────────────────────────────────────────────────────────

export interface MatterStatsData {
  activeMatterCount: number
  newMatterCount: number
  closedMatterCount: number
  totalBilledInPeriod: number
}

export interface TaskStatsData {
  openTaskCount: number
  overdueDeadlineCount: number
  completedTaskCount: number
  totalTaskCount: number
  statusBreakdown: { name: string; value: number; color: string }[]
}

export interface MattersByPAData {
  practice_area_name: string
  practice_area_color: string
  count: number
}

export interface MatterTrendData {
  month: string
  opened: number
  closed: number
}

export interface TasksByAssigneeData {
  user_name: string
  overdue_count: number
  completed_count: number
  open_count: number
}

export interface RevenueByPAData {
  practice_area_name: string
  practice_area_color: string
  total_billed: number
}

export interface RevenueByBillingData {
  billing_type: string
  billing_type_label: string
  total_billed: number
}

export interface RevenueTrendData {
  month: string
  revenue: number
}

export interface MattersByLawyerData {
  user_name: string
  active_count: number
}

export interface TaskCompletionByUserData {
  user_name: string
  completed: number
  total: number
  completion_rate: number
}

export interface TeamMember {
  id: string
  first_name: string | null
  last_name: string | null
  full_name: string
}

// ── Hook: Team Members (for filter dropdowns) ────────────────────────────────────

export function useTeamMembers(tenantId: string) {
  return useQuery({
    queryKey: reportKeys.teamMembers(tenantId),
    queryFn: async (): Promise<TeamMember[]> => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('users')
        .select('id, first_name, last_name')
        .eq('tenant_id', tenantId)
        .eq('is_active', true)
        .order('first_name')
      if (error) throw error
      return (data ?? []).map((u) => ({
        ...u,
        full_name: [u.first_name, u.last_name].filter(Boolean).join(' ') || 'Unknown',
      }))
    },
    enabled: !!tenantId,
    staleTime: 5 * 60 * 1000,
  })
}

// ── Hook 1: Matter Stats ─────────────────────────────────────────────────────────

export function useReportMatterStats(tenantId: string, range: DateRange, filters?: ReportFilters) {
  const s = toDateString(range.start)
  const e = toDateString(range.end)
  const f = serializeFilters(filters)

  return useQuery({
    queryKey: reportKeys.matterStats(tenantId, s, e, f),
    queryFn: async (): Promise<MatterStatsData> => {
      const supabase = createClient()

      let activeQ = supabase.from('matters').select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenantId).eq('status', 'active')
      activeQ = applyMatterFilters(activeQ, filters)

      let newQ = supabase.from('matters').select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenantId).gte('date_opened', s).lte('date_opened', e)
        .neq('status', IMPORT_REVERTED_STATUS)
      newQ = applyMatterFilters(newQ, filters)

      let closedQ = supabase.from('matters').select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenantId).not('date_closed', 'is', null)
        .gte('date_closed', s).lte('date_closed', e)
        .neq('status', IMPORT_REVERTED_STATUS)
      closedQ = applyMatterFilters(closedQ, filters)

      let revenueQ = supabase.from('matters').select('total_billed')
        .eq('tenant_id', tenantId).gte('date_opened', s).lte('date_opened', e)
        .neq('status', IMPORT_REVERTED_STATUS)
      revenueQ = applyMatterFilters(revenueQ, filters)

      const [activeRes, newRes, closedRes, revenueRes] = await Promise.all([activeQ, newQ, closedQ, revenueQ])
      if (activeRes.error) throw activeRes.error
      if (newRes.error) throw newRes.error
      if (closedRes.error) throw closedRes.error
      if (revenueRes.error) throw revenueRes.error

      const totalBilledInPeriod = (revenueRes.data ?? []).reduce(
        (sum, m) => sum + ((m.total_billed as number) ?? 0), 0
      )
      return {
        activeMatterCount: activeRes.count ?? 0,
        newMatterCount: newRes.count ?? 0,
        closedMatterCount: closedRes.count ?? 0,
        totalBilledInPeriod,
      }
    },
    enabled: !!tenantId,
    staleTime: 3 * 60 * 1000,
  })
}

// ── Hook 2: Task Stats ───────────────────────────────────────────────────────────

export function useReportTaskStats(tenantId: string, range: DateRange, filters?: ReportFilters) {
  const s = toISO(range.start)
  const e = toISO(range.end)
  const f = serializeFilters(filters)

  return useQuery({
    queryKey: reportKeys.taskStats(tenantId, toDateString(range.start), toDateString(range.end), f),
    queryFn: async (): Promise<TaskStatsData> => {
      const supabase = createClient()
      const today = toDateString(new Date())

      // Get filtered matter IDs if matter-level filters are active
      const matterIds = await getFilteredMatterIds(supabase, tenantId, filters)

      let openQ = supabase.from('tasks').select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .in('status', ['not_started', 'working_on_it', 'stuck'])
        .neq('is_deleted', true)
      if (filters?.lawyerId) openQ = openQ.eq('assigned_to', filters.lawyerId)
      if (matterIds) openQ = openQ.in('matter_id', matterIds)

      const overdueQ = supabase.from('matter_deadlines').select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .lt('due_date', today)
        .not('status', 'in', '(completed,cancelled,dismissed)')

      let completedQ = supabase.from('tasks').select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenantId).eq('status', 'done')
        .gte('completed_at', s).lte('completed_at', e)
      if (filters?.lawyerId) completedQ = completedQ.eq('assigned_to', filters.lawyerId)
      if (matterIds) completedQ = completedQ.in('matter_id', matterIds)

      let allTasksQ = supabase.from('tasks').select('status')
        .eq('tenant_id', tenantId).neq('is_deleted', true)
        .gte('created_at', s).lte('created_at', e)
      if (filters?.lawyerId) allTasksQ = allTasksQ.eq('assigned_to', filters.lawyerId)
      if (matterIds) allTasksQ = allTasksQ.in('matter_id', matterIds)

      const [openRes, overdueRes, completedRes, allTasksRes] = await Promise.all([openQ, overdueQ, completedQ, allTasksQ])
      if (openRes.error) throw openRes.error
      if (overdueRes.error) throw overdueRes.error
      if (completedRes.error) throw completedRes.error
      if (allTasksRes.error) throw allTasksRes.error

      const statusCounts: Record<string, number> = {}
      for (const t of allTasksRes.data ?? []) {
        statusCounts[t.status] = (statusCounts[t.status] || 0) + 1
      }
      const statusBreakdown = TASK_STATUSES.map((ts) => ({
        name: ts.label,
        value: statusCounts[ts.value] ?? 0,
        color: ts.color,
      })).filter((s) => s.value > 0)

      return {
        openTaskCount: openRes.count ?? 0,
        overdueDeadlineCount: overdueRes.count ?? 0,
        completedTaskCount: completedRes.count ?? 0,
        totalTaskCount: (allTasksRes.data ?? []).length,
        statusBreakdown,
      }
    },
    enabled: !!tenantId,
    staleTime: 3 * 60 * 1000,
  })
}

// ── Hook 3: Matters by Practice Area ─────────────────────────────────────────────

export function useReportMattersByPracticeArea(tenantId: string, range: DateRange, filters?: ReportFilters) {
  const s = toDateString(range.start)
  const e = toDateString(range.end)
  const f = serializeFilters(filters)

  return useQuery({
    queryKey: reportKeys.mattersByPA(tenantId, s, e, f),
    queryFn: async (): Promise<MattersByPAData[]> => {
      const supabase = createClient()
      let query = supabase
        .from('matters')
        .select('practice_area_id')
        .eq('tenant_id', tenantId)
        .eq('status', 'active')
        .not('practice_area_id', 'is', null)
      query = applyMatterFilters(query, filters)

      const { data, error } = await query
      if (error) throw error
      const counts: Record<string, number> = {}
      for (const m of data ?? []) {
        if (m.practice_area_id) counts[m.practice_area_id] = (counts[m.practice_area_id] || 0) + 1
      }

      const paMap = await fetchPracticeAreaMap(supabase, tenantId, Object.keys(counts))
      return Object.entries(counts)
        .map(([id, count]) => ({
          practice_area_name: paMap[id]?.name ?? 'Unknown',
          practice_area_color: paMap[id]?.color ?? '#6366f1',
          count,
        }))
        .sort((a, b) => b.count - a.count)
    },
    enabled: !!tenantId,
    staleTime: 5 * 60 * 1000,
  })
}

// ── Hook 4: Matters Opened vs Closed (6-month trend) ─────────────────────────────

export function useReportMattersOpenedVsClosed(tenantId: string, filters?: ReportFilters) {
  const f = serializeFilters(filters)

  return useQuery({
    queryKey: reportKeys.mattersTrend(tenantId, f),
    queryFn: async (): Promise<MatterTrendData[]> => {
      const supabase = createClient()
      const now = new Date()
      const months: { label: string; start: string; end: string }[] = []

      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
        const nextMonth = new Date(d.getFullYear(), d.getMonth() + 1, 1)
        months.push({
          label: d.toLocaleString('default', { month: 'short', year: '2-digit' }),
          start: toDateString(d),
          end: toDateString(new Date(nextMonth.getTime() - 1)),
        })
      }

      const sixMonthsAgo = months[0].start

      let openedQ = supabase.from('matters').select('date_opened')
        .eq('tenant_id', tenantId).gte('date_opened', sixMonthsAgo)
        .neq('status', IMPORT_REVERTED_STATUS)
      openedQ = applyMatterFilters(openedQ, filters)

      let closedQ = supabase.from('matters').select('date_closed')
        .eq('tenant_id', tenantId).not('date_closed', 'is', null)
        .gte('date_closed', sixMonthsAgo)
        .neq('status', IMPORT_REVERTED_STATUS)
      closedQ = applyMatterFilters(closedQ, filters)

      const [openedRes, closedRes] = await Promise.all([openedQ, closedQ])
      if (openedRes.error) throw openedRes.error
      if (closedRes.error) throw closedRes.error

      return months.map((m) => ({
        month: m.label,
        opened: (openedRes.data ?? []).filter(
          (r) => r.date_opened && r.date_opened >= m.start && r.date_opened <= m.end
        ).length,
        closed: (closedRes.data ?? []).filter(
          (r) => r.date_closed && r.date_closed >= m.start && r.date_closed <= m.end
        ).length,
      }))
    },
    enabled: !!tenantId,
    staleTime: 5 * 60 * 1000,
  })
}

// ── Hook 5: Tasks by Assignee ────────────────────────────────────────────────────

export function useReportTasksByAssignee(tenantId: string, range: DateRange, filters?: ReportFilters) {
  const s = toDateString(range.start)
  const e = toDateString(range.end)
  const f = serializeFilters(filters)

  return useQuery({
    queryKey: reportKeys.tasksByAssignee(tenantId, s, e, f),
    queryFn: async (): Promise<TasksByAssigneeData[]> => {
      const supabase = createClient()
      const today = toDateString(new Date())

      const matterIds = await getFilteredMatterIds(supabase, tenantId, filters)

      let query = supabase
        .from('tasks')
        .select('assigned_to, status, due_date')
        .eq('tenant_id', tenantId)
        .neq('is_deleted', true)
        .not('assigned_to', 'is', null)
        .limit(5000)
      if (filters?.lawyerId) query = query.eq('assigned_to', filters.lawyerId)
      if (matterIds) query = query.in('matter_id', matterIds)

      const { data, error } = await query
      if (error) throw error
      const grouped: Record<string, { overdue: number; completed: number; open: number }> = {}
      for (const t of data ?? []) {
        if (!t.assigned_to) continue
        if (!grouped[t.assigned_to]) grouped[t.assigned_to] = { overdue: 0, completed: 0, open: 0 }
        if (t.status === 'done') grouped[t.assigned_to].completed++
        else if (t.status === 'cancelled') { /* skip */ }
        else {
          grouped[t.assigned_to].open++
          if (t.due_date && t.due_date < today) grouped[t.assigned_to].overdue++
        }
      }

      const userNames = await fetchUserNameMap(supabase, tenantId, Object.keys(grouped))
      return Object.entries(grouped)
        .map(([id, counts]) => ({
          user_name: userNames[id] || 'Unknown',
          overdue_count: counts.overdue,
          completed_count: counts.completed,
          open_count: counts.open,
        }))
        .sort((a, b) => b.overdue_count - a.overdue_count)
    },
    enabled: !!tenantId,
    staleTime: 3 * 60 * 1000,
  })
}

// ── Hook 6: Revenue by Practice Area ─────────────────────────────────────────────

export function useReportRevenueByPracticeArea(tenantId: string, range: DateRange, filters?: ReportFilters) {
  const s = toDateString(range.start)
  const e = toDateString(range.end)
  const f = serializeFilters(filters)

  return useQuery({
    queryKey: reportKeys.revenueByPA(tenantId, s, e, f),
    queryFn: async (): Promise<RevenueByPAData[]> => {
      const supabase = createClient()
      let query = supabase
        .from('matters')
        .select('practice_area_id, total_billed')
        .eq('tenant_id', tenantId)
        .not('practice_area_id', 'is', null)
        .neq('status', IMPORT_REVERTED_STATUS)
      query = applyMatterFilters(query, filters)

      const { data, error } = await query
      if (error) throw error
      const grouped: Record<string, number> = {}
      for (const m of data ?? []) {
        if (m.practice_area_id) {
          grouped[m.practice_area_id] = (grouped[m.practice_area_id] || 0) + ((m.total_billed as number) ?? 0)
        }
      }

      const paMap = await fetchPracticeAreaMap(supabase, tenantId, Object.keys(grouped))
      return Object.entries(grouped)
        .filter(([, v]) => v > 0)
        .map(([id, total]) => ({
          practice_area_name: paMap[id]?.name ?? 'Unknown',
          practice_area_color: paMap[id]?.color ?? '#6366f1',
          total_billed: total,
        }))
        .sort((a, b) => b.total_billed - a.total_billed)
    },
    enabled: !!tenantId,
    staleTime: 5 * 60 * 1000,
  })
}

// ── Hook 7: Revenue by Billing Type ──────────────────────────────────────────────

export function useReportRevenueByBillingType(tenantId: string, range: DateRange, filters?: ReportFilters) {
  const s = toDateString(range.start)
  const e = toDateString(range.end)
  const f = serializeFilters(filters)

  return useQuery({
    queryKey: reportKeys.revenueByBilling(tenantId, s, e, f),
    queryFn: async (): Promise<RevenueByBillingData[]> => {
      const supabase = createClient()
      let query = supabase
        .from('matters')
        .select('billing_type, total_billed')
        .eq('tenant_id', tenantId)
        .not('billing_type', 'is', null)
        .neq('status', IMPORT_REVERTED_STATUS)
      query = applyMatterFilters(query, filters)

      const { data, error } = await query
      if (error) throw error
      const grouped: Record<string, number> = {}
      for (const m of data ?? []) {
        if (m.billing_type) {
          grouped[m.billing_type] = (grouped[m.billing_type] || 0) + ((m.total_billed as number) ?? 0)
        }
      }

      const labelMap = Object.fromEntries(BILLING_TYPES.map((b) => [b.value, b.label]))
      return Object.entries(grouped)
        .filter(([, v]) => v > 0)
        .map(([type, total]) => ({
          billing_type: type,
          billing_type_label: labelMap[type] || type,
          total_billed: total,
        }))
        .sort((a, b) => b.total_billed - a.total_billed)
    },
    enabled: !!tenantId,
    staleTime: 5 * 60 * 1000,
  })
}

// ── Hook 8: Revenue Trend (12 months) ────────────────────────────────────────────

export function useReportRevenueTrend(tenantId: string, filters?: ReportFilters) {
  const f = serializeFilters(filters)

  return useQuery({
    queryKey: reportKeys.revenueTrend(tenantId, f),
    queryFn: async (): Promise<RevenueTrendData[]> => {
      const supabase = createClient()
      const now = new Date()
      const months: { label: string; start: string; end: string }[] = []

      for (let i = 11; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
        const nextMonth = new Date(d.getFullYear(), d.getMonth() + 1, 1)
        months.push({
          label: d.toLocaleString('default', { month: 'short' }),
          start: toDateString(d),
          end: toDateString(new Date(nextMonth.getTime() - 1)),
        })
      }

      const twelveMonthsAgo = months[0].start
      let query = supabase
        .from('matters')
        .select('date_opened, total_billed')
        .eq('tenant_id', tenantId)
        .gte('date_opened', twelveMonthsAgo)
        .neq('status', IMPORT_REVERTED_STATUS)
      query = applyMatterFilters(query, filters)

      const { data, error } = await query
      if (error) throw error
      return months.map((m) => ({
        month: m.label,
        revenue: (data ?? [])
          .filter((r) => r.date_opened && r.date_opened >= m.start && r.date_opened <= m.end)
          .reduce((sum, r) => sum + ((r.total_billed as number) ?? 0), 0),
      }))
    },
    enabled: !!tenantId,
    staleTime: 5 * 60 * 1000,
  })
}

// ── Hook 9: Matters by Lawyer ────────────────────────────────────────────────────

export function useReportMattersByLawyer(tenantId: string, range: DateRange, filters?: ReportFilters) {
  const s = toDateString(range.start)
  const e = toDateString(range.end)
  const f = serializeFilters(filters)

  return useQuery({
    queryKey: reportKeys.mattersByLawyer(tenantId, s, e, f),
    queryFn: async (): Promise<MattersByLawyerData[]> => {
      const supabase = createClient()
      let query = supabase
        .from('matters')
        .select('responsible_lawyer_id')
        .eq('tenant_id', tenantId)
        .eq('status', 'active')
        .not('responsible_lawyer_id', 'is', null)
      query = applyMatterFilters(query, filters)

      const { data, error } = await query
      if (error) throw error
      const counts: Record<string, number> = {}
      for (const m of data ?? []) {
        if (m.responsible_lawyer_id) counts[m.responsible_lawyer_id] = (counts[m.responsible_lawyer_id] || 0) + 1
      }

      const userNames = await fetchUserNameMap(supabase, tenantId, Object.keys(counts))
      return Object.entries(counts)
        .map(([id, count]) => ({
          user_name: userNames[id] || 'Unknown',
          active_count: count,
        }))
        .sort((a, b) => b.active_count - a.active_count)
    },
    enabled: !!tenantId,
    staleTime: 3 * 60 * 1000,
  })
}

// ── Hook 10: Task Completion by User ─────────────────────────────────────────────

export function useReportTaskCompletionByUser(tenantId: string, range: DateRange, filters?: ReportFilters) {
  const s = toISO(range.start)
  const e = toISO(range.end)
  const f = serializeFilters(filters)

  return useQuery({
    queryKey: reportKeys.taskCompletionByUser(tenantId, toDateString(range.start), toDateString(range.end), f),
    queryFn: async (): Promise<TaskCompletionByUserData[]> => {
      const supabase = createClient()
      const matterIds = await getFilteredMatterIds(supabase, tenantId, filters)

      let query = supabase
        .from('tasks')
        .select('assigned_to, status')
        .eq('tenant_id', tenantId)
        .neq('is_deleted', true)
        .not('assigned_to', 'is', null)
        .gte('created_at', s)
        .lte('created_at', e)
        .limit(5000)
      if (filters?.lawyerId) query = query.eq('assigned_to', filters.lawyerId)
      if (matterIds) query = query.in('matter_id', matterIds)

      const { data, error } = await query
      if (error) throw error
      const grouped: Record<string, { completed: number; total: number }> = {}
      for (const t of data ?? []) {
        if (!t.assigned_to) continue
        if (!grouped[t.assigned_to]) grouped[t.assigned_to] = { completed: 0, total: 0 }
        grouped[t.assigned_to].total++
        if (t.status === 'done') grouped[t.assigned_to].completed++
      }

      const userNames = await fetchUserNameMap(supabase, tenantId, Object.keys(grouped))
      return Object.entries(grouped)
        .map(([id, g]) => ({
          user_name: userNames[id] || 'Unknown',
          completed: g.completed,
          total: g.total,
          completion_rate: g.total > 0 ? Math.round((g.completed / g.total) * 100) : 0,
        }))
        .sort((a, b) => b.completion_rate - a.completion_rate)
    },
    enabled: !!tenantId,
    staleTime: 3 * 60 * 1000,
  })
}
