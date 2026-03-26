'use client'

import { useMemo, useCallback, memo } from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { useQuery } from '@tanstack/react-query'
import { format, formatDistanceToNow, differenceInDays, startOfMonth } from 'date-fns'
import {
  Briefcase,
  CheckSquare,
  Users,
  AlertTriangle,
  Plus,
  ArrowRight,
  Calendar,
  Clock,
  FileText,
  Mail,
  Phone,
  MessageSquare,
  Upload,
  RefreshCw,
  Target,
  TrendingUp,
  CircleDot,
  Edit3,
  Trash2,
  PlusCircle,
  History,
  CheckCircle2,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useI18n } from '@/lib/i18n/i18n-provider'
import { useTenant } from '@/lib/hooks/use-tenant'
import { useUser } from '@/lib/hooks/use-user'
import { useUIStore } from '@/lib/stores/ui-store'
import { usePracticeAreaContext } from '@/lib/hooks/use-practice-area-context'
import { useCompleteTask } from '@/lib/queries/tasks'
import { useUpcomingMatterDeadlines } from '@/lib/queries/matter-types'
import { MATTER_STATUSES, PRIORITIES } from '@/lib/utils/constants'
import { formatDate, formatCurrency, isOverdue } from '@/lib/utils/formatters'
import { Card, CardContent, CardHeader, CardTitle, CardAction } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/shared/empty-state'
import { HelperTip } from '@/components/ui/helper-tip'
import { cn } from '@/lib/utils'
import type { Database } from '@/lib/types/database'
// Lazy-load today's appointments widget
const TodaysAppointmentsWidget = dynamic(
  () => import('@/components/dashboard/todays-appointments-widget').then((m) => ({ default: m.TodaysAppointmentsWidget })),
  { loading: () => <ImmigrationWidgetSkeleton /> }
)

// Lazy-load Compliance Health Bar — Directive 41.3
const ComplianceHealthBar = dynamic(
  () => import('@/components/dashboard/compliance-health-bar').then((m) => ({ default: m.ComplianceHealthBar })),
  { loading: () => <></> }
)

// Lazy-load UEE widget
const RiskOverviewWidget = dynamic(
  () => import('@/components/dashboard/risk-overview-widget').then((m) => ({ default: m.RiskOverviewWidget })),
  { loading: () => <ImmigrationWidgetSkeleton /> }
)

// Lazy-load immigration widgets — only rendered when immigration section is visible
const ActiveFilesByStageWidget = dynamic(
  () => import('@/components/immigration/dashboard-widgets').then((m) => ({ default: m.ActiveFilesByStageWidget })),
  { loading: () => <ImmigrationWidgetSkeleton /> }
)
const FilesAwaitingDocsWidget = dynamic(
  () => import('@/components/immigration/dashboard-widgets').then((m) => ({ default: m.FilesAwaitingDocsWidget })),
  { loading: () => <ImmigrationWidgetSkeleton /> }
)
const RetainerConversionWidget = dynamic(
  () => import('@/components/immigration/dashboard-widgets').then((m) => ({ default: m.RetainerConversionWidget })),
  { loading: () => <ImmigrationWidgetSkeleton /> }
)
const DeadlineRiskSummaryWidget = dynamic(
  () => import('@/components/immigration/dashboard-widgets').then((m) => ({ default: m.DeadlineRiskSummaryWidget })),
  { loading: () => <ImmigrationWidgetSkeleton /> }
)
const ImmigrationDeadlinesWidget = dynamic(
  () => import('@/components/immigration/dashboard-widgets').then((m) => ({ default: m.UpcomingDeadlinesWidget })),
  { loading: () => <ImmigrationWidgetSkeleton /> }
)
const StaffWorkloadWidget = dynamic(
  () => import('@/components/immigration/dashboard-widgets').then((m) => ({ default: m.StaffWorkloadWidget })),
  { loading: () => <ImmigrationWidgetSkeleton /> }
)
const StaffWellnessMeter = dynamic(
  () => import('@/components/immigration/dashboard-widgets').then((m) => ({ default: m.StaffWellnessMeter })),
  { loading: () => <ImmigrationWidgetSkeleton /> }
)

// Lazy-load quick-start checklist — only shown for empty tenants
const QuickStartChecklist = dynamic(
  () => import('@/components/dashboard/quick-start-checklist').then((m) => ({ default: m.QuickStartChecklist })),
  { ssr: false }
)

