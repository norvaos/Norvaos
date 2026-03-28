'use client'

import { useState } from 'react'
import { CheckCircle2, XCircle, Loader2, ShieldAlert } from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { getStageLabel } from './lead-workflow-helpers'
import type { TransitionWithStatus } from './lead-workflow-types'

// ─── Component ──────────────────────────────────────────────────────────────

interface AdvanceStageDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  transition: TransitionWithStatus | null
  currentStage: string | null
  onConfirm: (targetStage: string, reason: string) => void
  isSubmitting?: boolean
}

export function AdvanceStageDialog({
  open,
  onOpenChange,
  transition,
  currentStage,
  onConfirm,
  isSubmitting = false,
}: AdvanceStageDialogProps) {
  const [reason, setReason] = useState('')

  if (!transition) return null

  const isBlocked = !transition.allowed
  const canSubmit = !isBlocked && !isSubmitting

  function handleConfirm() {
    if (!canSubmit) return
    onConfirm(transition!.toStage, reason)
    setReason('')
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Advance Stage</DialogTitle>
          <DialogDescription>
            {currentStage
              ? `Move from ${getStageLabel(currentStage)} to ${getStageLabel(transition.toStage)}`
              : `Advance to ${getStageLabel(transition.toStage)}`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Guard checklist */}
          {transition.guards.length > 0 && (
            <div className="space-y-2">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Requirements
              </Label>
              <div className="space-y-1.5">
                {transition.guards.map((guard, idx) => (
                  <div key={idx} className="flex items-start gap-2">
                    {transition.allowed ? (
                      <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
                    ) : (
                      <XCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                    )}
                    <span className="text-sm">{guard.description}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Blocked reasons */}
          {isBlocked && transition.blockedReasons.length > 0 && (
            <div className="rounded-md bg-red-950/30 border border-red-500/20 px-3 py-2">
              <div className="flex items-center gap-2 mb-1">
                <ShieldAlert className="h-4 w-4 text-red-500" />
                <span className="text-sm font-medium text-red-400">Cannot advance</span>
              </div>
              <ul className="space-y-0.5 ml-6">
                {transition.blockedReasons.map((reason, idx) => (
                  <li key={idx} className="text-xs text-red-600">• {reason}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Reason textarea */}
          {!isBlocked && (
            <div className="space-y-1">
              <Label className="text-xs">Reason (optional)</Label>
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Why is this stage being advanced?"
                rows={2}
                className="text-sm resize-none"
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={!canSubmit}>
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Advancing...
              </>
            ) : (
              'Advance Stage'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
