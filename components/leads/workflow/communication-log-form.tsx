'use client'

import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

// ─── Channel / Direction Options ────────────────────────────────────────────

const CHANNEL_OPTIONS = [
  { value: 'call', label: 'Call' },
  { value: 'email', label: 'Email' },
  { value: 'sms', label: 'SMS' },
  { value: 'portal_chat', label: 'Portal Chat' },
] as const

const DIRECTION_OPTIONS = [
  { value: 'outbound', label: 'Outbound' },
  { value: 'inbound', label: 'Inbound' },
] as const

// ─── Component ──────────────────────────────────────────────────────────────

interface CommunicationLogFormProps {
  onSubmit: (data: CommunicationFormData) => void
  isSubmitting?: boolean
  defaultChannel?: string
  defaultDirection?: string
  /** Pre-filled template subject/body from automation settings */
  templateSubject?: string
  templateBody?: string
  templateSource?: 'workspace' | 'system_default'
}

export interface CommunicationFormData {
  channel: string
  direction: string
  subject: string
  bodyPreview: string
}

export function CommunicationLogForm({
  onSubmit,
  isSubmitting = false,
  defaultChannel = 'call',
  defaultDirection = 'outbound',
  templateSubject,
  templateBody,
  templateSource,
}: CommunicationLogFormProps) {
  const [channel, setChannel] = useState(defaultChannel)
  const [direction, setDirection] = useState(defaultDirection)
  const [subject, setSubject] = useState(templateSubject ?? '')
  const [body, setBody] = useState(templateBody ?? '')

  const canSubmit = channel && direction && !isSubmitting

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    onSubmit({ channel, direction, subject, bodyPreview: body })
    // Reset form after submit
    setSubject('')
    setBody('')
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 p-3">
      {/* Channel + Direction row */}
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-xs">Channel</Label>
          <Select value={channel} onValueChange={setChannel}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CHANNEL_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value} className="text-xs">
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label className="text-xs">Direction</Label>
          <Select value={direction} onValueChange={setDirection}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DIRECTION_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value} className="text-xs">
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Subject */}
      <div className="space-y-1">
        <Label className="text-xs">Subject</Label>
        <Input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Brief subject..."
          className="h-8 text-xs"
        />
      </div>

      {/* Body */}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <Label className="text-xs">Notes</Label>
          {templateSource && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
              templateSource === 'workspace'
                ? 'bg-blue-50 text-blue-600'
                : 'bg-muted text-muted-foreground'
            }`}>
              {templateSource === 'workspace' ? 'Workspace Template' : 'System Default'}
            </span>
          )}
        </div>
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Details about the interaction..."
          rows={3}
          className="text-xs resize-none"
        />
      </div>

      {/* Submit */}
      <Button type="submit" size="sm" disabled={!canSubmit} className="w-full h-8 text-xs">
        {isSubmitting ? (
          <>
            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
            Logging...
          </>
        ) : (
          'Log Communication'
        )}
      </Button>
    </form>
  )
}