// Lazy-load Welcome Home migration summary — only shown for migrated firms
const WelcomeHomeWidget = dynamic(
  () => import('@/components/dashboard/welcome-home-widget').then((m) => ({ default: m.WelcomeHomeWidget })),
  { ssr: false }
)

// Lazy-load Launch Demo Hook — Directive 29.2: Arjun Mehta first-login CTA
const LaunchDemoHook = dynamic(
  () => import('@/components/dashboard/launch-demo-hook').then((m) => ({ default: m.LaunchDemoHook })),
  { ssr: false }
)

// Lazy-load Action Trident — Directive 0.0: client entry funnel on dashboard
const ActionTrident = dynamic(
  () => import('@/components/front-desk/ActionTrident').then((m) => ({ default: m.ActionTrident })),
  { ssr: false }
)

// Skeleton placeholder used while immigration widgets load
function ImmigrationWidgetSkeleton() {
  return (
    <Card>
      <CardContent className="pt-6">
        <Skeleton className="h-5 w-32 mb-3" />
        <Skeleton className="h-9 w-20 mb-2" />
        <Skeleton className="h-3.5 w-48" />
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Task = Database['public']['Tables']['tasks']['Row']
type Activity = Database['public']['Tables']['activities']['Row']
type AuditLog = Database['public']['Tables']['audit_logs']['Row']
type Matter = Database['public']['Tables']['matters']['Row']
type Lead = Database['public']['Tables']['leads']['Row']
type Pipeline = Database['public']['Tables']['pipelines']['Row']
type PipelineStage = Database['public']['Tables']['pipeline_stages']['Row']

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getActivityIcon(activityType: string) {
  switch (activityType) {
    case 'note_added':
      return FileText
    case 'email_sent':
      return Mail
    case 'call_logged':
      return Phone
    case 'meeting_scheduled':
      return Calendar
    case 'status_changed':
      return RefreshCw
    case 'document_uploaded':
      return Upload
    case 'task_completed':
      return CheckSquare
    default:
      return MessageSquare
  }
}

function getAuditIcon(action: string) {
  switch (action) {
    case 'created': return PlusCircle
    case 'updated': return Edit3
    case 'deleted':
    case 'archived': return Trash2
    case 'stage_changed': return ArrowRight
    case 'completed': return CheckCircle2
    case 'converted': return ArrowRight
    default: return History
  }
}

function getAuditIconColor(action: string): string {
  switch (action) {
    case 'created': return 'text-emerald-600 bg-emerald-50'
    case 'updated': return 'text-blue-600 bg-blue-50'
    case 'deleted':
    case 'archived': return 'text-red-500 bg-red-50'
    case 'stage_changed': return 'text-violet-600 bg-violet-50'
    case 'completed': return 'text-green-600 bg-green-50'
    default: return 'text-muted-foreground bg-muted'
  }
}

function formatAuditTitle(action: string, entityType: string): string {
  const a = action.replace(/_/g, ' ')
  const e = entityType.replace(/_/g, ' ')
  return `${a.charAt(0).toUpperCase() + a.slice(1)} ${e}`
}

function getPriorityColor(priority: string): string {
  const found = PRIORITIES.find((p) => p.value === priority)
  return found?.color ?? '#6b7280'
}

// ---------------------------------------------------------------------------
// Data hooks
// ---------------------------------------------------------------------------

function useDashboardStats(tenantId: string, userId: string, practiceAreaId: string) {
  return useQuery({
    queryKey: ['dashboard', 'stats', tenantId, userId, practiceAreaId],
    queryFn: async () => {
      const supabase = createClient()
      const monthStart = startOfMonth(new Date()).toISOString()
      const today = format(new Date(), 'yyyy-MM-dd')

      // Active matters query — scoped to practice area if filter is active
      let mattersQ = supabase
        .from('matters')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('status', 'active')
      if (practiceAreaId && practiceAreaId !== 'all') {
        mattersQ = mattersQ.eq('practice_area_id', practiceAreaId)
      }

      const [mattersRes, tasksRes, leadsRes, overdueRes] = await Promise.all([
        mattersQ,
        supabase
          .from('tasks')
          .select('*', { count: 'exact', head: true })
          .eq('tenant_id', tenantId)
          .eq('assigned_to', userId)
          .in('status', ['pending', 'in_progress']),
        supabase
          .from('leads')
          .select('*', { count: 'exact', head: true })
          .eq('tenant_id', tenantId)
          .eq('status', 'open')
          .gte('created_at', monthStart),
        supabase
          .from('tasks')
          .select('*', { count: 'exact', head: true })
          .eq('tenant_id', tenantId)
          .eq('assigned_to', userId)
          .not('status', 'in', '("completed","cancelled")')
          .lt('due_date', today),
      ])

      return {
        activeMatterCount: mattersRes.count ?? 0,
        openTaskCount: tasksRes.count ?? 0,
        newLeadCount: leadsRes.count ?? 0,
        overdueTaskCount: overdueRes.count ?? 0,
      }
    },
    enabled: !!tenantId && !!userId,
    staleTime: 2 * 60 * 1000, // 2 minutes
  })
}

/** Lightweight check for Quick Start checklist — contacts + trust accounts */
function useQuickStartStatus(tenantId: string) {
  return useQuery({
    queryKey: ['dashboard', 'quick-start', tenantId],
    queryFn: async () => {
      const supabase = createClient()
      const [contactsRes, trustRes] = await Promise.all([
        supabase
          .from('contacts')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenantId),
        supabase
          .from('trust_bank_accounts')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenantId)
          .eq('is_active', true),
      ])
      return {
        hasContacts: (contactsRes.count ?? 0) > 0,
        hasTrustAccount: (trustRes.count ?? 0) > 0,
      }
    },
    enabled: !!tenantId,
    staleTime: 5 * 60 * 1000, // 5 minutes — reference data
  })
}

