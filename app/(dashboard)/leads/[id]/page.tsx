'use client'

import { useState, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useTenant } from '@/lib/hooks/use-tenant'
import { useUser } from '@/lib/hooks/use-user'
import { useUserRole } from '@/lib/hooks/use-user-role'
import { useLead, useDeleteLead } from '@/lib/queries/leads'
import {
  useLeadStageTransitions,
  useLeadStageHistory,
  useLeadMilestones,
  useLeadCommunicationEvents,
  useLeadInsights,
  useLeadConsultations,
  useLeadRetainerPackages,
  useLeadQualificationDecisions,
  useLeadClosureRecords,
  useConversionGates,
  useAdvanceLeadStage,
  useCloseLead,
  useReopenLead,
  useConvertLead,
  useLogCommunicationEvent,
  useUpdateMilestoneTask,
  useGenerateInsights,
  useAcceptInsight,
} from '@/lib/queries/lead-workflow'
import { useActivities } from '@/lib/queries/activities'
import { isTerminalStage, isClosedStage, LEAD_STAGES } from '@/lib/config/lead-workflow-definitions'
import type { Database } from '@/lib/types/database'

import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { ArrowLeft, Loader2, MessageSquare, Brain } from 'lucide-react'

// Workflow components
import { LeadDetailHeader } from '@/components/leads/workflow/lead-detail-header'
import { LeadStagePipelineBar } from '@/components/leads/workflow/lead-stage-pipeline-bar'
import { CommunicationPanel } from '@/components/leads/workflow/communication-panel'
import { CommunicationStream } from '@/components/shared/communication-stream'
import { CentrePanel } from '@/components/leads/workflow/centre-panel'
import { RightPanel } from '@/components/leads/workflow/right-panel'
import { AdvanceStageDialog } from '@/components/leads/workflow/advance-stage-dialog'
import { CloseLeadDialog } from '@/components/leads/workflow/close-lead-dialog'
import { ReopenLeadDialog } from '@/components/leads/workflow/reopen-lead-dialog'
import { ConvertLeadDialog } from '@/components/leads/workflow/convert-lead-dialog'
// Command Centre components
import { LiveIntakeSidebar } from '@/components/leads/workflow/live-intake-sidebar'
import { ComplianceGateModal } from '@/components/leads/workflow/compliance-gate-modal'
import { useRunOnboarding } from '@/lib/queries/command-centre'
import type { CommunicationFormData } from '@/components/leads/workflow/communication-log-form'
import type { TransitionWithStatus, Lead, Contact, PracticeArea, UserRow } from '@/components/leads/workflow/lead-workflow-types'
import { isStageAtOrPast } from '@/components/leads/workflow/lead-workflow-helpers'
import { RouteGuard } from '@/app/providers/RouteGuard'

// ─── Inline Data Hooks ──────────────────────────────────────────────────────

