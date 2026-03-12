'use client'

import { useState, useCallback } from 'react'
import { useCreateActivity } from '@/lib/queries/activities'
import { MEETING_OUTCOME_TYPES } from '@/lib/utils/constants'
import type { Json } from '@/lib/types/database'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Calendar,
  Clock,
  MapPin,
  Loader2,
} from 'lucide-react'
import { toast } from 'sonner'

interface LogMeetingDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  contactId: string
  contactName: string
  tenantId: string
  userId?: string
}

interface MeetingMetadata {
  outcome: string
  duration_minutes: number | null
  location: string
  notes: string
}

function getOutcomeInfo(value: string) {
  return MEETING_OUTCOME_TYPES.find((o) => o.value === value) ?? { value, label: value, color: '#6b7280' }
}

function formatDuration(minutes: number | null): string {
  if (!minutes) return ''
  if (minutes < 60) return `${minutes}m`
  const hrs = Math.floor(minutes / 60)
  const mins = minutes % 60
  return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`
}

export function LogMeetingDialog({
  open,
  onOpenChange,
  contactId,
  contactName,
  tenantId,
  userId,
}: LogMeetingDialogProps) {
  const createActivity = useCreateActivity()

  const [outcome, setOutcome] = useState('consultation_complete')
  const [durationMinutes, setDurationMinutes] = useState('')
  const [location, setLocation] = useState('')
  const [notes, setNotes] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  const handleOpenChange = useCallback(
    (isOpen: boolean) => {
      if (isOpen) {
        setOutcome('consultation_complete')
        setDurationMinutes('')
        setLocation('')
        setNotes('')
      }
      onOpenChange(isOpen)
    },
    [onOpenChange]
  )

  const handleSave = useCallback(async () => {
    setIsSaving(true)

    const outcomeInfo = getOutcomeInfo(outcome)
    const duration = durationMinutes ? parseInt(durationMinutes, 10) : null

    const metadata: MeetingMetadata = {
      outcome,
      duration_minutes: duration,
      location,
      notes,
    }

    const title = `Meeting with ${contactName}`

    const descParts: string[] = [outcomeInfo.label]
    if (duration) descParts.push(`(${formatDuration(duration)})`)
    if (location) descParts.push(`at ${location}`)
    if (notes) descParts.push(`— ${notes}`)
    const description = descParts.join(' ')

    try {
      await createActivity.mutateAsync({
        tenant_id: tenantId,
        activity_type: 'meeting',
        title,
        description,
        contact_id: contactId,
        entity_type: 'contact',
        entity_id: contactId,
        user_id: userId ?? null,
        metadata: metadata as unknown as Json,
      })

      toast.success('Meeting logged')
      onOpenChange(false)
    } catch {
      toast.error('Failed to log meeting')
    } finally {
      setIsSaving(false)
    }
  }, [outcome, durationMinutes, location, notes, contactName, tenantId, contactId, userId, createActivity, onOpenChange])

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-green-600" />
            Log Meeting
          </DialogTitle>
          <DialogDescription>
            Log a meeting or consultation with {contactName}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Outcome */}
          <div className="space-y-1.5">
            <Label className="text-xs text-slate-500">Outcome</Label>
            <Select value={outcome} onValueChange={setOutcome}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MEETING_OUTCOME_TYPES.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    <span className="flex items-center gap-2">
                      <span
                        className="h-2 w-2 rounded-full inline-block"
                        style={{ backgroundColor: o.color }}
                      />
                      {o.label}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Duration */}
          <div className="space-y-1.5">
            <Label className="text-xs text-slate-500 flex items-center gap-1">
              <Clock className="h-3 w-3" />
              Duration (minutes)
            </Label>
            <Input
              type="number"
              placeholder="e.g. 30"
              className="h-9 text-sm"
              min={0}
              max={999}
              value={durationMinutes}
              onChange={(e) => setDurationMinutes(e.target.value)}
            />
          </div>

          {/* Location */}
          <div className="space-y-1.5">
            <Label className="text-xs text-slate-500 flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              Location
            </Label>
            <Input
              placeholder="Office, virtual, etc."
              className="h-9 text-sm"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            />
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label className="text-xs text-slate-500">Meeting Notes</Label>
            <Textarea
              placeholder="Key discussion points, decisions made, next steps..."
              className="text-sm min-h-[80px] resize-none"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={isSaving}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={isSaving}
            className="bg-green-600 hover:bg-green-700"
          >
            {isSaving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            Log Meeting
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
