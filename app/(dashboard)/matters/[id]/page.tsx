'use client'

import { useState, useMemo, useCallback, memo } from 'react'
import { differenceInDays } from 'date-fns'
import { useParams, useRouter } from 'next/navigation'
import { useTenant } from '@/lib/hooks/use-tenant'
import { useUser } from '@/lib/hooks/use-user'
import { useMatter, useUpdateMatter } from '@/lib/queries/matters'
import { useActivities } from '@/lib/queries/activities'
import { createClient } from '@/lib/supabase/client'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { Database } from '@/lib/types/database'
import {
  MATTER_STATUSES,
  PRIORITIES,
  BILLING_TYPES,
  MATTER_CONTACT_ROLES,
  TASK_STATUSES,
  INVOICE_STATUSES,
  PAYMENT_METHODS,
} from '@/lib/utils/constants'
import {
  formatDate,
  formatRelativeDate,
  formatCurrency,
  formatFullName,
  formatPhoneNumber,
} from '@/lib/utils/formatters'
import { MatterForm } from '@/components/matters/matter-form'
import type { MatterFormValues } from '@/lib/schemas/matter'
import { DocumentUpload } from '@/components/shared/document-upload'
import {
  useTimeEntries,
  useUnbilledTimeEntries,
  useCreateTimeEntry,
  useDeleteTimeEntry,
  useInvoices,
  useCreateInvoice,
  useUpdateInvoiceStatus,
  useDeleteInvoice,
  useRecordPayment,
  type TimeEntry,
  type InvoiceWithMatter,
} from '@/lib/queries/invoicing'
import { TagManager } from '@/components/shared/tag-manager'
import { NotesEditor } from '@/components/shared/notes-editor'
import { ActivityTimeline } from '@/components/shared/activity-timeline'
import { MiniTimeline } from '@/components/shared/mini-timeline'
import { useCreateAuditLog } from '@/lib/queries/audit-logs'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardAction } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  ArrowLeft,
  MoreHorizontal,
  Pencil,
  Archive,
  Trash2,
  Mail,
  Phone,
  Calendar,
  Briefcase,
  FileText,
  MessageSquare,
  Clock,
  Loader2,
  DollarSign,
  Users,
  Hash,
  AlertTriangle,
  CheckCircle2,
  ListTodo,
  ListChecks,
  Shield,
  Plus,
  Plane,
  Settings2,
  Link2,
  Copy,
  ExternalLink,
  RefreshCw,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { ContactSearch } from '@/components/shared/contact-search'
import { TaskCreateDialog } from '@/components/tasks/task-create-dialog'
import { TaskDetailSheet } from '@/components/tasks/task-detail-sheet'
import { useTaskTemplates, useApplyTemplate } from '@/lib/queries/task-templates'
import { CaseInsightsPanel } from '@/components/immigration/case-insights-panel'
import { ImmigrationDetailsPanel } from '@/components/immigration/immigration-details-panel'
import { DocumentChecklistPanel } from '@/components/immigration/document-checklist-panel'
import { DeadlineRiskPanel } from '@/components/immigration/deadline-risk-panel'
import { StageProgressionBar } from '@/components/immigration/stage-progression-bar'
import { StagePipelineBar } from '@/components/matters/stage-pipeline-bar'
import { StageManageSheet } from '@/components/immigration/stage-manage-sheet'
import { usePortalLinks, useCreatePortalLink, useRevokePortalLink, type PortalLinkMetadata } from '@/lib/queries/portal-links'
import { useMatterImmigration, useCaseStages, useMatterChecklistItems } from '@/lib/queries/immigration'
import {
  useMatterDeadlines,
  useDeadlineTypes,
  useCreateMatterDeadline,
  useToggleMatterDeadline,
  useDeleteMatterDeadline,
  useMatterStagePipelines,
  useMatterStages,
  useMatterStageState,
  useAdvanceMatterStage,
} from '@/lib/queries/matter-types'

type Matter = Database['public']['Tables']['matters']['Row']
type MatterContact = Database['public']['Tables']['matter_contacts']['Row']
type Contact = Database['public']['Tables']['contacts']['Row']
type Task = Database['public']['Tables']['tasks']['Row']
type UserRow = Database['public']['Tables']['users']['Row']
type PracticeArea = Database['public']['Tables']['practice_areas']['Row']
type Activity = Database['public']['Tables']['activities']['Row']

// -------------------------------------------------------------------
// Custom hooks for matter-related data
// -------------------------------------------------------------------

function useMatterUsers(tenantId: string) {
  return useQuery({
    queryKey: ['users', tenantId, 'all'],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('users')
        .select('id, tenant_id, auth_user_id, email, first_name, last_name, avatar_url, role_id, is_active')
        .eq('tenant_id', tenantId)
        .eq('is_active', true)
        .order('first_name')

      if (error) throw error
      return data as UserRow[]
    },
    enabled: !!tenantId,
  })
}

function useMatterPracticeArea(practiceAreaId: string | null) {
  return useQuery({
    queryKey: ['practice_area', practiceAreaId],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('practice_areas')
        .select('*')
        .eq('id', practiceAreaId!)
        .single()

      if (error) throw error
      return data as PracticeArea
    },
    enabled: !!practiceAreaId,
  })
}

function useMatterContacts(matterId: string, tenantId: string) {
  return useQuery({
    queryKey: ['matter-contacts', matterId],
    queryFn: async () => {
      const supabase = createClient()

      // Get matter_contacts for this matter
      const { data: matterContacts, error: mcError } = await supabase
        .from('matter_contacts')
        .select('*')
        .eq('matter_id', matterId)
        .eq('tenant_id', tenantId)

      if (mcError) throw mcError
      if (!matterContacts || matterContacts.length === 0) return []

      // Fetch the corresponding contacts
      const contactIds = matterContacts.map((mc: MatterContact) => mc.contact_id)
      const { data: contacts, error: cError } = await supabase
        .from('contacts')
        .select('*')
        .in('id', contactIds)
        .eq('tenant_id', tenantId)

      if (cError) throw cError

      // Combine contact data with role info
      const typedMatterContacts = matterContacts as MatterContact[]
      return (contacts as Contact[]).map((contact) => {
        const mc = typedMatterContacts.find((mc) => mc.contact_id === contact.id)
        return {
          ...contact,
          role: mc?.role ?? 'client',
          is_primary: mc?.is_primary ?? false,
        }
      })
    },
    enabled: !!matterId && !!tenantId,
  })
}

function useMatterTasks(matterId: string, tenantId: string) {
  return useQuery({
    queryKey: ['matter-tasks', matterId],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .eq('matter_id', matterId)
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })

      if (error) throw error
      return data as Task[]
    },
    enabled: !!matterId && !!tenantId,
  })
}

function useDeleteMatter() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient()
      const { error } = await supabase
        .from('matters')
        .update({ status: 'archived' })
        .eq('id', id)

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['matters'] })
      toast.success('Matter archived successfully')
    },
    onError: () => {
      toast.error('Failed to archive matter')
    },
  })
}

// -------------------------------------------------------------------
// Helper functions
// -------------------------------------------------------------------

function getStatusConfig(status: string) {
  const found = MATTER_STATUSES.find((s) => s.value === status)
  return found ?? { label: status, color: '#6b7280' }
}

function getPriorityConfig(priority: string) {
  const found = PRIORITIES.find((p) => p.value === priority)
  return found ?? { label: priority, color: '#6b7280' }
}

function getBillingLabel(billingType: string) {
  const found = BILLING_TYPES.find((b) => b.value === billingType)
  return found?.label ?? billingType
}

function getTaskStatusConfig(status: string) {
  const found = TASK_STATUSES.find((s) => s.value === status)
  return found ?? { label: status, color: '#6b7280' }
}

function getRoleLabel(role: string) {
  const found = MATTER_CONTACT_ROLES.find((r) => r.value === role)
  return found?.label ?? role
}

function getUserName(userId: string | null, users: UserRow[] | undefined): string {
  if (!userId || !users) return '-'
  const user = users.find((u) => u.id === userId)
  if (!user) return '-'
  const name = formatFullName(user.first_name, user.last_name)
  return name || user.email
}

// -------------------------------------------------------------------
// Main page component
// -------------------------------------------------------------------

