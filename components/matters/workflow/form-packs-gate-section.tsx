'use client'

/**
 * FormPacksGateSection — Gated wrapper for IRCC form generation.
 *
 * Before drafting_enabled: shows a locked card with readiness progress.
 * After drafting_enabled: renders IRCCFormsTab directly.
 */

import { Lock, Unlock, Pencil } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { ImmigrationReadinessData } from '@/lib/queries/immigration-readiness'

// ── Types ──────────────────────────────────────────────────────────────────────

export interface FormPacksGateSectionProps {
  readinessData: ImmigrationReadinessData | null | undefined
  intakeStatus: string
  /** Render prop for the IRCCFormsTab component (avoids circular imports) */
  renderFormsTab: () => React.ReactNode
  onNavigateToSection: (section: 'review') => void
  /** Opens the IRCC Intake sheet so the lawyer can fill in / edit form answers */
  onOpenIRCCIntake?: () => void
}

// Status order for comparison
const STATUS_ORDER = [
  'not_issued',
  'issued',
  'client_in_progress',
  'review_required',
  'deficiency_outstanding',
  'intake_complete',
  'drafting_enabled',
  'lawyer_review',
  'ready_for_filing',
  'filed',
]

function isBeforeDrafting(status: string): boolean {
  const idx = STATUS_ORDER.indexOf(status)
  const draftingIdx = STATUS_ORDER.indexOf('drafting_enabled')
  return idx < draftingIdx
}

// ── Component ──────────────────────────────────────────────────────────────────

export function FormPacksGateSection({
  readinessData,
  intakeStatus,
  renderFormsTab,
  onNavigateToSection,
  onOpenIRCCIntake,
}: FormPacksGateSectionProps) {
  if (!readinessData) return null

  const locked = isBeforeDrafting(intakeStatus)
  const matrix = readinessData.readinessMatrix
  const pct = matrix?.overallPct ?? 0
  const threshold = readinessData.playbook?.readinessThreshold ?? 85
  const blockersRemaining = (matrix?.draftingBlockers.length ?? 0)
  const statusBlockers = readinessData.blockedReasons ?? []

  // Portal form status summary — visible in both locked and unlocked states
  const portalFormsSummary = readinessData.portalForms ? (
    <div className="rounded-lg border border-slate-200 bg-white p-3 mb-3">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-medium text-slate-700">Portal Form Status</p>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-slate-500">
            {readinessData.portalForms.completedForms} of {readinessData.portalForms.totalForms} completed
          </span>
          {onOpenIRCCIntake && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-[11px] gap-1 text-blue-600 hover:text-blue-700"
              onClick={onOpenIRCCIntake}
            >
              <Pencil className="h-3 w-3" />
              Fill in
            </Button>
          )}
        </div>
      </div>
      <div className="space-y-1.5">
        {readinessData.portalForms.forms.map((f) => (
          <div key={f.form_id} className="flex items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className={cn(
                'shrink-0 w-2 h-2 rounded-full',
                f.status === 'completed' ? 'bg-green-500' :
                f.status === 'in_progress' ? 'bg-blue-500' : 'bg-slate-300'
              )} />
              <span className="text-slate-700 truncate">{f.form_code} &mdash; {f.form_name}</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className={cn(
                'text-[11px] font-medium',
                f.status === 'completed' ? 'text-green-600' :
                f.status === 'in_progress' ? 'text-blue-600' : 'text-slate-400'
              )}>
                {f.status === 'completed' ? 'Completed' :
                 f.status === 'in_progress' ? `${f.progress_percent}%` : 'Not started'}
              </span>
              {onOpenIRCCIntake && (
                <button
                  onClick={onOpenIRCCIntake}
                  className="text-[11px] text-blue-600 hover:text-blue-800 hover:underline"
                >
                  {f.status === 'completed' ? 'Review' : f.status === 'in_progress' ? 'Continue' : 'Start'} →
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
      {readinessData.portalForms.completedForms < readinessData.portalForms.totalForms && (
        <p className="text-[11px] text-amber-600 mt-2">
          Package generation blocked: awaiting client portal form completion
        </p>
      )}
    </div>
  ) : null

  if (locked) {
    return (
      <div>
        {portalFormsSummary}
        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50/50 p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Lock className="h-5 w-5 text-slate-400 shrink-0" />
              <div>
                <p className="text-sm font-medium text-slate-700">
                  Form Packs & Drafting
                </p>
                <p className="text-xs text-slate-500 mt-0.5">
                  Reach {threshold}% readiness to unlock form generation.
                  {blockersRemaining > 0 && (
                    <>
                      {' '}{blockersRemaining} blocker{blockersRemaining > 1 ? 's' : ''} remaining.{' '}
                      <button
                        onClick={() => onNavigateToSection('review')}
                        className="text-blue-600 hover:text-blue-800 underline"
                      >
                        View in Review section
                      </button>
                    </>
                  )}
                </p>
                {statusBlockers.length > 0 && (
                  <ul className="mt-2 space-y-0.5">
                    {statusBlockers.slice(0, 3).map((reason, i) => (
                      <li key={i} className="text-xs text-amber-700 flex items-start gap-1">
                        <span className="shrink-0 mt-px">→</span>
                        <span>{reason}</span>
                      </li>
                    ))}
                    {statusBlockers.length > 3 && (
                      <li className="text-xs text-slate-400">…and {statusBlockers.length - 3} more</li>
                    )}
                  </ul>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <div className="w-24 h-2 bg-slate-200 rounded-full overflow-hidden">
                <div
                  className={cn(
                    'h-full rounded-full transition-all',
                    pct >= threshold ? 'bg-green-500' : pct >= 60 ? 'bg-amber-500' : 'bg-red-500'
                  )}
                  style={{ width: `${Math.min(pct, 100)}%` }}
                />
              </div>
              <span className="text-xs font-medium text-slate-500 tabular-nums w-8 text-right">
                {pct}%
              </span>
              <Badge variant="outline" className="text-[10px] border-slate-300 text-slate-500">
                LOCKED
              </Badge>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Unlocked — render the forms tab
  return (
    <div>
      {portalFormsSummary}
      <div className="rounded-lg border bg-card">
        <div className="flex items-center gap-2 px-4 py-2.5 border-b">
          <Unlock className="h-4 w-4 text-green-600" />
          <span className="text-sm font-medium">Form Packs & Drafting</span>
          <Badge variant="outline" className="text-[10px] border-green-300 text-green-700 bg-green-50 ml-1">
            UNLOCKED
          </Badge>
          {readinessData.formPacks.stale.length > 0 && (
            <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-700 bg-amber-50 ml-1">
              {readinessData.formPacks.stale.length} outdated
            </Badge>
          )}
        </div>
        <div className="p-4">
          {renderFormsTab()}
        </div>
      </div>
    </div>
  )
}
