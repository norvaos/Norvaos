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
import { useSubmitLawyerReview } from '@/lib/queries/immigration-readiness'

// ── Types ──────────────────────────────────────────────────────────────────────

export interface LawyerReviewDialogProps {
  open: boolean
  onOpenChange: (v: boolean) => void
  matterId: string
  userId: string
}

// ── Component ──────────────────────────────────────────────────────────────────

export function LawyerReviewDialog({
  open,
  onOpenChange,
  matterId,
  userId,
}: LawyerReviewDialogProps) {
  const [notes, setNotes] = useState('')
  const submitReview = useSubmitLawyerReview()

  const handleSubmit = (action: 'approved' | 'changes_requested') => {
    submitReview.mutate(
      { matterId, action, notes, userId },
      {
        onSuccess: () => {
          toast.success(
            action === 'approved'
              ? 'Review approved — matter is ready for filing'
              : 'Changes requested — matter moved to deficiency'
          )
          setNotes('')
          onOpenChange(false)
        },
        onError: () => toast.error('Failed to submit review'),
      }
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Lawyer Review</DialogTitle>
          <DialogDescription>
            Review the complete intake, documents, and form packs before approving for filing.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Notes (optional)</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add review notes or instructions…"
              rows={3}
            />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => handleSubmit('changes_requested')}
            disabled={submitReview.isPending}
          >
            Request Changes
          </Button>
          <Button
            onClick={() => handleSubmit('approved')}
            disabled={submitReview.isPending}
          >
            {submitReview.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-1" />
            ) : null}
            Approve for Filing
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