function useMyUpcomingTasks(tenantId: string, userId: string) {
  return useQuery({
    queryKey: ['dashboard', 'my-tasks', tenantId, userId],
    queryFn: async () => {
      const supabase = createClient()

      // Fetch tasks without FK join (our manual types don't define Relationships)
      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('assigned_to', userId)
        .in('status', ['pending', 'in_progress', 'waiting'])
        .order('due_date', { ascending: true, nullsFirst: false })
        .limit(10)

      if (error) throw error

      const tasks = data as Task[]

      // Fetch matter titles for tasks that have a matter_id
      const matterIds = [...new Set(tasks.filter((t) => t.matter_id).map((t) => t.matter_id!))]
      let matterMap: Record<string, string> = {}

      if (matterIds.length > 0) {
        const { data: matters } = await supabase
          .from('matters')
          .select('id, title')
          .in('id', matterIds)

        if (matters) {
          matterMap = Object.fromEntries(matters.map((m) => [m.id, m.title]))
        }
      }

      return tasks.map((t) => ({
        ...t,
        matter_title: t.matter_id ? matterMap[t.matter_id] ?? null : null,
      }))
    },
    enabled: !!tenantId && !!userId,
    staleTime: 2 * 60 * 1000,
  })
}

function useRecentActivities(tenantId: string) {
  return useQuery({
    queryKey: ['dashboard', 'activities', tenantId],
    queryFn: async () => {
      const supabase = createClient()

      const { data, error } = await supabase
        .from('activities')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(10)

      if (error) throw error
      return data as Activity[]
    },
    enabled: !!tenantId,
    staleTime: 2 * 60 * 1000,
  })
}

function useRecentAuditLogs(tenantId: string) {
  return useQuery({
    queryKey: ['dashboard', 'audit-logs', tenantId],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('audit_logs')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(10)
      if (error) throw error
      return data as AuditLog[]
    },
    enabled: !!tenantId,
    staleTime: 2 * 60 * 1000,
  })
}

function useUpcomingDeadlines(tenantId: string) {
  return useQuery({
    queryKey: ['dashboard', 'deadlines', tenantId],
    queryFn: async () => {
      const supabase = createClient()
      const today = format(new Date(), 'yyyy-MM-dd')

      // Fetch matters that have an upcoming next_deadline or statute_of_limitations
      const { data, error } = await supabase
        .from('matters')
        .select('id, title, next_deadline, statute_of_limitations, status')
        .eq('tenant_id', tenantId)
        .in('status', ['active', 'intake'])
        .or(`next_deadline.gte.${today},statute_of_limitations.gte.${today}`)
        .order('next_deadline', { ascending: true, nullsFirst: true })
        .limit(20)

      if (error) throw error

      // Compute the effective deadline for each matter and sort
      const withDeadline = (data as Matter[])
        .map((m) => {
          const deadlines = [m.next_deadline, m.statute_of_limitations]
            .filter(Boolean)
            .filter((d) => d! >= today)
            .sort()
          return {
            ...m,
            effectiveDeadline: deadlines[0] ?? null,
          }
        })
        .filter((m) => m.effectiveDeadline)
        .sort(
          (a, b) =>
            new Date(a.effectiveDeadline!).getTime() -
            new Date(b.effectiveDeadline!).getTime()
        )
        .slice(0, 5)

      return withDeadline
    },
    enabled: !!tenantId,
  })
}

