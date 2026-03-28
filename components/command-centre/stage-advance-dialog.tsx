'use client'

/**
 * StageAdvanceDialog
 *
 * A rich confirmation dialog shown before any action that changes the
 * lead's pipeline stage. Shows:
 *   - Current stage → proposed stage (visual arrow)
 *   - Stage description & win probability
 *   - Automated actions that will fire (tasks, notifications, etc.)
 *   - "Yes, advance" / "Keep current stage" choice
 *
 * Usage:
 *   <StageAdvanceDialog
 *     open={open}
 *     onConfirm={() => doTheAction(true)}
 *     onSkip={() => doTheAction(false)}
 *     onCancel={() => setOpen(false)}
 *     currentStageName="Appointment Completed"
 *     proposedStageName="Retainer Sent"
 *     proposedStageColor="#f59e0b"
 *     proposedWinProbability={70}
 *     proposedStageDescription="Retainer agreement has been sent..."
 *     automations={['Retainer package created', 'Task: Prepare retainer (due in 2 days)']}
 *     isLostMove={false}
 *   />
 */

import { cn } from '@/lib/utils'
import { ArrowRight, TrendingUp, TrendingDown, Minus, AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

// ─── Props ──────────────────────────────────────────────────────────────────

export interface StageAdvanceDialogProps {
  open: boolean
  onConfirm: () => void
  onSkip: () => void
  onCancel: () => void
  isSubmitting?: boolean

  contactName?: string
  currentStageName?: string | null
  currentStageColor?: string | null
  proposedStageName: string
  proposedStageColor?: string | null
  proposedWinProbability?: number | null
  proposedStageDescription?: string | null
  automations?: string[]
  isLostMove?: boolean
  isWinMove?: boolean
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function WinBadge({ pct }: { pct: number }) {
  const color = pct >= 80
    ? 'text-emerald-400 bg-emerald-950/30 border-emerald-500/20'
    : pct >= 50
      ? 'text-blue-400 bg-blue-950/30 border-blue-500/20'
      : pct >= 20
        ? 'text-amber-400 bg-amber-950/30 border-amber-500/20'
        : 'text-slate-500 bg-slate-50 border-slate-200'

  const Icon = pct >= 50 ? TrendingUp : pct === 0 ? TrendingDown : Minus
  return (
    <span className={cn('inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full border', color)}>
      <Icon className="h-3 w-3" />
      {pct}% retention probability
    </span>
  )
}

// ─── Component ──────────────────────────────────────────────────────────────

export function StageAdvanceDialog({
  open,
  onConfirm,
  onSkip,
  onCancel,
  isSubmitting = false,
  contactName,
  currentStageName,
  currentStageColor,
  proposedStageName,
  proposedStageColor,
  proposedWinProbability,
  proposedStageDescription,
  automations = [],
  isLostMove = false,
  isWinMove = false,
}: StageAdvanceDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && !isSubmitting) onCancel() }}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isLostMove ? (
              <AlertTriangle className="h-5 w-5 text-red-500 shrink-0" />
            ) : isWinMove ? (
              <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />
            ) : (
              <ArrowRight className="h-5 w-5 text-blue-500 shrink-0" />
            )}
            Advance Pipeline Stage?
          </DialogTitle>
          <DialogDescription>
            {contactName
              ? `This action will move ${contactName} to a new pipeline stage.`
              : 'This action will move the lead to a new pipeline stage.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">

          {/* Stage transition visual */}
          <div className="flex items-center gap-2 p-3 rounded-lg bg-slate-50 border">
            {/* Current stage */}
            <div className="flex-1 min-w-0">
              <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wide mb-1">Current Stage</p>
              <div className="flex items-center gap-2">
                <span
                  className="h-3 w-3 rounded-full shrink-0"
                  style={{ backgroundColor: currentStageColor ?? '#94a3b8' }}
                />
                <span className="text-sm font-medium text-slate-600 truncate">
                  {currentStageName ?? 'Unknown'}
                </span>
              </div>
            </div>

            {/* Arrow */}
            <ArrowRight className="h-5 w-5 text-slate-400 shrink-0" />

            {/* Proposed stage */}
            <div className="flex-1 min-w-0">
              <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wide mb-1">Moving To</p>
              <div className="flex items-center gap-2">
                <span
                  className="h-3 w-3 rounded-full shrink-0 ring-2 ring-offset-1"
                  style={{
                    backgroundColor: proposedStageColor ?? '#6366f1',
                    // ring colour via CSS custom property (Tailwind arbitrary ring)
                    ['--tw-ring-color' as string]: proposedStageColor ?? '#6366f1',
                  }}
                />
                <span className="text-sm font-semibold text-slate-900 truncate">
                  {proposedStageName}
                </span>
              </div>
            </div>
          </div>

          {/* Win probability */}
          {proposedWinProbability !== null && proposedWinProbability !== undefined && (
            <div>
              <WinBadge pct={proposedWinProbability} />
            </div>
          )}

          {/* Stage description */}
          {proposedStageDescription && (
            <div className="rounded-md border border-blue-100 bg-blue-950/30/60 px-3 py-2.5">
              <p className="text-xs text-blue-400 leading-relaxed">
                <span className="font-semibold">What this means: </span>
                {proposedStageDescription}
              </p>
            </div>
          )}

          {/* Automations that will fire */}
          {automations.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-500 mb-1.5">Actions that will happen automatically:</p>
              <ul className="space-y-1">
                {automations.map((a, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-xs text-slate-600">
                    <span className="text-emerald-500 mt-0.5 shrink-0">✓</span>
                    {a}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Lost-move warning */}
          {isLostMove && (
            <div className="rounded-md border border-red-500/20 bg-red-950/30 px-3 py-2.5">
              <p className="text-xs text-red-400 font-medium">
                ⚠ This will close the lead as <strong>Lost</strong>. This action can only be undone by a manager.
              </p>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-2 pt-2">
          <Button
            onClick={onConfirm}
            disabled={isSubmitting}
            className={cn(
              'w-full',
              isLostMove
                ? 'bg-red-600 hover:bg-red-700 text-white'
                : isWinMove
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                  : ''
            )}
          >
            {isSubmitting ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Processing…</>
            ) : (
              <>
                <ArrowRight className="mr-2 h-4 w-4" />
                Yes  -  advance to &ldquo;{proposedStageName}&rdquo;
              </>
            )}
          </Button>
          <Button
            variant="outline"
            onClick={onSkip}
            disabled={isSubmitting}
            className="w-full"
          >
            Record outcome but keep current stage
          </Button>
          <Button
            variant="ghost"
            onClick={onCancel}
            disabled={isSubmitting}
            className="w-full text-slate-500"
          >
            Cancel  -  go back
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
