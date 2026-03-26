'use client'

/**
 * SuggestedActions  -  Low-keyboard action table.
 *
 * Maps the current matter stage/state to a set of one-click actions.
 * Each action opens the appropriate dialog or panel.
 */

import {
  Send,
  FileSearch,
  ClipboardList,
  FileOutput,
  CheckCircle2,
  FileText,
  ArrowRight,
  Mail,
  Eye,
  ShieldCheck,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { ImmigrationReadinessData } from '@/lib/queries/immigration-readiness'

// ── Types ──────────────────────────────────────────────────────────────────────

export interface SuggestedActionsProps {
  intakeStatus?: string
  matterStatus?: string
  readinessData?: ImmigrationReadinessData | null
  onSendDocRequest?: () => void
  onOpenQuestionnaire?: () => void
  onReviewDocuments?: () => void
  onGenerateForms?: () => void
  onRunReadinessCheck?: () => void
  onClassifyDocument?: () => void
  onRecordOutcome?: () => void
  onInitiateNextStep?: () => void
  onSendWelcomeEmail?: () => void
  onOpenLawyerReview?: () => void
  onNavigateToSection?: (section: string) => void
}

interface ActionItem {
  key: string
  icon: React.ElementType
  label: string
  description: string
  onClick?: () => void
  variant?: 'default' | 'outline'
  badge?: string
}

// ── Stage-to-action mapping ────────────────────────────────────────────────────

function computeActions(props: SuggestedActionsProps): ActionItem[] {
  const {
    intakeStatus,
    matterStatus,
    readinessData,
    onSendDocRequest,
    onOpenQuestionnaire,
    onReviewDocuments,
    onGenerateForms,
    onRunReadinessCheck,
    onClassifyDocument,
    onRecordOutcome,
    onInitiateNextStep,
    onSendWelcomeEmail,
    onOpenLawyerReview,
  } = props

  const actions: ActionItem[] = []

  // Closed matters get no suggestions
  if (matterStatus === 'closed_won' || matterStatus === 'closed_lost' || matterStatus === 'archived') {
    return []
  }

  // Intake / early stages
  if (!intakeStatus || intakeStatus === 'not_issued' || intakeStatus === 'issued') {
    actions.push({
      key: 'complete-questionnaire',
      icon: ClipboardList,
      label: 'Complete Questionnaire',
      description: 'Begin or continue the intake questionnaire for this matter.',
      onClick: onOpenQuestionnaire,
      variant: 'default',
    })
    actions.push({
      key: 'request-documents',
      icon: Send,
      label: 'Request Documents',
      description: 'Send a document request to the client via portal or email.',
      onClick: onSendDocRequest,
    })
    if (onSendWelcomeEmail) {
      actions.push({
        key: 'send-welcome',
        icon: Mail,
        label: 'Send Welcome Email',
        description: 'Send an introductory email to the client with next steps.',
        onClick: onSendWelcomeEmail,
      })
    }
    return actions
  }

  // Client in progress / review required  -  document stage
  if (intakeStatus === 'client_in_progress' || intakeStatus === 'review_required') {
    const pendingDocs = readinessData?.documents?.pendingReview ?? 0
    if (pendingDocs > 0) {
      actions.push({
        key: 'review-documents',
        icon: FileSearch,
        label: 'Review Uploaded Documents',
        description: `${pendingDocs} document${pendingDocs > 1 ? 's' : ''} uploaded and awaiting your review.`,
        onClick: onReviewDocuments,
        variant: 'default',
        badge: `${pendingDocs}`,
      })
    }

    const missingFields = readinessData?.readinessMatrix?.allBlockers
      ?.filter((b) => b.type === 'question').length ?? 0
    if (missingFields > 0) {
      actions.push({
        key: 'complete-fields',
        icon: ClipboardList,
        label: 'Complete Missing Fields',
        description: `${missingFields} required field${missingFields > 1 ? 's' : ''} still incomplete.`,
        onClick: onOpenQuestionnaire,
        badge: `${missingFields}`,
      })
    }

    actions.push({
      key: 'request-missing',
      icon: Send,
      label: 'Request Missing Documents',
      description: 'Send a follow-up request for outstanding documents.',
      onClick: onSendDocRequest,
    })

    return actions
  }

  // Lawyer review
  if (intakeStatus === 'lawyer_review') {
    actions.push({
      key: 'lawyer-review',
      icon: ShieldCheck,
      label: 'Complete Lawyer Review',
      description: 'Review the complete submission package before proceeding.',
      onClick: onOpenLawyerReview,
      variant: 'default',
    })
    return actions
  }

  // Pre-submission / drafting
  if (intakeStatus === 'drafting_enabled') {
    actions.push({
      key: 'run-readiness',
      icon: CheckCircle2,
      label: 'Run Readiness Check',
      description: 'Verify all requirements are met before generating forms.',
      onClick: onRunReadinessCheck,
    })
    actions.push({
      key: 'generate-forms',
      icon: FileOutput,
      label: 'Generate Forms',
      description: 'Auto-generate the required immigration forms from profile data.',
      onClick: onGenerateForms,
      variant: 'default',
    })
    return actions
  }

  // Ready for filing
  if (intakeStatus === 'ready_for_filing') {
    actions.push({
      key: 'proceed-filing',
      icon: CheckCircle2,
      label: 'Proceed to Filing',
      description: 'All requirements met. Proceed to submit the application.',
      onClick: onGenerateForms,
      variant: 'default',
    })
    return actions
  }

  // Submitted / post-submission
  if (intakeStatus === 'submitted' || intakeStatus === 'filed') {
    actions.push({
      key: 'classify-doc',
      icon: FileText,
      label: 'Classify IRCC Document',
      description: 'Classify a received correspondence from IRCC.',
      onClick: onClassifyDocument,
    })
    actions.push({
      key: 'log-acknowledgement',
      icon: Eye,
      label: 'Log Acknowledgement',
      description: 'Record receipt of acknowledgement of submission.',
      onClick: onRecordOutcome,
    })
    return actions
  }

  // Post-decision
  if (intakeStatus === 'decided' || intakeStatus === 'approved' || intakeStatus === 'refused') {
    actions.push({
      key: 'record-outcome',
      icon: CheckCircle2,
      label: 'Record Outcome',
      description: 'Capture the final decision or outcome for this matter.',
      onClick: onRecordOutcome,
      variant: 'default',
    })
    if (onInitiateNextStep) {
      actions.push({
        key: 'initiate-next',
        icon: ArrowRight,
        label: 'Initiate Next Step',
        description: 'Begin the next course of action (appeal, reconsideration, new application).',
        onClick: onInitiateNextStep,
      })
    }
    return actions
  }

  // Fallback  -  generic view action
  actions.push({
    key: 'view-details',
    icon: Eye,
    label: 'View Details',
    description: 'Review the current state of this matter.',
    onClick: () => props.onNavigateToSection?.('documents'),
  })

  return actions
}

// ── Component ──────────────────────────────────────────────────────────────────

export function SuggestedActions(props: SuggestedActionsProps) {
  const actions = computeActions(props)

  if (actions.length === 0) return null

  return (
    <div className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Suggested Actions
      </h3>
      <div className="space-y-1.5">
        {actions.map((action) => {
          const Icon = action.icon
          return (
            <button
              key={action.key}
              onClick={action.onClick}
              className={cn(
                'flex items-center gap-3 w-full rounded-lg border p-3 text-left transition-colors hover:bg-accent',
                action.variant === 'default'
                  ? 'border-primary/20 bg-primary/5'
                  : 'border-border'
              )}
            >
              <Icon
                className={cn(
                  'h-4 w-4 shrink-0',
                  action.variant === 'default'
                    ? 'text-primary'
                    : 'text-muted-foreground'
                )}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{action.label}</span>
                  {action.badge && (
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                      {action.badge}
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5 truncate">
                  {action.description}
                </p>
              </div>
              <ArrowRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            </button>
          )
        })}
      </div>
    </div>
  )
}
