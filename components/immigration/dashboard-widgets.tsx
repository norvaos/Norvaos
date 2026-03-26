'use client'

import Link from 'next/link'
import { differenceInDays } from 'date-fns'
import {
  Briefcase,
  FileWarning,
  Clock,
  TrendingUp,
  AlertTriangle,
  Users,
  CheckCircle2,
  ArrowRight,
  Calendar,
  Shield,
} from 'lucide-react'

import { cn } from '@/lib/utils'
import { formatDate } from '@/lib/utils/formatters'
import { DEADLINE_TYPES, DEADLINE_STATUSES } from '@/lib/utils/constants'
import {
  calculateDeadlineRiskScore,
  getRiskLevelConfig,
} from '@/lib/utils/deadline-risk-engine'
import type { RiskLevel } from '@/lib/utils/deadline-risk-engine'
import { Card, CardContent, CardHeader, CardTitle, CardAction } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ScrollArea } from '@/components/ui/scroll-area'
import { HelperTip } from '@/components/ui/helper-tip'

import {
  useActiveFilesByStage,
  useFilesAwaitingDocuments,
  useFilesWaitingOnIRCC,
  useRetainerConversionRate,
  useOverdueRiskItems,
  useAllUpcomingDeadlines,
  useStaffWorkload,
  useStaffWellness,
  type StaffWellnessEntry,
} from '@/lib/queries/immigration'

// ---------------------------------------------------------------------------
// Shared Skeleton
// ---------------------------------------------------------------------------