function useLeadContact(contactId: string, tenantId: string) {
  return useQuery({
    queryKey: ['lead-contact', contactId],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('contacts')
        .select('id, first_name, last_name, email_primary, phone_primary, date_of_birth, nationality, immigration_data')
        .eq('id', contactId)
        .single()
      if (error) throw error
      return data as Contact
    },
    enabled: !!contactId && !!tenantId,
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

function usePracticeAreas(tenantId: string) {
  return useQuery({
    queryKey: ['practice-areas', tenantId],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('practice_areas')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('name')
      if (error) throw error
      return data as PracticeArea[]
    },
    enabled: !!tenantId,
  })
}

// ═══════════════════════════════════════════════════════════════════════════════
// LEAD DETAIL PAGE  -  3-PANEL WORKFLOW VIEW
// ═══════════════════════════════════════════════════════════════════════════════

export default function LeadDetailPage() {
  const params = useParams()
  const router = useRouter()
  const leadId = params.id as string
  const { tenant } = useTenant()
  const tenantId = tenant?.id ?? ''
  const { appUser } = useUser()
  const { role: userRole } = useUserRole()
  const userId = appUser?.id ?? ''

  // ─── Dialog States ──────────────────────────────────────────────────────────

  const [advanceTransition, setAdvanceTransition] = useState<TransitionWithStatus | null>(null)
  const [showCloseDialog, setShowCloseDialog] = useState(false)
  const [showReopenDialog, setShowReopenDialog] = useState(false)
  const [showConvertDialog, setShowConvertDialog] = useState(false)
  const [conversionError, setConversionError] = useState<string | null>(null)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [showCommSheet, setShowCommSheet] = useState(false)
  const [showIntakeSheet, setShowIntakeSheet] = useState(false)
  const [showComplianceGate, setShowComplianceGate] = useState(false)
  const [updatingTaskId, setUpdatingTaskId] = useState<string | null>(null)

  // ─── Primary Data ───────────────────────────────────────────────────────────

  const { data: lead, isLoading: isLeadLoading } = useLead(leadId)
  const { data: contact } = useLeadContact(lead?.contact_id ?? '', tenantId)
  const { data: users } = useLeadUsers(tenantId)
  const { data: practiceArea } = useLeadPracticeArea(lead?.practice_area_id ?? null)
  const { data: practiceAreas } = usePracticeAreas(tenantId)

  // ─── Derived State ──────────────────────────────────────────────────────────

  const currentStage = lead?.current_stage ?? ''
  const isTerminal = isTerminalStage(currentStage)
  const isClosed = isClosedStage(currentStage)
  const isConverted = currentStage === LEAD_STAGES.CONVERTED
  const isReadOnly = isTerminal

  // ─── Panel Queries (fire in parallel once lead loads) ─────────────────────

  const { data: stageTransitions } = useLeadStageTransitions(leadId)
  const { data: stageHistory, isLoading: isStageHistoryLoading } = useLeadStageHistory(leadId)
  const { data: milestones, isLoading: isMilestonesLoading } = useLeadMilestones(leadId)
  const { data: communicationEvents, isLoading: isCommLoading } = useLeadCommunicationEvents(leadId)
  const { data: insights, isLoading: isInsightsLoading } = useLeadInsights(leadId)

  // Activities for the stage activity feed
  const { data: activities } = useActivities({
    tenantId,
    limit: 50,
  })
  // Filter activities to those related to this lead
  const leadActivities = useMemo(
    () => (activities ?? []).filter((a) => a.entity_id === leadId && a.entity_type === 'lead'),
    [activities, leadId]
  )

  // Conditional queries
  const showQualification = isStageAtOrPast(currentStage, LEAD_STAGES.CONTACTED_QUALIFICATION_COMPLETE) || true
  const { data: qualificationDecisions } = useLeadQualificationDecisions(leadId)

  const showConsultation = isStageAtOrPast(currentStage, LEAD_STAGES.CONSULTATION_BOOKED) || true
  const { data: consultations } = useLeadConsultations(leadId)

  const showRetainer = isStageAtOrPast(currentStage, LEAD_STAGES.RETAINER_SENT) || true
  const { data: retainerPackages } = useLeadRetainerPackages(leadId)

  const { data: closureRecords } = useLeadClosureRecords(leadId)

  const showConversionGates = currentStage === LEAD_STAGES.RETAINED_ACTIVE_MATTER
  const { data: conversionGatesData, isLoading: isGatesLoading } = useConversionGates(
    showConversionGates ? leadId : ''
  )

  // ─── Mutations ──────────────────────────────────────────────────────────────

  const advanceStageMutation = useAdvanceLeadStage()
  const closeLeadMutation = useCloseLead()
  const reopenLeadMutation = useReopenLead()
  const convertLeadMutation = useConvertLead()
  const logCommMutation = useLogCommunicationEvent()
  const updateTaskMutation = useUpdateMilestoneTask()
  const generateInsightsMutation = useGenerateInsights()
  const acceptInsightMutation = useAcceptInsight()
  const deleteLeadMutation = useDeleteLead()
  const runOnboarding = useRunOnboarding()

  // ─── Handlers ───────────────────────────────────────────────────────────────

  function handleAdvanceStage(targetStage: string, reason: string) {
    advanceStageMutation.mutate(
      { leadId, targetStage, reason, tenantId, userId },
      { onSuccess: () => setAdvanceTransition(null) }
    )
  }

  function handleCloseLead(data: { closedStage: string; reasonCode: string; reasonText: string }) {
    closeLeadMutation.mutate(
      { leadId, ...data, tenantId, userId },
      { onSuccess: () => setShowCloseDialog(false) }
    )
  }

  function handleReopenLead(data: { targetStage: string; reason: string; taskStrategy: 'restore' | 'reopen' | 'regenerate' }) {
    reopenLeadMutation.mutate(
      { leadId, ...data, tenantId, userId },
      { onSuccess: () => setShowReopenDialog(false) }
    )
  }

  /**
   * handleConvertAttempt  -  Intercepts the "Convert to Matter" action.
   * Checks the retainer_signed gate FIRST. If no signed retainer is found,
   * opens the Compliance Gate modal instead of proceeding directly.
   */
  function handleConvertAttempt() {
    // Check if retainer gate passes
    const retainerGate = conversionGatesData?.gateResults?.find(
      (g) => g.gate === 'retainer_signed'
    )

    if (retainerGate && !retainerGate.passed && retainerGate.enabled) {
      // Open compliance gate modal instead
      setShowComplianceGate(true)
    } else {
      // Retainer gate passes  -  open normal convert dialog
      setShowConvertDialog(true)
    }
  }

  function handleConvertLead(data: {
    title: string
    description?: string
    practiceAreaId?: string
    responsibleLawyerId?: string
    billingType?: string
    priority?: string
  }) {
    // Clear any previous conversion error
    setConversionError(null)

    convertLeadMutation.mutate(
      { leadId, tenantId, userId, ...data },
      {
        onSuccess: (result) => {
          setShowConvertDialog(false)

          // Trigger One-Click Onboarding after successful conversion
          // This runs the 3-step sequence: Fee Snapshot → Portal Birth → Blueprint Injection
          const newMatterId = result?.matterId ?? result?.converted_matter_id
          if (newMatterId) {
            runOnboarding.mutate({
              matterId: newMatterId,
              leadId,
            })

            // Redirect to the new Matter Detail page
            router.push(`/matters/${newMatterId}/shell`)
          }
        },
        onError: (error: Error) => {
          // Gracefully handle 403 Sentinel violations  -  show inline banner, don't crash
          const msg = error.message || 'An unexpected error occurred'
          if (
            msg.includes('Permission denied') ||
            msg.includes('Access denied') ||
            msg.includes('Account deactivated') ||
            msg.includes('No role assigned') ||
            msg.includes('403')
          ) {
            setConversionError(msg)
          }
        },
      }
    )
  }

  /** Handle compliance gate bypass  -  proceed to convert dialog */
  function handleComplianceBypassConfirmed() {
    setShowComplianceGate(false)
    setShowConvertDialog(true)
  }

  /** Handle "Generate Retainer" from compliance gate modal */
  function handleGenerateRetainer() {
    setShowComplianceGate(false)
    // Navigate to the retainer tab/section of this lead
    // The retainer builder is in the right panel
    router.push(`/leads/${leadId}#retainer`)
  }

  function handleLogCommunication(data: CommunicationFormData) {
    logCommMutation.mutate({
      leadId,
      tenantId,
      userId,
      channel: data.channel,
      direction: data.direction,
      subject: data.subject,
      bodyPreview: data.bodyPreview,
    })
  }

  function handleCompleteTask(taskId: string) {
    setUpdatingTaskId(taskId)
    updateTaskMutation.mutate(
      { leadId, taskId, action: 'complete', tenantId, userId },
      { onSettled: () => setUpdatingTaskId(null) }
    )
  }

  function handleSkipTask(taskId: string) {
    setUpdatingTaskId(taskId)
    updateTaskMutation.mutate(
      { leadId, taskId, action: 'skip', tenantId, userId },
      { onSettled: () => setUpdatingTaskId(null) }
    )
  }

  function handleDeleteLead() {
    deleteLeadMutation.mutate(
      leadId,
      {
        onSuccess: () => {
          setShowDeleteDialog(false)
          router.push('/leads')
        },
      }
    )
  }

  // ─── Loading State ──────────────────────────────────────────────────────────

  if (isLeadLoading || !lead) {
    return <PageSkeleton />
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <RouteGuard leadId={leadId}>
    <div className="flex flex-col h-[calc(100vh-var(--header-height,64px))]">
      {/* Header */}
      <LeadDetailHeader
        lead={lead}
        contact={contact}
        onEdit={!isTerminal ? () => router.push(`/leads/${leadId}/edit`) : undefined}
        onClose={!isTerminal ? () => setShowCloseDialog(true) : undefined}
        onReopen={isClosed ? () => setShowReopenDialog(true) : undefined}
        onConvert={
          currentStage === LEAD_STAGES.RETAINED_ACTIVE_MATTER
            ? handleConvertAttempt
            : undefined
        }
        onDelete={() => setShowDeleteDialog(true)}
        onStartIntake={!isReadOnly ? () => setShowIntakeSheet(true) : undefined}
      />

      {/* Stage Pipeline Bar */}
      <LeadStagePipelineBar
        currentStage={currentStage}
        transitions={stageTransitions?.transitions}
        onStageClick={(transition) => setAdvanceTransition(transition)}
        convertedMatterId={lead.converted_matter_id}
      />

      {/* Toolbar: Communication Sheet toggle (tablet) + Start Intake */}
      <div className="flex items-center gap-2 lg:hidden px-4 py-2 border-b">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowCommSheet(true)}
          className="text-xs"
        >
          <MessageSquare className="mr-1 h-3 w-3" />
          Communication
          {communicationEvents && (
            <span className="ml-1 text-muted-foreground">({communicationEvents.length})</span>
          )}
        </Button>
        {!isReadOnly && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowIntakeSheet(true)}
            className="text-xs border-violet-200 text-violet-700 hover:bg-violet-50"
          >
            <Brain className="mr-1 h-3 w-3" />
            Live Intake
          </Button>
        )}
      </div>

      {/* 3-Panel Grid */}
      <div className="grid flex-1 overflow-hidden lg:grid-cols-[320px_1fr_360px] md:grid-cols-[1fr_360px] grid-cols-1 gap-0">
        {/* Left Panel  -  Communication (desktop only) */}
        <div className="hidden lg:flex flex-col border-r overflow-hidden">
          <CommunicationPanel
            events={communicationEvents}
            users={users}
            isLoading={isCommLoading}
            isReadOnly={isReadOnly}
            onLogEvent={handleLogCommunication}
            isSubmitting={logCommMutation.isPending}
          />
          {/* Omniscient Archive — Microsoft Email Stream */}
          {contact?.email_primary && (
            <div className="border-t flex-1 overflow-hidden">
              <CommunicationStream
                contactEmail={contact.email_primary}
                contactName={`${contact.first_name ?? ''} ${contact.last_name ?? ''}`.trim()}
                leadId={leadId}
                contactId={contact.id}
              />
            </div>
          )}
        </div>

        {/* Centre Panel  -  Summary & Activity */}
        <div className="flex flex-col overflow-y-auto">
          <CentrePanel
            lead={lead}
            contact={contact}
            practiceArea={practiceArea}
            users={users}
            isReadOnly={isReadOnly}
            stageHistory={stageHistory}
            activities={leadActivities}
            isStageHistoryLoading={isStageHistoryLoading}
            insights={insights}
            isInsightsLoading={isInsightsLoading}
            onGenerateInsights={() => generateInsightsMutation.mutate({ leadId })}
            onAcceptInsight={(insightId) =>
              acceptInsightMutation.mutate({ leadId, insightId, tenantId, userId })
            }
            isGenerating={generateInsightsMutation.isPending}
            isAccepting={acceptInsightMutation.isPending}
            consultations={consultations}
            retainerPackages={retainerPackages}
            qualificationDecisions={qualificationDecisions}
          />
        </div>

        {/* Right Panel  -  Milestones & Tasks */}
        <div className="hidden md:flex flex-col border-l overflow-hidden">
          <RightPanel
            currentStage={currentStage}
            isReadOnly={isReadOnly}
            milestones={milestones}
            isMilestonesLoading={isMilestonesLoading}
            users={users}
            onCompleteTask={handleCompleteTask}
            onSkipTask={handleSkipTask}
            updatingTaskId={updatingTaskId}
            canConvert={conversionGatesData?.canConvert}
            gateResults={conversionGatesData?.gateResults}
            blockedReasons={conversionGatesData?.blockedReasons}
            isGatesLoading={isGatesLoading}
            onConvert={handleConvertAttempt}
            closureRecords={closureRecords}
            onReopen={() => setShowReopenDialog(true)}
          />
        </div>
      </div>

      {/* Communication Sheet (tablet/mobile) */}
      <Sheet open={showCommSheet} onOpenChange={setShowCommSheet}>
        <SheetContent side="left" className="w-[340px] p-0">
          <SheetHeader className="sr-only">
            <SheetTitle>Communication</SheetTitle>
          </SheetHeader>
          <CommunicationPanel
            events={communicationEvents}
            users={users}
            isLoading={isCommLoading}
            isReadOnly={isReadOnly}
            onLogEvent={handleLogCommunication}
            isSubmitting={logCommMutation.isPending}
          />
        </SheetContent>
      </Sheet>

      {/* Live Intake Sheet (mobile/tablet) */}
      <Sheet open={showIntakeSheet} onOpenChange={setShowIntakeSheet}>
        <SheetContent side="right" className="w-[360px] p-0">
          <SheetHeader className="sr-only">
            <SheetTitle>Live Intake</SheetTitle>
          </SheetHeader>
          <LiveIntakeSidebar
            leadId={leadId}
            tenantId={tenantId}
            userId={userId}
          />
        </SheetContent>
      </Sheet>

      {/* Compliance Gate Modal */}
      <ComplianceGateModal
        open={showComplianceGate}
        onOpenChange={setShowComplianceGate}
        leadId={leadId}
        tenantId={tenantId}
        userId={userId}
        userRole={userRole?.name ?? 'member'}
        onGenerateRetainer={handleGenerateRetainer}
        onBypassConfirmed={handleComplianceBypassConfirmed}
      />

      {/* ─── Dialogs ──────────────────────────────────────────────────── */}

      {/* Advance Stage */}
      <AdvanceStageDialog
        open={advanceTransition !== null}
        onOpenChange={(open) => { if (!open) setAdvanceTransition(null) }}
        transition={advanceTransition}
        currentStage={currentStage}
        onConfirm={handleAdvanceStage}
        isSubmitting={advanceStageMutation.isPending}
      />

      {/* Close Lead */}
      <CloseLeadDialog
        open={showCloseDialog}
        onOpenChange={setShowCloseDialog}
        onConfirm={handleCloseLead}
        isSubmitting={closeLeadMutation.isPending}
      />

      {/* Reopen Lead */}
      <ReopenLeadDialog
        open={showReopenDialog}
        onOpenChange={setShowReopenDialog}
        onConfirm={handleReopenLead}
        isSubmitting={reopenLeadMutation.isPending}
      />

      {/* Convert Lead */}
      <ConvertLeadDialog
        open={showConvertDialog}
        onOpenChange={setShowConvertDialog}
        canConvert={conversionGatesData?.canConvert ?? false}
        gateResults={conversionGatesData?.gateResults ?? []}
        blockedReasons={conversionGatesData?.blockedReasons ?? []}
        isGatesLoading={isGatesLoading}
        practiceAreas={practiceAreas}
        users={users}
        defaultTitle={contact ? `${contact.first_name ?? ''} ${contact.last_name ?? ''} – Matter`.trim() : ''}
        defaultPracticeAreaId={lead.practice_area_id ?? undefined}
        defaultResponsibleLawyerId={lead.responsible_lawyer_id ?? undefined}
        contact={contact}
        onConfirm={handleConvertLead}
        isSubmitting={convertLeadMutation.isPending}
        conversionError={conversionError}
      />

      {/* Delete Confirmation */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Lead</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this lead? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteLead}
              disabled={deleteLeadMutation.isPending}
            >
              {deleteLeadMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                'Delete Lead'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </RouteGuard>
  )
}

