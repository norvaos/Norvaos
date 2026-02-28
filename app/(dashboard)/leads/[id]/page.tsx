'use client'

import { useState, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useTenant } from '@/lib/hooks/use-tenant'
import { useUser } from '@/lib/hooks/use-user'
import {
  useLead,
  useUpdateLead,
  useDeleteLead,
  useUpdateLeadStage,
  useConvertLead,
  leadKeys,
} from '@/lib/queries/leads'
import { useActivities } from '@/lib/queries/activities'
import { ActivityTimeline } from '@/components/shared/activity-timeline'
import { MiniTimeline } from '@/components/shared/mini-timeline'
import { createClient } from '@/lib/supabase/client'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { Database } from '@/lib/types/database'
import { LEAD_TEMPERATURES, CONTACT_SOURCES } from '@/lib/utils/constants'
import {
  formatDate,
  formatRelativeDate,
  formatCurrency,
  formatFullName,
  formatPhoneNumber,
  isOverdue,
  daysInStage,
} from '@/lib/utils/formatters'
import { LeadForm } from '@/components/leads/lead-form'
import type { LeadFormValues } from '@/lib/schemas/lead'
import { useLeadIntakeSubmission } from '@/lib/queries/intake-forms'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
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
  Trash2,
  ArrowRightLeft,
  Loader2,
  Mail,
  Phone,
  Building2,
  MapPin,
  Calendar,
  DollarSign,
  Clock,
  UserCheck,
  Briefcase,
  FileText,
  Thermometer,
  ExternalLink,
  CheckCircle2,
  AlertTriangle,
  ClipboardList,
  Paperclip,
} from 'lucide-react'
import { toast } from 'sonner'

type Lead = Database['public']['Tables']['leads']['Row']
type Contact = Database['public']['Tables']['contacts']['Row']
type Pipeline = Database['public']['Tables']['pipelines']['Row']
type PipelineStage = Database['public']['Tables']['pipeline_stages']['Row']
type UserRow = Database['public']['Tables']['users']['Row']
type PracticeArea = Database['public']['Tables']['practice_areas']['Row']
type Activity = Database['public']['Tables']['activities']['Row']

// -------------------------------------------------------------------
// Custom hooks for lead-related data
// -------------------------------------------------------------------

function useLeadContact(contactId: string, tenantId: string) {
  return useQuery({
    queryKey: ['lead-contact', contactId],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('contacts')
        .select('*')
        .eq('id', contactId)
        .single()
      if (error) throw error
      return data as Contact
    },
    enabled: !!contactId && !!tenantId,
  })
}

function useLeadPipelineInfo(pipelineId: string) {
  return useQuery({
    queryKey: ['lead-pipeline-info', pipelineId],
    queryFn: async () => {
      const supabase = createClient()
      const [pipelineRes, stagesRes] = await Promise.all([
        supabase.from('pipelines').select('*').eq('id', pipelineId).single(),
        supabase
          .from('pipeline_stages')
          .select('*')
          .eq('pipeline_id', pipelineId)
          .order('sort_order'),
      ])
      if (pipelineRes.error) throw pipelineRes.error
      if (stagesRes.error) throw stagesRes.error
      return {
        pipeline: pipelineRes.data as Pipeline,
        stages: stagesRes.data as PipelineStage[],
      }
    },
    enabled: !!pipelineId,
  })
}

function useLeadUsers(tenantId: string) {
  return useQuery({
    queryKey: ['lead-users', tenantId],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('is_active', true)
      if (error) throw error
      return data as UserRow[]
    },
    enabled: !!tenantId,
  })
}

