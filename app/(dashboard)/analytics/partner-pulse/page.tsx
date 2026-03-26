'use client'

import { Suspense, lazy } from 'react'
import {
  DollarSign,
  Briefcase,
  Users,
  AlertTriangle,
  Activity,
} from 'lucide-react'

import { useTenant } from '@/lib/hooks/use-tenant'
import { usePeriodFilter } from '@/lib/hooks/use-period-filter'
import { PeriodFilter } from '@/components/dashboard/period-filter'
import { StatCard } from '@/components/dashboard/stat-card'
import { ChartCard } from '@/components/dashboard/chart-card'
import { RequirePermission } from '@/components/require-permission'
import { Skeleton } from '@/components/ui/skeleton'

import {
  useReportMatterStats,
  useReportTaskStats,
  useReportRevenueByPracticeArea,
  useReportMattersByPracticeArea,
  useReportTasksByAssignee,
  useReportMattersOpenedVsClosed,
} from '@/lib/queries/reports'

// ── Lazy-loaded chart panels (React Suspense for "instant" feel) ─────────────

const RevenueByPAChart = lazy(() => import('./charts/revenue-by-pa-chart'))
const MattersByPAChart = lazy(() => import('./charts/matters-by-pa-chart'))
const MattersTrendChart = lazy(() => import('./charts/matters-trend-chart'))
const BottleneckTable = lazy(() => import('./charts/bottleneck-table'))

// ── Chart Loading Skeleton ───────────────────────────────────────────────────

function ChartSkeleton({ height = 280 }: { height?: number }) {
  return <Skeleton className="w-full rounded-md" style={{ height }} />
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function PartnerPulseDashboard() {
  const { tenant } = useTenant()
  const tenantId = tenant?.id ?? ''
  const { period, setPeriod, current, previous, comparisonLabel } = usePeriodFilter('month')

  const matterStats = useReportMatterStats(tenantId, current)
  const prevMatterStats = useReportMatterStats(tenantId, previous)
  const taskStats = useReportTaskStats(tenantId, current)
  const revenueByPA = useReportRevenueByPracticeArea(tenantId, current)
  const mattersByPA = useReportMattersByPracticeArea(tenantId, current)
  const mattersTrend = useReportMattersOpenedVsClosed(tenantId)
  const tasksByAssignee = useReportTasksByAssignee(tenantId, current)

  const statsLoading = matterStats.isLoading || taskStats.isLoading

  return (
    <RequirePermission entity="analytics" action="view">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <Activity className="h-6 w-6 text-indigo-500" />
              Partner Pulse
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Firm-wide performance at a glance — revenue, workload, and bottlenecks.
            </p>
          </div>
          <PeriodFilter
            period={period}
            onPeriodChange={setPeriod}
            comparisonLabel={comparisonLabel}
          />
        </div>

        {/* KPI Row */}
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="Total Billed"
            value={matterStats.data?.totalBilledInPeriod}
            previousValue={prevMatterStats.data?.totalBilledInPeriod}
            format="currency"
            icon={DollarSign}
            iconColor="text-emerald-500"
            loading={statsLoading}
          />
          <StatCard
            title="Active Matters"
            value={matterStats.data?.activeMatterCount}
            previousValue={prevMatterStats.data?.activeMatterCount}
            format="number"
            icon={Briefcase}
            iconColor="text-blue-500"
            loading={statsLoading}
          />
          <StatCard
            title="Open Tasks"
            value={taskStats.data?.openTaskCount}
            format="number"
            icon={Users}
            iconColor="text-violet-500"
            loading={taskStats.isLoading}
          />
          <StatCard
            title="Overdue Deadlines"
            value={taskStats.data?.overdueDeadlineCount}
            format="number"
            icon={AlertTriangle}
            iconColor="text-red-500"
            loading={taskStats.isLoading}
          />
        </div>

        {/* Charts Row 1: Revenue + Matters by Practice Area */}
        <div className="grid gap-6 lg:grid-cols-2">
          <ChartCard
            title="Revenue by Practice Area"
            subtitle="Total billed amount per practice area"
            loading={revenueByPA.isLoading}
          >
            <Suspense fallback={<ChartSkeleton />}>
              <RevenueByPAChart data={revenueByPA.data ?? []} />
            </Suspense>
          </ChartCard>

          <ChartCard
            title="Matters by Practice Area"
            subtitle="Active matter distribution"
            loading={mattersByPA.isLoading}
          >
            <Suspense fallback={<ChartSkeleton />}>
              <MattersByPAChart data={mattersByPA.data ?? []} />
            </Suspense>
          </ChartCard>
        </div>

        {/* Charts Row 2: Trend + Bottlenecks */}
        <div className="grid gap-6 lg:grid-cols-2">
          <ChartCard
            title="Matters Opened vs Closed"
            subtitle="6-month trend"
            loading={mattersTrend.isLoading}
          >
            <Suspense fallback={<ChartSkeleton />}>
              <MattersTrendChart data={mattersTrend.data ?? []} />
            </Suspense>
          </ChartCard>

          <ChartCard
            title="Workload Bottlenecks"
            subtitle="Team members with the most overdue items"
            loading={tasksByAssignee.isLoading}
          >
            <Suspense fallback={<ChartSkeleton height={240} />}>
              <BottleneckTable data={tasksByAssignee.data ?? []} />
            </Suspense>
          </ChartCard>
        </div>
      </div>
    </RequirePermission>
  )
}
