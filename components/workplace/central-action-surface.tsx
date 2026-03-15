'use client'

/**
 * CentralActionSurface (Zone 2) — The main working area.
 *
 * Shows blocker cards, suggested actions, document/form status summaries,
 * and the submission readiness checklist. For immigration matters, also
 * renders the existing workflow sections.
 */

import { useMemo } from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import {
  FileText,
  FolderOpen,
  CheckCircle2,
  Clock,
  AlertTriangle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { BlockerCards, type BlockerCardsProps } from './blocker-cards'
import { SuggestedActions, type SuggestedActionsProps } from './suggested-actions'
import type { ImmigrationReadinessData } from '@/lib/queries/immigration-readiness'

// ── Types ──────────────────────────────────────────────────────────────────────

export interface CentralActionSurfaceProps {
  matterId: string
  tenantId: string
  readinessData?: ImmigrationReadinessData | null
  intakeStatus?: string
  matterStatus?: string
  blockerCardProps?: BlockerCardsProps
  suggestedActionProps?: SuggestedActionsProps
  /** Immigration workspace workflow sections (rendered as children) */
  immigrationWorkspaceContent?: React.ReactNode
  isImmigrationWorkspace?: boolean
}

// ── Component ──────────────────────────────────────────────────────────────────

export function CentralActionSurface({
  matterId,
  tenantId,
  readinessData,
  intakeStatus,
  matterStatus,
  blockerCardProps,
  suggestedActionProps,
  immigrationWorkspaceContent,
  isImmigrationWorkspace = false,
}: CentralActionSurfaceProps) {
  // Document status summary
  const docStats = useMemo(() => {
    if (!readinessData?.documents) return null
    const { totalSlots, accepted, pendingReview, needsReUpload } = readinessData.documents
    if (totalSlots === 0) return null
    return {
      total: totalSlots,
      accepted,
      pending: pendingReview ?? 0,
      needsReUpload: needsReUpload ?? 0,
      pct: Math.round((accepted / totalSlots) * 100),
    }
  }, [readinessData])

  // Forms status summary
  const formStats = useMemo(() => {
    if (!readinessData?.questionnaire) return null
    return {
      pct: readinessData.questionnaire.completionPct,
    }
  }, [readinessData])

  // Readiness checklist
  const readinessItems = useMemo(() => {
    if (!readinessData?.readinessMatrix) return []
    const matrix = readinessData.readinessMatrix
    const items: Array<{ label: string; satisfied: boolean; severity: string }> = []

    // Check question blockers
    const questionBlockers = matrix.allBlockers?.filter((b) => b.type === 'question') ?? []
    items.push({
      label: 'Questionnaire complete',
      satisfied: questionBlockers.length === 0,
      severity: questionBlockers.length > 0 ? 'warning' : 'success',
    })

    // Check document blockers
    const docBlockers = matrix.allBlockers?.filter((b) => b.type === 'document') ?? []
    items.push({
      label: 'All documents accepted',
      satisfied: docBlockers.length === 0,
      severity: docBlockers.length > 0 ? 'warning' : 'success',
    })

    // Drafting readiness
    items.push({
      label: 'Drafting ready',
      satisfied: (matrix.draftingBlockers?.length ?? 0) === 0,
      severity: (matrix.draftingBlockers?.length ?? 0) > 0 ? 'warning' : 'success',
    })

    // Filing readiness
    items.push({
      label: 'Filing ready',
      satisfied: (matrix.filingBlockers?.length ?? 0) === 0,
      severity: (matrix.filingBlockers?.length ?? 0) > 0 ? 'warning' : 'success',
    })

    // Lawyer review
    if (readinessData.lawyerReview?.required) {
      items.push({
        label: 'Lawyer review complete',
        satisfied: readinessData.lawyerReview.status === 'approved',
        severity: readinessData.lawyerReview.status !== 'approved' ? 'warning' : 'success',
      })
    }

    // Contradictions
    if (readinessData.contradictions) {
      items.push({
        label: 'No contradictions',
        satisfied: readinessData.contradictions.blockingCount === 0 || readinessData.contradictions.overridden,
        severity: readinessData.contradictions.blockingCount > 0 && !readinessData.contradictions.overridden ? 'critical' : 'success',
      })
    }

    return items
  }, [readinessData])

  return (
    <ScrollArea className="flex-1 min-h-0">
      <div className="p-4 space-y-4">
        {/* Blocker cards */}
        {blockerCardProps && <BlockerCards {...blockerCardProps} />}

        {/* Suggested actions */}
        {suggestedActionProps && <SuggestedActions {...suggestedActionProps} />}

        {/* Status summary cards */}
        {(docStats || formStats) && (
          <div className="grid gap-3 sm:grid-cols-2">
            {/* Document status */}
            {docStats && (
              <div className="rounded-lg border bg-card p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <FolderOpen className="h-4 w-4 text-muted-foreground" />
                  <span className="text-xs font-medium">Documents</span>
                  <Badge
                    variant="outline"
                    className={cn(
                      'text-[10px] ml-auto',
                      docStats.pct >= 100
                        ? 'border-green-200 text-green-700'
                        : docStats.pct >= 50
                          ? 'border-amber-200 text-amber-700'
                          : 'border-red-200 text-red-700'
                    )}
                  >
                    {docStats.pct}%
                  </Badge>
                </div>
                <Progress value={docStats.pct} className="h-1.5" />
                <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                  <span>{docStats.accepted}/{docStats.total} accepted</span>
                  {docStats.pending > 0 && (
                    <span className="text-amber-600">{docStats.pending} pending</span>
                  )}
                  {docStats.needsReUpload > 0 && (
                    <span className="text-red-600">{docStats.needsReUpload} re-upload</span>
                  )}
                </div>
              </div>
            )}

            {/* Forms status */}
            {formStats && (
              <div className="rounded-lg border bg-card p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <span className="text-xs font-medium">Questionnaire</span>
                  <Badge
                    variant="outline"
                    className={cn(
                      'text-[10px] ml-auto',
                      formStats.pct >= 100
                        ? 'border-green-200 text-green-700'
                        : formStats.pct >= 50
                          ? 'border-amber-200 text-amber-700'
                          : 'border-red-200 text-red-700'
                    )}
                  >
                    {formStats.pct}%
                  </Badge>
                </div>
                <Progress value={formStats.pct} className="h-1.5" />
              </div>
            )}
          </div>
        )}

        {/* Submission readiness checklist */}
        {readinessItems.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Readiness Checklist
            </h3>
            <div className="rounded-lg border bg-card p-3 space-y-1.5">
              {readinessItems.map((item) => (
                <div key={item.label} className="flex items-center gap-2 text-sm">
                  {item.satisfied ? (
                    <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                  ) : item.severity === 'critical' ? (
                    <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />
                  ) : (
                    <Clock className="h-4 w-4 text-amber-500 shrink-0" />
                  )}
                  <span
                    className={cn(
                      'text-xs',
                      item.satisfied
                        ? 'text-green-700'
                        : item.severity === 'critical'
                          ? 'text-red-700'
                          : 'text-amber-700'
                    )}
                  >
                    {item.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Immigration workspace content (workflow sections) */}
        {isImmigrationWorkspace && immigrationWorkspaceContent}
      </div>
    </ScrollArea>
  )
}