function useLeadPracticeArea(practiceAreaId: string | null) {
  return useQuery({
    queryKey: ['lead-practice-area', practiceAreaId],
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

// -------------------------------------------------------------------
// Helper functions
// -------------------------------------------------------------------

function getContactDisplayName(contact?: Contact | null): string {
  if (!contact) return 'Unknown Contact'
  if (contact.contact_type === 'organization') {
    return contact.organization_name || 'Unknown Organization'
  }
  const name = formatFullName(contact.first_name, contact.last_name)
  return name || contact.email_primary || 'Unknown Contact'
}

function getContactInitials(contact?: Contact | null): string {
  if (!contact) return '?'
  if (contact.contact_type === 'organization') {
    return contact.organization_name?.charAt(0)?.toUpperCase() || 'O'
  }
  const first = contact.first_name?.charAt(0)?.toUpperCase() ?? ''
  const last = contact.last_name?.charAt(0)?.toUpperCase() ?? ''
  return first + last || '?'
}

function getUserName(userId: string | null, users: UserRow[] | undefined): string {
  if (!userId || !users) return '-'
  const user = users.find((u) => u.id === userId)
  if (!user) return '-'
  return formatFullName(user.first_name, user.last_name) || user.email
}

function getTemperatureInfo(temp: string | null) {
  return LEAD_TEMPERATURES.find((t) => t.value === temp) ?? { value: 'warm', label: 'Warm', color: '#f59e0b' }
}

// -------------------------------------------------------------------
// InfoRow component
// -------------------------------------------------------------------

function InfoRow({ label, value, icon }: { label: string; value: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between py-2.5">
      <div className="flex items-center gap-2 text-sm text-slate-500">
        {icon}
        {label}
      </div>
      <div className="text-right text-sm font-medium text-slate-900">{value || '-'}</div>
    </div>
  )
}

// -------------------------------------------------------------------
// Main page component
// -------------------------------------------------------------------

export default function LeadDetailPage() {
  const params = useParams()
  const router = useRouter()
  const leadId = params.id as string
  const { tenant } = useTenant()
  const { appUser } = useUser()
  const tenantId = tenant?.id ?? ''

  // Core lead data
  const { data: lead, isLoading, isError } = useLead(leadId)
  const updateLead = useUpdateLead()
  const deleteLead = useDeleteLead()
  const updateLeadStage = useUpdateLeadStage()
  const convertLead = useConvertLead()

  // Related data (enabled when lead loads)
  const { data: contact } = useLeadContact(lead?.contact_id ?? '', tenantId)
  const { data: pipelineInfo } = useLeadPipelineInfo(lead?.pipeline_id ?? '')
  const { data: users } = useLeadUsers(tenantId)
  const { data: practiceArea } = useLeadPracticeArea(lead?.practice_area_id ?? null)
  const { data: activities } = useActivities({
    tenantId,
    contactId: lead?.contact_id ?? '',
    limit: 50,
  })
  const { data: intakeSubmission, isLoading: intakeLoading } = useLeadIntakeSubmission(leadId)

  // UI state
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  // Current stage info
  const currentStage = useMemo(() => {
    if (!lead?.stage_id || !pipelineInfo?.stages) return null
    return pipelineInfo.stages.find((s) => s.id === lead.stage_id) ?? null
  }, [lead?.stage_id, pipelineInfo?.stages])

  const temperatureInfo = getTemperatureInfo(lead?.temperature ?? null)

  // Edit form default values
  const editDefaults = useMemo((): Partial<LeadFormValues> | undefined => {
    if (!lead) return undefined
    return {
      contact_id: lead.contact_id,
      pipeline_id: lead.pipeline_id,
      stage_id: lead.stage_id,
      source: lead.source ?? undefined,
      source_detail: lead.source_detail ?? undefined,
      practice_area_id: lead.practice_area_id ?? undefined,
      estimated_value: lead.estimated_value ?? undefined,
      assigned_to: lead.assigned_to ?? undefined,
      temperature: (lead.temperature as 'cold' | 'warm' | 'hot') ?? 'warm',
      notes: lead.notes ?? undefined,
      next_follow_up: lead.next_follow_up
        ? new Date(lead.next_follow_up).toISOString().split('T')[0]
        : undefined,
    }
  }, [lead])

  // Handlers
  function handleUpdate(values: LeadFormValues) {
    updateLead.mutate(
      {
        id: leadId,
        ...values,
        next_follow_up: values.next_follow_up
          ? new Date(values.next_follow_up).toISOString()
          : null,
      },
      { onSuccess: () => setEditOpen(false) }
    )
  }

  function handleDelete() {
    deleteLead.mutate(leadId, {
      onSuccess: () => router.push('/leads'),
    })
  }

  function handleStageChange(stageId: string) {
    updateLeadStage.mutate({ id: leadId, stageId })
  }

  // ------- Loading state -------
  if (isLoading) {
    return <LeadDetailSkeleton />
  }

  // ------- Error state -------
  if (isError || !lead) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <AlertTriangle className="h-12 w-12 text-slate-300" />
        <h2 className="text-lg font-semibold text-slate-700">Lead not found</h2>
        <p className="text-sm text-slate-500">
          The lead you&apos;re looking for doesn&apos;t exist or you don&apos;t have access.
        </p>
        <Button variant="outline" onClick={() => router.push('/leads')}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Return to Leads
        </Button>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      {/* Back navigation */}
      <Button
        variant="ghost"
        size="sm"
        className="mb-2 -ml-2 text-slate-600"
        onClick={() => router.push('/leads')}
      >
        <ArrowLeft className="mr-1 h-4 w-4" />
        Back to Leads
      </Button>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-slate-900">
            {getContactDisplayName(contact)}
          </h1>

          {/* Badges row */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Temperature badge */}
            <Badge
              variant="secondary"
              className="gap-1.5"
              style={{
                backgroundColor: `${temperatureInfo.color}15`,
                color: temperatureInfo.color,
                borderColor: `${temperatureInfo.color}40`,
              }}
            >
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ backgroundColor: temperatureInfo.color }}
              />
              {temperatureInfo.label}
            </Badge>

            {/* Stage badge */}
            {currentStage && (
              <Badge
                variant="secondary"
                className="gap-1.5"
                style={{
                  backgroundColor: `${currentStage.color ?? '#6b7280'}15`,
                  color: currentStage.color ?? '#6b7280',
                  borderColor: `${currentStage.color ?? '#6b7280'}40`,
                }}
              >
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ backgroundColor: currentStage.color ?? '#6b7280' }}
                />
                {currentStage.name}
              </Badge>
            )}

            {/* Practice area */}
            {practiceArea && (
              <Badge variant="outline">{practiceArea.name}</Badge>
            )}

            {/* Status badge for converted/lost */}
            {lead.status === 'converted' && (
              <Badge className="bg-green-100 text-green-800 border-green-200">
                <CheckCircle2 className="mr-1 h-3 w-3" />
                Converted
              </Badge>
            )}
            {lead.status === 'lost' && (
              <Badge variant="destructive">Lost / Archived</Badge>
            )}
          </div>

          {/* Subtitle info */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-500">
            {lead.source && <span>Source: {lead.source}</span>}
            {lead.estimated_value != null && lead.estimated_value > 0 && (
              <span>Est. Value: {formatCurrency(lead.estimated_value)}</span>
            )}
            {lead.next_follow_up && (
              <span
                className={isOverdue(lead.next_follow_up) ? 'font-medium text-red-600' : ''}
              >
                Follow-up: {formatDate(lead.next_follow_up, 'dd-MM-yyyy')}
                {isOverdue(lead.next_follow_up) && ' (overdue)'}
              </span>
            )}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setEditOpen(true)}
            disabled={lead.status === 'converted'}
          >
            <Pencil className="mr-1.5 h-4 w-4" />
            Edit
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" className="h-9 w-9">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setEditOpen(true)} disabled={lead.status === 'converted'}>
                <Pencil className="mr-2 h-4 w-4" />
                Edit Lead
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={lead.status === 'converted'}
                onClick={() => {
                  toast.info('Convert to Matter: Create a new matter first, then link it.')
                }}
              >
                <ArrowRightLeft className="mr-2 h-4 w-4" />
                Convert to Matter
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-red-600"
                onClick={() => setDeleteOpen(true)}
                disabled={lead.status === 'converted'}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Archive Lead
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <Separator />

      {/* Tabs */}
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="pipeline">Pipeline</TabsTrigger>
          <TabsTrigger value="contact">Contact</TabsTrigger>
          <TabsTrigger value="intake">Intake</TabsTrigger>
          <TabsTrigger value="activities">Activities</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
          <TabsTrigger value="notes">Notes</TabsTrigger>
        </TabsList>

        {/* ============ OVERVIEW TAB ============ */}
        <TabsContent value="overview">
          <div className="grid gap-4 md:grid-cols-2">
            {/* Lead Details card */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Briefcase className="h-4 w-4 text-slate-400" />
                  Lead Details
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-0 divide-y">
                <InfoRow
                  label="Temperature"
                  value={
                    <div className="flex items-center gap-2">
                      <span
                        className="inline-block h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: temperatureInfo.color }}
                      />
                      {temperatureInfo.label}
                    </div>
                  }
                  icon={<Thermometer className="h-3.5 w-3.5" />}
                />
                <InfoRow label="Source" value={lead.source} />
                {lead.source_detail && (
                  <InfoRow label="Source Detail" value={lead.source_detail} />
                )}
                <InfoRow
                  label="Estimated Value"
                  value={lead.estimated_value ? formatCurrency(lead.estimated_value) : '-'}
                  icon={<DollarSign className="h-3.5 w-3.5" />}
                />
                <InfoRow
                  label="Practice Area"
                  value={practiceArea?.name ?? '-'}
                />
                <InfoRow
                  label="Created"
                  value={formatDate(lead.created_at, 'dd-MM-yyyy')}
                  icon={<Calendar className="h-3.5 w-3.5" />}
                />
              </CardContent>
            </Card>

            {/* Assignment card */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <UserCheck className="h-4 w-4 text-slate-400" />
                  Assignment
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-0 divide-y">
                <InfoRow
                  label="Assigned To"
                  value={getUserName(lead.assigned_to, users)}
                />
                <InfoRow
                  label="Created By"
                  value={getUserName(lead.created_by, users)}
                />
              </CardContent>
            </Card>

            {/* Pipeline Position card */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Briefcase className="h-4 w-4 text-slate-400" />
                  Pipeline Position
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <InfoRow
                  label="Pipeline"
                  value={pipelineInfo?.pipeline?.name ?? '-'}
                />
                <InfoRow
                  label="Current Stage"
                  value={
                    currentStage ? (
                      <div className="flex items-center gap-2">
                        <span
                          className="inline-block h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: currentStage.color ?? '#6b7280' }}
                        />
                        {currentStage.name}
                      </div>
                    ) : (
                      '-'
                    )
                  }
                />
                <InfoRow
                  label="Win Probability"
                  value={`${currentStage?.win_probability ?? 0}%`}
                />
                <InfoRow
                  label="Days in Stage"
                  value={`${daysInStage(lead.stage_entered_at ?? lead.updated_at)} days`}
                  icon={<Clock className="h-3.5 w-3.5" />}
                />

                {/* Visual stage progress */}
                {pipelineInfo?.stages && pipelineInfo.stages.length > 0 && (
                  <div className="pt-2">
                    <div className="flex items-center gap-1">
                      {pipelineInfo.stages
                        .filter((s) => !s.is_lost_stage)
                        .map((stage) => {
                          const isCurrent = stage.id === lead.stage_id
                          const currentIdx = pipelineInfo.stages
                            .filter((s) => !s.is_lost_stage)
                            .findIndex((s) => s.id === lead.stage_id)
                          const stageIdx = pipelineInfo.stages
                            .filter((s) => !s.is_lost_stage)
                            .findIndex((s) => s.id === stage.id)
                          const isPassed = stageIdx < currentIdx

                          return (
                            <div key={stage.id} className="flex-1">
                              <div
                                className="h-2 rounded-full transition-all"
                                style={{
                                  backgroundColor:
                                    isCurrent || isPassed
                                      ? stage.color ?? '#6366f1'
                                      : '#e2e8f0',
                                }}
                                title={stage.name}
                              />
                            </div>
                          )
                        })}
                    </div>
                    <div className="mt-1 flex justify-between text-[10px] text-slate-400">
                      <span>
                        {pipelineInfo.stages.filter((s) => !s.is_lost_stage)[0]?.name}
                      </span>
                      <span>
                        {
                          pipelineInfo.stages.filter((s) => !s.is_lost_stage)[
                            pipelineInfo.stages.filter((s) => !s.is_lost_stage).length - 1
                          ]?.name
                        }
                      </span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Key Dates card */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Calendar className="h-4 w-4 text-slate-400" />
                  Key Dates
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-0 divide-y">
                <InfoRow
                  label="Next Follow-up"
                  value={
                    lead.next_follow_up ? (
                      <span
                        className={
                          isOverdue(lead.next_follow_up) ? 'font-medium text-red-600' : ''
                        }
                      >
                        {formatDate(lead.next_follow_up, 'dd-MM-yyyy')}
                        {isOverdue(lead.next_follow_up) && ' (overdue)'}
                      </span>
                    ) : (
                      '-'
                    )
                  }
                />
                <InfoRow
                  label="Created At"
                  value={formatDate(lead.created_at, 'dd-MM-yyyy')}
                />
                <InfoRow
                  label="Updated At"
                  value={formatDate(lead.updated_at, 'dd-MM-yyyy')}
                />
                {lead.converted_at && (
                  <InfoRow
                    label="Converted At"
                    value={formatDate(lead.converted_at, 'dd-MM-yyyy')}
                  />
                )}
              </CardContent>
            </Card>

            {/* Recent Activity — spans full width */}
            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Clock className="h-4 w-4 text-slate-400" />
                  Recent Activity
                </CardTitle>
              </CardHeader>
              <CardContent>
                <MiniTimeline
                  tenantId={tenantId}
                  entityType="lead"
                  entityId={leadId}
                  contactId={lead.contact_id}
                  limit={5}
                />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ============ PIPELINE TAB ============ */}
        <TabsContent value="pipeline">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Pipeline: {pipelineInfo?.pipeline?.name ?? 'Loading...'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {pipelineInfo?.stages && pipelineInfo.stages.length > 0 ? (
                <div className="space-y-4">
                  {/* Pipeline stepper */}
                  <div className="flex flex-wrap gap-2">
                    {pipelineInfo.stages.map((stage) => {
                      const isCurrent = stage.id === lead.stage_id
                      return (
                        <button
                          key={stage.id}
                          onClick={() => {
                            if (!isCurrent && lead.status === 'open') {
                              handleStageChange(stage.id)
                            }
                          }}
                          disabled={isCurrent || lead.status !== 'open'}
                          className={`flex items-center gap-2 rounded-lg border px-4 py-3 text-left transition-all ${
                            isCurrent
                              ? 'border-primary bg-primary/5 ring-1 ring-primary/20'
                              : lead.status === 'open'
                                ? 'hover:border-slate-300 hover:bg-slate-50'
                                : 'opacity-50'
                          }`}
                        >
                          <span
                            className="inline-block h-3 w-3 rounded-full"
                            style={{ backgroundColor: stage.color ?? '#6b7280' }}
                          />
                          <div>
                            <div className="text-sm font-medium text-slate-900">
                              {stage.name}
                            </div>
                            <div className="text-xs text-slate-500">
                              {stage.win_probability ?? 0}% probability
                              {stage.is_win_stage && ' • Win stage'}
                              {stage.is_lost_stage && ' • Lost stage'}
                            </div>
                          </div>
                          {isCurrent && (
                            <Badge variant="secondary" className="ml-2 text-[10px]">
                              Current
                            </Badge>
                          )}
                        </button>
                      )
                    })}
                  </div>

                  {/* Stage details */}
                  {currentStage && (
                    <div className="rounded-lg bg-slate-50 p-4">
                      <h4 className="text-sm font-medium text-slate-700">
                        Current: {currentStage.name}
                      </h4>
                      <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm text-slate-500">
                        <span>Win Probability: {currentStage.win_probability ?? 0}%</span>
                        <span>
                          In stage for: {daysInStage(lead.stage_entered_at ?? lead.updated_at)}{' '}
                          days
                        </span>
                        {currentStage.rotting_days && (
                          <span>
                            Rotting after: {currentStage.rotting_days} days
                          </span>
                        )}
                      </div>
                      {currentStage.description && (
                        <p className="mt-2 text-sm text-slate-600">
                          {currentStage.description}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-slate-500">No pipeline stages configured.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ============ CONTACT TAB ============ */}
        <TabsContent value="contact">
          {contact ? (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">
                  {getContactDisplayName(contact)}
                </CardTitle>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => router.push(`/contacts/${contact.id}`)}
                >
                  View Full Contact
                  <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
                </Button>
              </CardHeader>
              <CardContent className="space-y-0 divide-y">
                {contact.contact_type && (
                  <InfoRow
                    label="Type"
                    value={
                      <Badge variant="outline" className="capitalize">
                        {contact.contact_type}
                      </Badge>
                    }
                  />
                )}
                {contact.email_primary && (
                  <InfoRow
                    label="Email"
                    value={contact.email_primary}
                    icon={<Mail className="h-3.5 w-3.5" />}
                  />
                )}
                {contact.phone_primary && (
                  <InfoRow
                    label="Phone"
                    value={formatPhoneNumber(contact.phone_primary)}
                    icon={<Phone className="h-3.5 w-3.5" />}
                  />
                )}
                {contact.organization_name && contact.contact_type !== 'organization' && (
                  <InfoRow
                    label="Organization"
                    value={contact.organization_name}
                    icon={<Building2 className="h-3.5 w-3.5" />}
                  />
                )}
                {(contact.address_line1 || contact.city) && (
                  <InfoRow
                    label="Address"
                    value={[
                      contact.address_line1,
                      contact.city,
                      contact.province_state,
                      contact.postal_code,
                    ]
                      .filter(Boolean)
                      .join(', ')}
                    icon={<MapPin className="h-3.5 w-3.5" />}
                  />
                )}
                <InfoRow
                  label="Source"
                  value={contact.source}
                />
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="py-8 text-center text-sm text-slate-500">
                No contact linked to this lead.
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ============ INTAKE TAB ============ */}
        <TabsContent value="intake">
          <LeadIntakeTab submission={intakeSubmission as IntakeSubmissionWithForm | null | undefined} isLoading={intakeLoading} />
        </TabsContent>

        {/* ============ ACTIVITIES TAB ============ */}
        <TabsContent value="activities">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Activity History</CardTitle>
            </CardHeader>
            <CardContent>
              <ActivityTimeline
                tenantId={tenantId}
                contactId={lead.contact_id}
                entityType="lead"
                entityId={leadId}
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* ============ HISTORY TAB ============ */}
        <TabsContent value="history">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Change History</CardTitle>
            </CardHeader>
            <CardContent>
              <ActivityTimeline
                tenantId={tenantId}
                entityType="lead"
                entityId={leadId}
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* ============ NOTES TAB ============ */}
        <TabsContent value="notes">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Lead Notes</CardTitle>
            </CardHeader>
            <CardContent>
              {lead.notes ? (
                <div className="whitespace-pre-wrap rounded-lg bg-slate-50 p-4 text-sm text-slate-700">
                  {lead.notes}
                </div>
              ) : (
                <div className="py-8 text-center">
                  <FileText className="mx-auto h-8 w-8 text-slate-300" />
                  <p className="mt-2 text-sm text-slate-500">No notes for this lead.</p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3"
                    onClick={() => setEditOpen(true)}
                  >
                    Add Notes
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ============ EDIT SHEET ============ */}
      <Sheet open={editOpen} onOpenChange={setEditOpen}>
        <SheetContent side="right" className="w-full sm:max-w-lg p-0">
          <SheetHeader className="border-b px-6 py-4">
            <SheetTitle>Edit Lead</SheetTitle>
            <SheetDescription>Update the details for this lead.</SheetDescription>
          </SheetHeader>
          <ScrollArea className="h-[calc(100vh-5rem)]">
            <div className="px-6 py-4">
              <LeadForm
                mode="edit"
                defaultValues={editDefaults}
                onSubmit={handleUpdate}
                isLoading={updateLead.isPending}
              />
            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>

      {/* ============ DELETE DIALOG ============ */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Archive Lead</DialogTitle>
            <DialogDescription>
              Are you sure you want to archive this lead? It will be marked as lost and
              removed from the pipeline. This action can be reversed.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleteLead.isPending}
            >
              {deleteLead.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Archive Lead
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// -------------------------------------------------------------------
// Intake tab for leads
// -------------------------------------------------------------------

interface IntakeField {
  id: string
  field_type: string
  label: string
  sort_order: number
  section_id?: string
  mapping?: string
  allow_other?: boolean
}

interface IntakeFormSettings {
  sections?: { id: string; title: string; description?: string; sort_order: number }[]
}

type IntakeSubmissionWithForm = {
  id: string
  data: Record<string, unknown> | null
  created_at: string
  intake_forms: {
    id: string
    name: string
    fields: unknown
    settings: unknown
    slug: string
  }
}

function LeadIntakeTab({
  submission,
  isLoading,
}: {
  submission: IntakeSubmissionWithForm | null | undefined
  isLoading: boolean
}) {
  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-6">
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full rounded-lg" />
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  if (!submission) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <ClipboardList className="mx-auto mb-3 size-10 text-muted-foreground/50" />
          <p className="text-sm font-medium text-slate-900">No intake submission</p>
          <p className="mt-1 text-sm text-muted-foreground">
            This lead was not created from an intake form.
          </p>
        </CardContent>
      </Card>
    )
  }

  const formInfo = submission.intake_forms
  const fields = (Array.isArray(formInfo.fields) ? formInfo.fields : []) as unknown as IntakeField[]
  const data = (submission.data ?? {}) as Record<string, unknown>

  // Try to parse settings from the form for section headers
  // Forms store settings alongside fields — we just display fields grouped by section
  const sectionMap = new Map<string, IntakeField[]>()
  const ungrouped: IntakeField[] = []

  for (const field of fields.sort((a, b) => a.sort_order - b.sort_order)) {
    const val = data[field.id]
    if (val === undefined) continue
    if (field.section_id) {
      const bucket = sectionMap.get(field.section_id) ?? []
      bucket.push(field)
      sectionMap.set(field.section_id, bucket)
    } else {
      ungrouped.push(field)
    }
  }

  function formatFieldValue(field: IntakeField, val: unknown): string {
    if (val === null || val === undefined) return '—'
    if (Array.isArray(val)) {
      return val
        .map((v: string) => {
          if (typeof v === 'string' && v.startsWith('__other__:'))
            return `Other: ${v.replace('__other__:', '')}`
          return v
        })
        .join(', ')
    }
    if (typeof val === 'boolean') return val ? 'Yes' : 'No'
    if (typeof val === 'object') {
      const obj = val as Record<string, unknown>
      if (obj.selected === '__other__' && obj.custom)
        return `Other: ${obj.custom}`
      return String(obj.selected ?? JSON.stringify(val))
    }
    return String(val)
  }

  function renderFieldRow(field: IntakeField) {
    const val = data[field.id]
    if (val === undefined) return null
    const isFile = field.field_type === 'file'
    return (
      <div key={field.id} className="flex gap-3 px-3 py-2.5">
        <span className="shrink-0 text-xs font-medium text-muted-foreground w-[180px] pt-0.5">
          {field.label}
        </span>
        <span className="text-sm text-slate-800 break-words min-w-0">
          {isFile && typeof val === 'string' && val.startsWith('http') ? (
            <a
              href={val}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline inline-flex items-center gap-1"
            >
              <Paperclip className="size-3" />
              Download
            </a>
          ) : (
            formatFieldValue(field, val)
          )}
        </span>
      </div>
    )
  }

  // Build section title lookup from settings
  const sectionTitles: Record<string, string> = {}
  const rawSettings = formInfo.settings
  if (rawSettings && typeof rawSettings === 'object' && !Array.isArray(rawSettings)) {
    const sections = (rawSettings as IntakeFormSettings).sections
    if (Array.isArray(sections)) {
      for (const sec of sections) {
        sectionTitles[sec.id] = sec.title
      }
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ClipboardList className="size-4 text-muted-foreground" />
          {formInfo.name}
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Submitted on {formatDate(submission.created_at, 'dd MMM yyyy \'at\' HH:mm')}
        </p>
      </CardHeader>
      <CardContent>
        {/* Ungrouped fields (if any) */}
        {ungrouped.length > 0 && (
          <div className="divide-y rounded-lg border mb-4">
            {ungrouped.map(renderFieldRow)}
          </div>
        )}

        {/* Grouped fields by section */}
        {Array.from(sectionMap.entries()).map(([sectionId, sectionFields]) => (
          <div key={sectionId} className="mb-4">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2 px-1">
              {sectionTitles[sectionId] ?? sectionId.replace(/^sec_/, '').replace(/_/g, ' ')}
            </h4>
            <div className="divide-y rounded-lg border">
              {sectionFields.map(renderFieldRow)}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

// -------------------------------------------------------------------
// Skeleton loader
// -------------------------------------------------------------------

function LeadDetailSkeleton() {
  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <Skeleton className="h-8 w-32" />
      <div className="space-y-3">
        <Skeleton className="h-8 w-64" />
        <div className="flex gap-2">
          <Skeleton className="h-6 w-20 rounded-full" />
          <Skeleton className="h-6 w-24 rounded-full" />
          <Skeleton className="h-6 w-28 rounded-full" />
        </div>
        <Skeleton className="h-4 w-80" />
      </div>
      <Separator />
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
