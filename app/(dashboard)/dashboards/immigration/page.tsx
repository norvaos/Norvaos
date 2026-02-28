'use client'

import { useMemo } from 'react'
import dynamic from 'next/dynamic'
import {
  Briefcase,
  PlusCircle,
  XCircle,
  FileText,
  AlertTriangle,
} from 'lucide-react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  CartesianGrid,
  Legend,
} from 'recharts'
import { useTenant } from '@/lib/hooks/use-tenant'
import { usePeriodFilter } from '@/lib/hooks/use-period-filter'
import {
  useImmigrationCaseStats,
  useImmigrationDocStats,
  useImmigrationDeadlineStats,
  useImmigrationCasesByStage,
  useImmigrationCasesByType,
  useImmigrationMonthlyTrend,
} from '@/lib/queries/immigration-dashboard'
import { PeriodFilter } from '@/components/dashboard/period-filter'
import { StatCard } from '@/components/dashboard/stat-card'
import { ChartCard } from '@/components/dashboard/chart-card'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

// Lazy-load existing widgets that don't need period filtering
const RetainerConversionWidget = dynamic(
  () =>
    import('@/components/immigration/dashboard-widgets').then((m) => ({
      default: m.RetainerConversionWidget,
    })),
  { loading: () => <WidgetSkeleton /> }
)
const StaffWorkloadWidget = dynamic(
  () =>
    import('@/components/immigration/dashboard-widgets').then((m) => ({
      default: m.StaffWorkloadWidget,
    })),
  { loading: () => <WidgetSkeleton /> }
)
const UpcomingDeadlinesWidget = dynamic(
  () =>
    import('@/components/immigration/dashboard-widgets').then((m) => ({
      default: m.UpcomingDeadlinesWidget,
    })),
  { loading: () => <WidgetSkeleton /> }
)

function WidgetSkeleton() {
  return (
    <Card>
      <CardContent className="pt-6">
        <Skeleton className="h-5 w-32 mb-3" />
        <Skeleton className="h-40 w-full" />
      </CardContent>
    </Card>
  )
}

// Donut chart colors
const DONUT_COLORS = [
  '#3b82f6', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b',
  '#ef4444', '#ec4899', '#6366f1', '#14b8a6', '#f97316',
]

