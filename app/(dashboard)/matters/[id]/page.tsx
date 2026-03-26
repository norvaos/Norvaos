'use client'

import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import Link from 'next/link'
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
import { MatterReadinessBadge } from '@/components/matters/matter-readiness-badge'
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
    staleTime: 1000 * 60 * 5, // 5 min — reference data, rarely changes
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
    staleTime: 1000 * 60 * 5, // 5 min — reference data, rarely changes
  })
}

function useMatterTasks(matterId: string, tenantId: string) {
  return useQuery({
    queryKey: ['matter-tasks', matterId],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('tasks')
        .select('id, title, status, priority, due_date, assigned_to, matter_id, created_at')
        .eq('matter_id', matterId)
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })

      if (error) throw error
      return data as Task[]
    },
    enabled: !!matterId && !!tenantId,
    staleTime: 1000 * 60, // 1 min
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

// Canonical matter detail page — renders the shell directly (no redirect).
// The useEffect redirect to /matters/[id]/shell was causing a double-navigation
// flicker. Now we import and render the shell page component inline.
export { default } from './shell/page'