export function ImmigrationStatSkeleton() {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Skeleton className="h-5 w-5 rounded" />
          <Skeleton className="h-4 w-32" />
        </div>
      </CardHeader>
      <CardContent>
        <Skeleton className="h-9 w-20 mb-2" />
        <Skeleton className="h-3.5 w-48" />
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// 1. Active Files by Stage
// ---------------------------------------------------------------------------

interface WidgetProps {
  tenantId: string
}

export function ActiveFilesByStageWidget({ tenantId }: WidgetProps) {
  const { data, isLoading } = useActiveFilesByStage(tenantId)

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <Briefcase className="h-4 w-4 text-muted-foreground" />
            Active Files by Stage <HelperTip contentKey="dashboard.active_files_by_stage" />
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Skeleton className="h-3.5 w-24" />
                <Skeleton className="h-3.5 w-8" />
              </div>
              <Skeleton className="h-2.5 w-full rounded-full" />
            </div>
          ))}
        </CardContent>
      </Card>
    )
  }

  const stages = data ?? []
  const maxCount = Math.max(...stages.map((s) => s.count), 1)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <Briefcase className="h-4 w-4 text-muted-foreground" />
          Active Files by Stage
        </CardTitle>
      </CardHeader>
      <CardContent>
        {stages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-6 text-center text-muted-foreground">
            <Shield className="h-8 w-8 mb-2 opacity-50" />
            <p className="text-sm">No active files</p>
          </div>
        ) : (
          <div className="space-y-3">
            {stages.map((stage) => (
              <div key={stage.stage_name} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="truncate font-medium">{stage.stage_name}</span>
                  <span className="ml-2 shrink-0 text-muted-foreground tabular-nums">
                    {stage.count}
                  </span>
                </div>
                <div className="h-2.5 w-full rounded-full bg-muted">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${(stage.count / maxCount) * 100}%`,
                      backgroundColor: stage.stage_color || '#3b82f6',
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// 2. Files Awaiting Documents
// ---------------------------------------------------------------------------

export function FilesAwaitingDocsWidget({ tenantId }: WidgetProps) {
  const { data, isLoading } = useFilesAwaitingDocuments(tenantId)

  if (isLoading) return <ImmigrationStatSkeleton />

  const count = data ?? 0
  const hasItems = count > 0

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <FileWarning
            className={cn('h-4 w-4', hasItems ? 'text-orange-500' : 'text-muted-foreground')}
          />
          Awaiting Documents
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p
          className={cn(
            'text-3xl font-bold tabular-nums',
            hasItems ? 'text-orange-500' : 'text-foreground'
          )}
        >
          {count}
        </p>
        <p className="text-sm text-muted-foreground mt-1">
          Files awaiting client documents
        </p>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// 3. Files Waiting on IRCC
// ---------------------------------------------------------------------------

export function FilesWaitingIRCCWidget({ tenantId }: WidgetProps) {
  const { data, isLoading } = useFilesWaitingOnIRCC(tenantId)

  if (isLoading) return <ImmigrationStatSkeleton />

  const count = data ?? 0

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <Clock className="h-4 w-4 text-blue-500" />
          Waiting on IRCC
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-3xl font-bold tabular-nums text-blue-500">{count}</p>
        <p className="text-sm text-muted-foreground mt-1">
          Files waiting on IRCC decision
        </p>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// 4. Retainer Conversion
// ---------------------------------------------------------------------------

export function RetainerConversionWidget({ tenantId }: WidgetProps) {
  const { data, isLoading } = useRetainerConversionRate(tenantId)

  if (isLoading) return <ImmigrationStatSkeleton />

  const rate = data?.rate ?? 0
  const signed = data?.signed ?? 0
  const total = data?.total ?? 0

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <TrendingUp className="h-4 w-4 text-emerald-500" />
          Retainer Conversion
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-3xl font-bold tabular-nums text-emerald-500">
          {rate.toFixed(0)}%
        </p>
        <p className="text-sm text-muted-foreground mt-1">
          {signed} of {total} this month
        </p>
        <div className="mt-3 h-2 w-full rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-emerald-500 transition-all"
            style={{ width: `${Math.min(rate, 100)}%` }}
          />
        </div>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// 5. Overdue Risk Items
// ---------------------------------------------------------------------------

export function OverdueRiskWidget({ tenantId }: WidgetProps) {
  const { data, isLoading } = useOverdueRiskItems(tenantId)

  if (isLoading) return <ImmigrationStatSkeleton />

  // data can be a number (legacy) or { overdue, atRisk } object
  const overdueCount = typeof data === 'object' && data !== null
    ? (data as { overdue: number; atRisk: number }).overdue
    : (data ?? 0)
  const atRiskCount = typeof data === 'object' && data !== null
    ? (data as { overdue: number; atRisk: number }).atRisk
    : 0
  const totalCritical = overdueCount + atRiskCount
  const hasCritical = totalCritical > 0

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <AlertTriangle
            className={cn('h-4 w-4', hasCritical ? 'text-red-500' : 'text-emerald-500')}
          />
          Critical Risk
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p
          className={cn(
            'text-3xl font-bold tabular-nums',
            hasCritical ? 'text-red-500' : 'text-emerald-500'
          )}
        >
          {totalCritical}
        </p>
        {hasCritical ? (
          <div className="mt-1 space-y-0.5">
            {overdueCount > 0 && (
              <p className="text-sm text-red-500 font-medium">
                {overdueCount} overdue
              </p>
            )}
            {atRiskCount > 0 && (
              <p className="text-sm text-amber-500 font-medium">
                {atRiskCount} at risk (within 7 days)
              </p>
            )}
          </div>
        ) : (
          <>
            <p className="text-sm text-muted-foreground mt-1">
              No critical deadlines
            </p>
            <div className="flex items-center gap-1 mt-2 text-emerald-500">
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span className="text-xs font-medium">All clear</span>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// 6. Upcoming Deadlines
// ---------------------------------------------------------------------------

function getDeadlineTypeLabel(value: string): string {
  return DEADLINE_TYPES.find((t) => t.value === value)?.label ?? value
}

function getDeadlineTypeColor(value: string): string {
  return DEADLINE_TYPES.find((t) => t.value === value)?.color ?? '#6b7280'
}

function getDeadlineStatusLabel(value: string): string {
  return DEADLINE_STATUSES.find((s) => s.value === value)?.label ?? value
}

function getDeadlineStatusColor(value: string): string {
  return DEADLINE_STATUSES.find((s) => s.value === value)?.color ?? '#6b7280'
}

function getUrgencyColor(dueDate: string): string {
  const days = differenceInDays(new Date(dueDate), new Date())
  if (days < 0) return 'text-red-600 font-semibold'
  if (days <= 3) return 'text-red-500'
  if (days <= 7) return 'text-orange-500'
  if (days <= 14) return 'text-yellow-600'
  return 'text-muted-foreground'
}

export function UpcomingDeadlinesWidget({ tenantId }: WidgetProps) {
  const { data, isLoading } = useAllUpcomingDeadlines(tenantId)

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            Upcoming Deadlines
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between gap-4">
              <div className="space-y-1.5 flex-1">
                <Skeleton className="h-3.5 w-40" />
                <Skeleton className="h-3 w-28" />
              </div>
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
          ))}
        </CardContent>
      </Card>
    )
  }

  const deadlines = (data ?? []).slice(0, 8)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          Upcoming Deadlines
        </CardTitle>
        {deadlines.length > 0 && (
          <CardAction>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/matters">
                View All
                <ArrowRight className="ml-1 h-3.5 w-3.5" />
              </Link>
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent>
        {deadlines.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-6 text-center text-muted-foreground">
            <CheckCircle2 className="h-8 w-8 mb-2 opacity-50" />
            <p className="text-sm">No upcoming deadlines</p>
          </div>
        ) : (
          <ScrollArea className="max-h-[400px]">
            <div className="space-y-3">
              {deadlines.map((deadline) => {
                const urgencyClass = getUrgencyColor(deadline.due_date)
                const daysUntil = differenceInDays(new Date(deadline.due_date), new Date())

                return (
                  <div
                    key={deadline.id}
                    className="flex items-start justify-between gap-3 rounded-md border p-3"
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="text-sm font-medium leading-snug truncate">
                        {deadline.title}
                      </p>
                      {deadline.matter_title && (
                        <p className="text-xs text-muted-foreground truncate">
                          {deadline.matter_title}
                        </p>
                      )}
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={cn('text-xs tabular-nums', urgencyClass)}>
                          {daysUntil < 0
                            ? `${Math.abs(daysUntil)}d overdue`
                            : daysUntil === 0
                              ? 'Due today'
                              : `${daysUntil}d remaining`}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {formatDate(deadline.due_date)}
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                      <Badge
                        variant="outline"
                        className="text-[10px] px-1.5"
                        style={{
                          borderColor: getDeadlineTypeColor(deadline.deadline_type),
                          color: getDeadlineTypeColor(deadline.deadline_type),
                        }}
                      >
                        {getDeadlineTypeLabel(deadline.deadline_type)}
                      </Badge>
                      <Badge
                        variant="secondary"
                        className="text-[10px] px-1.5"
                        style={{
                          backgroundColor: getDeadlineStatusColor(deadline.status) + '1a',
                          color: getDeadlineStatusColor(deadline.status),
                        }}
                      >
                        {getDeadlineStatusLabel(deadline.status)}
                      </Badge>
                    </div>
                  </div>
                )
              })}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// 7. Deadline Risk Summary (replaces OverdueRiskWidget in dashboard)
// ---------------------------------------------------------------------------

export function DeadlineRiskSummaryWidget({ tenantId }: WidgetProps) {
  const { data, isLoading } = useAllUpcomingDeadlines(tenantId)

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <Shield className="h-4 w-4 text-muted-foreground" />
            Deadline Risk Summary
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between gap-4">
              <div className="space-y-1.5 flex-1">
                <Skeleton className="h-3.5 w-40" />
                <Skeleton className="h-3 w-28" />
              </div>
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
          ))}
        </CardContent>
      </Card>
    )
  }

  const deadlines = data ?? []

  // Score each deadline and sort by risk
  const scored = deadlines
    .map((dl) => {
      const result = calculateDeadlineRiskScore(dl)
      return { ...dl, riskScore: result.score, riskLevel: result.level as RiskLevel }
    })
    .sort((a, b) => b.riskScore - a.riskScore)

  const criticalCount = scored.filter((s) => s.riskLevel === 'critical').length
  const highCount = scored.filter((s) => s.riskLevel === 'high').length
  const atRiskTotal = criticalCount + highCount
  const topDeadlines = scored.slice(0, 5)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <Shield
            className={cn(
              'h-4 w-4',
              atRiskTotal > 0 ? 'text-red-500' : 'text-emerald-500'
            )}
          />
          Deadline Risk Summary
        </CardTitle>
        {topDeadlines.length > 0 && (
          <CardAction>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/matters">
                View All
                <ArrowRight className="ml-1 h-3.5 w-3.5" />
              </Link>
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent>
        {atRiskTotal > 0 ? (
          <div className="space-y-1 mb-4">
            <p className={cn(
              'text-3xl font-bold tabular-nums',
              criticalCount > 0 ? 'text-red-500' : 'text-orange-500'
            )}>
              {atRiskTotal}
            </p>
            <p className="text-sm text-muted-foreground">
              {criticalCount > 0 && (
                <span className="text-red-500 font-medium">
                  {criticalCount} critical
                </span>
              )}
              {criticalCount > 0 && highCount > 0 && ', '}
              {highCount > 0 && (
                <span className="text-orange-500 font-medium">
                  {highCount} high risk
                </span>
              )}
            </p>
          </div>
        ) : (
          <div className="mb-4">
            <p className="text-3xl font-bold tabular-nums text-emerald-500">0</p>
            <div className="flex items-center gap-1 mt-1 text-emerald-500">
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span className="text-xs font-medium">No high-risk deadlines</span>
            </div>
          </div>
        )}

        {topDeadlines.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Highest Risk
            </p>
            {topDeadlines.map((dl) => {
              const cfg = getRiskLevelConfig(dl.riskLevel)
              const daysUntil = differenceInDays(new Date(dl.due_date), new Date())
              return (
                <Link
                  key={dl.id}
                  href={`/matters/${dl.matter_id}`}
                  className="flex items-start justify-between gap-2 rounded-md border p-2.5 hover:bg-muted/50 transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium leading-snug truncate">
                      {dl.title}
                    </p>
                    {dl.matter_title && (
                      <p className="text-xs text-muted-foreground truncate">
                        {dl.matter_title}
                      </p>
                    )}
                    <span className={cn('text-xs tabular-nums', getUrgencyColor(dl.due_date))}>
                      {daysUntil < 0
                        ? `${Math.abs(daysUntil)}d overdue`
                        : daysUntil === 0
                          ? 'Due today'
                          : `${daysUntil}d remaining`}
                    </span>
                  </div>
                  <Badge
                    variant="outline"
                    className={cn('text-[10px] shrink-0', cfg.text, cfg.border)}
                  >
                    {dl.riskScore}
                  </Badge>
                </Link>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// 8. Staff Workload
// ---------------------------------------------------------------------------

export function StaffWorkloadWidget({ tenantId }: WidgetProps) {
  const { data, isLoading } = useStaffWorkload(tenantId)

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <Users className="h-4 w-4 text-muted-foreground" />
            Staff Workload
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between gap-4">
                <Skeleton className="h-4 w-28" />
                <div className="flex gap-4">
                  <Skeleton className="h-4 w-12" />
                  <Skeleton className="h-4 w-12" />
                  <Skeleton className="h-4 w-12" />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  const staff = [...(data ?? [])].sort((a, b) => {
    if (b.overdue_tasks !== a.overdue_tasks) return b.overdue_tasks - a.overdue_tasks
    return b.open_tasks - a.open_tasks
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <Users className="h-4 w-4 text-muted-foreground" />
          Staff Workload
        </CardTitle>
      </CardHeader>
      <CardContent>
        {staff.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-6 text-center text-muted-foreground">
            <Users className="h-8 w-8 mb-2 opacity-50" />
            <p className="text-sm">No staff data available</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="pb-2 text-left font-medium">Name</th>
                  <th className="pb-2 text-right font-medium">Active Files</th>
                  <th className="pb-2 text-right font-medium">Open Tasks</th>
                  <th className="pb-2 text-right font-medium">Overdue</th>
                </tr>
              </thead>
              <tbody>
                {staff.map((member) => (
                  <tr key={member.user_id} className="border-b last:border-0">
                    <td className="py-2.5 font-medium">
                      {member.first_name} {member.last_name}
                    </td>
                    <td className="py-2.5 text-right tabular-nums text-muted-foreground">
                      {member.active_matters}
                    </td>
                    <td className="py-2.5 text-right tabular-nums text-muted-foreground">
                      {member.open_tasks}
                    </td>
                    <td className="py-2.5 text-right">
                      {member.overdue_tasks > 0 ? (
                        <Badge variant="destructive" className="text-[10px] px-1.5">
                          {member.overdue_tasks}
                        </Badge>
                      ) : (
                        <span className="tabular-nums text-muted-foreground">0</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Staff Wellness Meter  -  Norva Wellness
// ---------------------------------------------------------------------------

const WELLNESS_CONFIG = {
  healthy:    { label: 'Healthy',    color: 'text-green-700',  bg: 'bg-green-50',  border: 'border-green-200', icon: CheckCircle2 },
  elevated:   { label: 'Elevated',   color: 'text-amber-700',  bg: 'bg-amber-50',  border: 'border-amber-200', icon: AlertTriangle },
  overloaded: { label: 'Overloaded', color: 'text-red-700',    bg: 'bg-red-50',    border: 'border-red-200',   icon: AlertTriangle },
} as const

export function StaffWellnessMeter({ tenantId }: WidgetProps) {
  const { data, isLoading } = useStaffWellness(tenantId)

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <Shield className="h-4 w-4 text-muted-foreground" />
            Staff Wellness
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between gap-4">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-4 w-20" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  const staff = [...(data ?? [])].sort((a, b) => {
    // Overloaded first, then elevated, then healthy
    const statusOrder = { overloaded: 0, elevated: 1, healthy: 2 }
    if (statusOrder[a.wellness_status] !== statusOrder[b.wellness_status]) {
      return statusOrder[a.wellness_status] - statusOrder[b.wellness_status]
    }
    return b.red_matters - a.red_matters
  })

  const alertCount = staff.filter((s) => s.load_balance_alert).length

  return (
    <Card className={alertCount > 0 ? 'border-red-200' : undefined}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <Shield className="h-4 w-4 text-muted-foreground" />
          Norva Wellness Meter
          {alertCount > 0 && (
            <Badge variant="destructive" className="text-[10px] px-1.5 ml-auto">
              {alertCount} Load-Balance {alertCount === 1 ? 'Alert' : 'Alerts'}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {staff.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-6 text-center text-muted-foreground">
            <Shield className="h-8 w-8 mb-2 opacity-50" />
            <p className="text-sm">No staff data available</p>
          </div>
        ) : (
          <div className="space-y-2">
            {staff.map((member) => {
              const config = WELLNESS_CONFIG[member.wellness_status]
              const StatusIcon = config.icon
              return (
                <div
                  key={member.user_id}
                  className={cn(
                    'flex items-center justify-between rounded-md border px-3 py-2',
                    member.load_balance_alert ? `${config.bg} ${config.border}` : 'border-slate-100',
                  )}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-sm font-medium truncate">
                      {member.first_name} {member.last_name}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {member.active_matters} files
                    </span>
                    <span className={cn('text-xs font-semibold tabular-nums', config.color)}>
                      {member.red_matters} red
                    </span>
                    {member.overdue_tasks > 0 && (
                      <Badge variant="destructive" className="text-[10px] px-1.5">
                        {member.overdue_tasks} overdue
                      </Badge>
                    )}
                    <span
                      className={cn(
                        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium',
                        config.color, config.bg, config.border,
                      )}
                    >
                      <StatusIcon className="h-3 w-3" />
                      {config.label}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