export default function ImmigrationDashboardPage() {
  const { tenant, isLoading: tenantLoading } = useTenant()
  const tenantId = tenant?.id ?? ''
  const { period, setPeriod, current, previous, comparisonLabel } = usePeriodFilter('month')

  // ── Current period data ──
  const { data: currentCaseStats, isLoading: caseStatsLoading } = useImmigrationCaseStats(tenantId, current)
  const { data: currentDocStats, isLoading: docStatsLoading } = useImmigrationDocStats(tenantId, current)
  const { data: currentDeadlineStats, isLoading: deadlineStatsLoading } = useImmigrationDeadlineStats(tenantId, current)

  // ── Previous period data (for deltas) ──
  const { data: prevCaseStats } = useImmigrationCaseStats(tenantId, previous)
  const { data: prevDocStats } = useImmigrationDocStats(tenantId, previous)
  const { data: prevDeadlineStats } = useImmigrationDeadlineStats(tenantId, previous)

  // ── Chart data ──
  const { data: casesByStage, isLoading: stageChartLoading } = useImmigrationCasesByStage(tenantId, current)
  const { data: casesByType, isLoading: typeChartLoading } = useImmigrationCasesByType(tenantId, current)
  const { data: monthlyTrend, isLoading: trendLoading } = useImmigrationMonthlyTrend(tenantId)

  const statsLoading = tenantLoading || caseStatsLoading || docStatsLoading || deadlineStatsLoading

  // Sort stage data by count descending for bar chart
  const sortedStageData = useMemo(
    () => [...(casesByStage ?? [])].sort((a, b) => b.count - a.count),
    [casesByStage]
  )

  if (tenantLoading) {
    return (
      <div className="space-y-6 p-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-5 gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Skeleton className="h-80" />
          <Skeleton className="h-80" />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Immigration Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Overview of immigration matters, deadlines, and team performance
          </p>
        </div>
        <PeriodFilter
          period={period}
          onPeriodChange={setPeriod}
          comparisonLabel={comparisonLabel}
        />
      </div>

      {/* Stat Cards Row */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <StatCard
          title="Active Matters"
          value={currentCaseStats?.activeCases ?? null}
          previousValue={prevCaseStats?.activeCases}
          icon={Briefcase}
          iconColor="text-blue-500"
          loading={statsLoading}
          href="/matters?status=active"
        />
        <StatCard
          title="New Matters"
          value={currentCaseStats?.newCases ?? null}
          previousValue={prevCaseStats?.newCases}
          icon={PlusCircle}
          iconColor="text-emerald-500"
          loading={statsLoading}
          href="/matters?status=intake"
        />
        <StatCard
          title="Closed Matters"
          value={currentCaseStats?.closedCases ?? null}
          previousValue={prevCaseStats?.closedCases}
          icon={XCircle}
          iconColor="text-slate-500"
          loading={statsLoading}
          href="/matters?status=closed_won"
        />
        <StatCard
          title="Docs Pending"
          value={currentDocStats?.awaitingDocs ?? null}
          previousValue={prevDocStats?.awaitingDocs}
          icon={FileText}
          iconColor="text-amber-500"
          loading={statsLoading}
          href="/matters?status=active"
        />
        <StatCard
          title="Overdue Deadlines"
          value={currentDeadlineStats?.overdue ?? null}
          previousValue={prevDeadlineStats?.overdue}
          icon={AlertTriangle}
          iconColor="text-red-500"
          loading={statsLoading}
          href="/matters?status=active"
        />
      </div>

      {/* Charts Row 1: Matters by Stage + Matters by Type */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard
          title="Matters by Stage"
          subtitle="Active immigration matters grouped by current stage"
          loading={stageChartLoading}
          chartHeight={300}
        >
          {sortedStageData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={sortedStageData} layout="vertical" margin={{ left: 20, right: 20, top: 5, bottom: 5 }}>
                <XAxis type="number" allowDecimals={false} fontSize={12} />
                <YAxis
                  type="category"
                  dataKey="stage_name"
                  width={120}
                  fontSize={11}
                  tick={{ fill: '#64748b' }}
                />
                <RechartsTooltip
                  formatter={(value) => [value, 'Matters']}
                  contentStyle={{ fontSize: 12, borderRadius: 8 }}
                />
                <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                  {sortedStageData.map((entry, i) => (
                    <Cell key={i} fill={entry.stage_color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[300px] text-sm text-muted-foreground">
              No stage data available
            </div>
          )}
        </ChartCard>

        <ChartCard
          title="Matters by Type"
          subtitle="Distribution of active matters by immigration type"
          loading={typeChartLoading}
          chartHeight={300}
        >
          {(casesByType ?? []).length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={casesByType}
                  dataKey="count"
                  nameKey="type_name"
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={2}
                  label={(props) => {
                    const name = props.name ?? ''
                    const percent = typeof props.percent === 'number' ? props.percent : 0
                    return `${name} (${(percent * 100).toFixed(0)}%)`
                  }}
                  labelLine={false}
                  fontSize={11}
                >
                  {(casesByType ?? []).map((_, i) => (
                    <Cell key={i} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />
                  ))}
                </Pie>
                <RechartsTooltip
                  formatter={(value, name) => [value, name]}
                  contentStyle={{ fontSize: 12, borderRadius: 8 }}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[300px] text-sm text-muted-foreground">
              No type data available
            </div>
          )}
        </ChartCard>
      </div>

      {/* Charts Row 2: Monthly Trend + Retainer Conversion */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard
          title="Monthly Trend"
          subtitle="Matters opened vs closed over the last 6 months"
          loading={trendLoading}
          chartHeight={300}
        >
          {(monthlyTrend ?? []).length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={monthlyTrend} margin={{ left: 0, right: 20, top: 5, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="month" fontSize={12} tick={{ fill: '#64748b' }} />
                <YAxis allowDecimals={false} fontSize={12} tick={{ fill: '#64748b' }} />
                <RechartsTooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                <Line
                  type="monotone"
                  dataKey="opened"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={{ r: 4 }}
                  name="Opened"
                />
                <Line
                  type="monotone"
                  dataKey="closed"
                  stroke="#10b981"
                  strokeWidth={2}
                  dot={{ r: 4 }}
                  name="Closed"
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[300px] text-sm text-muted-foreground">
              No trend data available
            </div>
          )}
        </ChartCard>

        <RetainerConversionWidget tenantId={tenantId} />
      </div>

      {/* Bottom Row: Staff Workload + Upcoming Deadlines */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <StaffWorkloadWidget tenantId={tenantId} />
        <UpcomingDeadlinesWidget tenantId={tenantId} />
      </div>
    </div>
  )
}
