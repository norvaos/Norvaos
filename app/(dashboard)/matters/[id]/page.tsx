'use client'

import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useTenant } from '@/lib/hooks/use-tenant'
import { useUser } from '@/lib/hooks/use-user'
import { useUserRole } from '@/lib/hooks/use-user-role'
import { useMatter, useUpdateMatter } from '@/lib/queries/matters'
import { useConditionErrors } from '@/lib/queries/activities'
import { createClient } from '@/lib/supabase/client'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { Database } from '@/lib/types/database'
import {
  IMMIGRATION_INTAKE_STATUSES,
} from '@/lib/utils/constants'
import {
  formatDate,
} from '@/lib/utils/formatters'
import { MatterForm } from '@/components/matters/matter-form'
import type { MatterFormValues } from '@/lib/schemas/matter'
import { DocumentUpload } from '@/components/shared/document-upload'
import { DocumentSlotPanel } from '@/components/matters/document-slot-panel'
import { DocumentList } from '@/components/document-engine/document-list'
import { TagManager } from '@/components/shared/tag-manager'
import { NotesEditor } from '@/components/shared/notes-editor'
import { ActivityTimeline } from '@/components/shared/activity-timeline'
import { OverviewTab } from '@/components/matters/tabs/overview-tab'
import { MilestonesTab } from '@/components/matters/tabs/milestones-tab'
import { ContactsTab } from '@/components/matters/tabs/contacts-tab'
import { TasksTab } from '@/components/matters/tabs/tasks-tab'
import { DeadlinesTab } from '@/components/matters/tabs/deadlines-tab'
import { BillingTab } from '@/components/matters/tabs/billing-tab'
import { TrustTab } from '@/components/matters/tabs/trust-tab'
import { OnboardingTab } from '@/components/matters/tabs/onboarding-tab'
import { useOnboardingBadgeCount } from '@/lib/queries/matter-onboarding'
import { ClientReviewPanel } from '@/components/ircc/client-review-panel'
import { getStatusConfig, getPriorityConfig } from '@/components/matters/tabs/matter-tab-helpers'
import { useCreateAuditLog } from '@/lib/queries/audit-logs'
import { RequirePermission } from '@/components/require-permission'

// Unified workspace components
import { MatterCommandCenter } from '@/components/matters/matter-command-center'
import { MatterControlHeader } from '@/components/matters/matter-control-header'
import { CentralActionPanel } from '@/components/matters/central-action-panel'
import { QuestionsWorkflowSection } from '@/components/matters/workflow/questions-section'
import { DocumentsWorkflowSection } from '@/components/matters/workflow/documents-section'
import { ReviewBlockersWorkflowSection } from '@/components/matters/workflow/review-blockers-section'
import { FormPacksGateSection } from '@/components/matters/workflow/form-packs-gate-section'
import { SecondaryAccessBar } from '@/components/matters/secondary-access-bar'
import { CustomFieldsPanel } from '@/components/matters/custom-fields-panel'
import { LawyerReviewDialog } from '@/components/matters/lawyer-review-dialog'
import { ContradictionOverrideDialog } from '@/components/matters/contradiction-override-dialog'
import type { ImmigrationReadinessData } from '@/lib/queries/immigration-readiness'

// Phase C — Workplace Shell (5-zone layout)
import { WorkplaceShell } from '@/components/workplace/workplace-shell'
import { PostSubmissionClassifier } from '@/components/matters/post-submission-classifier'
import { OutcomeCaptureDialog } from '@/components/matters/outcome-capture-dialog'
import { ExpiryTracker } from '@/components/matters/expiry-tracker'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  ArrowLeft,
  MoreHorizontal,
  Pencil,
  Archive,
  Trash2,
  Mail,
  Loader2,
  Hash,
  AlertTriangle,
  ListTodo,
  ListChecks,
  Shield,
  Settings2,
  Link2,
  Copy,
  ExternalLink,
  RefreshCw,
  ShieldAlert,
  CloudUpload,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { CaseInsightsPanel } from '@/components/immigration/case-insights-panel'
