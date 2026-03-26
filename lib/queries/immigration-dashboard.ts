import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { DateRange } from '@/lib/hooks/use-period-filter'

// ─── Query key factory ───────────────────────────────────────────────────────

export const immigrationDashboardKeys = {
  all: ['immigration-dashboard'] as const,
  caseStats: (tenantId: string, start: string, end: string) =>
    [...immigrationDashboardKeys.all, 'case-stats', tenantId, start, end] as const,
  docStats: (tenantId: string, start: string, end: string) =>
    [...immigrationDashboardKeys.all, 'doc-stats', tenantId, start, end] as const,
  deadlineStats: (tenantId: string, start: string, end: string) =>
    [...immigrationDashboardKeys.all, 'deadline-stats', tenantId, start, end] as const,
  casesByStage: (tenantId: string, start: string, end: string) =>
    [...immigrationDashboardKeys.all, 'cases-by-stage', tenantId, start, end] as const,
  casesByType: (tenantId: string, start: string, end: string) =>
    [...immigrationDashboardKeys.all, 'cases-by-type', tenantId, start, end] as const,
  monthlyTrend: (tenantId: string) =>
    [...immigrationDashboardKeys.all, 'monthly-trend', tenantId] as const,
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toISOString(date: Date): string {
  return date.toISOString()
}

function toDateString(date: Date): string {
  return date.toISOString().split('T')[0]
}

// ─── 1. Case Stats (active, new, closed) ────────────────────────────────────

export interface CaseStatsData {
  activeCases: number
  newCases: number
  closedCases: number
}

export function useImmigrationCaseStats(tenantId: string, range: DateRange) {
  const startStr = toISOString(range.start)
  const endStr = toISOString(range.end)

  return useQuery({
    queryKey: immigrationDashboardKeys.caseStats(tenantId, startStr, endStr),
    queryFn: async (): Promise<CaseStatsData> => {
      const supabase = createClient()

      // Active immigration cases (matters that have a matter_immigration row and status='active')
      const { data: activeData, error: activeError } = await supabase
        .from('matter_immigration')
        .select('matter_id, matters!inner(status)')
        .eq('tenant_id', tenantId)

      if (activeError) throw activeError

      const activeCases = (activeData as unknown as { matter_id: string; matters: { status: string } }[])
        .filter((m) => m.matters.status === 'active')
        .length

      // New immigration cases created in the period
      const { count: newCases, error: newError } = await supabase
        .from('matter_immigration')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .gte('created_at', startStr)
        .lte('created_at', endStr)

      if (newError) throw newError

      // Closed cases in the period (matters joined to matter_immigration with date_closed in range)
      const { data: closedData, error: closedError } = await supabase
        .from('matter_immigration')
        .select('matter_id, matters!inner(status, date_closed)')
        .eq('tenant_id', tenantId)

      if (closedError) throw closedError

      const closedCases = (closedData as unknown as { matter_id: string; matters: { status: string; date_closed: string | null } }[])
        .filter((m) => {
          if (!m.matters.date_closed) return false
          const closedDate = new Date(m.matters.date_closed)
          return closedDate >= range.start && closedDate <= range.end
        })
        .length

      return { activeCases, newCases: newCases ?? 0, closedCases }
    },
    enabled: !!tenantId,
  })
}

// ─── 2. Document Stats ──────────────────────────────────────────────────────

export interface DocStatsData {
  awaitingDocs: number
  completedDocs: number
}

export function useImmigrationDocStats(tenantId: string, range: DateRange) {
  const startStr = toISOString(range.start)
  const endStr = toISOString(range.end)

  return useQuery({
    queryKey: immigrationDashboardKeys.docStats(tenantId, startStr, endStr),
    queryFn: async (): Promise<DocStatsData> => {
      const supabase = createClient()

      // Awaiting docs: checklist items with status 'missing' or 'requested'
      const { count: awaitingDocs, error: awaitError } = await supabase
        .from('matter_checklist_items')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .in('status', ['missing', 'requested'])

      if (awaitError) throw awaitError

      // Completed docs in the period
      const { count: completedDocs, error: compError } = await supabase
        .from('matter_checklist_items')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .in('status', ['received', 'approved'])
        .gte('updated_at', startStr)
        .lte('updated_at', endStr)

      if (compError) throw compError

      return {
        awaitingDocs: awaitingDocs ?? 0,
        completedDocs: completedDocs ?? 0,
      }
    },
    enabled: !!tenantId,
  })
}

// ─── 3. Deadline Stats ──────────────────────────────────────────────────────

export interface DeadlineStatsData {
  overdue: number
  upcoming: number
  completed: number
}

export function useImmigrationDeadlineStats(tenantId: string, range: DateRange) {
  const startStr = toDateString(range.start)
  const endStr = toDateString(range.end)

  return useQuery({
    queryKey: immigrationDashboardKeys.deadlineStats(tenantId, startStr, endStr),
    queryFn: async (): Promise<DeadlineStatsData> => {
      const supabase = createClient()
      const today = new Date().toISOString().split('T')[0]

      // Overdue deadlines
      const { count: overdue, error: overdueErr } = await supabase
        .from('matter_deadlines')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .neq('status', 'completed')
        .lt('due_date', today)

      if (overdueErr) throw overdueErr

      // Upcoming deadlines (due in range, not completed)
      const { count: upcoming, error: upcomingErr } = await supabase
        .from('matter_deadlines')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .neq('status', 'completed')
        .gte('due_date', today)
        .lte('due_date', endStr)

      if (upcomingErr) throw upcomingErr

      // Completed deadlines in the period
      const { count: completed, error: completedErr } = await supabase
        .from('matter_deadlines')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('status', 'completed')
        .gte('completed_at', toISOString(range.start))
        .lte('completed_at', toISOString(range.end))

      if (completedErr) throw completedErr

      return {
        overdue: overdue ?? 0,
        upcoming: upcoming ?? 0,
        completed: completed ?? 0,
      }
    },
    enabled: !!tenantId,
  })
}

// ─── 4. Cases by Stage (for bar chart) ──────────────────────────────────────

export interface CasesByStageData {
  stage_name: string
  stage_color: string
  count: number
}

export function useImmigrationCasesByStage(tenantId: string, range: DateRange) {
  const startStr = toISOString(range.start)
  const endStr = toISOString(range.end)

  return useQuery({
    queryKey: immigrationDashboardKeys.casesByStage(tenantId, startStr, endStr),
    queryFn: async (): Promise<CasesByStageData[]> => {
      const supabase = createClient()

      // Fetch active immigration matters with current stage
      const { data: matterImm, error: matterImmError } = await supabase
        .from('matter_immigration')
        .select('current_stage_id, matters!inner(status)')
        .eq('tenant_id', tenantId)
        .not('current_stage_id', 'is', null)

      if (matterImmError) throw matterImmError

      const activeMatterImm = (matterImm as unknown as { current_stage_id: string | null; matters: { status: string } }[])
        .filter((m) => m.matters.status === 'active' && m.current_stage_id)

      // Count per stage
      const stageCounts: Record<string, number> = {}
      for (const m of activeMatterImm) {
        const stageId = m.current_stage_id!
        stageCounts[stageId] = (stageCounts[stageId] || 0) + 1
      }

      const stageIds = Object.keys(stageCounts)
      if (stageIds.length === 0) return []

      const { data: stages, error: stagesError } = await supabase
        .from('case_stage_definitions')
        .select('id, name, color')
        .in('id', stageIds)

      if (stagesError) throw stagesError

      return (stages ?? []).map((s) => ({
        stage_name: s.name,
        stage_color: s.color ?? '#6b7280',
        count: stageCounts[s.id] || 0,
      }))
    },
    enabled: !!tenantId,
  })
}

// ─── 5. Cases by Type (for donut chart) ─────────────────────────────────────

export interface CasesByTypeData {
  type_name: string
  count: number
}

export function useImmigrationCasesByType(tenantId: string, range: DateRange) {
  const startStr = toISOString(range.start)
  const endStr = toISOString(range.end)

  return useQuery({
    queryKey: immigrationDashboardKeys.casesByType(tenantId, startStr, endStr),
    queryFn: async (): Promise<CasesByTypeData[]> => {
      const supabase = createClient()

      // Fetch active immigration matters with their case type
      const { data: matterImm, error: matterImmError } = await supabase
        .from('matter_immigration')
        .select('case_type_id, matters!inner(status)')
        .eq('tenant_id', tenantId)

      if (matterImmError) throw matterImmError

      const activeMatterImm = (matterImm as unknown as { case_type_id: string | null; matters: { status: string } }[])
        .filter((m) => m.matters.status === 'active' && m.case_type_id)

      // Count per case type
      const typeCounts: Record<string, number> = {}
      for (const m of activeMatterImm) {
        const typeId = m.case_type_id!
        typeCounts[typeId] = (typeCounts[typeId] || 0) + 1
      }

      const typeIds = Object.keys(typeCounts)
      if (typeIds.length === 0) return []

      const { data: caseTypes, error: caseTypesError } = await supabase
        .from('immigration_case_types')
        .select('id, name')
        .in('id', typeIds)

      if (caseTypesError) throw caseTypesError

      return (caseTypes ?? []).map((ct) => ({
        type_name: ct.name,
        count: typeCounts[ct.id] || 0,
      }))
    },
    enabled: !!tenantId,
  })
}

// ─── 6. Monthly Trend (last 6 months) ───────────────────────────────────────

export interface MonthlyTrendData {
  month: string
  opened: number
  closed: number
}

export function useImmigrationMonthlyTrend(tenantId: string) {
  return useQuery({
    queryKey: immigrationDashboardKeys.monthlyTrend(tenantId),
    queryFn: async (): Promise<MonthlyTrendData[]> => {
      const supabase = createClient()
      const now = new Date()

      // Build last 6 months array
      const months: { label: string; start: Date; end: Date }[] = []
      for (let i = 5; i >= 0; i--) {
        const start = new Date(now.getFullYear(), now.getMonth() - i, 1)
        const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59, 999)
        const label = start.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
        months.push({ label, start, end })
      }

      const sixMonthsAgo = months[0].start.toISOString()

      // Fetch immigration matters created in last 6 months
      const { data: newMatters, error: newErr } = await supabase
        .from('matter_immigration')
        .select('created_at')
        .eq('tenant_id', tenantId)
        .gte('created_at', sixMonthsAgo)

      if (newErr) throw newErr

      // Fetch matters closed in last 6 months
      const { data: closedMatters, error: closedErr } = await supabase
        .from('matter_immigration')
        .select('matter_id, matters!inner(date_closed)')
        .eq('tenant_id', tenantId)

      if (closedErr) throw closedErr

      const closedWithDates = (closedMatters as unknown as { matter_id: string; matters: { date_closed: string | null } }[])
        .filter((m) => m.matters.date_closed)
        .map((m) => new Date(m.matters.date_closed!))
        .filter((d) => d >= months[0].start)

      return months.map(({ label, start, end }) => {
        const opened = (newMatters ?? []).filter((m) => {
          const d = new Date(m.created_at)
          return d >= start && d <= end
        }).length

        const closed = closedWithDates.filter((d) => d >= start && d <= end).length

        return { month: label, opened, closed }
      })
    },
    enabled: !!tenantId,
    staleTime: 5 * 60 * 1000, // 5 min  -  trend data doesn't change often
  })
}
