'use client'

/**
 * MatterControlHeader  -  Clean 3-row control header for the unified immigration workspace.
 *
 * Row 1: Back button, title, client name, matter number, status/priority badges, edit/actions
 * Row 2: Stage pipeline bar (immigration or generic)
 * Row 3: Operational metrics  -  type, readiness %, drafting/filing status, lawyer review, stale packs
 */

import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { IMMIGRATION_INTAKE_STATUSES } from '@/lib/utils/constants'
import type { ImmigrationReadinessData } from '@/lib/queries/immigration-readiness'
import { FileText, FolderOpen } from 'lucide-react'

// ── Types ──────────────────────────────────────────────────────────────────────

export interface MatterControlHeaderProps {
  /** Matter type display name (e.g., "Spousal Sponsorship") */
  matterTypeName: string | null
  /** Immigration readiness data */
  readinessData: ImmigrationReadinessData | null | undefined
  /** Current intake status label (for display) */
  intakeStatusLabel?: string | null
  /** Called when user clicks the Forms % pill */
  onFormsClick?: () => void
  /** Called when user clicks the Docs % pill */
  onDocsClick?: () => void
}

// ── Component ──────────────────────────────────────────────────────────────────

export function MatterControlHeader({
  matterTypeName,
  readinessData,
  onFormsClick,
  onDocsClick,
}: MatterControlHeaderProps) {
  if (!readinessData) return null

  const matrix = readinessData.readinessMatrix
  const threshold = readinessData.playbook?.readinessThreshold ?? 85

  // Intake status label
  const statusMeta = IMMIGRATION_INTAKE_STATUSES.find(
    (s) => s.value === readinessData.intakeStatus
  )

  // Readiness % colour
  const pct = matrix?.overallPct ?? 0
  const pctClasses = pct >= threshold
    ? 'text-emerald-400 bg-emerald-950/40 border-emerald-500/30'
    : pct >= 60
      ? 'text-amber-400 bg-amber-100 border-amber-300'
      : 'text-red-400 bg-red-100 border-red-300'

  // Drafting / Filing status
  const hasDraftingBlockers = (matrix?.draftingBlockers.length ?? 0) > 0
  const hasFilingBlockers = (matrix?.filingBlockers.length ?? 0) > 0

  // Lawyer review
  const lawyerReviewNeeded = readinessData.lawyerReview.required
    && readinessData.lawyerReview.status !== 'approved'
    && readinessData.lawyerReview.status !== 'not_required'

  // Stale packs
  const stalePacks = readinessData.formPacks.stale.length

  // Form completion % (IRCC questionnaire)
  const formsPct = readinessData.questionnaire.completionPct
  const formsColour = formsPct >= 80
    ? 'text-emerald-400 bg-emerald-950/30 border-emerald-500/20'
    : formsPct >= 50
      ? 'text-amber-400 bg-amber-950/30 border-amber-200'
      : 'text-red-400 bg-red-950/30 border-red-200'

  // Doc completion % (accepted / total)
  const docs = readinessData.documents
  const docsPct = docs.totalSlots > 0
    ? Math.round((docs.accepted / docs.totalSlots) * 100)
    : 0
  const docsColour = docsPct >= 80
    ? 'text-emerald-400 bg-emerald-950/30 border-emerald-500/20'
    : docsPct >= 50
      ? 'text-amber-400 bg-amber-950/30 border-amber-200'
      : 'text-red-400 bg-red-950/30 border-red-200'

  return (
    <div className="rounded-lg border bg-card px-4 py-2.5 space-y-1.5">
      {/* Metrics strip */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        {/* Matter type  -  iron-canvas-guard for long translations */}
        {matterTypeName && (
          <span className="font-medium text-slate-700 iron-canvas-guard max-w-[200px]" title={matterTypeName}>
            {matterTypeName}
          </span>
        )}

        {/* Intake status */}
        {statusMeta && (
          <>
            <Divider />
            <Badge
              variant="outline"
              className="text-[11px] border iron-canvas-guard max-w-[180px]"
              title={statusMeta.label}
              style={{
                backgroundColor: `${statusMeta.color}15`,
                color: statusMeta.color,
                borderColor: `${statusMeta.color}30`,
              }}
            >
              {statusMeta.label}
            </Badge>
          </>
        )}

        {/* Readiness % */}
        {matrix && (
          <>
            <Divider />
            <div className="flex items-center gap-1.5">
              <span className="text-slate-500 iron-canvas-guard">Readiness</span>
              <div className="w-16 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                <div
                  className={cn(
                    'h-full rounded-full transition-all',
                    pct >= threshold ? 'bg-emerald-950/300' : pct >= 60 ? 'bg-amber-950/300' : 'bg-red-950/300'
                  )}
                  style={{ width: `${Math.min(pct, 100)}%` }}
                />
              </div>
              <span className={cn('font-semibold px-1.5 py-0.5 rounded-full border tabular-nums', pctClasses)}>
                {pct}%
              </span>
            </div>
          </>
        )}

        {/* Drafting status */}
        {matrix && (
          <>
            <Divider />
            <span className="text-slate-500 iron-canvas-guard">Drafting</span>
            {hasDraftingBlockers ? (
              <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                BLOCKED
              </Badge>
            ) : (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-green-300 text-green-700 bg-green-50">
                READY
              </Badge>
            )}
          </>
        )}

        {/* Filing status */}
        {matrix && (
          <>
            <Divider />
            <span className="text-slate-500 iron-canvas-guard">Filing</span>
            {hasFilingBlockers ? (
              <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                BLOCKED
              </Badge>
            ) : (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-green-300 text-green-700 bg-green-50">
                READY
              </Badge>
            )}
          </>
        )}

        {/* Lawyer review */}
        {lawyerReviewNeeded && (
          <>
            <Divider />
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-amber-300 text-amber-400 bg-amber-950/30 iron-canvas-guard max-w-[200px]" title="Lawyer Review Required">
              Lawyer Review Required
            </Badge>
          </>
        )}

        {/* Stale packs */}
        {stalePacks > 0 && (
          <>
            <Divider />
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-amber-300 text-amber-400 bg-amber-950/30 iron-canvas-guard max-w-[200px]" title={`${stalePacks} outdated ${stalePacks === 1 ? 'form pack' : 'form packs'}`}>
              {stalePacks} outdated {stalePacks === 1 ? 'form pack' : 'form packs'}
            </Badge>
          </>
        )}

        {/* Forms completion pill */}
        <>
          <Divider />
          <button
            type="button"
            onClick={onFormsClick}
            className={cn(
              'inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full border tabular-nums',
              formsColour,
              onFormsClick ? 'cursor-pointer hover:opacity-80' : 'cursor-default'
            )}
            title="IRCC questionnaire completion"
          >
            <FileText className="h-2.5 w-2.5" />
            Forms {formsPct}%
          </button>
        </>

        {/* Docs completion pill */}
        {docs.totalSlots > 0 && (
          <>
            <Divider />
            <button
              type="button"
              onClick={onDocsClick}
              className={cn(
                'inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full border tabular-nums',
                docsColour,
                onDocsClick ? 'cursor-pointer hover:opacity-80' : 'cursor-default'
              )}
              title={`${docs.accepted} of ${docs.totalSlots} documents accepted`}
            >
              <FolderOpen className="h-2.5 w-2.5" />
              Docs {docsPct}%
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function Divider() {
  return <div className="h-3 w-px bg-slate-200 shrink-0" />
}