import { ImmigrationDetailsPanel } from '@/components/immigration/immigration-details-panel'
import { ClientProgressPanel } from '@/components/immigration/client-progress-panel'
import { DocumentChecklistPanel } from '@/components/immigration/document-checklist-panel'
import { DeadlineRiskPanel } from '@/components/immigration/deadline-risk-panel'
import { StageProgressionBar } from '@/components/immigration/stage-progression-bar' // compact redesign
import { StagePipelineBar } from '@/components/matters/stage-pipeline-bar' // compact redesign
import { StageManageSheet } from '@/components/immigration/stage-manage-sheet'
import { MatterComments } from '@/components/matters/matter-comments'
import { IRCCIntakeTab } from './ircc-intake-tab'
import { IRCCFormsTab } from './ircc-forms-tab'
import { FormsTab } from '@/components/matters/tabs/forms-tab'
import { UnifiedCaseDetailsTab } from '@/components/matters/unified-case-details-tab'
import { CoreDataSummaryPanel } from '@/components/matters/core-data-summary-panel'
import { CoreDataCardTab } from '@/components/matters/core-data-card-tab'
import { SendDocumentRequestDialog } from '@/components/matters/send-document-request-dialog'
import { ImmigrationReadinessHub } from '@/components/matters/immigration-readiness-hub'
import { useImmigrationReadiness } from '@/lib/queries/immigration-readiness'
import { ClientNotificationsTab } from '@/components/matters/client-notifications-tab'
import { useRegenerateSlots, useDocumentSlots } from '@/lib/queries/document-slots'
import { useMicrosoftConnection, useSyncMatterOneDrive } from '@/lib/queries/microsoft-integration'
import { useMatterIntake } from '@/lib/queries/matter-intake'
import { usePortalLinks, useCreatePortalLink, useRevokePortalLink, type PortalLinkMetadata } from '@/lib/queries/portal-links'
import { useMatterImmigration, useCaseStages, useMatterChecklistItems } from '@/lib/queries/immigration'
import {
  useMatterStagePipelines,
  useMatterStages,
  useMatterStageState,
  useAdvanceMatterStage,
  useCheckGating,
} from '@/lib/queries/matter-types'

type Matter = Database['public']['Tables']['matters']['Row']
type Task = Database['public']['Tables']['tasks']['Row']
type UserRow = Database['public']['Tables']['users']['Row']
type PracticeArea = Database['public']['Tables']['practice_areas']['Row']

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
// Auto-expand logic for immigration workspace
// ── Auto-expand logic ─────────────────────────────────────────────

