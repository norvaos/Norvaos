'use client'

/**
 * CentralActionPanel  -  Shows one primary next action + 1-2 secondary quick actions.
 *
 * The primary action is computed from `readinessData.nextAction` and `intakeStatus`.
 * Secondary actions are context-dependent (contradictions, pending review, missing fields, etc.).
 */

import { Button } from '@/components/ui/button'
import {
  Send,
  FileSearch,
  ShieldCheck,
  FileOutput,
  CheckCircle2,
  Eye,
  AlertTriangle,
  ClipboardList,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ImmigrationReadinessData } from '@/lib/queries/immigration-readiness'

// ── Types ──────────────────────────────────────────────────────────────────────

export interface CentralActionPanelProps {
  readinessData: ImmigrationReadinessData | null | undefined
  intakeStatus: string
  isLawyer: boolean
  onOpenDocRequest: () => void
  onNavigateToSection: (section: 'questions' | 'documents' | 'review' | 'formPacks') => void
  onOpenLawyerReview: () => void
  onOpenContradictionOverride: () => void
}

interface SecondaryAction {
  label: string
  icon: typeof Send
  onClick: () => void
}

// ── Component ──────────────────────────────────────────────────────────────────

export function CentralActionPanel({
  readinessData,
  intakeStatus,
  isLawyer,
  onOpenDocRequest,
  onNavigateToSection,
  onOpenLawyerReview,
  onOpenContradictionOverride,
}: CentralActionPanelProps) {
  if (!readinessData) return null

  const nextAction = readinessData.nextAction ?? 'No pending actions'

  // ── Primary action button logic ──────────────────────────────────────────

  const primary = computePrimaryAction(
    intakeStatus,
    readinessData,
    isLawyer,
    onOpenDocRequest,
    onNavigateToSection,
    onOpenLawyerReview,
    onOpenContradictionOverride,
  )

  // ── Secondary actions (max 2) ────────────────────────────────────────────

  const secondary = computeSecondaryActions(
    intakeStatus,
    readinessData,
    primary.key,
    onNavigateToSection,
  )

  // ── Accent colour based on status ────────────────────────────────────────

  const wrapperClass = intakeStatus === 'ready_for_filing'
    ? 'rounded-lg border-l-4 border-l-green-500 border bg-green-50/50 dark:bg-green-950/20 p-4'
    : intakeStatus === 'deficiency_outstanding'
      ? 'rounded-lg border-l-4 border-l-red-500 border bg-red-50/50 dark:bg-red-950/20 p-4'
      : 'rounded-lg border-l-4 border-l-blue-500 border bg-blue-50/50 dark:bg-blue-950/20 p-4'

  const labelClass = intakeStatus === 'ready_for_filing'
    ? 'text-[10px] font-semibold uppercase tracking-wider text-green-700 dark:text-green-300'
    : intakeStatus === 'deficiency_outstanding'
      ? 'text-[10px] font-semibold uppercase tracking-wider text-red-400 dark:text-red-300'
      : 'text-[10px] font-semibold uppercase tracking-wider text-blue-400 dark:text-blue-300'

  return (
    <div className={wrapperClass}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className={labelClass}>Next Action</p>
          <p className="text-sm font-medium mt-0.5">{nextAction}</p>
        </div>
        <Button
          size="sm"
          onClick={primary.onClick}
          className="shrink-0"
        >
          <primary.icon className="mr-1.5 h-3.5 w-3.5" />
          {primary.label}
        </Button>
      </div>

      {/* Secondary actions */}
      {secondary.length > 0 && (
        <div className="flex items-center gap-2 mt-2.5 pt-2.5 border-t border-slate-200/60">
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider shrink-0">Also</span>
          {secondary.map((action) => (
            <Button
              key={action.label}
              variant="outline"
              size="sm"
              className="text-xs h-7"
              onClick={action.onClick}
            >
              <action.icon className="mr-1 h-3 w-3" />
              {action.label}
            </Button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Primary action computation ─────────────────────────────────────────────────

function computePrimaryAction(
  intakeStatus: string,
  readinessData: ImmigrationReadinessData,
  isLawyer: boolean,
  onOpenDocRequest: () => void,
  onNavigateToSection: (section: 'questions' | 'documents' | 'review' | 'formPacks') => void,
  onOpenLawyerReview: () => void,
  onOpenContradictionOverride: () => void,
): { key: string; label: string; icon: typeof Send; onClick: () => void } {
  if (intakeStatus === 'not_issued' || intakeStatus === 'issued') {
    return {
      key: 'send_doc_request',
      label: 'Send Document Request',
      icon: Send,
      onClick: onOpenDocRequest,
    }
  }

  if (
    (intakeStatus === 'client_in_progress' || intakeStatus === 'review_required')
    && readinessData.documents.pendingReview > 0
  ) {
    return {
      key: 'review_documents',
      label: `Review & Accept ${readinessData.documents.pendingReview} Document${readinessData.documents.pendingReview > 1 ? 's' : ''}`,
      icon: FileSearch,
      onClick: () => onNavigateToSection('documents'),
    }
  }

  if (intakeStatus === 'lawyer_review' && isLawyer) {
    return {
      key: 'lawyer_review',
      label: 'Open Lawyer Review',
      icon: ShieldCheck,
      onClick: onOpenLawyerReview,
    }
  }

  if (intakeStatus === 'drafting_enabled' && !readinessData.formPacks.allReady) {
    return {
      key: 'generate_forms',
      label: 'Generate Immigration Forms',
      icon: FileOutput,
      onClick: () => onNavigateToSection('formPacks'),
    }
  }

  if (intakeStatus === 'ready_for_filing') {
    return {
      key: 'proceed_filing',
      label: 'Proceed to IRCC Filing',
      icon: CheckCircle2,
      onClick: () => onNavigateToSection('formPacks'),
    }
  }

  // Deficiency outstanding  -  specific action based on what's blocking
  if (intakeStatus === 'deficiency_outstanding') {
    // Contradictions are the primary deficiency
    if (readinessData.contradictions.blockingCount > 0 && !readinessData.contradictions.overridden) {
      return {
        key: 'override_contradictions',
        label: 'Override Contradictions',
        icon: AlertTriangle,
        onClick: onOpenContradictionOverride,
      }
    }
    // Documents need re-upload
    if (readinessData.documents.needsReUpload > 0) {
      return {
        key: 'review_deficiencies',
        label: `Request Re-upload for ${readinessData.documents.needsReUpload} Document${readinessData.documents.needsReUpload > 1 ? 's' : ''}`,
        icon: FileSearch,
        onClick: () => onNavigateToSection('documents'),
      }
    }
    // General deficiency  -  direct to review
    return {
      key: 'resolve_deficiency',
      label: 'Review Deficiencies',
      icon: AlertTriangle,
      onClick: () => onNavigateToSection('review'),
    }
  }

  // Default fallback
  return {
    key: 'view_details',
    label: 'View Details',
    icon: Eye,
    onClick: () => onNavigateToSection('review'),
  }
}

// ── Secondary actions computation (matrix-aware) ──────────────────────────────

function computeSecondaryActions(
  intakeStatus: string,
  readinessData: ImmigrationReadinessData,
  primaryKey: string,
  onNavigateToSection: (section: 'questions' | 'documents' | 'review' | 'formPacks') => void,
): SecondaryAction[] {
  const actions: SecondaryAction[] = []

  // Show contradictions if any exist and primary isn't already handling them
  if (readinessData.contradictions.blockingCount > 0 && !readinessData.contradictions.overridden && primaryKey !== 'view_details' && primaryKey !== 'override_contradictions') {
    actions.push({
      label: `Resolve ${readinessData.contradictions.blockingCount} Contradiction${readinessData.contradictions.blockingCount > 1 ? 's' : ''}`,
      icon: AlertTriangle,
      onClick: () => onNavigateToSection('review'),
    })
  }

  // Show pending documents if primary is something else but pending > 0
  if (primaryKey !== 'review_documents' && readinessData.documents.pendingReview > 0) {
    actions.push({
      label: `Accept ${readinessData.documents.pendingReview} Pending Doc${readinessData.documents.pendingReview > 1 ? 's' : ''}`,
      icon: FileSearch,
      onClick: () => onNavigateToSection('documents'),
    })
  }

  // Show missing questionnaire fields if readiness matrix has unsatisfied question rules
  if (primaryKey !== 'view_details') {
    const missingQCount = readinessData.readinessMatrix?.allBlockers
      .filter((b) => b.type === 'question').length ?? 0
    if (missingQCount > 0) {
      actions.push({
        label: `${missingQCount} Incomplete Questionnaire Field${missingQCount > 1 ? 's' : ''}`,
        icon: ClipboardList,
        onClick: () => onNavigateToSection('questions'),
      })
    }
  }

  return actions.slice(0, 2)
}
