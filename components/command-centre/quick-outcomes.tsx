'use client'

import { useState, useMemo, useCallback } from 'react'
import { useCommandCentre } from './command-centre-context'
import { useUpdateLeadStage, useUpdateLead } from '@/lib/queries/leads'
import { ConversionDialog } from './conversion-dialog'
import { CloseLostDialog } from './close-lost-dialog'
import { Button } from '@/components/ui/button'
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
  CalendarCheck,
  UserX,
  FileSignature,
  CreditCard,
  Trophy,
  XCircle,
  AlertTriangle,
  Loader2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { useCommandPermissions } from '@/lib/hooks/use-command-permissions'
import { useComplianceMatrix, useHasGovernmentId } from '@/lib/hooks/use-compliance-data'

// ─── Stage discovery helpers ────────────────────────────────────────

function findStageByPattern(
  stages: { id: string; name: string; is_win_stage: boolean | null; is_lost_stage: boolean | null }[],
  pattern: RegExp
) {
  return stages.find((s) => pattern.test(s.name))
}

// ─── Component ──────────────────────────────────────────────────────

export function QuickOutcomes() {
  const {
    lead,
    contact,
    stages,
    tenantId,
    userId,
    entityId,
    isConverted,
  } = useCommandCentre()

  const updateLeadStage = useUpdateLeadStage()
  const updateLead = useUpdateLead()
  const { canMarkRetained, canCloseLost } = useCommandPermissions()

  // ── Directive 41.3: Step-Gate Compliance ──────────────────────────
  const matrix = useComplianceMatrix(
    contact?.id ?? null,
    entityId,
    null, // no matterId for leads
    tenantId
  )
  const { data: hasGovId } = useHasGovernmentId(contact?.id ?? null, tenantId)

  // Step 1 Gate: Conflict check must pass before advancing past inquiry
  const conflictGatePassed = matrix.conflict === 'passed'
  // Step 2 Gate: Government ID must exist before sending questionnaire/retainer
  const govIdGatePassed = !!hasGovId

  // Dialogs
  const [conversionOpen, setConversionOpen] = useState(false)
  const [closeLostOpen, setCloseLostOpen] = useState(false)
  const [noShowConfirmOpen, setNoShowConfirmOpen] = useState(false)
  const [isNoShowPending, setIsNoShowPending] = useState(false)
  const [isNoShowMarked, setIsNoShowMarked] = useState(false)
  const [confirmStage, setConfirmStage] = useState<{
    stageId: string
    stageName: string
    warning?: string
  } | null>(null)

  // Discover stages
  const winStage = useMemo(() => stages.find((s) => s.is_win_stage), [stages])
  const lostStage = useMemo(() => stages.find((s) => s.is_lost_stage), [stages])

  const consultStage = useMemo(
    () => findStageByPattern(stages, /consult.*book|book.*consult/i),
    [stages]
  )
  const retainerSentStage = useMemo(
    () => findStageByPattern(stages, /retainer.*sent|send.*retainer/i),
    [stages]
  )
  const signedPendingStage = useMemo(
    () => findStageByPattern(stages, /payment.*pending|retainer.*sign|signed/i),
    [stages]
  )

  // Current stage detection — highlight button matching current stage
  const currentStageId = lead?.stage_id
  const isAtConsult = currentStageId === consultStage?.id
  const isAtRetainerSent = currentStageId === retainerSentStage?.id
  const isAtSignedPending = currentStageId === signedPendingStage?.id
  const isAtWin = currentStageId === winStage?.id
  const isAtLost = currentStageId === lostStage?.id

  // Stage move handler with confirmation
  const handleStageMove = useCallback(
    (stageId: string, stageName: string, warning?: string) => {
      if (!lead || isConverted) return
      if (stageId === lead.stage_id) {
        toast.info(`Already at "${stageName}"`)
        return
      }
      setConfirmStage({ stageId, stageName, warning })
    },
    [lead, isConverted]
  )

  const confirmStageMove = useCallback(() => {
    if (!confirmStage || !lead) return
    updateLeadStage.mutate(
      { id: lead.id, stageId: confirmStage.stageId, userId },
      { onSuccess: () => toast.success(`Moved to "${confirmStage.stageName}"`) }
    )
    setConfirmStage(null)
    // Reset no-show highlight when moving to a different stage
    setIsNoShowMarked(false)
  }, [confirmStage, lead, updateLeadStage, userId])

  // No-show handler: logs activity + creates follow-up task
  const executeNoShow = useCallback(async () => {
    if (!lead || !contact) return
    setIsNoShowPending(true)
    try {
      const supabase = createClient()

      // Log no-show activity
      await supabase.from('activities').insert({
        tenant_id: tenantId,
        activity_type: 'no_show',
        title: 'Marked as No-Show',
        description: `${contact.first_name ?? ''} ${contact.last_name ?? ''} did not attend the consultation.`.trim(),
        entity_type: 'lead',
        entity_id: lead.id,
        user_id: userId,
      })

      // Create follow-up task
      const followUpDate = new Date()
      followUpDate.setDate(followUpDate.getDate() + 1)

      await supabase.from('tasks').insert({
        tenant_id: tenantId,
        contact_id: contact.id,
        title: `Follow up with ${contact.first_name ?? ''} ${contact.last_name ?? ''} (No-Show)`.trim(),
        due_date: followUpDate.toISOString().split('T')[0],
        assigned_to: lead.assigned_to ?? userId,
        assigned_by: userId,
        priority: 'high',
        status: 'not_started',
        created_via: 'manual',
        created_by: userId,
      })

      toast.success('Marked as No-Show. Follow-up task created for tomorrow.')
      setIsNoShowMarked(true)
      setNoShowConfirmOpen(false)
    } catch {
      toast.error('Failed to mark No-Show')
    } finally {
      setIsNoShowPending(false)
    }
  }, [lead, contact, tenantId, userId])

  if (!lead || isConverted) return null

  return (
    <>
      <div className="px-4 py-2 flex items-center gap-2 overflow-x-auto">
        {/* Book Consult — Step 1 Gate: Conflict check must be initiated */}
        <Button
          variant={isAtConsult ? 'default' : 'outline'}
          size="sm"
          className={cn(
            'h-8 text-xs gap-1.5 shrink-0',
            isAtConsult && 'bg-blue-600 hover:bg-blue-700 text-white',
            !conflictGatePassed && !isAtConsult && 'opacity-60'
          )}
          onClick={() => {
            if (!conflictGatePassed) {
              toast.error('Norva Sovereign Block: Conflict check must be cleared before booking a consultation.', {
                description: 'Run the conflict scan from the Compliance Pulse panel first.',
              })
              return
            }
            if (consultStage) {
              handleStageMove(consultStage.id, consultStage.name)
            } else {
              toast.info('No "Consultation Booked" stage found in pipeline')
            }
          }}
        >
          <CalendarCheck className="h-3.5 w-3.5" />
          <span className="hidden md:inline">Book Consult</span>
          <span className="md:hidden">Book</span>
        </Button>

        {/* Mark No-Show */}
        <Button
          variant={isNoShowMarked ? 'default' : 'outline'}
          size="sm"
          className={cn(
            'h-8 text-xs gap-1.5 shrink-0',
            isNoShowMarked && 'bg-amber-600 hover:bg-amber-700 text-white'
          )}
          onClick={() => setNoShowConfirmOpen(true)}
          disabled={isNoShowPending}
        >
          {isNoShowPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <UserX className="h-3.5 w-3.5" />
          )}
          <span className="hidden md:inline">{isNoShowMarked ? 'No-Show Marked' : 'Mark No-Show'}</span>
          <span className="md:hidden">No-Show</span>
        </Button>

        {/* Send Retainer — Step 2 Gate: Conflict check + Gov ID required */}
        <Button
          variant={isAtRetainerSent ? 'default' : 'outline'}
          size="sm"
          className={cn(
            'h-8 text-xs gap-1.5 shrink-0',
            isAtRetainerSent && 'bg-blue-600 hover:bg-blue-700 text-white',
            (!conflictGatePassed || !govIdGatePassed) && !isAtRetainerSent && 'opacity-60'
          )}
          onClick={() => {
            if (!conflictGatePassed) {
              toast.error('Norva Sovereign Block: Conflict check must be cleared before sending the retainer.', {
                description: 'Open the Compliance Pulse panel to run the conflict scan.',
              })
              return
            }
            if (!govIdGatePassed) {
              toast.error('Norva Sovereign Block: Government ID must be uploaded to the Norva Vault before sending the retainer.', {
                description: 'Upload a passport or government ID to the Identity category.',
              })
              return
            }
            if (retainerSentStage) {
              handleStageMove(retainerSentStage.id, retainerSentStage.name)
            } else {
              toast.info('No "Retainer Sent" stage found in pipeline')
            }
          }}
        >
          <FileSignature className="h-3.5 w-3.5" />
          <span className="hidden md:inline">Send Retainer</span>
          <span className="md:hidden">Retainer</span>
        </Button>

        {/* Signed – Payment Pending */}
        <Button
          variant={isAtSignedPending ? 'default' : 'outline'}
          size="sm"
          className={cn(
            'h-8 text-xs gap-1.5 shrink-0',
            isAtSignedPending && 'bg-blue-600 hover:bg-blue-700 text-white'
          )}
          onClick={() => {
            if (signedPendingStage) {
              handleStageMove(
                signedPendingStage.id,
                signedPendingStage.name,
                'This does NOT activate the client portal or document requirements. Portal access only activates at "Retained – Active Matter".'
              )
            } else {
              toast.info('No "Signed – Payment Pending" stage found in pipeline')
            }
          }}
        >
          <CreditCard className="h-3.5 w-3.5" />
          <span className="hidden md:inline">Signed – Payment Pending</span>
          <span className="md:hidden">Signed</span>
        </Button>

        {/* Retained – Active Matter (requires matters:create permission) */}
        <Button
          variant={isAtWin ? 'default' : 'outline'}
          size="sm"
          className={cn(
            'h-8 text-xs gap-1.5 shrink-0',
            isAtWin && 'bg-green-600 hover:bg-green-700 text-white'
          )}
          onClick={() => {
            if (!canMarkRetained) {
              toast.error('You do not have permission to convert leads')
              return
            }
            setConversionOpen(true)
          }}
          disabled={!winStage || !canMarkRetained}
        >
          <Trophy className="h-3.5 w-3.5" />
          <span className="hidden md:inline">Retained – Active Matter</span>
          <span className="md:hidden">Retain</span>
        </Button>

        {/* Close Lost (requires leads:edit permission) */}
        <Button
          variant={isAtLost ? 'default' : 'outline'}
          size="sm"
          className={cn(
            'h-8 text-xs gap-1.5 shrink-0',
            isAtLost && 'bg-red-600 hover:bg-red-700 text-white'
          )}
          onClick={() => {
            if (!canCloseLost) {
              toast.error('You do not have permission to close leads')
              return
            }
            setCloseLostOpen(true)
          }}
          disabled={!lostStage || !canCloseLost}
        >
          <XCircle className="h-3.5 w-3.5" />
          <span className="hidden md:inline">Close Lost</span>
          <span className="md:hidden">Lost</span>
        </Button>
      </div>

      {/* Stage move confirmation dialog */}
      <AlertDialog open={!!confirmStage} onOpenChange={() => setConfirmStage(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Move to &ldquo;{confirmStage?.stageName}&rdquo;?</AlertDialogTitle>
            <AlertDialogDescription>
              This will update the lead&apos;s pipeline stage.
              {confirmStage?.warning && (
                <span className="block mt-2 text-amber-600 font-medium">
                  <AlertTriangle className="inline h-3.5 w-3.5 mr-1" />
                  {confirmStage.warning}
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmStageMove}>
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Conversion dialog */}
      <ConversionDialog
        open={conversionOpen}
        onOpenChange={setConversionOpen}
      />

      {/* Close Lost dialog */}
      <CloseLostDialog
        open={closeLostOpen}
        onOpenChange={setCloseLostOpen}
      />

      {/* No-Show confirmation dialog */}
      <AlertDialog open={noShowConfirmOpen} onOpenChange={setNoShowConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mark as No-Show?</AlertDialogTitle>
            <AlertDialogDescription>
              {contact
                ? `Mark ${contact.first_name ?? ''} ${contact.last_name ?? ''} as a No-Show. A high-priority follow-up task will be created for tomorrow.`.trim()
                : 'Mark this lead as a No-Show. A follow-up task will be created for tomorrow.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isNoShowPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={executeNoShow} disabled={isNoShowPending}>
              {isNoShowPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirm No-Show
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