function computeAutoExpandSection(
  readinessData: ImmigrationReadinessData,
  intakeStatus: string,
): 'questions' | 'documents' | 'review' | null {
  const matrix = readinessData.readinessMatrix

  // If next action relates to documents, expand documents
  if (
    ['client_in_progress', 'review_required'].includes(intakeStatus) &&
    readinessData.documents.pendingReview > 0
  ) {
    return 'documents'
  }

  // If blocked by contradictions or active lawyer review, expand review
  // (status defaults to 'not_required' when no review has happened yet —
  //  only expand review if status indicates an actual pending/in-progress review)
  if (
    (readinessData.contradictions?.blockingCount ?? 0) > 0 ||
    (readinessData.lawyerReview?.required
      && readinessData.lawyerReview?.status !== 'approved'
      && readinessData.lawyerReview?.status !== 'not_required')
  ) {
    return 'review'
  }

  // Compare question vs document blockers — expand whichever has more
  const questionBlockers = matrix?.allBlockers?.filter((b) => b.type === 'question') ?? []
  const docBlockers = matrix?.allBlockers?.filter((b) => b.type === 'document') ?? []

  if (questionBlockers.length > docBlockers.length) {
    return 'questions'
  }
  if (docBlockers.length > 0) {
    return 'documents'
  }

  // Default: expand review if any blockers exist
  if ((matrix?.allBlockers?.length ?? 0) > 0) {
    return 'review'
  }

  return null // Everything clear — keep all collapsed
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
  const { role: userRole } = useUserRole()
  const tenantId = tenant?.id ?? ''
  const userId = appUser?.id ?? ''

  const queryClient = useQueryClient()

  // OneDrive: check connection once per page; only show sync button when enabled
  const { data: msConnection } = useMicrosoftConnection(userId)
  const syncOneDrive = useSyncMatterOneDrive(matterId)
  const { data: matter, isLoading, isError } = useMatter(matterId)
  const updateMatter = useUpdateMatter()
  const deleteMatter = useDeleteMatter()
  const createAuditLog = useCreateAuditLog()
  const { data: users } = useMatterUsers(tenantId)
  const { data: practiceArea } = useMatterPracticeArea(matter?.practice_area_id ?? null)
  const { data: immigrationData } = useMatterImmigration(matterId)
  const { data: immigrationStages } = useCaseStages(immigrationData?.case_type_id ?? '')

  // UEE: Fetch intake data and detect enforcement
  const { data: intake } = useMatterIntake(matterId)
  const { data: matterTypeData } = useQuery({
    queryKey: ['matter_types', 'single', matter?.matter_type_id],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('matter_types')
        .select('id, enforcement_enabled')
        .eq('id', matter!.matter_type_id!)
        .single()
      if (error) throw error
      return data as { id: string; enforcement_enabled: boolean }
    },
    enabled: !!matter?.matter_type_id,
    staleTime: 5 * 60 * 1000,
  })
  const enforcementEnabled = matterTypeData?.enforcement_enabled ?? false
  const regenerateSlots = useRegenerateSlots()

  // Immigration vs generic pipeline — must be mutually exclusive
  // Detect immigration: legacy case_type_id, matter_immigration record, OR enforcement-enabled matter type
  const hasImmigration = !!matter?.case_type_id || !!immigrationData || enforcementEnabled
  const { data: readinessData } = useImmigrationReadiness(hasImmigration ? matterId : undefined)
  const { data: documentSlots = [] } = useDocumentSlots(hasImmigration ? matterId : undefined)
  const hasGenericPipeline = !!matter?.matter_type_id && !hasImmigration
  // Unified Case Details tab — show when matter has a matter type
  const showCaseDetails = !!matter?.matter_type_id
  const { data: pipelines } = useMatterStagePipelines(tenantId, hasGenericPipeline ? matter?.matter_type_id : null)
  const defaultPipeline = pipelines?.find((p) => p.is_default) ?? pipelines?.[0]
  const { data: pipelineStages } = useMatterStages(defaultPipeline?.id)
  const { data: stageState } = useMatterStageState(hasGenericPipeline ? matterId : null)
  const advanceStage = useAdvanceMatterStage()
  const { data: gatingData } = useCheckGating(matterId, hasGenericPipeline)

  // Primary contact for edit form defaults
  const { data: primaryContactId } = useQuery({
    queryKey: ['matter-primary-contact', matterId],
    queryFn: async () => {
      const supabase = createClient()
      const { data } = await supabase
        .from('matter_contacts')
        .select('contact_id')
        .eq('matter_id', matterId)
        .eq('tenant_id', tenantId)
        .eq('is_primary', true)
        .maybeSingle()
      return data?.contact_id ?? null
    },
    enabled: !!matterId && !!tenantId,
  })

  // Primary client name for header display
  const { data: primaryClientName } = useQuery({
    queryKey: ['matter-primary-client-name', primaryContactId],
    queryFn: async () => {
      const supabase = createClient()
      const { data } = await supabase
        .from('contacts')
        .select('first_name, last_name, organization_name')
        .eq('id', primaryContactId!)
        .single()
      if (!data) return null
      const name = [data.first_name, data.last_name].filter(Boolean).join(' ')
      return name || data.organization_name || null
    },
    enabled: !!primaryContactId,
  })

  // Template condition error banner (fail-closed errors affecting required docs)
  const { data: conditionErrorActivity } = useConditionErrors(matterId)

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

  const onboardingBadgeCount = useOnboardingBadgeCount(matterId)
  const [activeTab, setActiveTab] = useState('onboarding')
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [stageError, setStageError] = useState<string | null>(null)
  const [pendingTerminalStageId, setPendingTerminalStageId] = useState<string | null>(null)
  const [stageManageOpen, setStageManageOpen] = useState(false)
  const [portalDialogOpen, setPortalDialogOpen] = useState(false)
  const [docRequestDialogOpen, setDocRequestDialogOpen] = useState(false)
  const [lawyerReviewDialogOpen, setLawyerReviewDialogOpen] = useState(false)
  const [contradictionOverrideDialogOpen, setContradictionOverrideDialogOpen] = useState(false)
  const [postSubmissionDialogOpen, setPostSubmissionDialogOpen] = useState(false)
  const [outcomeCaptureDialogOpen, setOutcomeCaptureDialogOpen] = useState(false)
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

  // ── Immigration workspace state (controlled expand + navigation) ──
  const isImmigrationWorkspace = hasImmigration && enforcementEnabled && showCaseDetails
  const intakeStatus = readinessData?.intakeStatus ?? 'not_issued'

  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set())
  const hasAutoExpanded = useRef(false)

  // Auto-expand the most relevant section when readiness data first arrives
  useEffect(() => {
    if (isImmigrationWorkspace && readinessData && !hasAutoExpanded.current) {
      hasAutoExpanded.current = true
      const autoSection = computeAutoExpandSection(readinessData, intakeStatus)
      if (autoSection) {
        setExpandedSections(new Set([autoSection]))
      }
    }
  }, [isImmigrationWorkspace, readinessData, intakeStatus])

  const toggleSection = useCallback((section: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev)
      if (next.has(section)) next.delete(section)
      else next.add(section)
      return next
    })
  }, [])

  // Cross-section navigation — expands target section
  const handleNavigateToSection = useCallback((section: 'questions' | 'documents' | 'review' | 'formPacks') => {
    setExpandedSections((prev) => {
      const next = new Set(prev)
      next.add(section)
      return next
    })
    // Scroll into view after a tick
    setTimeout(() => {
      document.getElementById(`workflow-section-${section}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 100)
  }, [])

  // Open sheet externally (e.g., "Go to Field" → open Case Details sheet)
  const [externalSheetKey, setExternalSheetKey] = useState<string | null>(null)
  const clearExternalSheet = useCallback(() => setExternalSheetKey(null), [])

  // Target profile path for deep field-level navigation within the questionnaire
  const [navigateProfilePath, setNavigateProfilePath] = useState<string | null>(null)

  // Field-level navigation — open the Case Details sheet and navigate to the exact field
  const handleNavigateToField = useCallback((profilePath: string) => {
    setNavigateProfilePath(profilePath)
    // Immigration workspace: questionnaire lives in IRCC Intake sheet
    // Non-immigration: questionnaire lives in Case Details sheet
    setExternalSheetKey(isImmigrationWorkspace ? 'irccIntake' : 'caseDetails')
  }, [isImmigrationWorkspace])

  // Build default values for the edit form — must be above early returns to
  // satisfy React's Rules of Hooks (hooks must be called unconditionally).
  const editDefaults = useMemo<Partial<MatterFormValues>>(() => {
    if (!matter) return {}
    return {
      title: matter.title,
      description: matter.description ?? undefined,
      contact_id: primaryContactId ?? undefined,
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
      visibility: (matter.visibility as MatterFormValues['visibility']) ?? 'all',
      statute_of_limitations: matter.statute_of_limitations ?? undefined,
      next_deadline: matter.next_deadline ?? undefined,
      case_type_id: matter.case_type_id ?? undefined,
      matter_type_id: matter.matter_type_id ?? undefined,
    }
  }, [matter, primaryContactId])

  // ── Computed values for WorkplaceShell (must be above early returns) ──────
  const responsibleLawyer = matter ? (users?.find((u) => u.id === matter.responsible_lawyer_id) ?? null) : null
  const nextDeadlineStr = matter?.next_deadline ?? null
  const nextActionText = readinessData?.nextAction ?? null
  const blockerCount = useMemo(() => {
    let count = 0
    if (readinessData?.documents) {
      const missing = readinessData.documents.totalSlots - readinessData.documents.accepted - (readinessData.documents.pendingReview ?? 0)
      if (missing > 0) count += missing
    }
    if (readinessData?.readinessMatrix?.allBlockers) {
      count += readinessData.readinessMatrix.allBlockers.filter((b) => b.type === 'question').length
    }
    return count
  }, [readinessData])

  const overdueTasks = useMemo(() => {
    if (!topTasks) return []
    const now = new Date()
    return topTasks.filter(
      (t) => t.status !== 'done' && t.status !== 'cancelled' && t.due_date && new Date(t.due_date) < now
    )
  }, [topTasks])

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

  async function handleUpdatePrimaryContact(contactId: string | null | undefined) {
    const supabase = createClient()
    const newContactId = contactId || null

    // If contact didn't change, skip
    if (newContactId === (primaryContactId ?? null)) return

    // Remove old primary contact link (if any)
    if (primaryContactId) {
      await supabase
        .from('matter_contacts')
        .delete()
        .eq('matter_id', matterId)
        .eq('contact_id', primaryContactId)
        .eq('tenant_id', tenantId)
    }

    // Add new primary contact link (if any)
    if (newContactId) {
      await supabase.from('matter_contacts').upsert(
        {
          tenant_id: tenantId,
          matter_id: matterId,
          contact_id: newContactId,
          role: 'client',
          is_primary: true,
        },
        { onConflict: 'matter_id,contact_id' }
      )
    }

    // Invalidate contacts queries
    queryClient.invalidateQueries({ queryKey: ['matter-contacts', matterId] })
    queryClient.invalidateQueries({ queryKey: ['matter-primary-contact', matterId] })
  }

  async function handleUpdate(values: MatterFormValues) {
    // If matter_type_id is being newly assigned, look up the type name
    const newMatterTypeId = values.matter_type_id || null
    const oldMatterTypeId = matter?.matter_type_id || null
    const matterTypeChanged = newMatterTypeId !== oldMatterTypeId
    let matterTypeName: string | null = null

    if (matterTypeChanged && newMatterTypeId) {
      const supabase = createClient()
      const { data: mt } = await supabase
        .from('matter_types')
        .select('name')
        .eq('id', newMatterTypeId)
        .single()
      matterTypeName = mt?.name ?? null
    }

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
        visibility: values.visibility || 'all',
        statute_of_limitations: values.statute_of_limitations || null,
        next_deadline: values.next_deadline || null,
        case_type_id: values.case_type_id || null,
        matter_type_id: newMatterTypeId,
        // Sync the matter_type text name from the selected type
        ...(matterTypeChanged && { matter_type: matterTypeName }),
      },
      {
        onSuccess: async () => {
          // Update primary contact in junction table (fire-and-forget)
          handleUpdatePrimaryContact(values.contact_id)

          // If matter type changed, regenerate document slots
          if (matterTypeChanged) {
            regenerateSlots.mutate({ matterId })
          }

          // If a matter type was NEWLY assigned (was null, now set), activate the workflow kit
          if (matterTypeChanged && newMatterTypeId && !oldMatterTypeId) {
            try {
              await fetch(`/api/matters/${matterId}/activate-kit`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  matterTypeId: newMatterTypeId,
                  caseTypeId: values.case_type_id || null,
                }),
              })
              // Invalidate pipeline / stage queries so the UI picks up the new pipeline
              queryClient.invalidateQueries({ queryKey: ['matter_stage_pipelines'] })
              queryClient.invalidateQueries({ queryKey: ['matter_stages'] })
              queryClient.invalidateQueries({ queryKey: ['matter_stage_state'] })
              queryClient.invalidateQueries({ queryKey: ['matter_types', 'single'] })
              toast.success('Workflow kit activated for the new matter type')
            } catch (err) {
              console.error('Failed to activate workflow kit:', err)
            }
          }

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

  // Build immigration workspace content for Zone 2
  const immigrationContent = isImmigrationWorkspace ? (
    <div className="space-y-3">
      {/* Operational metrics strip */}
      <MatterControlHeader
        matterTypeName={matter.matter_type ?? null}
        readinessData={readinessData}
      />

      {/* Central Action Panel: primary + secondary actions */}
      <CentralActionPanel
        readinessData={readinessData}
        intakeStatus={intakeStatus}
        isLawyer={userRole?.name === 'Lawyer' || userRole?.name === 'Admin'}
        onOpenDocRequest={() => setDocRequestDialogOpen(true)}
        onNavigateToSection={handleNavigateToSection}
        onOpenLawyerReview={() => setLawyerReviewDialogOpen(true)}
        onOpenContradictionOverride={() => setContradictionOverrideDialogOpen(true)}
      />

      {/* Client Portal Link — quick copy bar */}
      {activePortalLink && (
        <div className="flex items-center gap-2 rounded-lg border bg-slate-50/80 px-3 py-2">
          <Link2 className="h-3.5 w-3.5 text-slate-500 shrink-0" />
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider shrink-0">
            Portal
          </span>
          <code className="flex-1 truncate text-xs text-slate-500">
            {typeof window !== 'undefined'
              ? `${window.location.origin}/portal/${activePortalLink.token}`
              : `/portal/${activePortalLink.token}`}
          </code>
          <Button
            variant="outline"
            size="sm"
            className="h-6 text-[11px] shrink-0 px-2"
            onClick={() => {
              navigator.clipboard.writeText(
                `${window.location.origin}/portal/${activePortalLink.token}`
              )
              toast.success('Portal link copied to clipboard')
            }}
          >
            <Copy className="mr-1 h-3 w-3" />
            Copy
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0"
            onClick={() =>
              window.open(`/portal/${activePortalLink.token}`, '_blank')
            }
          >
            <ExternalLink className="h-3 w-3" />
          </Button>
        </div>
      )}

      {/* Workflow Section 1: Questions & Profile Completeness */}
      <div id="workflow-section-questions">
        <QuestionsWorkflowSection
          readinessData={readinessData}
          isExpanded={expandedSections.has('questions')}
          onToggle={() => toggleSection('questions')}
          onNavigateToField={handleNavigateToField}
        />
      </div>

      {/* Workflow Section 2: Documents */}
      <div id="workflow-section-documents">
        <DocumentsWorkflowSection
          matterId={matterId}
          tenantId={tenantId}
          readinessData={readinessData}
          isExpanded={expandedSections.has('documents')}
          onToggle={() => toggleSection('documents')}
        />
      </div>

      {/* Workflow Section 3: Review & Blockers */}
      <div id="workflow-section-review">
        <ReviewBlockersWorkflowSection
          readinessData={readinessData}
          matterId={matterId}
          slots={documentSlots}
          isExpanded={expandedSections.has('review')}
          onToggle={() => toggleSection('review')}
          onNavigateToSection={handleNavigateToSection}
          onNavigateToField={handleNavigateToField}
          onOpenLawyerReview={() => setLawyerReviewDialogOpen(true)}
          onOpenContradictionOverride={() => setContradictionOverrideDialogOpen(true)}
        />
      </div>

      {/* Workflow Section 4: Form Packs (gated) */}
      <div id="workflow-section-formPacks">
        <FormPacksGateSection
          readinessData={readinessData}
          intakeStatus={intakeStatus}
          renderFormsTab={() => (
            <IRCCFormsTab
              matterId={matterId}
              contactId={primaryContactId ?? null}
              tenantId={tenantId}
              caseTypeId={matter?.case_type_id ?? immigrationData?.case_type_id ?? null}
            />
          )}
          onNavigateToSection={handleNavigateToSection}
          onOpenIRCCIntake={() => setExternalSheetKey('irccIntake')}
        />
      </div>
    </div>
  ) : null

  return (
    <>
      {/* Stage error banner */}
      {stageError && (
        <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 mx-4 mt-2">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          <span>{stageError}</span>
          <button className="ml-auto text-red-400 hover:text-red-600" onClick={() => setStageError(null)}>
            &times;
          </button>
        </div>
      )}

      {/* Template condition error banner */}
      {conditionErrorActivity && (
        <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 mx-4 mt-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <div className="flex-1">
            <span className="font-medium">Template condition error affecting required documents.</span>
            <span className="ml-1">
              One or more document slot conditions failed evaluation and the affected slots were not generated.
              Review the template conditions in Settings &rarr; Document Slot Templates.
            </span>
          </div>
        </div>
      )}

      {/* Assign Matter Type Banner */}
      {!matter?.matter_type_id && (
        <div className="flex items-center gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 mx-4 mt-2">
          <AlertTriangle className="size-5 text-amber-500 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-amber-800">No matter type assigned</p>
            <p className="text-xs text-amber-600 mt-0.5">
              Assign a matter type to activate the pipeline, document slots, and intake workflow.
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="shrink-0 border-amber-400 text-amber-700 hover:bg-amber-100"
            onClick={() => setEditOpen(true)}
          >
            <Settings2 className="size-3.5 mr-1.5" />
            Assign Type
          </Button>
        </div>
      )}

      {/* ─── Phase C: Workplace Shell (5-zone layout) ─── */}
      <WorkplaceShell
        matterId={matterId}
        tenantId={tenantId}
        contextHeaderProps={{
          matter,
          primaryClientName,
          matterTypeName: matter.matter_type ?? null,
          practiceAreaName: practiceArea?.name ?? null,
          readinessData,
          blockerCount,
          responsibleLawyer,
          nextDeadline: nextDeadlineStr,
          nextAction: nextActionText,
          portalActive: !!activePortalLink,
          hasImmigration,
          hasGenericPipeline,
          pipelineStages,
          currentStageId: stageState?.current_stage_id ?? null,
          stageEnteredAt: stageState?.entered_at ?? null,
          stageHistory: (Array.isArray(stageState?.stage_history) ? stageState.stage_history : []) as Array<{ stage_id: string; stage_name: string; entered_at: string; exited_at?: string; user_id?: string }>,
          immigrationStages,
          immigrationData: immigrationData ?? undefined,
          onStageClick: matter.status?.startsWith('closed') ? undefined : (stageId) => {
            setStageError(null)
            const targetStage = pipelineStages?.find((s) => s.id === stageId)
            if (targetStage?.is_terminal && targetStage?.auto_close_matter) {
              setPendingTerminalStageId(stageId)
              return
            }
            advanceStage.mutate(
              { matterId, targetStageId: stageId, system: hasImmigration ? 'immigration' : 'generic' },
              { onError: (error) => setStageError(error.message) }
            )
          },
          stageAdvancing: advanceStage.isPending,
          gatingErrors: gatingData?.gatingErrors,
          users,
          onEdit: () => setEditOpen(true),
          onArchive: handleArchive,
          onDelete: () => setDeleteOpen(true),
          onPortalOpen: () => handlePortalDialogOpen(true),
          onDocRequestOpen: () => setDocRequestDialogOpen(true),
          onRegenerateSlots: () => regenerateSlots.mutate({ matterId }),
          regeneratingSlots: regenerateSlots.isPending,
          enforcementEnabled,
          completionPercent: intake?.completion_pct ?? null,
        }}
        centralSurfaceProps={{
          matterId,
          tenantId,
          readinessData,
          intakeStatus,
          matterStatus: matter.status,
          isImmigrationWorkspace,
          immigrationWorkspaceContent: immigrationContent,
          blockerCardProps: {
            readinessData,
            overdueTasks,
            conflictCount: readinessData?.contradictions?.blockingCount ?? 0,
            onNavigateToSection: (section) => {
              // Map to drawer panel or workflow section
              const drawerSections = ['documents', 'questionnaire', 'tasks', 'people']
              if (drawerSections.includes(section)) {
                // This will be handled by the QuickAccessRail via Zustand
              }
            },
          },
          suggestedActionProps: {
            intakeStatus,
            matterStatus: matter.status,
            readinessData,
            onSendDocRequest: () => setDocRequestDialogOpen(true),
            onOpenQuestionnaire: () => setExternalSheetKey('irccIntake'),
            onReviewDocuments: () => handleNavigateToSection('documents'),
            onGenerateForms: () => handleNavigateToSection('formPacks'),
            onRunReadinessCheck: () => handleNavigateToSection('review'),
            onClassifyDocument: () => setPostSubmissionDialogOpen(true),
            onRecordOutcome: () => setOutcomeCaptureDialogOpen(true),
            onOpenLawyerReview: () => setLawyerReviewDialogOpen(true),
            onNavigateToSection: (section) => handleNavigateToSection(section as 'questions' | 'documents' | 'review' | 'formPacks'),
          },
        }}
        communicationPanelProps={{
          matterId,
          matterNumber: matter.matter_number,
          tenantId,
          onCreateTask: () => setExternalSheetKey('tasks'),
          onCreateNote: () => setExternalSheetKey('notes'),
        }}
        drawerPanelContent={{
          documents: enforcementEnabled ? (
            <DocumentSlotPanel matterId={matterId} tenantId={tenantId} enforcementEnabled={enforcementEnabled} />
          ) : (
            <>
              <DocumentUpload entityType="matter" entityId={matterId} tenantId={tenantId} />
              <DocumentList matterId={matterId} contactId={primaryContactId ?? undefined} />
            </>
          ),
          questionnaire: matter.matter_type_id ? (
            <UnifiedCaseDetailsTab
              matterId={matterId}
              tenantId={tenantId}
              matterTypeId={matter.matter_type_id}
              caseTypeId={matter.case_type_id ?? immigrationData?.case_type_id ?? null}
              contactId={primaryContactId ?? null}
              navigateToProfilePath={navigateProfilePath}
            />
          ) : (
            <OnboardingTab
              matter={matter}
              users={users ?? []}
              matterId={matterId}
              tenantId={tenantId}
            />
          ),
          irccForms: matter.matter_type_id ? (
            <IRCCIntakeTab
              matterId={matterId}
              contactId={primaryContactId ?? null}
              tenantId={tenantId}
              matterTypeId={matter.matter_type_id}
              initialProfilePath={navigateProfilePath}
              onOpenContactsSheet={() => setExternalSheetKey('contacts')}
            />
          ) : (
            <FormsTab matterId={matterId} matterStatus={matter.status} />
          ),
          tasks: (
            <TasksTab
              matterId={matterId}
              tenantId={tenantId}
              users={users}
              practiceAreaId={matter.practice_area_id ?? null}
              contactId={primaryContactId ?? undefined}
            />
          ),
          deadlines: (
            <DeadlinesTab
              matterId={matterId}
              tenantId={tenantId}
              practiceAreaId={matter.practice_area_id ?? null}
            />
          ),
          billing: (
            <RequirePermission entity="billing" action="view" variant="inline">
              <BillingTab matterId={matterId} tenantId={tenantId} matter={matter} />
            </RequirePermission>
          ),
          trust: (
            <RequirePermission entity="trust_accounting" action="view" variant="inline">
              <TrustTab matterId={matterId} tenantId={tenantId} matter={matter} />
            </RequirePermission>
          ),
          notes: <NotesEditor tenantId={tenantId} matterId={matterId} />,
          timeline: (
            <ActivityTimeline
              tenantId={tenantId}
              matterId={matterId}
              entityType="matter"
              entityId={matterId}
            />
          ),
          people: <ContactsTab matterId={matterId} tenantId={tenantId} />,
          customFields: (
            <CustomFieldsPanel
              matterId={matterId}
              matterTypeId={matter.matter_type_id ?? null}
              tenantId={tenantId}
              readOnly={matter.status?.startsWith('closed')}
            />
          ),
          postDecision: primaryContactId ? (
            <div className="space-y-4">
              <ExpiryTracker contactId={primaryContactId} />
            </div>
          ) : (
            <div className="text-sm text-muted-foreground text-center py-8">
              No primary contact assigned.
            </div>
          ),
        }}
      />

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

      {/* Send Document Request Dialog */}
      {enforcementEnabled && (
        <SendDocumentRequestDialog
          open={docRequestDialogOpen}
          onOpenChange={setDocRequestDialogOpen}
          matterId={matterId}
        />
      )}

      {/* Lawyer Review Dialog */}
      <LawyerReviewDialog
        open={lawyerReviewDialogOpen}
        onOpenChange={setLawyerReviewDialogOpen}
        matterId={matterId}
        userId={appUser?.id ?? ''}
      />

      {/* Contradiction Override Dialog */}
      <ContradictionOverrideDialog
        open={contradictionOverrideDialogOpen}
        onOpenChange={setContradictionOverrideDialogOpen}
        matterId={matterId}
        userId={appUser?.id ?? ''}
      />

      {/* Terminal Stage Confirmation */}
      <AlertDialog open={!!pendingTerminalStageId} onOpenChange={(open) => { if (!open) setPendingTerminalStageId(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Close this matter?</AlertDialogTitle>
            <AlertDialogDescription>
              Advancing to this stage will automatically close the matter. This action cannot be undone from the pipeline bar.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              if (pendingTerminalStageId) {
                advanceStage.mutate(
                  { matterId, targetStageId: pendingTerminalStageId, system: hasImmigration ? 'immigration' : 'generic' },
                  { onError: (error) => setStageError(error.message) }
                )
              }
              setPendingTerminalStageId(null)
            }}>
              Close Matter
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
                  Expires: {formatDate(activePortalLink.expires_at)}
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

      {/* Post-Submission Classifier Dialog */}
      <PostSubmissionClassifier
        open={postSubmissionDialogOpen}
        onOpenChange={setPostSubmissionDialogOpen}
        matterId={matterId}
        tenantId={tenantId}
      />

      {/* Outcome Capture Dialog */}
      <OutcomeCaptureDialog
        open={outcomeCaptureDialogOpen}
        onOpenChange={setOutcomeCaptureDialogOpen}
        matterId={matterId}
      />

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
    </>
  )
}

// ─── Skeleton ────────────────────────────────────────────────────────────────

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
