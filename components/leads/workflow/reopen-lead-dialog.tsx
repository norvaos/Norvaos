'use client'

import { useState } from 'react'
import { Loader2, RotateCcw } from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ACTIVE_STAGES, STAGE_LABELS } from '@/lib/config/lead-workflow-definitions'
import type { LeadStage } from '@/lib/config/lead-workflow-definitions'

// ─── Task Strategy Options ──────────────────────────────────────────────────

const TASK_STRATEGIES = [
  {
    value: 'restore' as const,
    label: 'Restore Tasks',
    description: 'Keep existing tasks as they were before closure',
  },
  {
    value: 'reopen' as const,
    label: 'Reset Pending Tasks',
    description: 'Reset incomplete tasks back to pending status',
  },
  {
    value: 'regenerate' as const,
    label: 'Regenerate Tasks',
    description: 'Create fresh tasks based on the target stage',
  },
]

// ─── Component ──────────────────────────────────────────────────────────────

interface ReopenLeadDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: (data: {
    targetStage: string
    reason: string
    taskStrategy: 'restore' | 'reopen' | 'regenerate'
  }) => void
  isSubmitting?: boolean
}

export function ReopenLeadDialog({
  open,
  onOpenChange,
  onConfirm,
  isSubmitting = false,
}: ReopenLeadDialogProps) {
  const [targetStage, setTargetStage] = useState<string>(ACTIVE_STAGES[0])
  const [reason, setReason] = useState('')
  const [taskStrategy, setTaskStrategy] = useState<'restore' | 'reopen' | 'regenerate'>('restore')

  const canSubmit = targetStage && reason.trim().length > 0 && !isSubmitting

  function handleConfirm() {
    if (!canSubmit) return
    onConfirm({ targetStage, reason: reason.trim(), taskStrategy })
    setReason('')
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RotateCcw className="h-5 w-5" />
            Reopen Lead
          </DialogTitle>
          <DialogDescription>
            Reopening will restore this lead to an active pipeline stage.
            Choose where to place it and how to handle existing tasks.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Target stage */}
          <div className="space-y-1">
            <Label className="text-xs">Target Stage</Label>
            <Select value={targetStage} onValueChange={setTargetStage}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ACTIVE_STAGES.map((stage) => (
                  <SelectItem key={stage} value={stage}>
                    {STAGE_LABELS[stage as LeadStage] ?? stage}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Reason (required) */}
          <div className="space-y-1">
            <Label className="text-xs">
              Reason <span className="text-red-500">*</span>
            </Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why is this lead being reopened?"
              rows={2}
              className="text-sm resize-none"
            />
          </div>

          {/* Task strategy  -  button group */}
          <div className="space-y-2">
            <Label className="text-xs">Task Strategy</Label>
            <div className="space-y-1.5">
              {TASK_STRATEGIES.map((strategy) => (
                <button
                  key={strategy.value}
                  type="button"
                  onClick={() => setTaskStrategy(strategy.value)}
                  className={`flex w-full items-start gap-3 rounded-md border p-3 text-left transition-colors ${
                    taskStrategy === strategy.value
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:bg-muted/50'
                  }`}
                >
                  <div
                    className={`mt-0.5 h-4 w-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                      taskStrategy === strategy.value
                        ? 'border-primary'
                        : 'border-muted-foreground/30'
                    }`}
                  >
                    {taskStrategy === strategy.value && (
                      <div className="h-2 w-2 rounded-full bg-primary" />
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-medium">{strategy.label}</p>
                    <p className="text-xs text-muted-foreground">{strategy.description}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={!canSubmit}>
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Reopening...
              </>
            ) : (
              'Reopen Lead'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
