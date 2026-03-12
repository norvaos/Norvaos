'use client'

import { useState } from 'react'
import { useCommandCentre } from './command-centre-context'
import { useUpdateLead, useUpdateLeadStage } from '@/lib/queries/leads'
import { createClient } from '@/lib/supabase/client'
import type { Json } from '@/lib/types/database'
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
import { toast } from 'sonner'

// ─── Lost reasons ───────────────────────────────────────────────────

const LOST_REASONS = [
  'No Response',
  'Not Signed',
  'Declined',
  'Not a Fit',
  'Budget Constraints',
  'Competitor',
  'Other',
] as const

// ─── Component ──────────────────────────────────────────────────────

interface CloseLostDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CloseLostDialog({ open, onOpenChange }: CloseLostDialogProps) {
  const { lead, stages, tenantId, userId } = useCommandCentre()

  const updateLead = useUpdateLead()
  const updateLeadStage = useUpdateLeadStage()

  const [reason, setReason] = useState('')
  const [detail, setDetail] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const lostStage = stages.find((s) => s.is_lost_stage)

  const handleSubmit = async () => {
    if (!lead || !lostStage || !reason) return
    setIsSubmitting(true)

    try {
      // 1. Update lead status and lost reason
      await updateLead.mutateAsync({
        id: lead.id,
        status: 'lost',
      })

      // 2. Move to lost stage
      await updateLeadStage.mutateAsync({
        id: lead.id,
        stageId: lostStage.id,
      })

      // 3. Log activity
      const supabase = createClient()
      await supabase.from('activities').insert({
        tenant_id: tenantId,
        activity_type: 'lead_closed_lost',
        title: `Lead closed as lost: ${reason}`,
        description: detail || null,
        entity_type: 'lead',
        entity_id: lead.id,
        user_id: userId,
        metadata: { reason, detail: detail || null } as unknown as Json,
      })

      toast.success('Lead closed as lost')
      onOpenChange(false)
      setReason('')
      setDetail('')
    } catch {
      toast.error('Failed to close lead')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <XCircle className="h-5 w-5 text-red-500" />
            Close Lead as Lost
          </DialogTitle>
          <DialogDescription>
            This will move the lead to the &ldquo;{lostStage?.name ?? 'Lost'}&rdquo; stage and mark it as closed.
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
            <Label className="text-sm">Details (optional)</Label>
            <Textarea
              placeholder="Any additional context..."
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleSubmit}
            disabled={!reason || isSubmitting}
          >
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Close as Lost
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
