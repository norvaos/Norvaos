'use client'

import { useMemo } from 'react'
import dynamic from 'next/dynamic'
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import {
  Briefcase,
  PlusCircle,
  XCircle,
  DollarSign,
  CheckSquare,
  AlertTriangle,
} from 'lucide-react'

import { useTenant } from '@/lib/hooks/use-tenant'
import { usePeriodFilter } from '@/lib/hooks/use-period-filter'
import { PeriodFilter } from '@/components/dashboard/period-filter'
import { StatCard } from '@/components/dashboard/stat-card'
import { ChartCard } from '@/components/dashboard/chart-card'
import { Progress } from '@/components/ui/progress'

import {
  useReportMatterStats,
  useReportTaskStats,
  useReportMattersByPracticeArea,
  useReportMattersOpenedVsClosed,
  useReportTasksByAssignee,
  useReportRevenueByPracticeArea,
  useReportRevenueByBillingType,
  useReportRevenueTrend,
  useReportMattersByLawyer,
  useReportTaskCompletionByUser,
} from '@/lib/queries/reports'

const MattersByStatusWidget = dynamic(
  () => import('@/components/dashboard/matters-by-status-widget'),
  { ssr: false }
)

// ── Chart colour palette ─────────────────────────────────────────────────────

const CHART_COLORS = [
  '#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#3b82f6',
  '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#06b6d4',
]

const BILLING_TYPE_COLORS: Record<string, string> = {
  hourly: '#3b82f6',
  flat_fee: '#22c55e',
  contingency: '#f59e0b',
  retainer: '#8b5cf6',
  hybrid: '#ec4899',
}

// ── Currency formatter ──────────────────────────────────────────────────────

function fmtCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function tooltipCurrency(v: any) {
  return fmtCurrency(typeof v === 'number' ? v : 0)
}

// ── Empty state ──────────────────────────────────────────────────────────────

