'use client'

import { useState, useEffect } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

/**
 * Log Meeting Dialog
 *
 * Redesigned per spec:
 *  - Duration: preset dropdown (5 / 15 / 30 / 60 min) + "Custom" free-type
 *  - Primary attendee: pre-filled with current contact name (mandatory, read-only)
 *  - If contact has matters → matter picker appears
 *  - Optional additional attendees free-text field
 *  - Notes: mandatory
 */

interface MatterOption {
  value: string
  label: string
}

interface LogMeetingDialogProps {
  isOpen: boolean
  isSubmitting: boolean
  contactName: string
  contactId: string
  matterOptions: MatterOption[]
  onClose: () => void
  onSubmit: (data: {
    contactId: string
    meetingType: string
    durationMinutes: number | null
    attendees: string
    matterId?: string
    notes: string
  }) => void
}

const DURATION_PRESETS = [
  { value: '5',    label: '5 minutes'  },
  { value: '15',   label: '15 minutes' },
  { value: '30',   label: '30 minutes' },
  { value: '60',   label: '1 hour'     },
  { value: 'custom', label: 'Custom…'  },
]

export function LogMeetingDialog({
  isOpen,
  isSubmitting,
  contactName,
  contactId,
  matterOptions,
  onClose,
  onSubmit,
}: LogMeetingDialogProps) {
  const [meetingType, setMeetingType]         = useState('in_person')
  const [durationPreset, setDurationPreset]   = useState('30')
  const [customDuration, setCustomDuration]   = useState('')
  const [additionalAttendees, setAdditionalAttendees] = useState('')
  const [matterId, setMatterId]               = useState('')
  const [notes, setNotes]                     = useState('')
  const [submitted, setSubmitted]             = useState(false)

  // Reset form when dialog opens
  useEffect(() => {
    if (isOpen) {
      setMeetingType('in_person')
      setDurationPreset('30')
      setCustomDuration('')
      setAdditionalAttendees('')
      setMatterId('')
      setNotes('')
      setSubmitted(false)
    }
  }, [isOpen])

  const isCustomDuration = durationPreset === 'custom'

  // Compute final duration in minutes (null if blank custom)
  const finalDurationMinutes: number | null = (() => {
    if (durationPreset === 'custom') {
      const parsed = parseInt(customDuration, 10)
      return isNaN(parsed) || parsed <= 0 ? null : parsed
    }
    return parseInt(durationPreset, 10)
  })()

  // Build attendees string: always starts with the contact name
  const buildAttendees = () => {
    const parts = [contactName]
    if (additionalAttendees.trim()) {
      parts.push(additionalAttendees.trim())
    }
    return parts.join(', ')
  }

  const notesEmpty   = !notes.trim()
  const showErrors   = submitted

  function handleSubmit() {
    setSubmitted(true)
    if (notesEmpty) return

    onSubmit({
      contactId,
      meetingType,
      durationMinutes: finalDurationMinutes,
      attendees: buildAttendees(),
      matterId: matterId || undefined,
      notes: notes.trim(),
    })
  }

  // Active matters (exclude the blank "no matter" option for rendering)
  const activeMatters = matterOptions.filter((m) => m.value !== '')

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Log Meeting</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* Meeting Type */}
          <div className="space-y-1.5">
            <Label>Meeting Type</Label>
            <Select value={meetingType} onValueChange={setMeetingType} disabled={isSubmitting}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="in_person">In-Person</SelectItem>
                <SelectItem value="video">Video Call</SelectItem>
                <SelectItem value="phone">Phone Call</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Duration */}
          <div className="space-y-1.5">
            <Label>Duration</Label>
            <Select value={durationPreset} onValueChange={setDurationPreset} disabled={isSubmitting}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DURATION_PRESETS.map((p) => (
                  <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {isCustomDuration && (
              <Input
                type="number"
                min={1}
                max={480}
                placeholder="Enter minutes (e.g. 45)"
                value={customDuration}
                onChange={(e) => setCustomDuration(e.target.value)}
                disabled={isSubmitting}
                className="mt-1.5"
              />
            )}
          </div>

          {/* Primary Attendee — pre-filled, read-only */}
          <div className="space-y-1.5">
            <Label>
              Primary Attendee <span className="text-xs text-muted-foreground">(auto-filled)</span>
            </Label>
            <div className="flex h-9 w-full items-center rounded-md border border-input bg-muted/40 px-3 text-sm text-foreground">
              {contactName || '—'}
            </div>
          </div>

          {/* Matter Picker — only if contact has matters */}
          {activeMatters.length > 0 && (
            <div className="space-y-1.5">
              <Label>Related Matter <span className="text-xs text-muted-foreground">(optional)</span></Label>
              <Select
                value={matterId || '__none'}
                onValueChange={(v) => setMatterId(v === '__none' ? '' : v)}
                disabled={isSubmitting}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a matter…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">No related matter</SelectItem>
                  {activeMatters.map((m) => (
                    <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Additional Attendees */}
          <div className="space-y-1.5">
            <Label>
              Additional Attendees <span className="text-xs text-muted-foreground">(optional)</span>
            </Label>
            <Input
              placeholder="e.g. Jane Smith, John Doe"
              value={additionalAttendees}
              onChange={(e) => setAdditionalAttendees(e.target.value)}
              disabled={isSubmitting}
            />
          </div>

          {/* Notes — mandatory */}
          <div className="space-y-1.5">
            <Label htmlFor="meeting-notes">
              Notes <span className="text-red-500">*</span>
            </Label>
            <Textarea
              id="meeting-notes"
              placeholder="What was discussed, decisions made, next steps…"
              rows={4}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={isSubmitting}
              className={showErrors && notesEmpty ? 'border-red-400 focus-visible:ring-red-400' : ''}
              autoFocus
            />
            {showErrors && notesEmpty && (
              <p className="text-xs text-red-600">Notes are required.</p>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Logging…</>
            ) : (
              'Log Meeting'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