function useLeadPipeline(tenantId: string) {
  return useQuery({
    queryKey: ['dashboard', 'pipeline', tenantId],
    queryFn: async () => {
      const supabase = createClient()

      // Fetch all lead pipelines in one query, pick default or first active
      const { data: allPipelines, error: pipelineError } = await supabase
        .from('pipelines')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('pipeline_type', 'lead')
        .eq('is_active', true)
        .order('is_default', { ascending: false })
        .limit(5)

      if (pipelineError) throw pipelineError

      const pipeline = (allPipelines as Pipeline[])?.[0]
      if (!pipeline) return null

      return fetchPipelineData(supabase, pipeline, tenantId)
    },
    enabled: !!tenantId,
    staleTime: 5 * 60 * 1000, // 5 minutes — pipeline data changes infrequently
  })
}

async function fetchPipelineData(
  supabase: ReturnType<typeof createClient>,
  pipeline: Pipeline,
  tenantId: string
) {
  const [stagesRes, leadsRes] = await Promise.all([
    supabase
      .from('pipeline_stages')
      .select('*')
      .eq('pipeline_id', pipeline.id)
      .order('sort_order'),
    supabase
      .from('leads')
      .select('id, stage_id, estimated_value')
      .eq('tenant_id', tenantId)
      .eq('pipeline_id', pipeline.id)
      .eq('status', 'open'),
  ])

  if (stagesRes.error) throw stagesRes.error
  if (leadsRes.error) throw leadsRes.error

  const stages = stagesRes.data as PipelineStage[]
  const leads = leadsRes.data as Pick<Lead, 'id' | 'stage_id' | 'estimated_value'>[]

  const stageData = stages.map((stage) => {
    const stageLeads = leads.filter((l) => l.stage_id === stage.id)
    return {
      name: stage.name,
      count: stageLeads.length,
      color: stage.color,
      value: stageLeads.reduce((sum, l) => sum + (l.estimated_value ?? 0), 0),
    }
  })

  const totalValue = leads.reduce((sum, l) => sum + (l.estimated_value ?? 0), 0)
  const totalLeads = leads.length

  return { pipeline, stageData, totalValue, totalLeads }
}

// MattersByStatusWidget is lazy-loaded (contains recharts ~300KB)
const MattersByStatusWidget = dynamic(
  () => import('@/components/dashboard/matters-by-status-widget'),
  { ssr: false, loading: () => <ChartSkeleton /> }
)

// ---------------------------------------------------------------------------
// Skeleton components
// ---------------------------------------------------------------------------

function StatCardSkeleton() {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-12 w-12 rounded-lg" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-7 w-16" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function TaskListSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 py-2">
          <Skeleton className="h-4 w-4 rounded" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
          <Skeleton className="h-5 w-16" />
        </div>
      ))}
    </div>
  )
}

function ActivityListSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex gap-3 py-2">
          <Skeleton className="h-8 w-8 rounded-full" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-3 w-24" />
          </div>
        </div>
      ))}
    </div>
  )
}

function DeadlineListSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="flex items-center justify-between py-2">
          <div className="space-y-1.5">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-24" />
          </div>
          <Skeleton className="h-5 w-20 rounded-full" />
        </div>
      ))}
    </div>
  )
}

