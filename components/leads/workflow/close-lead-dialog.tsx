'use client'

import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { CLOSURE_STAGE_DEFINITIONS } from '@/lib/config/lead-workflow-definitions'

// ─── Reason Code Options ────────────────────────────────────────────────────

const REASON_CODES = [
  { value: 'no_response', label: 'No Response' },
  { value: 'retainer_not_signed', label: 'Retainer Not Signed' },
  { value: 'client_declined', label: 'Client Declined' },
  { value: 'not_a_fit', label: 'Not a Fit' },
  { value: 'conflict_of_interest', label: 'Conflict of Interest' },
  { value: 'unable_to_pay', label: 'Unable to Pay' },
  { value: 'other', label: 'Other' },
] as const

// ─── Component ──────────────────────────────────────────────────────────────

interface CloseLeadDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: (data: {
    closedStage: string
    reasonCode: string
    reasonText: string
  }) => void
  isSubmitting?: boolean
}

export function CloseLeadDialog({
  open,
  onOpenChange,
  onConfirm,
  isSubmitting = false,
}: CloseLeadDialogProps) {
  const closureOptions = Object.values(CLOSURE_STAGE_DEFINITIONS)
  const [closedStage, setClosedStage] = useState<string>(closureOptions[0]?.stage ?? '')
  const [reasonCode, setReasonCode] = useState<string>(closureOptions[0]?.defaultReasonCode ?? '')
  const [reasonText, setReasonText] = useState('')

  const canSubmit = closedStage && reasonCode && !isSubmitting

  function handleConfirm() {
    if (!canSubmit) return
    onConfirm({ closedStage, reasonCode, reasonText })
    setReasonText('')
  }

  // When closed stage changes, update default reason code
  function handleStageChange(stage: string) {
    setClosedStage(stage)
    const def = CLOSURE_STAGE_DEFINITIONS[stage]
    if (def) setReasonCode(def.defaultReasonCode)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-background dark:bg-background/95 dark:backdrop-blur-xl dark:border-border">
        <DialogHeader>
          <DialogTitle>Close Lead</DialogTitle>
          <DialogDescription>
            Closing a lead will end all active tasks and mark it as closed.
            You can reopen it later if needed.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Closure stage */}
          <div className="space-y-1">
            <Label className="text-xs">Closure Reason</Label>
            <Select value={closedStage} onValueChange={handleStageChange}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {closureOptions.map((opt) => (
                  <SelectItem key={opt.stage} value={opt.stage}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Reason code */}
          <div className="space-y-1">
            <Label className="text-xs">Reason Code</Label>
            <Select value={reasonCode} onValueChange={setReasonCode}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REASON_CODES.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Reason text */}
          <div className="space-y-1">
            <Label className="text-xs">Additional Details</Label>
            <Textarea
              value={reasonText}
              onChange={(e) => setReasonText(e.target.value)}
              placeholder="Any additional context for closing this lead..."
              rows={3}
              className="text-sm resize-none"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleConfirm} disabled={!canSubmit}>
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Closing...
              </>
            ) : (
              'Close Lead'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
