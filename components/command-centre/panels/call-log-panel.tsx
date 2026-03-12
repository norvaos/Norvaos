'use client'

import { useState, useCallback, useMemo } from 'react'
import { useCommandCentre } from '../command-centre-context'
import { useCreateActivity, useActivities } from '@/lib/queries/activities'
import { CALL_DIRECTIONS, CALL_OUTCOMES } from '@/lib/utils/constants'
import { formatRelativeDate } from '@/lib/utils/formatters'
import type { Json } from '@/lib/types/database'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  Phone,
  PhoneIncoming,
  PhoneOutgoing,
  PhoneMissed,
  Plus,
  Clock,
  Loader2,
  MessageSquare,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

// ─── Types ──────────────────────────────────────────────────────────

interface CallMetadata {
  direction: 'inbound' | 'outbound'
  outcome: string
  duration_minutes: number | null
  notes: string
}

// ─── Helpers ────────────────────────────────────────────────────────

function getOutcomeInfo(value: string) {
  return CALL_OUTCOMES.find((o) => o.value === value) ?? { value, label: value, color: '#6b7280' }
}

function getDirectionIcon(direction: string) {
  if (direction === 'inbound') return PhoneIncoming
  if (direction === 'outbound') return PhoneOutgoing
  return Phone
}

function formatDuration(minutes: number | null): string {
  if (!minutes) return ''
  if (minutes < 60) return `${minutes}m`
  const hrs = Math.floor(minutes / 60)
  const mins = minutes % 60
  return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`
}

// ─── Component ──────────────────────────────────────────────────────

export function CallLogPanel() {
  const { tenantId, entityType, entityId, contact, userId } = useCommandCentre()
  const createActivity = useCreateActivity()

  // Fetch calls — activities with type 'phone_call' for this entity
  const { data: allActivities } = useActivities({
    tenantId,
    contactId: contact?.id,
    limit: 50,
  })

  const recentCalls = useMemo(() => {
    if (!allActivities) return []
    return allActivities
      .filter((a) => a.activity_type === 'phone_call' || a.activity_type === 'phone_inbound' || a.activity_type === 'phone_outbound')
      .slice(0, 10)
  }, [allActivities])

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false)
  const [direction, setDirection] = useState<'inbound' | 'outbound'>('outbound')
  const [outcome, setOutcome] = useState('connected')
  const [durationMinutes, setDurationMinutes] = useState('')
  const [notes, setNotes] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  const contactName = useMemo(() => {
    if (!contact) return 'Client'
    if (contact.contact_type === 'organization') {
      return contact.organization_name ?? 'Client'
    }
    return `${contact.first_name ?? ''} ${contact.last_name ?? ''}`.trim() || 'Client'
  }, [contact])

  const resetForm = useCallback(() => {
    setDirection('outbound')
    setOutcome('connected')
    setDurationMinutes('')
    setNotes('')
  }, [])

  const handleQuickLog = useCallback((dir: 'inbound' | 'outbound') => {
    setDirection(dir)
    setOutcome('connected')
    setDurationMinutes('')
    setNotes('')
    setDialogOpen(true)
  }, [])

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

    // Build a readable title
    const title = `${dirLabel} call ${outcome === 'connected' ? 'with' : 'to'} ${contactName}`

    // Build description from outcome + duration
    const descParts: string[] = []
    descParts.push(outcomeInfo.label)
    if (duration) descParts.push(`(${formatDuration(duration)})`)
    if (notes) descParts.push(`— ${notes}`)
    const description = descParts.join(' ')

    try {
      await createActivity.mutateAsync({
        tenant_id: tenantId,
        activity_type: direction === 'inbound' ? 'phone_inbound' : 'phone_outbound',
        title,
        description,
        contact_id: contact?.id ?? null,
        entity_type: entityType,
        entity_id: entityId,
        user_id: userId,
        metadata: metadata as unknown as Json,
      })

      toast.success(`${dirLabel} call logged`)
      setDialogOpen(false)
      resetForm()
    } catch {
      toast.error('Failed to log call')
    } finally {
      setIsSaving(false)
    }
  }, [
    direction,
    outcome,
    durationMinutes,
    notes,
    contactName,
    tenantId,
    contact?.id,
    entityType,
    entityId,
    userId,
    createActivity,
    resetForm,
  ])

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium flex items-center gap-2 text-slate-700">
              <Phone className="h-4 w-4" />
              Call Log
            </CardTitle>
            <div className="flex items-center gap-1">
              {/* Quick log buttons */}
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs gap-1 text-green-600 border-green-200 hover:bg-green-50"
                      onClick={() => handleQuickLog('inbound')}
                    >
                      <PhoneIncoming className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">Inbound</span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Log inbound call</TooltipContent>
                </Tooltip>
              </TooltipProvider>

              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs gap-1 text-blue-600 border-blue-200 hover:bg-blue-50"
                      onClick={() => handleQuickLog('outbound')}
                    >
                      <PhoneOutgoing className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">Outbound</span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Log outbound call</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {recentCalls.length > 0 ? (
            <div className="space-y-1">
              {recentCalls.map((call) => {
                const meta = (call.metadata ?? {}) as unknown as Partial<CallMetadata>
                const dir = meta.direction ?? 'outbound'
                const outcomeVal = meta.outcome ?? 'connected'
                const outcomeInfo = getOutcomeInfo(outcomeVal)
                const DirIcon = getDirectionIcon(dir)
                const duration = meta.duration_minutes
                const callNotes = meta.notes

                return (
                  <div
                    key={call.id}
                    className="group flex items-start gap-2.5 py-2 px-2 rounded-md hover:bg-slate-50 transition-colors"
                  >
                    {/* Direction icon */}
                    <div
                      className={cn(
                        'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full',
                        dir === 'inbound'
                          ? 'bg-green-50 text-green-600'
                          : 'bg-blue-50 text-blue-600'
                      )}
                    >
                      <DirIcon className="h-3.5 w-3.5" />
                    </div>

                    {/* Call info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-sm font-medium text-slate-800">
                          {dir === 'inbound' ? 'Inbound' : 'Outbound'}
                        </span>
                        <Badge
                          variant="secondary"
                          className="text-[10px] px-1.5 py-0"
                          style={{
                            backgroundColor: `${outcomeInfo.color}15`,
                            color: outcomeInfo.color,
                            borderColor: `${outcomeInfo.color}40`,
                          }}
                        >
                          {outcomeInfo.label}
                        </Badge>
                        {duration && (
                          <span className="text-xs text-slate-400 flex items-center gap-0.5">
                            <Clock className="h-3 w-3" />
                            {formatDuration(duration)}
                          </span>
                        )}
                      </div>
                      {callNotes && (
                        <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">
                          {callNotes}
                        </p>
                      )}
                      <span className="text-[11px] text-slate-400 mt-0.5 block">
                        {formatRelativeDate(call.created_at)}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="py-6 text-center">
              <PhoneMissed className="mx-auto h-8 w-8 text-slate-200 mb-2" />
              <p className="text-sm text-slate-400">No calls logged yet</p>
              <p className="text-xs text-slate-300 mt-1">
                Use the buttons above to log inbound or outbound calls
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Log call dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
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
              Log a call with {contactName}. This will appear in the activity feed.
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
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDialogOpen(false)}
              disabled={isSaving}
            >
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
    </>
  )
}