function ChartSkeleton() {
  return (
    <div className="flex items-center justify-center py-8">
      <Skeleton className="h-40 w-40 rounded-full" />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Stat Card
// ---------------------------------------------------------------------------

interface StatCardProps {
  icon: React.ElementType
  label: string
  value: number
  subtitle?: string
  iconBg: string
  iconColor: string
  href?: string
}

const StatCard = memo(function StatCard({ icon: Icon, label, value, subtitle, iconBg, iconColor, href }: StatCardProps) {
  const content = (
    <Card className={href ? 'transition-shadow hover:shadow-md cursor-pointer' : undefined}>
      <CardContent className="pt-6">
        <div className="flex items-center gap-4">
          <div className={cn('flex h-12 w-12 items-center justify-center rounded-lg', iconBg)}>
            <Icon className={cn('h-6 w-6', iconColor)} />
          </div>
          <div>
            <p className="text-sm font-medium text-muted-foreground">{label}</p>
            <p className="text-2xl font-bold tracking-tight">{value}</p>
            {subtitle && (
              <p className="text-xs text-muted-foreground">{subtitle}</p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )

  if (href) {
    return <Link href={href}>{content}</Link>
  }
  return content
})

// ---------------------------------------------------------------------------
// My Tasks Widget
// ---------------------------------------------------------------------------

function MyTasksWidget({
  tenantId,
  userId,
}: {
  tenantId: string
  userId: string
}) {
  const { t } = useI18n()
  const { data: tasks, isLoading } = useMyUpcomingTasks(tenantId, userId)
  const completeTask = useCompleteTask()

  const handleComplete = useCallback(
    (taskId: string) => {
      completeTask.mutate({ id: taskId, userId })
    },
    [completeTask, userId]
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <CheckSquare className="h-4 w-4 text-muted-foreground" />
          {t('dashboard.tasks')}
        </CardTitle>
        <CardAction>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/tasks">
              {t('dashboard.view_all')}
              <ArrowRight className="ml-1 h-3 w-3" />
            </Link>
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <TaskListSkeleton />
        ) : !tasks || tasks.length === 0 ? (
          <EmptyState
            icon={CheckSquare}
            title={t('dashboard.no_pending_tasks')}
            description={t('dashboard.no_pending_tasks_desc')}
          />
        ) : (
          <div className="space-y-1">
            {tasks.map((task) => {
              const overdue = task.due_date ? isOverdue(task.due_date) : false
              const priorityColor = getPriorityColor(task.priority ?? '')
              const matterTitle = (task as Record<string, unknown>).matter_title as string | null

              return (
                <div
                  key={task.id}
                  className="flex items-center gap-3 rounded-md px-2 py-2 hover:bg-muted/50 transition-colors"
                >
                  <Checkbox
                    checked={false}
                    onCheckedChange={() => handleComplete(task.id)}
                    aria-label={`Complete task: ${task.title}`}
                  />
                  <div
                    className="h-2 w-2 rounded-full shrink-0"
                    style={{ backgroundColor: priorityColor }}
                    title={task.priority ?? ''}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{task.title}</p>
                    {matterTitle && (
                      <p className="text-xs text-muted-foreground truncate">
                        {matterTitle}
                      </p>
                    )}
                  </div>
                  {task.due_date && (
                    <span
                      className={cn(
                        'text-xs whitespace-nowrap shrink-0',
                        overdue
                          ? 'font-medium text-destructive'
                          : 'text-muted-foreground'
                      )}
                    >
                      {formatDate(task.due_date)}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Recent Activity Feed
// ---------------------------------------------------------------------------

function RecentActivityWidget({ tenantId }: { tenantId: string }) {
  const { t } = useI18n()
  const { data: activities, isLoading: activitiesLoading } = useRecentActivities(tenantId)
  const { data: auditLogs, isLoading: auditLoading } = useRecentAuditLogs(tenantId)

  const isLoading = activitiesLoading || auditLoading

  // Merge activities and audit logs into a single timeline
  const mergedItems = useMemo(() => {
    const items: Array<{
      id: string
      type: 'activity' | 'audit'
      title: string
      description: string | null
      createdAt: string
      icon: typeof Clock
      iconColor: string
    }> = []

    activities?.forEach((a) => {
      items.push({
        id: `a-${a.id}`,
        type: 'activity',
        title: a.title,
        description: a.description,
        createdAt: a.created_at ?? '',
        icon: getActivityIcon(a.activity_type),
        iconColor: 'text-muted-foreground bg-muted',
      })
    })

    auditLogs?.forEach((log) => {
      const changes = log.changes as Record<string, unknown>
      const desc = Object.keys(changes).length > 0
        ? `Changed: ${Object.keys(changes).join(', ')}`
        : null
      items.push({
        id: `al-${log.id}`,
        type: 'audit',
        title: formatAuditTitle(log.action, log.entity_type),
        description: desc,
        createdAt: log.created_at ?? '',
        icon: getAuditIcon(log.action),
        iconColor: getAuditIconColor(log.action),
      })
    })

    items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    return items.slice(0, 12)
  }, [activities, auditLogs])

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Clock className="h-4 w-4 text-muted-foreground" />
          {t('dashboard.recent_activity')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <ActivityListSkeleton />
        ) : mergedItems.length === 0 ? (
          <EmptyState
            icon={Clock}
            title={t('dashboard.no_recent_activity')}
            description={t('dashboard.no_recent_activity_desc')}
          />
        ) : (
          <div className="space-y-1">
            {mergedItems.map((item) => {
              const Icon = item.icon

              return (
                <div
                  key={item.id}
                  className="flex gap-3 rounded-md px-2 py-2 hover:bg-muted/50 transition-colors"
                >
                  <div className={cn(
                    'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
                    item.iconColor
                  )}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm leading-snug">
                      {item.title}
                    </p>
                    {item.description && (
                      <p className="text-xs text-muted-foreground truncate">
                        {item.description}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {formatDistanceToNow(new Date(item.createdAt), {
                        addSuffix: true,
                      })}
                    </p>
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

// ---------------------------------------------------------------------------
// Upcoming Deadlines Widget (legacy — matters.next_deadline)
// ---------------------------------------------------------------------------

function UpcomingDeadlinesWidget({ tenantId }: { tenantId: string }) {
  const { t } = useI18n()
  const { data: deadlines, isLoading } = useUpcomingDeadlines(tenantId)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          {t('dashboard.upcoming_deadlines')} <HelperTip contentKey="dashboard.upcoming_deadlines" />
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <DeadlineListSkeleton />
        ) : !deadlines || deadlines.length === 0 ? (
          <EmptyState
            icon={Calendar}
            title={t('dashboard.no_upcoming_deadlines')}
            description={t('dashboard.no_upcoming_deadlines_desc')}
          />
        ) : (
          <div className="space-y-1">
            {deadlines.map((matter) => {
              const daysLeft = differenceInDays(
                new Date(matter.effectiveDeadline!),
                new Date()
              )
              const isUrgent = daysLeft < 7

              return (
                <Link
                  key={matter.id}
                  href={`/matters/${matter.id}`}
                  className="flex items-center justify-between rounded-md px-2 py-2.5 hover:bg-muted/50 transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{matter.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(matter.effectiveDeadline!)}
                    </p>
                  </div>
                  <Badge
                    variant={isUrgent ? 'destructive' : 'secondary'}
                    className="ml-2 shrink-0"
                  >
                    {daysLeft === 0
                      ? t('dashboard.deadline_today')
                      : daysLeft === 1
                        ? t('dashboard.deadline_1_day')
                        : t('dashboard.deadline_days').replace('{days}', String(daysLeft))}
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
// Deadlines in 14 Days Widget (typed deadlines from matter_deadlines table)
// Practice-filter-aware.
// ---------------------------------------------------------------------------

function DeadlinesIn14DaysWidget({
  tenantId,
  practiceAreaId,
}: {
  tenantId: string
  practiceAreaId: string
}) {
  const { t } = useI18n()
  const { data: deadlines, isLoading } = useUpcomingMatterDeadlines(tenantId, {
    practiceAreaId: practiceAreaId !== 'all' ? practiceAreaId : null,
    days: 14,
    limit: 8,
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <AlertTriangle className="h-4 w-4 text-orange-500" />
          {t('dashboard.deadlines_14_days')} <HelperTip contentKey="dashboard.upcoming_deadlines" />
        </CardTitle>
        <CardAction>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/matters">
              {t('dashboard.view_all')}
              <ArrowRight className="ml-1 h-3 w-3" />
            </Link>
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <DeadlineListSkeleton />
        ) : !deadlines || deadlines.length === 0 ? (
          <EmptyState
            icon={Calendar}
            title={t('dashboard.no_deadlines_14')}
            description={t('dashboard.no_deadlines_14_desc')}
          />
        ) : (
          <div className="space-y-1">
            {deadlines.map((dl) => {
              const daysLeft = differenceInDays(new Date(dl.due_date), new Date())
              const isUrgent = daysLeft <= 3
              const isWarning = daysLeft <= 7 && !isUrgent

              return (
                <Link
                  key={dl.id}
                  href={`/matters/${dl.matter_id}`}
                  className="flex items-center justify-between rounded-md px-2 py-2 hover:bg-muted/50 transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">
                      {dl.matters?.title ?? t('dashboard.unknown_matter')}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {dl.deadline_type}
                      {dl.description ? ` · ${dl.description}` : ''}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(dl.due_date)}
                    </p>
                  </div>
                  <Badge
                    variant={isUrgent ? 'destructive' : isWarning ? 'outline' : 'secondary'}
                    className={cn(
                      'ml-2 shrink-0',
                      isWarning && 'border-orange-400 text-orange-600 bg-orange-50'
                    )}
                  >
                    {daysLeft === 0 ? t('dashboard.deadline_today') : daysLeft === 1 ? t('dashboard.deadline_1_day') : `${daysLeft}d`}
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
// Pipeline Summary Widget
// ---------------------------------------------------------------------------

function PipelineSummaryWidget({ tenantId }: { tenantId: string }) {
  const { t } = useI18n()
  const { data: pipelineData, isLoading } = useLeadPipeline(tenantId)

  const maxCount = useMemo(() => {
    if (!pipelineData?.stageData) return 0
    return Math.max(...pipelineData.stageData.map((s) => s.count), 1)
  }, [pipelineData])

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Target className="h-4 w-4 text-muted-foreground" />
          {t('dashboard.lead_pipeline')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="space-y-1.5">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-5 w-full rounded" />
              </div>
            ))}
          </div>
        ) : !pipelineData ? (
          <EmptyState
            icon={Target}
            title={t('dashboard.no_lead_pipeline')}
            description={t('dashboard.no_lead_pipeline_desc')}
          />
        ) : (
          <div className="space-y-3">
            {pipelineData.stageData.map((stage) => (
              <div key={stage.name} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-foreground">{stage.name}</span>
                  <span className="text-muted-foreground">{stage.count}</span>
                </div>
                <div className="h-5 w-full rounded bg-muted overflow-hidden">
                  <div
                    className="h-full rounded transition-all duration-500"
                    style={{
                      width: `${Math.max((stage.count / maxCount) * 100, stage.count > 0 ? 8 : 0)}%`,
                      backgroundColor: stage.color ?? undefined,
                    }}
                  />
                </div>
              </div>
            ))}

            <div className="mt-4 flex items-center justify-between border-t pt-3">
              <div className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{pipelineData.totalLeads}</span>{' '}
                {t('dashboard.open_leads')}
              </div>
              <div className="text-xs text-muted-foreground">
                {t('dashboard.pipeline_value')}{' '}
                <span className="font-medium text-foreground">
                  {formatCurrency(pipelineData.totalValue)}
                </span>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// MattersByStatusWidget is defined in components/dashboard/matters-by-status-widget.tsx
// and dynamically imported above (lazy-loads recharts ~300KB)

// ---------------------------------------------------------------------------
// Dashboard Page
// ---------------------------------------------------------------------------

export default function DashboardPage() {
  const { t } = useI18n()
  const { tenant, isLoading: tenantLoading } = useTenant()
  const { appUser, isLoading: userLoading } = useUser()
  const openModal = useUIStore((s) => s.openModal)
  const { filter: activePracticeFilter, isFiltered, isImmigration } = usePracticeAreaContext()

  const tenantId = tenant?.id ?? ''
  const userId = appUser?.id ?? ''
  const firstName = appUser?.first_name ?? 'there'

  const {
    data: stats,
    isLoading: statsLoading,
  } = useDashboardStats(tenantId, userId, activePracticeFilter)

  const { data: quickStart } = useQuickStartStatus(tenantId)

  // Compute date string once per mount (not per render)
  const todayStr = useMemo(() => formatDate(new Date()), [])

  if (tenantLoading || userLoading) {
    return <DashboardSkeleton />
  }

  return (
    <div className="space-y-6">
      {/* ---- Header Section ---- */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">
            {t('dashboard.welcome')}, {firstName}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {todayStr}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => openModal('create-contact')}
          >
            <Plus className="mr-1 h-3.5 w-3.5" />
            {t('dashboard.new_contact')}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => openModal('create-matter')}
          >
            <Plus className="mr-1 h-3.5 w-3.5" />
            {t('dashboard.new_matter')}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => openModal('create-task')}
          >
            <Plus className="mr-1 h-3.5 w-3.5" />
            {t('dashboard.new_task')}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => openModal('create-lead')}
          >
            <Plus className="mr-1 h-3.5 w-3.5" />
            {t('dashboard.new_lead')}
          </Button>
        </div>
      </div>

      {/* ---- Quick Start Checklist (empty-state onboarding) ---- */}
      {quickStart && (
        <QuickStartChecklist
          hasContacts={quickStart.hasContacts}
          hasTrustAccount={quickStart.hasTrustAccount}
        />
      )}

      {/* ---- Launch Demo Hook — Directive 29.2: Arjun Mehta first-login ---- */}
      <LaunchDemoHook tenantId={tenantId} userId={userId} />

      {/* ---- Welcome Home — Migration Summary (Directive 11.1) ---- */}
      <WelcomeHomeWidget tenantId={tenantId} />

      {/* ---- Action Trident — Directive 0.0: Client Entry Funnel ---- */}
      <ActionTrident
        intakeHref="/leads?action=new"
        vaultHref="/documents?action=upload"
        portalHref="/settings/portal"
      />

      {/* ---- Firm Compliance Health — Directive 41.3 ---- */}
      <ComplianceHealthBar />

      {/* ---- Stats Row ---- */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statsLoading ? (
          <>
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
          </>
        ) : (
          <>
            <StatCard
              icon={Briefcase}
              label={t('dashboard.active_matters')}
              value={stats?.activeMatterCount ?? 0}
              subtitle={t('dashboard.currently_open')}
              iconBg="bg-blue-50"
              iconColor="text-blue-600"
              href="/matters"
            />
            <StatCard
              icon={CheckSquare}
              label={t('dashboard.open_tasks')}
              value={stats?.openTaskCount ?? 0}
              subtitle={t('dashboard.assigned_to_you')}
              iconBg="bg-violet-50"
              iconColor="text-violet-600"
              href="/tasks"
            />
            <StatCard
              icon={Users}
              label={t('dashboard.new_leads')}
              value={stats?.newLeadCount ?? 0}
              subtitle={t('dashboard.this_month')}
              iconBg="bg-emerald-50"
              iconColor="text-emerald-600"
              href="/leads"
            />
            <StatCard
              icon={AlertTriangle}
              label={t('dashboard.overdue_tasks')}
              value={stats?.overdueTaskCount ?? 0}
              subtitle={
                (stats?.overdueTaskCount ?? 0) > 0
                  ? t('dashboard.require_attention')
                  : t('dashboard.all_on_track')
              }
              iconBg={(stats?.overdueTaskCount ?? 0) > 0 ? 'bg-red-50' : 'bg-slate-50'}
              iconColor={
                (stats?.overdueTaskCount ?? 0) > 0
                  ? 'text-red-600'
                  : 'text-slate-400'
              }
              href="/tasks"
            />
          </>
        )}
      </div>

      {/* ---- Main Content ---- */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        {/* Left column -- wider */}
        <div className="lg:col-span-3 space-y-6">
          <MyTasksWidget tenantId={tenantId} userId={userId} />
          <RecentActivityWidget tenantId={tenantId} />
        </div>

        {/* Right column -- narrower */}
        <div className="lg:col-span-2 space-y-6">
          <TodaysAppointmentsWidget tenantId={tenantId} userId={userId} />
          <RiskOverviewWidget tenantId={tenantId} practiceAreaId={activePracticeFilter} />
          <DeadlinesIn14DaysWidget tenantId={tenantId} practiceAreaId={activePracticeFilter} />
          <UpcomingDeadlinesWidget tenantId={tenantId} />
          <PipelineSummaryWidget tenantId={tenantId} />
          <MattersByStatusWidget tenantId={tenantId} />
        </div>
      </div>

      {/* ---- Immigration Section (hidden when filtered to non-immigration) ---- */}
      {(!isFiltered || isImmigration) && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-foreground">{t('dashboard.immigration_practice')}</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <ActiveFilesByStageWidget tenantId={tenantId} />
            <FilesAwaitingDocsWidget tenantId={tenantId} />
            <RetainerConversionWidget tenantId={tenantId} />
            <DeadlineRiskSummaryWidget tenantId={tenantId} />
          </div>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <ImmigrationDeadlinesWidget tenantId={tenantId} />
            <StaffWorkloadWidget tenantId={tenantId} />
          </div>
          <StaffWellnessMeter tenantId={tenantId} />
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Full-page skeleton for initial load
// ---------------------------------------------------------------------------

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-7 w-64" />
          <Skeleton className="h-4 w-48" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-8 w-28 rounded-md" />
          <Skeleton className="h-8 w-28 rounded-md" />
          <Skeleton className="h-8 w-24 rounded-md" />
          <Skeleton className="h-8 w-24 rounded-md" />
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCardSkeleton />
        <StatCardSkeleton />
        <StatCardSkeleton />
        <StatCardSkeleton />
      </div>

      {/* Main content */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3 space-y-6">
          <Card>
            <CardHeader>
              <Skeleton className="h-5 w-32" />
            </CardHeader>
            <CardContent>
              <TaskListSkeleton />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <Skeleton className="h-5 w-36" />
            </CardHeader>
            <CardContent>
              <ActivityListSkeleton />
            </CardContent>
          </Card>
        </div>
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <Skeleton className="h-5 w-40" />
            </CardHeader>
            <CardContent>
              <DeadlineListSkeleton />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <Skeleton className="h-5 w-32" />
            </CardHeader>
            <CardContent>
              <ChartSkeleton />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
