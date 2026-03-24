'use client'

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Loader2, XCircle } from 'lucide-react'

// ─── Lost reasons ───────────────────────────────────────────────────

export const LOST_REASONS = [
  'Price',
  'Ineligible',
  'No-Response',
  'Hired Competitor',
  'Other',
] as const

export type LostReason = (typeof LOST_REASONS)[number]

// ─── Component ──────────────────────────────────────────────────────

interface LostReasonDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: (reason: LostReason, detail: string) => Promise<void>
  onCancel: () => void
}

export function LostReasonDialog({
  open,
  onOpenChange,
  onConfirm,
  onCancel,
}: LostReasonDialogProps) {
  const [reason, setReason] = useState<string>('')
  const [detail, setDetail] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleCancel = () => {
    onCancel()
    setReason('')
    setDetail('')
  }

  const handleConfirm = async () => {
    if (!reason) return
    setIsSubmitting(true)
    try {
      await onConfirm(reason as LostReason, detail)
      setReason('')
      setDetail('')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          handleCancel()
        }
        onOpenChange(nextOpen)
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <XCircle className="h-5 w-5 text-red-500" />
            Close Lead as Lost
          </DialogTitle>
          <DialogDescription>
            Please select a reason for marking this lead as lost.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label className="text-sm">Reason *</Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger>
                <SelectValue placeholder="Select a reason..." />
              </SelectTrigger>
              <SelectContent>
                {LOST_REASONS.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm">
              Details {reason === 'Other' ? '*' : '(optional)'}
            </Label>
            <Textarea
              placeholder="Any additional context..."
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={handleCancel}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={!reason || isSubmitting}
          >
            {isSubmitting && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            Close as Lost
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