function ChartEmpty({ height = 200 }: { height?: number }) {
  return (
    <div
      className="flex items-center justify-center text-sm text-muted-foreground"
      style={{ height }}
    >
      No data available
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function ReportsPage() {
  const { tenant } = useTenant()
  const tenantId = tenant?.id ?? ''
  const { period, setPeriod, current, previous, comparisonLabel } = usePeriodFilter('month')

  // ── KPI data (current + previous for deltas) ──
  const { data: matterStats, isLoading: matterStatsLoading } = useReportMatterStats(tenantId, current)
  const { data: prevMatterStats } = useReportMatterStats(tenantId, previous)
  const { data: taskStats, isLoading: taskStatsLoading } = useReportTaskStats(tenantId, current)
  const { data: prevTaskStats } = useReportTaskStats(tenantId, previous)

  // ── Chart data ──
  const { data: mattersByPA, isLoading: mattersByPALoading } = useReportMattersByPracticeArea(tenantId, current)
  const { data: mattersTrend, isLoading: mattersTrendLoading } = useReportMattersOpenedVsClosed(tenantId)
  const { data: tasksByAssignee, isLoading: tasksByAssigneeLoading } = useReportTasksByAssignee(tenantId, current)
  const { data: revenueByPA, isLoading: revenueByPALoading } = useReportRevenueByPracticeArea(tenantId, current)
  const { data: revenueByBilling, isLoading: revenueByBillingLoading } = useReportRevenueByBillingType(tenantId, current)
  const { data: revenueTrend, isLoading: revenueTrendLoading } = useReportRevenueTrend(tenantId)
  const { data: mattersByLawyer, isLoading: mattersByLawyerLoading } = useReportMattersByLawyer(tenantId, current)
  const { data: taskCompletion, isLoading: taskCompletionLoading } = useReportTaskCompletionByUser(tenantId, current)

  // ── Derived: task completion rate ──
  const overallCompletionRate = useMemo(() => {
    if (!taskStats) return 0
    if (taskStats.totalTaskCount === 0) return 0
    return Math.round((taskStats.completedTaskCount / taskStats.totalTaskCount) * 100)
  }, [taskStats])

  const statsLoading = matterStatsLoading || taskStatsLoading

  return (
    <div className="space-y-8 p-6">
      {/* ── Header ── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Reports</h1>
          <p className="text-sm text-muted-foreground">
            Firm-wide analytics and performance insights
          </p>
        </div>
        <PeriodFilter
          period={period}
          onPeriodChange={setPeriod}
          comparisonLabel={comparisonLabel}
        />
      </div>

      {/* ── KPI Row ── */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
        <StatCard
          title="Active Matters"
          value={matterStats?.activeMatterCount ?? null}
          previousValue={prevMatterStats?.activeMatterCount}
          format="number"
          icon={Briefcase}
          iconColor="text-blue-500"
          loading={statsLoading}
        />
        <StatCard
          title="New Matters"
          value={matterStats?.newMatterCount ?? null}
          previousValue={prevMatterStats?.newMatterCount}
          format="number"
          icon={PlusCircle}
          iconColor="text-emerald-500"
          loading={statsLoading}
        />
        <StatCard
          title="Closed Matters"
          value={matterStats?.closedMatterCount ?? null}
          previousValue={prevMatterStats?.closedMatterCount}
          format="number"
          icon={XCircle}
          iconColor="text-gray-500"
          loading={statsLoading}
        />
        <StatCard
          title="Revenue"
          value={matterStats?.totalBilledInPeriod ?? null}
          previousValue={prevMatterStats?.totalBilledInPeriod}
          format="currency"
          icon={DollarSign}
          iconColor="text-amber-500"
          loading={statsLoading}
        />
        <StatCard
          title="Open Tasks"
          value={taskStats?.openTaskCount ?? null}
          previousValue={prevTaskStats?.openTaskCount}
          format="number"
          icon={CheckSquare}
          iconColor="text-violet-500"
          loading={statsLoading}
        />
        <StatCard
          title="Overdue Deadlines"
          value={taskStats?.overdueDeadlineCount ?? null}
          previousValue={prevTaskStats?.overdueDeadlineCount}
          format="number"
          icon={AlertTriangle}
          iconColor="text-red-500"
          loading={statsLoading}
        />
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          MATTERS SECTION
         ══════════════════════════════════════════════════════════════════════ */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Matters</h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {/* Matters by Status (self-contained widget) */}
          <MattersByStatusWidget tenantId={tenantId} />

          {/* Matters by Practice Area */}
          <ChartCard title="Matters by Practice Area" subtitle="Active matters" loading={mattersByPALoading}>
            {!mattersByPA?.length ? (
              <ChartEmpty />
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={mattersByPA} layout="vertical" margin={{ left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" allowDecimals={false} />
                  <YAxis
                    type="category"
                    dataKey="practice_area_name"
                    width={120}
                    tick={{ fontSize: 12 }}
                  />
                  <Tooltip />
                  <Bar dataKey="count" name="Matters" radius={[0, 4, 4, 0]}>
                    {mattersByPA.map((entry, i) => (
                      <Cell key={i} fill={entry.practice_area_color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

          {/* Matters Opened vs Closed */}
          <ChartCard title="Opened vs Closed" subtitle="Last 6 months" loading={mattersTrendLoading}>
            {!mattersTrend?.length ? (
              <ChartEmpty />
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={mattersTrend}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="opened" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="closed" stroke="#ef4444" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </ChartCard>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════════
          TASKS SECTION
         ══════════════════════════════════════════════════════════════════════ */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Tasks</h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {/* Task Completion Rate */}
          <ChartCard title="Task Completion Rate" subtitle="In selected period" loading={taskStatsLoading}>
            {taskStats?.totalTaskCount === 0 ? (
              <ChartEmpty />
            ) : (
              <div className="flex flex-col items-center gap-4 py-6">
                <div className="text-5xl font-bold tabular-nums">
                  {overallCompletionRate}%
                </div>
                <Progress value={overallCompletionRate} className="h-3 w-48" />
                <p className="text-sm text-muted-foreground">
                  {taskStats?.completedTaskCount ?? 0} of {taskStats?.totalTaskCount ?? 0} tasks completed
                </p>
              </div>
            )}
          </ChartCard>

          {/* Tasks by Status */}
          <ChartCard title="Tasks by Status" subtitle="Created in period" loading={taskStatsLoading}>
            {!taskStats?.statusBreakdown?.length ? (
              <ChartEmpty />
            ) : (
              <div className="space-y-3 py-4">
                {taskStats.statusBreakdown.map((s) => (
                  <div key={s.name} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{s.name}</span>
                      <span className="tabular-nums text-muted-foreground">{s.value}</span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${Math.max(2, (s.value / (taskStats.totalTaskCount || 1)) * 100)}%`,
                          backgroundColor: s.color,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ChartCard>

          {/* Overdue Tasks by Assignee */}
          <ChartCard title="Tasks by Assignee" subtitle="Overdue highlighted" loading={tasksByAssigneeLoading}>
            {!tasksByAssignee?.length ? (
              <ChartEmpty />
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={tasksByAssignee.slice(0, 8)} layout="vertical" margin={{ left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" allowDecimals={false} />
                  <YAxis
                    type="category"
                    dataKey="user_name"
                    width={100}
                    tick={{ fontSize: 12 }}
                  />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="overdue_count" name="Overdue" stackId="a" fill="#ef4444" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="open_count" name="Open" stackId="a" fill="#3b82f6" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="completed_count" name="Done" stackId="a" fill="#22c55e" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════════
          REVENUE SECTION
         ══════════════════════════════════════════════════════════════════════ */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Revenue</h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {/* Revenue by Practice Area */}
          <ChartCard title="Revenue by Practice Area" loading={revenueByPALoading}>
            {!revenueByPA?.length ? (
              <ChartEmpty />
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={revenueByPA} layout="vertical" margin={{ left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" tickFormatter={(v: number) => fmtCurrency(v)} />
                  <YAxis
                    type="category"
                    dataKey="practice_area_name"
                    width={120}
                    tick={{ fontSize: 12 }}
                  />
                  <Tooltip formatter={tooltipCurrency} />
                  <Bar dataKey="total_billed" name="Revenue" radius={[0, 4, 4, 0]}>
                    {revenueByPA.map((entry, i) => (
                      <Cell key={i} fill={entry.practice_area_color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

          {/* Revenue by Billing Type */}
          <ChartCard title="Revenue by Billing Type" loading={revenueByBillingLoading}>
            {!revenueByBilling?.length ? (
              <ChartEmpty />
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={revenueByBilling}
                    dataKey="total_billed"
                    nameKey="billing_type_label"
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={90}
                    paddingAngle={2}
                    label={({ name }: { name?: string }) => name ?? ''}
                  >
                    {revenueByBilling.map((entry, i) => (
                      <Cell
                        key={i}
                        fill={BILLING_TYPE_COLORS[entry.billing_type] || CHART_COLORS[i % CHART_COLORS.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip formatter={tooltipCurrency} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

          {/* Revenue Trend */}
          <ChartCard title="Revenue Trend" subtitle="Last 12 months" loading={revenueTrendLoading}>
            {!revenueTrend?.length ? (
              <ChartEmpty />
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={revenueTrend}>
                  <defs>
                    <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                  <YAxis tickFormatter={(v: number) => fmtCurrency(v)} />
                  <Tooltip formatter={tooltipCurrency} />
                  <Area
                    type="monotone"
                    dataKey="revenue"
                    stroke="#6366f1"
                    strokeWidth={2}
                    fill="url(#revenueGrad)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </ChartCard>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════════
          TEAM SECTION
         ══════════════════════════════════════════════════════════════════════ */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Team</h2>
        <div className="grid gap-4 md:grid-cols-2">
          {/* Matters per Lawyer */}
          <ChartCard title="Matters per Lawyer" subtitle="Active caseload" loading={mattersByLawyerLoading}>
            {!mattersByLawyer?.length ? (
              <ChartEmpty />
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={mattersByLawyer} layout="vertical" margin={{ left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" allowDecimals={false} />
                  <YAxis
                    type="category"
                    dataKey="user_name"
                    width={120}
                    tick={{ fontSize: 12 }}
                  />
                  <Tooltip />
                  <Bar dataKey="active_count" name="Active Matters" fill="#6366f1" radius={[0, 4, 4, 0]}>
                    {mattersByLawyer.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

          {/* Task Completion by Team Member */}
          <ChartCard title="Task Completion by Team" subtitle="In selected period" loading={taskCompletionLoading}>
            {!taskCompletion?.length ? (
              <ChartEmpty />
            ) : (
              <div className="space-y-4 py-2">
                {taskCompletion.slice(0, 8).map((user) => (
                  <div key={user.user_name} className="space-y-1.5">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{user.user_name}</span>
                      <span className="tabular-nums text-muted-foreground">
                        {user.completed}/{user.total} ({user.completion_rate}%)
                      </span>
                    </div>
                    <Progress value={user.completion_rate} className="h-2" />
                  </div>
                ))}
              </div>
            )}
          </ChartCard>
        </div>
      </section>
    </div>
  )
}
