'use client'

import { useState, useCallback } from 'react'
import { useCreateActivity } from '@/lib/queries/activities'
import { CALL_DIRECTIONS, CALL_OUTCOMES } from '@/lib/utils/constants'
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
  PhoneIncoming,
  PhoneOutgoing,
  Clock,
  MessageSquare,
  Loader2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

interface LogCallDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  contactId: string
  contactName: string
  tenantId: string
  userId?: string
  defaultDirection?: 'inbound' | 'outbound'
}

interface CallMetadata {
  direction: 'inbound' | 'outbound'
  outcome: string
  duration_minutes: number | null
  notes: string
}

function getOutcomeInfo(value: string) {
  return CALL_OUTCOMES.find((o) => o.value === value) ?? { value, label: value, color: '#6b7280' }
}

function formatDuration(minutes: number | null): string {
  if (!minutes) return ''
  if (minutes < 60) return `${minutes}m`
  const hrs = Math.floor(minutes / 60)
  const mins = minutes % 60
  return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`
}

export function LogCallDialog({
  open,
  onOpenChange,
  contactId,
  contactName,
  tenantId,
  userId,
  defaultDirection = 'outbound',
}: LogCallDialogProps) {
  const createActivity = useCreateActivity()

  const [direction, setDirection] = useState<'inbound' | 'outbound'>(defaultDirection)
  const [outcome, setOutcome] = useState('connected')
  const [durationMinutes, setDurationMinutes] = useState('')
  const [notes, setNotes] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  // Reset form when dialog opens with new direction
  const handleOpenChange = useCallback(
    (isOpen: boolean) => {
      if (isOpen) {
        setDirection(defaultDirection)
        setOutcome('connected')
        setDurationMinutes('')
        setNotes('')
      }
      onOpenChange(isOpen)
    },
    [defaultDirection, onOpenChange]
  )

  const handleSave = useCallback(async () => {
    setIsSaving(true)

    const outcomeInfo = getOutcomeInfo(outcome)
    const duration = durationMinutes ? parseInt(durationMinutes, 10) : null
    const dirLabel = direction === 'inbound' ? 'Inbound' : 'Outbound'

    const metadata: CallMetadata = {
      direction,
      outcome,
      duration_minutes: duration,
      notes,
    }

    const title = `${dirLabel} call ${outcome === 'connected' ? 'with' : 'to'} ${contactName}`

    const descParts: string[] = []
    descParts.push(outcomeInfo.label)
    if (duration) descParts.push(`(${formatDuration(duration)})`)
    if (notes) descParts.push(` -  ${notes}`)
    const description = descParts.join(' ')

    try {
      await createActivity.mutateAsync({
        tenant_id: tenantId,
        activity_type: direction === 'inbound' ? 'phone_inbound' : 'phone_outbound',
        title,
        description,
        contact_id: contactId,
        entity_type: 'contact',
        entity_id: contactId,
        user_id: userId ?? null,
        metadata: metadata as unknown as Json,
      })

      toast.success(`${dirLabel} call logged`)
      onOpenChange(false)
    } catch {
      toast.error('Failed to log call')
    } finally {
      setIsSaving(false)
    }
  }, [direction, outcome, durationMinutes, notes, contactName, tenantId, contactId, userId, createActivity, onOpenChange])

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {direction === 'inbound' ? (
              <PhoneIncoming className="h-5 w-5 text-green-600" />
            ) : (
              <PhoneOutgoing className="h-5 w-5 text-blue-600" />
            )}
            Log {direction === 'inbound' ? 'Inbound' : 'Outbound'} Call
          </DialogTitle>
          <DialogDescription>
            Log a call with {contactName}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Direction toggle */}
          <div className="space-y-1.5">
            <Label className="text-xs text-slate-500">Direction</Label>
            <div className="flex gap-2">
              {CALL_DIRECTIONS.map((d) => {
                const DirIcon = d.value === 'inbound' ? PhoneIncoming : PhoneOutgoing
                const isActive = direction === d.value
                return (
                  <Button
                    key={d.value}
                    type="button"
                    variant={isActive ? 'default' : 'outline'}
                    size="sm"
                    className={cn(
                      'flex-1 gap-1.5',
                      isActive && d.value === 'inbound' && 'bg-green-600 hover:bg-green-700',
                      isActive && d.value === 'outbound' && 'bg-blue-600 hover:bg-blue-700'
                    )}
                    onClick={() => setDirection(d.value as 'inbound' | 'outbound')}
                  >
                    <DirIcon className="h-3.5 w-3.5" />
                    {d.label}
                  </Button>
                )
              })}
            </div>
          </div>

          {/* Outcome */}
          <div className="space-y-1.5">
            <Label className="text-xs text-slate-500">Outcome</Label>
            <Select value={outcome} onValueChange={setOutcome}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CALL_OUTCOMES.map((o) => (
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
              placeholder="e.g. 15"
              className="h-9 text-sm"
              min={0}
              max={999}
              value={durationMinutes}
              onChange={(e) => setDurationMinutes(e.target.value)}
            />
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label className="text-xs text-slate-500 flex items-center gap-1">
              <MessageSquare className="h-3 w-3" />
              Call Notes
            </Label>
            <Textarea
              placeholder="What was discussed? Any follow-up needed?"
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
            className={cn(
              direction === 'inbound'
                ? 'bg-green-600 hover:bg-green-700'
                : 'bg-blue-600 hover:bg-blue-700'
            )}
          >
            {isSaving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            Log Call
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