// ─── Page Skeleton ──────────────────────────────────────────────────────────

function PageSkeleton() {
  return (
    <div className="flex flex-col h-[calc(100vh-var(--header-height,64px))]">
      {/* Header skeleton */}
      <div className="flex items-center gap-3 px-4 py-3 border-b">
        <Skeleton className="h-8 w-8 rounded" />
        <Skeleton className="h-8 w-8 rounded-full" />
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-5 w-16 rounded-full" />
      </div>

      {/* Pipeline bar skeleton */}
      <div className="flex items-center gap-2 px-4 py-2 border-b">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-7 w-24 rounded-full" />
        ))}
      </div>

      {/* 3-panel skeleton */}
      <div className="grid flex-1 overflow-hidden lg:grid-cols-[320px_1fr_360px] gap-0">
        <div className="hidden lg:block border-r p-4 space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex gap-3">
              <Skeleton className="h-8 w-8 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3 w-32" />
                <Skeleton className="h-4 w-48" />
              </div>
            </div>
          ))}
        </div>
        <div className="p-4 space-y-4">
          <Skeleton className="h-48 w-full rounded-lg" />
          <Skeleton className="h-32 w-full rounded-lg" />
          <Skeleton className="h-64 w-full rounded-lg" />
        </div>
        <div className="hidden md:block border-l p-4 space-y-3">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-2 w-full rounded-full" />
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-lg" />
          ))}
        </div>
      </div>
    </div>
  )
}
