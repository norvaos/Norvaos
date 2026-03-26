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
import { Input } from '@/components/ui/input'
import { TenantDateInput } from '@/components/ui/tenant-date-input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import { useRecordOutcome } from '@/lib/queries/lifecycle'

// ── Types ──────────────────────────────────────────────────────────────────────

export interface OutcomeCaptureDialogProps {
  open: boolean
  onOpenChange: (v: boolean) => void
  matterId: string
}

type EventType = 'approval' | 'refusal' | 'biometric' | 'medical' | 'passport_request' | 'pfl' | 'withdrawal'

const EVENT_TYPE_OPTIONS: { value: EventType; label: string }[] = [
  { value: 'approval', label: 'Approval / Grant' },
  { value: 'refusal', label: 'Refusal' },
  { value: 'biometric', label: 'Biometric Instruction' },
  { value: 'medical', label: 'Medical Request' },
  { value: 'passport_request', label: 'Passport Request (PPR)' },
  { value: 'pfl', label: 'Procedural Fairness Letter' },
  { value: 'withdrawal', label: 'Withdrawal' },
]

// ── Component ──────────────────────────────────────────────────────────────────

export function OutcomeCaptureDialog({
  open,
  onOpenChange,
  matterId,
}: OutcomeCaptureDialogProps) {
  const [eventType, setEventType] = useState<EventType | ''>('')
  const [issueDate, setIssueDate] = useState('')
  const [expiryDate, setExpiryDate] = useState('')
  const [refusalGrounds, setRefusalGrounds] = useState('')
  const [notes, setNotes] = useState('')

  const recordOutcome = useRecordOutcome()

  const resetForm = () => {
    setEventType('')
    setIssueDate('')
    setExpiryDate('')
    setRefusalGrounds('')
    setNotes('')
  }

  const handleSubmit = () => {
    if (!eventType) return

    const outcomeData: Record<string, unknown> = { notes }

    if (eventType === 'approval') {
      outcomeData.issue_date = issueDate || undefined
      outcomeData.expiry_date = expiryDate || undefined
    }

    if (eventType === 'refusal') {
      outcomeData.refusal_grounds = refusalGrounds || undefined
    }

    recordOutcome.mutate(
      { matterId, eventType, outcomeData },
      {
        onSuccess: () => {
          toast.success(`Outcome recorded: ${EVENT_TYPE_OPTIONS.find((o) => o.value === eventType)?.label}`)
          resetForm()
          onOpenChange(false)
        },
        onError: (err) => toast.error(err.message || 'Failed to record outcome'),
      }
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Record Outcome</DialogTitle>
          <DialogDescription>
            Capture the outcome or correspondence received for this matter.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Event type selection */}
          <div>
            <Label>Outcome Type</Label>
            <Select value={eventType} onValueChange={(v) => setEventType(v as EventType)}>
              <SelectTrigger>
                <SelectValue placeholder="Select outcome type..." />
              </SelectTrigger>
              <SelectContent>
                {EVENT_TYPE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Approval-specific fields */}
          {eventType === 'approval' && (
            <>
              <div>
                <Label>Issue Date</Label>
                <TenantDateInput
                  value={issueDate}
                  onChange={(iso) => setIssueDate(iso)}
                />
              </div>
              <div>
                <Label>Expiry Date (if applicable)</Label>
                <TenantDateInput
                  value={expiryDate}
                  onChange={(iso) => setExpiryDate(iso)}
                />
              </div>
            </>
          )}

          {/* Refusal-specific fields */}
          {eventType === 'refusal' && (
            <div>
              <Label>Refusal Grounds</Label>
              <Textarea
                value={refusalGrounds}
                onChange={(e) => setRefusalGrounds(e.target.value)}
                placeholder="Enter the grounds for refusal..."
                rows={3}
              />
            </div>
          )}

          {/* Common notes field */}
          <div>
            <Label>Notes (optional)</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Additional notes..."
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!eventType || recordOutcome.isPending}
          >
            {recordOutcome.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Record Outcome
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