export default function MatterDetailPage() {
  const params = useParams()
  const router = useRouter()
  const matterId = params.id as string
  const { tenant } = useTenant()
  const { appUser } = useUser()
  const tenantId = tenant?.id ?? ''

  const { data: matter, isLoading, isError } = useMatter(matterId)
  const updateMatter = useUpdateMatter()
  const deleteMatter = useDeleteMatter()
  const createAuditLog = useCreateAuditLog()
  const { data: users } = useMatterUsers(tenantId)
  const { data: practiceArea } = useMatterPracticeArea(matter?.practice_area_id ?? null)
  const { data: immigrationData } = useMatterImmigration(matterId)
  const { data: immigrationStages } = useCaseStages(immigrationData?.case_type_id ?? '')

  // Immigration vs generic pipeline — must be mutually exclusive
  const hasImmigration = !!matter?.case_type_id || !!immigrationData
  const hasGenericPipeline = !!matter?.matter_type_id && !matter?.case_type_id && !immigrationData
  const { data: pipelines } = useMatterStagePipelines(tenantId, hasGenericPipeline ? matter?.matter_type_id : null)
  const defaultPipeline = pipelines?.find((p) => p.is_default) ?? pipelines?.[0]
  const { data: pipelineStages } = useMatterStages(defaultPipeline?.id)
  const { data: stageState } = useMatterStageState(hasGenericPipeline ? matterId : null)
  const advanceStage = useAdvanceMatterStage()

  // Checklist completion & upcoming tasks for the stage bar header
  const { data: checklistItems } = useMatterChecklistItems(hasImmigration ? matterId : '')
  const { data: topTasks } = useMatterTasks(matterId, tenantId)

  const checklistCompletion = useMemo(() => {
    if (!checklistItems || checklistItems.length === 0) return null
    const done = checklistItems.filter((i) => i.status === 'approved' || i.status === 'not_applicable').length
    return Math.round((done / checklistItems.length) * 100)
  }, [checklistItems])

  const upcomingTasks = useMemo(() => {
    if (!topTasks) return []
    return topTasks
      .filter((t) => t.status !== 'done' && t.status !== 'cancelled')
      .sort((a, b) => {
        if (!a.due_date) return 1
        if (!b.due_date) return -1
        return a.due_date.localeCompare(b.due_date)
      })
      .slice(0, 3)
  }, [topTasks])

  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [stageError, setStageError] = useState<string | null>(null)
  const [stageManageOpen, setStageManageOpen] = useState(false)
  const [portalDialogOpen, setPortalDialogOpen] = useState(false)
  const [portalView, setPortalView] = useState<'manage' | 'create'>('manage')
  const [portalExpiryDays, setPortalExpiryDays] = useState('30')
  const [portalMeta, setPortalMeta] = useState<PortalLinkMetadata>({})

  // Portal link hooks
  const { data: portalLinks } = usePortalLinks(matterId)
  const createPortalLink = useCreatePortalLink()
  const revokePortalLink = useRevokePortalLink()
  const activePortalLink = portalLinks?.[0]

  // Reset portal form when dialog opens
  const handlePortalDialogOpen = useCallback((open: boolean) => {
    setPortalDialogOpen(open)
    if (open) {
      setPortalView(activePortalLink ? 'manage' : 'create')
      // Pre-fill lawyer info from current user
      if (!activePortalLink) {
        setPortalMeta({
          lawyer_name: appUser ? `${appUser.first_name ?? ''} ${appUser.last_name ?? ''}`.trim() : '',
          lawyer_email: appUser?.email ?? '',
          lawyer_phone: '',
          welcome_message: '',
          instructions: '',
        })
        setPortalExpiryDays('30')
      }
    }
  }, [activePortalLink, appUser])

  // Build default values for the edit form — must be above early returns to
  // satisfy React's Rules of Hooks (hooks must be called unconditionally).
  const editDefaults = useMemo<Partial<MatterFormValues>>(() => {
    if (!matter) return {}
    return {
      title: matter.title,
      description: matter.description ?? undefined,
      practice_area_id: matter.practice_area_id ?? undefined,
      pipeline_id: matter.pipeline_id ?? undefined,
      stage_id: matter.stage_id ?? undefined,
      responsible_lawyer_id: matter.responsible_lawyer_id ?? undefined,
      originating_lawyer_id: matter.originating_lawyer_id ?? undefined,
      billing_type: (matter.billing_type as MatterFormValues['billing_type']) ?? 'flat_fee',
      hourly_rate: matter.hourly_rate ?? undefined,
      estimated_value: matter.estimated_value ?? undefined,
      priority: (matter.priority as MatterFormValues['priority']) ?? 'medium',
      status: (matter.status as MatterFormValues['status']) ?? 'active',
      statute_of_limitations: matter.statute_of_limitations ?? undefined,
      next_deadline: matter.next_deadline ?? undefined,
    }
  }, [matter])

  // Loading state
  if (isLoading) {
    return <MatterDetailSkeleton />
  }

  // Error state
  if (isError || !matter) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => router.push('/matters')}>
          <ArrowLeft className="mr-2 size-4" />
          Back to Matters
        </Button>
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <p className="text-sm text-destructive">
            Matter not found or failed to load.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-4"
            onClick={() => router.push('/matters')}
          >
            Return to Matters
          </Button>
        </div>
      </div>
    )
  }

  const statusConfig = getStatusConfig(matter.status)
  const priorityConfig = getPriorityConfig(matter.priority)

  function handleUpdate(values: MatterFormValues) {
    updateMatter.mutate(
      {
        id: matterId,
        title: values.title,
        description: values.description || null,
        practice_area_id: values.practice_area_id,
        pipeline_id: values.pipeline_id || null,
        stage_id: values.stage_id || null,
        responsible_lawyer_id: values.responsible_lawyer_id,
        originating_lawyer_id: values.originating_lawyer_id || null,
        billing_type: values.billing_type,
        hourly_rate: values.hourly_rate ?? null,
        estimated_value: values.estimated_value ?? null,
        priority: values.priority,
        status: values.status,
        statute_of_limitations: values.statute_of_limitations || null,
        next_deadline: values.next_deadline || null,
      },
      {
        onSuccess: () => {
          setEditOpen(false)
          createAuditLog.mutate({
            tenant_id: tenantId,
            user_id: appUser?.id || null,
            entity_type: 'matter',
            entity_id: matterId,
            action: 'update',
            changes: values as any,
          })
        },
      }
    )
  }

  function handleArchive() {
    deleteMatter.mutate(matterId, {
      onSuccess: () => {
        router.push('/matters')
      },
    })
  }

  return (
    <div className="space-y-6">
      {/* Back button */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => router.push('/matters')}
      >
        <ArrowLeft className="mr-2 size-4" />
        Back to Matters
      </Button>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold text-slate-900">
              {matter.title}
            </h1>
            {matter.matter_number && (
              <Badge variant="secondary" className="gap-1">
                <Hash className="size-3" />
                {matter.matter_number}
              </Badge>
            )}
          </div>
          <div className="mt-2 flex items-center gap-2">
            <Badge
              variant="secondary"
              style={{
                backgroundColor: `${statusConfig.color}15`,
                color: statusConfig.color,
                borderColor: `${statusConfig.color}30`,
              }}
              className="border"
            >
              {statusConfig.label}
            </Badge>
            <Badge
              variant="secondary"
              style={{
                backgroundColor: `${priorityConfig.color}15`,
                color: priorityConfig.color,
                borderColor: `${priorityConfig.color}30`,
              }}
              className="border"
            >
              {priorityConfig.label} Priority
            </Badge>
            {matter.visibility && matter.visibility !== 'all' && (
              <Badge variant="outline" className="gap-1">
                <Shield className="h-3 w-3" />
                {matter.visibility === 'owner' ? 'Owner Only' : matter.visibility === 'team' ? 'Team' : 'Group'}
              </Badge>
            )}
            {practiceArea && (
              <Badge variant="outline">{practiceArea.name}</Badge>
            )}
          </div>
          <div className="mt-2">
            <TagManager entityType="matter" entityId={matterId} tenantId={tenantId} />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => handlePortalDialogOpen(true)}>
            <Link2 className="mr-2 size-4" />
            Portal Link
          </Button>
          <Button variant="outline" onClick={() => setEditOpen(true)}>
            <Pencil className="mr-2 size-4" />
            Edit
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon">
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setEditOpen(true)}>
                <Pencil className="mr-2 size-4" />
                Edit Matter
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handlePortalDialogOpen(true)}>
                <Link2 className="mr-2 size-4" />
                Client Portal Link
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleArchive}>
                <Archive className="mr-2 size-4" />
                Archive Matter
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => setDeleteOpen(true)}
              >
                <Trash2 className="mr-2 size-4" />
                Delete Matter
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Stage error banner (shared by both pipelines) */}
      {stageError && (
        <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          <span>{stageError}</span>
          <button
            className="ml-auto text-red-400 hover:text-red-600"
            onClick={() => setStageError(null)}
          >
            &times;
          </button>
        </div>
      )}

      {/* Generic Stage Pipeline Bar (non-immigration matters) */}
      {hasGenericPipeline && pipelineStages && pipelineStages.length > 0 && (
        <Card>
          <CardContent className="pt-4 pb-3">
            <StagePipelineBar
              stages={pipelineStages}
              currentStageId={stageState?.current_stage_id ?? null}
              stageEnteredAt={stageState?.entered_at ?? null}
              stageHistory={(Array.isArray(stageState?.stage_history) ? stageState.stage_history : []) as Array<{ stage_id: string; stage_name: string; entered_at: string; exited_at?: string; user_id?: string }>}
              onStageClick={(stageId) => {
                setStageError(null)
                advanceStage.mutate(
                  { matterId, targetStageId: stageId, system: 'generic' },
                  {
                    onError: (error) => {
                      setStageError(error.message)
                    },
                  }
                )
              }}
              disabled={advanceStage.isPending}
              users={users}
            />
          </CardContent>
        </Card>
      )}

      {/* Immigration Stage Progression Bar (always visible for immigration matters) */}
      {hasImmigration && immigrationStages && immigrationStages.length > 0 && immigrationData && (
        <Card className="overflow-hidden">
          <CardContent className="p-0">
            {/* Stage bar row */}
            <div className="flex items-center gap-2 px-4 pt-2.5 pb-1">
              <div className="flex-1 min-w-0">
                <StageProgressionBar
                  stages={immigrationStages}
                  currentStageId={immigrationData.current_stage_id}
                  stageEnteredAt={immigrationData.stage_entered_at}
                  stageHistory={(Array.isArray(immigrationData.stage_history) ? immigrationData.stage_history : []) as Array<{ stage_id: string; stage_name: string; entered_at: string; exited_at?: string; entered_by?: string }>}
                  onStageClick={(stageId) => {
                    setStageError(null)
                    advanceStage.mutate(
                      { matterId, targetStageId: stageId, system: 'immigration' },
                      {
                        onError: (error) => {
                          setStageError(error.message)
                        },
                      }
                    )
                  }}
                  disabled={advanceStage.isPending}
                  users={users}
                />
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 shrink-0 text-slate-400 hover:text-slate-600"
                onClick={() => setStageManageOpen(true)}
                title="Manage stages"
              >
                <Settings2 className="h-3.5 w-3.5" />
              </Button>
            </div>

            {/* Bottom strip: completion + upcoming tasks */}
            <div className="flex items-center gap-3 px-4 py-1.5 bg-slate-50/80 border-t border-slate-100 text-[11px]">
              {/* Checklist completion */}
              {checklistCompletion !== null && (
                <div className="flex items-center gap-1.5">
                  <ListChecks className="h-3 w-3 text-slate-400" />
                  <span className="text-slate-500">Documents</span>
                  <div className="w-16 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                    <div
                      className={cn(
                        'h-full rounded-full transition-all',
                        checklistCompletion >= 100
                          ? 'bg-green-500'
                          : checklistCompletion >= 50
                            ? 'bg-blue-500'
                            : 'bg-amber-500'
                      )}
                      style={{ width: `${Math.min(checklistCompletion, 100)}%` }}
                    />
                  </div>
                  <span className="font-medium text-slate-600 tabular-nums">{checklistCompletion}%</span>
                </div>
              )}

              {/* Divider */}
              {checklistCompletion !== null && upcomingTasks.length > 0 && (
                <div className="h-3 w-px bg-slate-200" />
              )}

              {/* Upcoming tasks */}
              {upcomingTasks.length > 0 && (
                <div className="flex items-center gap-1.5 flex-1 min-w-0">
                  <ListTodo className="h-3 w-3 text-slate-400 shrink-0" />
                  <span className="text-slate-500 shrink-0">Next:</span>
                  <div className="flex items-center gap-2 min-w-0 overflow-hidden">
                    {upcomingTasks.map((task) => (
                      <span
                        key={task.id}
                        className={cn(
                          'truncate max-w-[160px]',
                          task.due_date && new Date(task.due_date) < new Date()
                            ? 'text-red-600 font-medium'
                            : 'text-slate-600'
                        )}
                        title={`${task.title}${task.due_date ? ` — due ${task.due_date}` : ''}`}
                      >
                        {task.title}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Empty state */}
              {checklistCompletion === null && upcomingTasks.length === 0 && (
                <span className="text-slate-400">No checklist or tasks yet</span>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tabs */}
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="contacts">Contacts</TabsTrigger>
          <TabsTrigger value="tasks">Tasks</TabsTrigger>
          <TabsTrigger value="deadlines">Deadlines</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="billing">Billing</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
          <TabsTrigger value="notes">Notes</TabsTrigger>
          {hasImmigration && (
            <TabsTrigger value="immigration">Immigration</TabsTrigger>
          )}
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4">
          <OverviewTab matter={matter} users={users} practiceArea={practiceArea} tenantId={tenantId} matterId={matterId} />
        </TabsContent>

        {/* Contacts Tab */}
        <TabsContent value="contacts">
          <ContactsTab matterId={matterId} tenantId={tenantId} />
        </TabsContent>

        {/* Tasks Tab */}
        <TabsContent value="tasks">
          <TasksTab matterId={matterId} tenantId={tenantId} users={users} practiceAreaId={matter.practice_area_id ?? null} />
        </TabsContent>

        {/* Deadlines Tab */}
        <TabsContent value="deadlines" className="space-y-4">
          <DeadlinesTab
            matterId={matterId}
            tenantId={tenantId}
            practiceAreaId={matter.practice_area_id ?? null}
          />
        </TabsContent>

        {/* Documents Tab */}
        <TabsContent value="documents" className="space-y-4">
          <DocumentUpload entityType="matter" entityId={matterId} tenantId={tenantId} />
        </TabsContent>

        {/* Billing Tab */}
        <TabsContent value="billing" className="space-y-4">
          <BillingTab matterId={matterId} tenantId={tenantId} matter={matter} />
        </TabsContent>

        {/* History Tab */}
        <TabsContent value="history" className="space-y-4">
          <ActivityTimeline tenantId={tenantId} matterId={matterId} entityType="matter" entityId={matterId} />
        </TabsContent>

        {/* Notes Tab */}
        <TabsContent value="notes" className="space-y-4">
          <NotesEditor tenantId={tenantId} matterId={matterId} />
        </TabsContent>

        {/* Immigration Tab */}
        {hasImmigration && (
          <TabsContent value="immigration" className="space-y-6">
            {/* Smart Case Insights */}
            <CaseInsightsPanel matterId={matterId} tenantId={tenantId} />

            {/* Immigration Details */}
            <ImmigrationDetailsPanel matterId={matterId} tenantId={tenantId} />

            {/* Document Checklist and Deadlines side by side */}
            <div className="grid gap-6 lg:grid-cols-2">
              <DocumentChecklistPanel matterId={matterId} tenantId={tenantId} />
              <DeadlineRiskPanel matterId={matterId} tenantId={tenantId} />
            </div>
          </TabsContent>
        )}
      </Tabs>

      {/* Edit Sheet */}
      <Sheet open={editOpen} onOpenChange={setEditOpen}>
        <SheetContent side="right" className="w-full sm:max-w-lg p-0">
          <SheetHeader className="border-b px-6 py-4">
            <SheetTitle>Edit Matter</SheetTitle>
            <SheetDescription>
              Update the details for {matter.title}.
            </SheetDescription>
          </SheetHeader>
          <ScrollArea className="h-[calc(100vh-5rem)]">
            <div className="px-6 py-4">
              <MatterForm
                mode="edit"
                defaultValues={editDefaults}
                onSubmit={handleUpdate}
                isLoading={updateMatter.isPending}
              />
            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Matter</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete {matter.title}? This action will archive the matter and it will no longer appear in your matters list.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                handleArchive()
                setDeleteOpen(false)
              }}
              disabled={deleteMatter.isPending}
            >
              {deleteMatter.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
              Delete Matter
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Portal Link Dialog */}
      <Dialog open={portalDialogOpen} onOpenChange={handlePortalDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Client Document Portal</DialogTitle>
            <DialogDescription>
              {activePortalLink && portalView === 'manage'
                ? 'Manage the portal link for this matter.'
                : 'Configure and generate a secure link for your client to upload documents.'}
            </DialogDescription>
          </DialogHeader>

          {/* ── Manage existing link ── */}
          {activePortalLink && portalView === 'manage' ? (
            <div className="space-y-4 py-2">
              <div className="flex items-center gap-2 p-3 bg-slate-50 rounded-lg border text-sm">
                <code className="flex-1 truncate text-xs text-slate-600">
                  {typeof window !== 'undefined'
                    ? `${window.location.origin}/portal/${activePortalLink.token}`
                    : `/portal/${activePortalLink.token}`}
                </code>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  onClick={() => {
                    navigator.clipboard.writeText(
                      `${window.location.origin}/portal/${activePortalLink.token}`
                    )
                    toast.success('Link copied to clipboard')
                  }}
                >
                  <Copy className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  onClick={() =>
                    window.open(`/portal/${activePortalLink.token}`, '_blank')
                  }
                >
                  <ExternalLink className="h-4 w-4" />
                </Button>
              </div>

              {/* Link info */}
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>
                  Expires: {new Date(activePortalLink.expires_at).toLocaleDateString()}
                </span>
                <span>Accessed: {activePortalLink.access_count} times</span>
              </div>

              {/* Show metadata summary if present */}
              {activePortalLink.metadata && typeof activePortalLink.metadata === 'object' && !Array.isArray(activePortalLink.metadata) && (() => {
                const meta = activePortalLink.metadata as Record<string, string>
                if (!meta.lawyer_name && !meta.welcome_message) return null
                return (
                  <div className="text-xs text-slate-500 space-y-1 border-t pt-3">
                    {meta.lawyer_name && <p>Lawyer: {meta.lawyer_name}</p>}
                    {meta.welcome_message && <p>Message: {meta.welcome_message.slice(0, 60)}{meta.welcome_message.length > 60 ? '...' : ''}</p>}
                  </div>
                )
              })()}

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="text-red-600 hover:text-red-700"
                  onClick={() =>
                    revokePortalLink.mutate({
                      id: activePortalLink.id,
                      matterId,
                    })
                  }
                  disabled={revokePortalLink.isPending}
                >
                  Revoke Link
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPortalView('create')}
                >
                  <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                  Regenerate
                </Button>
              </div>
            </div>
          ) : (
            /* ── Create / Regenerate form ── */
            <div className="space-y-4 py-2">
              {/* Welcome message */}
              <div className="space-y-1.5">
                <Label htmlFor="portal-welcome" className="text-xs">
                  Welcome Message
                </Label>
                <Textarea
                  id="portal-welcome"
                  placeholder="e.g. Thank you for choosing our firm. Please upload the requested documents below."
                  className="text-sm min-h-[60px]"
                  value={portalMeta.welcome_message ?? ''}
                  onChange={(e) =>
                    setPortalMeta((prev) => ({ ...prev, welcome_message: e.target.value }))
                  }
                />
              </div>

              {/* Instructions */}
              <div className="space-y-1.5">
                <Label htmlFor="portal-instructions" className="text-xs">
                  Upload Instructions
                </Label>
                <Textarea
                  id="portal-instructions"
                  placeholder="e.g. Please ensure all documents are clear, legible scans in PDF format. Each file must be under 10 MB."
                  className="text-sm min-h-[60px]"
                  value={portalMeta.instructions ?? ''}
                  onChange={(e) =>
                    setPortalMeta((prev) => ({ ...prev, instructions: e.target.value }))
                  }
                />
              </div>

              {/* Lawyer info row */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="portal-lawyer-name" className="text-xs">
                    Lawyer Name
                  </Label>
                  <Input
                    id="portal-lawyer-name"
                    placeholder="Your name"
                    className="text-sm"
                    value={portalMeta.lawyer_name ?? ''}
                    onChange={(e) =>
                      setPortalMeta((prev) => ({ ...prev, lawyer_name: e.target.value }))
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="portal-lawyer-email" className="text-xs">
                    Contact Email
                  </Label>
                  <Input
                    id="portal-lawyer-email"
                    placeholder="you@firm.com"
                    type="email"
                    className="text-sm"
                    value={portalMeta.lawyer_email ?? ''}
                    onChange={(e) =>
                      setPortalMeta((prev) => ({ ...prev, lawyer_email: e.target.value }))
                    }
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="portal-lawyer-phone" className="text-xs">
                    Contact Phone
                  </Label>
                  <Input
                    id="portal-lawyer-phone"
                    placeholder="+1 (555) 123-4567"
                    className="text-sm"
                    value={portalMeta.lawyer_phone ?? ''}
                    onChange={(e) =>
                      setPortalMeta((prev) => ({ ...prev, lawyer_phone: e.target.value }))
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="portal-expiry" className="text-xs">
                    Link Expiry
                  </Label>
                  <Select
                    value={portalExpiryDays}
                    onValueChange={setPortalExpiryDays}
                  >
                    <SelectTrigger id="portal-expiry" className="text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="7">7 days</SelectItem>
                      <SelectItem value="14">14 days</SelectItem>
                      <SelectItem value="30">30 days</SelectItem>
                      <SelectItem value="60">60 days</SelectItem>
                      <SelectItem value="90">90 days</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex items-center justify-between pt-2">
                {activePortalLink && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setPortalView('manage')}
                  >
                    Cancel
                  </Button>
                )}
                <Button
                  className={!activePortalLink ? 'w-full' : 'ml-auto'}
                  onClick={() => {
                    // Clean empty strings from metadata
                    const cleanMeta: PortalLinkMetadata = {}
                    if (portalMeta.welcome_message?.trim()) cleanMeta.welcome_message = portalMeta.welcome_message.trim()
                    if (portalMeta.instructions?.trim()) cleanMeta.instructions = portalMeta.instructions.trim()
                    if (portalMeta.lawyer_name?.trim()) cleanMeta.lawyer_name = portalMeta.lawyer_name.trim()
                    if (portalMeta.lawyer_email?.trim()) cleanMeta.lawyer_email = portalMeta.lawyer_email.trim()
                    if (portalMeta.lawyer_phone?.trim()) cleanMeta.lawyer_phone = portalMeta.lawyer_phone.trim()

                    const doCreate = () => {
                      createPortalLink.mutate(
                        {
                          tenantId,
                          matterId,
                          createdBy: appUser?.id ?? '',
                          expiryDays: parseInt(portalExpiryDays, 10),
                          metadata: cleanMeta,
                        },
                        { onSuccess: () => setPortalView('manage') }
                      )
                    }

                    if (activePortalLink) {
                      // Revoke old, then create new
                      revokePortalLink.mutate(
                        { id: activePortalLink.id, matterId },
                        { onSuccess: doCreate }
                      )
                    } else {
                      doCreate()
                    }
                  }}
                  disabled={createPortalLink.isPending || revokePortalLink.isPending}
                >
                  {(createPortalLink.isPending || revokePortalLink.isPending) && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  {activePortalLink ? 'Regenerate Portal Link' : 'Generate Portal Link'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Stage Management Sheet (immigration) */}
      {hasImmigration && immigrationStages && immigrationData?.case_type_id && (
        <StageManageSheet
          open={stageManageOpen}
          onOpenChange={setStageManageOpen}
          stages={immigrationStages}
          caseTypeId={immigrationData.case_type_id}
          tenantId={tenantId}
        />
      )}
    </div>
  )
}

// -------------------------------------------------------------------
// Overview Tab
// -------------------------------------------------------------------

function OverviewTab({
  matter,
  users,
  practiceArea,
  tenantId,
  matterId,
}: {
  matter: Matter
  users: UserRow[] | undefined
  practiceArea: PracticeArea | undefined
  tenantId: string
  matterId: string
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {/* Matter Details */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <Briefcase className="size-4 text-muted-foreground" />
            Matter Details
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <InfoRow label="Matter Number" value={matter.matter_number} />
          <InfoRow label="Title" value={matter.title} />
          {matter.description && (
            <InfoRow label="Description" value={matter.description} />
          )}
          <Separator />
          <InfoRow label="Practice Area" value={practiceArea?.name ?? '-'} />
          {matter.matter_type && (
            <InfoRow label="Matter Type" value={matter.matter_type} />
          )}
          <InfoRow
            label="Date Opened"
            value={formatDate(matter.date_opened, 'dd MMM yyyy')}
          />
          {matter.date_closed && (
            <InfoRow
              label="Date Closed"
              value={formatDate(matter.date_closed, 'dd MMM yyyy')}
            />
          )}
          <InfoRow
            label="Created"
            value={formatDate(matter.created_at, 'dd MMM yyyy')}
          />
        </CardContent>
      </Card>

      {/* Assignment */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <Users className="size-4 text-muted-foreground" />
            Assignment
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <InfoRow
            label="Responsible Lawyer"
            value={getUserName(matter.responsible_lawyer_id, users)}
          />
          <InfoRow
            label="Originating Lawyer"
            value={getUserName(matter.originating_lawyer_id, users)}
          />
          {matter.team_member_ids && matter.team_member_ids.length > 0 && (
            <>
              <Separator />
              <div>
                <p className="text-xs text-muted-foreground">Team Members</p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {matter.team_member_ids.map((memberId) => (
                    <Badge key={memberId} variant="secondary" className="text-xs">
                      {getUserName(memberId, users)}
                    </Badge>
                  ))}
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Billing & Financial */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <DollarSign className="size-4 text-muted-foreground" />
            Billing & Financial
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <InfoRow label="Billing Type" value={getBillingLabel(matter.billing_type)} />
          {matter.hourly_rate != null && (
            <InfoRow
              label="Hourly Rate"
              value={formatCurrency(matter.hourly_rate)}
            />
          )}
          <Separator />
          <InfoRow
            label="Estimated Value"
            value={matter.estimated_value != null ? formatCurrency(matter.estimated_value) : '-'}
          />
          {matter.weighted_value != null && (
            <InfoRow
              label="Weighted Value"
              value={formatCurrency(matter.weighted_value)}
            />
          )}
          <Separator />
          <InfoRow
            label="Total Billed"
            value={formatCurrency(matter.total_billed)}
          />
          <InfoRow
            label="Total Paid"
            value={formatCurrency(matter.total_paid)}
          />
          <InfoRow
            label="Trust Balance"
            value={formatCurrency(matter.trust_balance)}
          />
        </CardContent>
      </Card>

      {/* Key Dates */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <Calendar className="size-4 text-muted-foreground" />
            Key Dates
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <InfoRow
            label="Date Opened"
            value={formatDate(matter.date_opened, 'dd MMM yyyy')}
          />
          {matter.date_closed && (
            <InfoRow
              label="Date Closed"
              value={formatDate(matter.date_closed, 'dd MMM yyyy')}
            />
          )}
          <Separator />
          {matter.statute_of_limitations ? (
            <div>
              <p className="text-xs text-muted-foreground">Statute of Limitations</p>
              <div className="flex items-center gap-2">
                <p className="text-sm text-slate-900">
                  {formatDate(matter.statute_of_limitations, 'dd MMM yyyy')}
                </p>
                {new Date(matter.statute_of_limitations) < new Date() && (
                  <Badge variant="destructive" className="text-[10px]">
                    <AlertTriangle className="mr-1 size-3" />
                    Expired
                  </Badge>
                )}
              </div>
            </div>
          ) : (
            <InfoRow label="Statute of Limitations" value="-" />
          )}
          {matter.next_deadline ? (
            <div>
              <p className="text-xs text-muted-foreground">Next Deadline</p>
              <div className="flex items-center gap-2">
                <p className="text-sm text-slate-900">
                  {formatDate(matter.next_deadline, 'dd MMM yyyy')}
                </p>
                {new Date(matter.next_deadline) < new Date() && (
                  <Badge variant="destructive" className="text-[10px]">
                    <AlertTriangle className="mr-1 size-3" />
                    Overdue
                  </Badge>
                )}
              </div>
            </div>
          ) : (
            <InfoRow label="Next Deadline" value="-" />
          )}
          <Separator />
          <InfoRow
            label="Current Stage Since"
            value={formatDate(matter.stage_entered_at, 'dd MMM yyyy')}
          />
        </CardContent>
      </Card>

      {/* Recent Activity — spans full width */}
      <Card className="md:col-span-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <Clock className="size-4 text-muted-foreground" />
            Recent Activity
          </CardTitle>
        </CardHeader>
        <CardContent>
          <MiniTimeline
            tenantId={tenantId}
            entityType="matter"
            entityId={matterId}
            matterId={matterId}
            limit={6}
          />
        </CardContent>
      </Card>
    </div>
  )
}

// -------------------------------------------------------------------
// Contacts Tab
// -------------------------------------------------------------------

function ContactsTab({
  matterId,
  tenantId,
}: {
  matterId: string
  tenantId: string
}) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { data: contacts, isLoading } = useMatterContacts(matterId, tenantId)

  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [selectedContactId, setSelectedContactId] = useState('')
  const [selectedRole, setSelectedRole] = useState('client')
  const [isPrimary, setIsPrimary] = useState(false)
  const [isLinking, setIsLinking] = useState(false)

  async function handleAddContact() {
    if (!selectedContactId) return
    setIsLinking(true)
    try {
      const supabase = createClient()
      const { error } = await supabase.from('matter_contacts').insert({
        tenant_id: tenantId,
        matter_id: matterId,
        contact_id: selectedContactId,
        role: selectedRole,
        is_primary: isPrimary,
      })
      if (error) throw error
      queryClient.invalidateQueries({ queryKey: ['matter-contacts', matterId] })
      setAddDialogOpen(false)
      setSelectedContactId('')
      setSelectedRole('client')
      setIsPrimary(false)
      toast.success('Contact added to matter')
    } catch {
      toast.error('Failed to add contact')
    } finally {
      setIsLinking(false)
    }
  }

  async function handleRemoveContact(contactId: string) {
    try {
      const supabase = createClient()
      const { error } = await supabase
        .from('matter_contacts')
        .delete()
        .eq('matter_id', matterId)
        .eq('contact_id', contactId)
        .eq('tenant_id', tenantId)
      if (error) throw error
      queryClient.invalidateQueries({ queryKey: ['matter-contacts', matterId] })
      toast.success('Contact removed from matter')
    } catch {
      toast.error('Failed to remove contact')
    }
  }

  // IDs of contacts already linked
  const linkedContactIds = contacts?.map((c) => c.id) ?? []

  return (
    <>
      {/* Action bar */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-muted-foreground">
          {isLoading ? '' : `${contacts?.length ?? 0} contacts`}
        </p>
        <Button size="sm" onClick={() => setAddDialogOpen(true)}>
          <Plus className="mr-1.5 size-4" />
          Add Contact
        </Button>
      </div>

      {isLoading ? (
        <Card>
          <CardContent className="py-6">
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4">
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-5 w-16 rounded-full" />
                  <Skeleton className="h-4 w-24" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : !contacts || contacts.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Users className="mx-auto mb-3 size-10 text-muted-foreground/50" />
            <p className="text-sm font-medium text-slate-900">
              No linked contacts
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              This matter does not have any linked contacts yet.
            </p>
            <Button
              size="sm"
              className="mt-4"
              onClick={() => setAddDialogOpen(true)}
            >
              <Plus className="mr-1.5 size-4" />
              Add First Contact
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {contacts.map((contact) => {
                const displayName =
                  contact.contact_type === 'organization'
                    ? contact.organization_name ?? 'Unnamed Organisation'
                    : formatFullName(contact.first_name, contact.last_name) || 'Unnamed Contact'
                return (
                  <TableRow
                    key={contact.id}
                    className="cursor-pointer hover:bg-slate-50"
                    onClick={() => router.push(`/contacts/${contact.id}`)}
                  >
                    <TableCell className="font-medium text-slate-900">
                      {displayName}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="text-slate-600">
                          {getRoleLabel(contact.role)}
                        </span>
                        {contact.is_primary && (
                          <Badge variant="outline" className="text-[10px]">
                            Primary
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-slate-600">
                      {contact.email_primary ?? '-'}
                    </TableCell>
                    <TableCell className="text-slate-600">
                      {contact.phone_primary
                        ? formatPhoneNumber(contact.phone_primary)
                        : '-'}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleRemoveContact(contact.id)
                        }}
                        title="Remove contact from matter"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Add Contact Dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Contact to Matter</DialogTitle>
            <DialogDescription>
              Search for an existing contact or create a new one to link to this matter.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium text-slate-700 mb-1.5 block">
                Contact *
              </label>
              <ContactSearch
                value={selectedContactId}
                onChange={setSelectedContactId}
                tenantId={tenantId}
                placeholder="Search contacts..."
              />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700 mb-1.5 block">
                Role *
              </label>
              <Select value={selectedRole} onValueChange={setSelectedRole}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent>
                  {MATTER_CONTACT_ROLES.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="is-primary"
                checked={isPrimary}
                onCheckedChange={(checked) => setIsPrimary(!!checked)}
              />
              <label htmlFor="is-primary" className="text-sm text-slate-600">
                Primary contact
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleAddContact}
              disabled={!selectedContactId || isLinking}
            >
              {isLinking && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Add Contact
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

// -------------------------------------------------------------------
// Tasks Tab
// -------------------------------------------------------------------

function TasksTab({
  matterId,
  tenantId,
  users,
  practiceAreaId,
}: {
  matterId: string
  tenantId: string
  users: UserRow[] | undefined
  practiceAreaId: string | null
}) {
  const { appUser } = useUser()
  const { data: tasks, isLoading } = useMatterTasks(matterId, tenantId)
  const { data: templates } = useTaskTemplates(tenantId)
  const applyTemplate = useApplyTemplate()

  const [createOpen, setCreateOpen] = useState(false)
  const [templateOpen, setTemplateOpen] = useState(false)
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)

  // Filter templates by practice area (memoized to avoid array recreation)
  const filteredTemplates = useMemo(
    () => templates?.filter(
      (t) => !practiceAreaId || !t.practice_area_id || t.practice_area_id === practiceAreaId
    ) ?? [],
    [templates, practiceAreaId]
  )

  function handleTaskClick(taskId: string) {
    setSelectedTaskId(taskId)
    setDetailOpen(true)
  }

  function handleApplyTemplate(templateId: string) {
    if (!appUser) return
    applyTemplate.mutate(
      {
        tenantId,
        matterId,
        templateId,
        createdBy: appUser.id,
      },
      {
        onSuccess: () => {
          setTemplateOpen(false)
        },
      }
    )
  }

  return (
    <>
      {/* Action bar */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-muted-foreground">
          {isLoading ? '' : `${tasks?.length ?? 0} tasks`}
        </p>
        <div className="flex items-center gap-2">
          {filteredTemplates.length > 0 && (
            <Button size="sm" variant="outline" onClick={() => setTemplateOpen(true)}>
              <ListChecks className="mr-1.5 size-4" />
              Apply Template
            </Button>
          )}
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="mr-1.5 size-4" />
            Create Task
          </Button>
        </div>
      </div>

      {isLoading ? (
        <Card>
          <CardContent className="py-6">
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4">
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-5 w-16 rounded-full" />
                  <Skeleton className="h-4 w-24" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : !tasks || tasks.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <ListTodo className="mx-auto mb-3 size-10 text-muted-foreground/50" />
            <p className="text-sm font-medium text-slate-900">
              No tasks
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              There are no tasks associated with this matter yet.
            </p>
            <div className="mt-4 flex items-center justify-center gap-2">
              {filteredTemplates.length > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setTemplateOpen(true)}
                >
                  <ListChecks className="mr-1.5 size-4" />
                  Apply Template
                </Button>
              )}
              <Button
                size="sm"
                onClick={() => setCreateOpen(true)}
              >
                <Plus className="mr-1.5 size-4" />
                Create First Task
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Due Date</TableHead>
                <TableHead>Assigned To</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tasks.map((task) => {
                const taskStatusConfig = getTaskStatusConfig(task.status)
                const taskPriorityConfig = getPriorityConfig(task.priority)
                return (
                  <TableRow
                    key={task.id}
                    className="cursor-pointer"
                    onClick={() => handleTaskClick(task.id)}
                  >
                    <TableCell className="font-medium text-slate-900">
                      <div className="flex items-center gap-2">
                        {task.status === 'done' && (
                          <CheckCircle2 className="size-4 text-green-500" />
                        )}
                        {task.title}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="secondary"
                        style={{
                          backgroundColor: `${taskStatusConfig.color}15`,
                          color: taskStatusConfig.color,
                          borderColor: `${taskStatusConfig.color}30`,
                        }}
                        className="border"
                      >
                        {taskStatusConfig.label}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="secondary"
                        style={{
                          backgroundColor: `${taskPriorityConfig.color}15`,
                          color: taskPriorityConfig.color,
                          borderColor: `${taskPriorityConfig.color}30`,
                        }}
                        className="border"
                      >
                        {taskPriorityConfig.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-slate-600">
                      {task.due_date ? (
                        <div className="flex items-center gap-1">
                          {formatDate(task.due_date, 'dd MMM yyyy')}
                          {new Date(task.due_date) < new Date() &&
                            task.status !== 'completed' &&
                            task.status !== 'cancelled' && (
                              <AlertTriangle className="size-3.5 text-red-500" />
                            )}
                        </div>
                      ) : (
                        '-'
                      )}
                    </TableCell>
                    <TableCell className="text-slate-600">
                      {getUserName(task.assigned_to, users)}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Create Task Dialog (pre-filled with this matter) */}
      <TaskCreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        matterId={matterId}
      />

      {/* Task Detail Sheet */}
      <TaskDetailSheet
        taskId={selectedTaskId}
        open={detailOpen}
        onOpenChange={setDetailOpen}
      />

      {/* Apply Template Dialog */}
      <Dialog open={templateOpen} onOpenChange={setTemplateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Apply Task Template</DialogTitle>
            <DialogDescription>
              Select a template to create tasks for this matter. Tasks will be created with due dates relative to today.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-80 overflow-y-auto space-y-2 py-2">
            {filteredTemplates.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                No templates available. Create templates in Settings → Task Templates.
              </p>
            ) : (
              filteredTemplates.map((template) => (
                <button
                  key={template.id}
                  type="button"
                  className="flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-muted/50 disabled:opacity-50"
                  onClick={() => handleApplyTemplate(template.id)}
                  disabled={applyTemplate.isPending}
                >
                  <ListChecks className="mt-0.5 size-5 shrink-0 text-primary" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{template.name}</p>
                    {template.description && (
                      <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
                        {template.description}
                      </p>
                    )}
                  </div>
                  {applyTemplate.isPending && (
                    <Loader2 className="size-4 animate-spin text-muted-foreground" />
                  )}
                </button>
              ))
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTemplateOpen(false)}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

// -------------------------------------------------------------------
// Helper components
// -------------------------------------------------------------------

function InfoRow({
  label,
  value,
}: {
  label: string
  value: string | null | undefined
}) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm text-slate-900">{value || '-'}</p>
    </div>
  )
}

// -------------------------------------------------------------------
// Skeleton
// -------------------------------------------------------------------

// -------------------------------------------------------------------
// Deadlines Tab — Key Deadlines panel with typed deadline catalog
// -------------------------------------------------------------------

type MatterDeadlineRow = Database['public']['Tables']['matter_deadlines']['Row']
type DeadlineTypeRow = Database['public']['Tables']['deadline_types']['Row']

function DeadlinesTab({
  matterId,
  tenantId,
  practiceAreaId,
}: {
  matterId: string
  tenantId: string
  practiceAreaId: string | null
}) {
  const [showForm, setShowForm] = useState(false)
  const [newDate, setNewDate] = useState('')
  const [newTypeId, setNewTypeId] = useState<string>('')
  const [newDescription, setNewDescription] = useState('')

  const { data: deadlines, isLoading } = useMatterDeadlines(tenantId, matterId)
  const { data: deadlineTypes } = useDeadlineTypes(tenantId, practiceAreaId)
  const createDeadline = useCreateMatterDeadline()
  const toggleDeadline = useToggleMatterDeadline()
  const deleteDeadline = useDeleteMatterDeadline()

  const selectedType = deadlineTypes?.find((dt) => dt.id === newTypeId)

  function handleAdd() {
    if (!newDate) return
    createDeadline.mutate(
      {
        tenantId,
        matterId,
        deadlineTypeId: newTypeId || null,
        deadlineType: selectedType?.name ?? 'General',
        deadlineDate: newDate,
        description: newDescription || null,
        title: selectedType?.name ?? 'Deadline',
      },
      {
        onSuccess: () => {
          setShowForm(false)
          setNewDate('')
          setNewTypeId('')
          setNewDescription('')
        },
      }
    )
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full rounded-md" />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <AlertTriangle className="h-4 w-4 text-orange-500" />
            Key Deadlines
          </CardTitle>
          <CardAction>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowForm((v) => !v)}
            >
              <Plus className="mr-1 h-3.5 w-3.5" />
              Add Deadline
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Add form */}
          {showForm && (
            <div className="rounded-lg border bg-slate-50 p-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Deadline Type
                  </label>
                  <Select value={newTypeId} onValueChange={setNewTypeId}>
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue placeholder="Select type (optional)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">— None —</SelectItem>
                      {deadlineTypes?.map((dt) => (
                        <SelectItem key={dt.id} value={dt.id}>
                          <div className="flex items-center gap-2">
                            <span
                              className="h-2 w-2 rounded-full shrink-0"
                              style={{ backgroundColor: dt.color }}
                            />
                            {dt.name}
                            {dt.is_hard && (
                              <Badge variant="destructive" className="text-[10px] py-0 px-1">HARD</Badge>
                            )}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Date *
                  </label>
                  <Input
                    type="date"
                    value={newDate}
                    onChange={(e) => setNewDate(e.target.value)}
                    className="h-9 text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Notes (optional)
                </label>
                <Input
                  placeholder="e.g. Closing at 3pm"
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  className="h-9 text-sm"
                />
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  onClick={handleAdd}
                  disabled={!newDate || createDeadline.isPending}
                >
                  {createDeadline.isPending ? 'Saving…' : 'Save'}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setShowForm(false)
                    setNewDate('')
                    setNewTypeId('')
                    setNewDescription('')
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {/* List */}
          {!deadlines || deadlines.length === 0 ? (
            <div className="py-8 text-center">
              <Calendar className="mx-auto mb-2 h-8 w-8 text-slate-300" />
              <p className="text-sm text-muted-foreground">No deadlines added yet.</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Add key deadlines to track important dates for this matter.
              </p>
            </div>
          ) : (
            <div className="divide-y">
              {deadlines.map((dl: MatterDeadlineRow) => {
                const today = new Date().toISOString().split('T')[0]
                const isComplete = dl.status === 'completed' || dl.status === 'dismissed'
                const daysLeft = differenceInDays(new Date(dl.due_date), new Date())
                const isOverdue = dl.due_date < today && !isComplete
                const isUrgent = daysLeft >= 0 && daysLeft <= 3 && !isComplete
                const isWarning = daysLeft > 3 && daysLeft <= 7 && !isComplete

                return (
                  <div
                    key={dl.id}
                    className={cn(
                      'flex items-start gap-3 py-3',
                      isComplete && 'opacity-50'
                    )}
                  >
                    <Checkbox
                      checked={isComplete}
                      onCheckedChange={(checked) =>
                        toggleDeadline.mutate({
                          id: dl.id,
                          tenantId,
                          matterId,
                          isCompleted: !!checked,
                        })
                      }
                      className="mt-0.5 shrink-0"
                      aria-label={`Mark deadline ${dl.title} as ${isComplete ? 'incomplete' : 'complete'}`}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            'text-sm font-medium',
                            isComplete && 'line-through text-muted-foreground'
                          )}
                        >
                          {dl.title}
                        </span>
                        {isOverdue && (
                          <Badge variant="destructive" className="text-xs">Overdue</Badge>
                        )}
                        {isUrgent && !isOverdue && (
                          <Badge variant="destructive" className="text-xs">{daysLeft}d</Badge>
                        )}
                        {isWarning && (
                          <Badge variant="outline" className="text-xs border-orange-400 text-orange-600 bg-orange-50">
                            {daysLeft}d
                          </Badge>
                        )}
                      </div>
                      {dl.description && (
                        <p className="text-xs text-muted-foreground mt-0.5">{dl.description}</p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        {formatDate(dl.due_date, 'EEEE, MMMM d, yyyy')}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={() =>
                        deleteDeadline.mutate({ id: dl.id, tenantId, matterId })
                      }
                      aria-label="Delete deadline"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// ── Billing Tab ──────────────────────────────────────────────────────────────

type MatterRow = Database['public']['Tables']['matters']['Row']

function fmtCents(cents: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(cents / 100)
}

function BillingTab({ matterId, tenantId, matter }: { matterId: string; tenantId: string; matter: MatterRow }) {
  const { appUser } = useUser()
  const [showLogTime, setShowLogTime] = useState(false)
  const [showCreateInvoice, setShowCreateInvoice] = useState(false)
  const [showPayment, setShowPayment] = useState<string | null>(null)

  // Time entry form state
  const [teHours, setTeHours] = useState('')
  const [teMinutes, setTeMinutes] = useState('')
  const [teDesc, setTeDesc] = useState('')
  const [teRate, setTeRate] = useState(matter.hourly_rate?.toString() ?? '')
  const [teBillable, setTeBillable] = useState(true)

  // Invoice form state
  const [invNotes, setInvNotes] = useState('')
  const [invDueDays, setInvDueDays] = useState('30')
  const [selectedEntries, setSelectedEntries] = useState<Set<string>>(new Set())

  // Payment form state
  const [payAmount, setPayAmount] = useState('')
  const [payMethod, setPayMethod] = useState('bank_transfer')
  const [payRef, setPayRef] = useState('')

  const { data: timeEntries = [], isLoading: teLoading } = useTimeEntries(tenantId, matterId)
  const { data: unbilledEntries = [] } = useUnbilledTimeEntries(tenantId, matterId)
  const { data: invoices = [], isLoading: invLoading } = useInvoices(tenantId, matterId)
  const createTimeEntry = useCreateTimeEntry()
  const deleteTimeEntry = useDeleteTimeEntry()
  const createInvoice = useCreateInvoice()
  const updateStatus = useUpdateInvoiceStatus()
  const deleteInvoice = useDeleteInvoice()
  const recordPayment = useRecordPayment()

  const outstanding = (matter.total_billed ?? 0) - (matter.total_paid ?? 0)

  // ── Log Time Handler ──
  const handleLogTime = async () => {
    const totalMin = (parseInt(teHours || '0') * 60) + parseInt(teMinutes || '0')
    if (totalMin <= 0 || !teDesc.trim()) return
    await createTimeEntry.mutateAsync({
      tenant_id: tenantId,
      matter_id: matterId,
      user_id: appUser?.id ?? '',
      duration_minutes: totalMin,
      description: teDesc.trim(),
      is_billable: teBillable,
      hourly_rate: teRate ? parseFloat(teRate) : undefined,
    })
    setTeHours(''); setTeMinutes(''); setTeDesc(''); setShowLogTime(false)
  }

  // ── Create Invoice Handler ──
  const handleCreateInvoice = async () => {
    const entries = unbilledEntries.filter((e) => selectedEntries.has(e.id))
    if (entries.length === 0) return
    const now = new Date()
    const dueDate = new Date(now.getTime() + parseInt(invDueDays) * 86400000)
    const invoiceNumber = `INV-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`

    const lineItems = entries.map((e) => ({
      description: e.description,
      quantity: Math.round((e.duration_minutes / 60) * 100) / 100,
      unitPrice: Math.round((e.hourly_rate ?? matter.hourly_rate ?? 0) * 100),
      timeEntryId: e.id,
    }))

    await createInvoice.mutateAsync({
      tenantId,
      matterId,
      invoiceNumber,
      issueDate: now.toISOString().split('T')[0],
      dueDate: dueDate.toISOString().split('T')[0],
      notes: invNotes || undefined,
      lineItems,
    })
    setSelectedEntries(new Set()); setInvNotes(''); setShowCreateInvoice(false)
  }

  // ── Record Payment Handler ──
  const handleRecordPayment = async () => {
    if (!showPayment) return
    const amountCents = Math.round(parseFloat(payAmount) * 100)
    if (isNaN(amountCents) || amountCents <= 0) return
    await recordPayment.mutateAsync({
      tenant_id: tenantId,
      invoice_id: showPayment,
      amount: amountCents,
      payment_method: payMethod,
      reference: payRef || undefined,
    })
    setPayAmount(''); setPayRef(''); setShowPayment(null)
  }

  const toggleEntry = (id: string) => {
    setSelectedEntries((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const selectAllUnbilled = () => {
    setSelectedEntries(new Set(unbilledEntries.map((e) => e.id)))
  }

  const invoiceStatusColor = (status: string) => INVOICE_STATUSES.find((s) => s.value === status)?.color ?? '#6b7280'
  const invoiceStatusLabel = (status: string) => INVOICE_STATUSES.find((s) => s.value === status)?.label ?? status

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Total Billed</p><p className="text-lg font-semibold">{formatCurrency(matter.total_billed)}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Total Paid</p><p className="text-lg font-semibold">{formatCurrency(matter.total_paid)}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Outstanding</p><p className="text-lg font-semibold">{formatCurrency(outstanding)}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Trust Balance</p><p className="text-lg font-semibold">{formatCurrency(matter.trust_balance)}</p></CardContent></Card>
      </div>

      {/* Time Entries Section */}
      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-semibold">Time Entries</CardTitle>
          <Button size="sm" variant="outline" onClick={() => setShowLogTime(true)}>
            <Plus className="mr-1 h-3.5 w-3.5" /> Log Time
          </Button>
        </CardHeader>
        <CardContent>
          {teLoading ? (
            <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
          ) : timeEntries.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No time entries yet</p>
          ) : (
            <div className="space-y-1">
              <div className="grid grid-cols-[80px_60px_70px_70px_1fr_60px_50px] gap-2 px-2 py-1.5 text-xs font-medium text-muted-foreground border-b">
                <span>Date</span><span>Duration</span><span>Rate</span><span>Amount</span><span>Description</span><span>Billable</span><span></span>
              </div>
              {timeEntries.slice(0, 30).map((te) => {
                const hrs = Math.floor(te.duration_minutes / 60)
                const mins = te.duration_minutes % 60
                const amount = te.hourly_rate ? (te.duration_minutes / 60) * Number(te.hourly_rate) : 0
                return (
                  <div key={te.id} className="grid grid-cols-[80px_60px_70px_70px_1fr_60px_50px] gap-2 px-2 py-2 text-sm items-center rounded hover:bg-slate-50">
                    <span className="text-xs">{formatDate(te.entry_date)}</span>
                    <span className="text-xs">{hrs}h {mins > 0 ? `${mins}m` : ''}</span>
                    <span className="text-xs">{te.hourly_rate ? `$${Number(te.hourly_rate).toFixed(0)}` : '—'}</span>
                    <span className="text-xs font-medium">{amount > 0 ? `$${amount.toFixed(2)}` : '—'}</span>
                    <span className="text-xs truncate">{te.description}</span>
                    <span>{te.is_billable ? <Badge variant="outline" className="text-xs py-0">{te.is_billed ? 'Billed' : 'Yes'}</Badge> : <span className="text-xs text-muted-foreground">No</span>}</span>
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => deleteTimeEntry.mutate(te.id)} disabled={te.is_billed}><Trash2 className="h-3 w-3" /></Button>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Invoices Section */}
      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-semibold">Invoices</CardTitle>
          <Button size="sm" onClick={() => { selectAllUnbilled(); setShowCreateInvoice(true) }} disabled={unbilledEntries.length === 0}>
            <Plus className="mr-1 h-3.5 w-3.5" /> Create Invoice
          </Button>
        </CardHeader>
        <CardContent>
          {invLoading ? (
            <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
          ) : invoices.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No invoices yet</p>
          ) : (
            <div className="space-y-1">
              <div className="grid grid-cols-[90px_80px_90px_90px_80px_1fr] gap-2 px-2 py-1.5 text-xs font-medium text-muted-foreground border-b">
                <span>Invoice #</span><span>Date</span><span>Amount</span><span>Paid</span><span>Status</span><span>Actions</span>
              </div>
              {invoices.map((inv) => (
                <div key={inv.id} className="grid grid-cols-[90px_80px_90px_90px_80px_1fr] gap-2 px-2 py-2 text-sm items-center rounded hover:bg-slate-50">
                  <span className="font-mono text-xs">{inv.invoice_number}</span>
                  <span className="text-xs">{formatDate(inv.issue_date)}</span>
                  <span className="text-xs font-medium">{fmtCents(inv.total_amount)}</span>
                  <span className="text-xs">{fmtCents(inv.amount_paid)}</span>
                  <Badge variant="outline" className="text-xs py-0 w-fit" style={{ borderColor: invoiceStatusColor(inv.status), color: invoiceStatusColor(inv.status) }}>
                    {invoiceStatusLabel(inv.status)}
                  </Badge>
                  <div className="flex gap-1">
                    {inv.status === 'draft' && (
                      <>
                        <Button variant="ghost" size="sm" className="h-6 text-xs px-2" onClick={() => updateStatus.mutate({ id: inv.id, status: 'sent' })}>Send</Button>
                        <Button variant="ghost" size="sm" className="h-6 text-xs px-2 text-red-500" onClick={() => deleteInvoice.mutate(inv.id)}>Delete</Button>
                      </>
                    )}
                    {['sent', 'viewed', 'overdue'].includes(inv.status) && (
                      <Button variant="ghost" size="sm" className="h-6 text-xs px-2" onClick={() => setShowPayment(inv.id)}>Record Payment</Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Log Time Dialog */}
      <Dialog open={showLogTime} onOpenChange={setShowLogTime}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Log Time</DialogTitle><DialogDescription>Add a time entry for this matter</DialogDescription></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">Hours</Label><Input type="number" min="0" value={teHours} onChange={(e) => setTeHours(e.target.value)} className="mt-1" /></div>
              <div><Label className="text-xs">Minutes</Label><Input type="number" min="0" max="59" value={teMinutes} onChange={(e) => setTeMinutes(e.target.value)} className="mt-1" /></div>
            </div>
            <div><Label className="text-xs">Rate ($/hr)</Label><Input type="number" step="0.01" value={teRate} onChange={(e) => setTeRate(e.target.value)} className="mt-1" /></div>
            <div><Label className="text-xs">Description</Label><Input value={teDesc} onChange={(e) => setTeDesc(e.target.value)} className="mt-1" placeholder="Work performed..." /></div>
            <div className="flex items-center gap-2"><Checkbox id="te-billable" checked={teBillable} onCheckedChange={(v) => setTeBillable(v === true)} /><label htmlFor="te-billable" className="text-sm">Billable</label></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowLogTime(false)}>Cancel</Button>
            <Button onClick={handleLogTime} disabled={createTimeEntry.isPending}>
              {createTimeEntry.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Log Time
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Invoice Dialog */}
      <Dialog open={showCreateInvoice} onOpenChange={setShowCreateInvoice}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>Create Invoice</DialogTitle><DialogDescription>Select time entries to include</DialogDescription></DialogHeader>
          <div className="space-y-4">
            {unbilledEntries.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No unbilled time entries</p>
            ) : (
              <div className="max-h-48 overflow-y-auto space-y-1 border rounded-md p-2">
                {unbilledEntries.map((e) => {
                  const hrs = Math.floor(e.duration_minutes / 60)
                  const mins = e.duration_minutes % 60
                  const amt = e.hourly_rate ? (e.duration_minutes / 60) * Number(e.hourly_rate) : 0
                  return (
                    <div key={e.id} className="flex items-center gap-2 py-1 text-sm">
                      <Checkbox checked={selectedEntries.has(e.id)} onCheckedChange={() => toggleEntry(e.id)} />
                      <span className="text-xs flex-1 truncate">{e.description}</span>
                      <span className="text-xs text-muted-foreground">{hrs}h{mins > 0 ? ` ${mins}m` : ''}</span>
                      <span className="text-xs font-medium">{amt > 0 ? `$${amt.toFixed(2)}` : '—'}</span>
                    </div>
                  )
                })}
              </div>
            )}
            <div><Label className="text-xs">Payment Terms (days)</Label><Input type="number" value={invDueDays} onChange={(e) => setInvDueDays(e.target.value)} className="mt-1" /></div>
            <div><Label className="text-xs">Notes (optional)</Label><Input value={invNotes} onChange={(e) => setInvNotes(e.target.value)} className="mt-1" placeholder="Additional notes..." /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateInvoice(false)}>Cancel</Button>
            <Button onClick={handleCreateInvoice} disabled={createInvoice.isPending || selectedEntries.size === 0}>
              {createInvoice.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Create Invoice
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Record Payment Dialog */}
      <Dialog open={!!showPayment} onOpenChange={() => setShowPayment(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Record Payment</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label className="text-xs">Amount ($)</Label><Input type="number" step="0.01" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} className="mt-1" /></div>
            <div>
              <Label className="text-xs">Method</Label>
              <Select value={payMethod} onValueChange={setPayMethod}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>{PAYMENT_METHODS.map((pm) => <SelectItem key={pm.value} value={pm.value}>{pm.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label className="text-xs">Reference</Label><Input value={payRef} onChange={(e) => setPayRef(e.target.value)} className="mt-1" placeholder="Optional" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPayment(null)}>Cancel</Button>
            <Button onClick={handleRecordPayment} disabled={recordPayment.isPending || !payAmount}>
              {recordPayment.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Record Payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function MatterDetailSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-40" />
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Skeleton className="h-7 w-64" />
          <Skeleton className="h-5 w-20 rounded-full" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-5 w-16 rounded-full" />
          <Skeleton className="h-5 w-24 rounded-full" />
        </div>
      </div>
      <Skeleton className="h-10 w-96" />
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-64 rounded-lg" />
        <Skeleton className="h-64 rounded-lg" />
        <Skeleton className="h-64 rounded-lg" />
        <Skeleton className="h-64 rounded-lg" />
      </div>
    </div>
  )
}
