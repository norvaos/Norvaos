'use client'

import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import { useOverrideContradictions } from '@/lib/queries/immigration-readiness'

// ── Types ──────────────────────────────────────────────────────────────────────

export interface ContradictionOverrideDialogProps {
  open: boolean
  onOpenChange: (v: boolean) => void
  matterId: string
  userId: string
}

// ── Component ──────────────────────────────────────────────────────────────────

export function ContradictionOverrideDialog({
  open,
  onOpenChange,
  matterId,
  userId,
}: ContradictionOverrideDialogProps) {
  const [reason, setReason] = useState('')
  const override = useOverrideContradictions()

  const handleOverride = () => {
    if (!reason.trim()) {
      toast.error('Reason is required to override contradictions')
      return
    }
    override.mutate(
      { matterId, reason, userId },
      {
        onSuccess: () => {
          toast.success('Contradictions overridden')
          setReason('')
          onOpenChange(false)
        },
        onError: () => toast.error('Failed to override contradictions'),
      }
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Override Contradictions</DialogTitle>
          <DialogDescription>
            This will allow the matter to proceed past contradiction blocks. The contradictions
            will remain visible but will no longer prevent drafting or filing. If intake data
            changes after override, contradictions will be re-evaluated.
          </DialogDescription>
        </DialogHeader>
        <div>
          <Label>Override Reason (required)</Label>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Explain why these contradictions are acceptable…"
            rows={3}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleOverride}
            disabled={override.isPending || !reason.trim()}
          >
            {override.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-1" />
            ) : null}
            Confirm Override
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
