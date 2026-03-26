'use client'

import { useState, useCallback, useMemo } from 'react'
import { useCommandCentre } from '../command-centre-context'
import { useCreateActivity, useActivities } from '@/lib/queries/activities'
import { useContactEmailLogs } from '@/lib/queries/email-logs'
import { CALL_DIRECTIONS, CALL_OUTCOMES } from '@/lib/utils/constants'
import { formatRelativeDate } from '@/lib/utils/formatters'
import type { Json } from '@/lib/types/database'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
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
  Phone,
  PhoneIncoming,
  PhoneOutgoing,
  PhoneMissed,
  Mail,
  MessageSquare,
  Calendar,
  FileText,
  ChevronDown,
  ChevronRight,
  Clock,
  Loader2,
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

type LogCategory = 'call' | 'email' | 'meeting' | 'note'

interface UnifiedLogEntry {
  id: string
  category: LogCategory
  title: string
  description: string | null
  created_at: string
  metadata: Record<string, unknown> | null
  activity_type: string
}

// ─── Categorisation maps (same activity types as front desk) ────────

// Calls: command-centre logged (phone_*) + front desk logged (front_desk_call_logged)
const CALL_TYPES = new Set([
  'phone_call', 'phone_inbound', 'phone_outbound',
  'front_desk_call_logged',
])

// Emails: all sources
const EMAIL_TYPES = new Set([
  'email_sent', 'email_received', 'follow_up_sent',
  'front_desk_email_logged', 'lead_contacted',
])

// Meetings
const MEETING_TYPES = new Set([
  'meeting_outcome', 'front_desk_meeting_logged',
  'meeting_notes', 'meeting_logged',
])

// Notes
const NOTE_TYPES = new Set([
  'note_added', 'note_created', 'note',
])

function categorize(activityType: string): LogCategory | null {
  if (CALL_TYPES.has(activityType)) return 'call'
  if (EMAIL_TYPES.has(activityType)) return 'email'
  if (MEETING_TYPES.has(activityType)) return 'meeting'
  if (NOTE_TYPES.has(activityType)) return 'note'
  return null // skip system/unknown events
}

// ─── Helpers ────────────────────────────────────────────────────────

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

function getCategoryIcon(
  category: LogCategory,
  meta?: Record<string, unknown> | null,
): React.ElementType {
  switch (category) {
    case 'call': {
      const dir = meta?.direction as string | undefined
      if (dir === 'inbound') return PhoneIncoming
      if (dir === 'outbound') return PhoneOutgoing
      return Phone
    }
    case 'email': return Mail
    case 'meeting': return Calendar
    case 'note': return FileText
  }
}

function getCategoryColorClass(category: LogCategory): string {
  switch (category) {
    case 'call': return 'bg-blue-50 text-blue-600'
    case 'email': return 'bg-amber-50 text-amber-600'
    case 'meeting': return 'bg-purple-50 text-purple-700'
    case 'note': return 'bg-slate-100 text-slate-600'
  }
}

// ─── Component ──────────────────────────────────────────────────────

export function CallLogPanel() {
  const { tenantId, entityType, entityId, contact, userId } = useCommandCentre()
  const createActivity = useCreateActivity()

  // ── Data sources  -  same as front desk ────────────────────────
  // Primary: activities table (covers all event types from both front desk and command centre)
  const { data: allActivities, isLoading: activitiesLoading } = useActivities({
    tenantId,
    contactId: contact?.id,
    limit: 100,
  })

  // Secondary: email_logs table (actual sent/received emails)
  const { data: emailLogs, isLoading: emailsLoading } = useContactEmailLogs(contact?.id ?? '')

  const isLoading = activitiesLoading || emailsLoading

  // ── Build unified, categorised log ───────────────────────────
  const { logEntries, counts } = useMemo(() => {
    const entries: UnifiedLogEntry[] = []
    const emailLogIds = new Set<string>()

    // 1. Email logs (dedicated email table  -  highest fidelity for emails)
    for (const e of emailLogs ?? []) {
      emailLogIds.add(e.id)
      entries.push({
        id: `el-${e.id}`,
        category: 'email',
        title: e.subject ?? (e.direction === 'in' ? 'Email received' : 'Email sent'),
        description: e.direction === 'in'
          ? `From: ${e.from_address ?? ' - '}`
          : `To: ${e.from_address ?? ' - '}`,
        created_at: e.sent_at ?? e.created_at,
        metadata: { direction: e.direction === 'in' ? 'inbound' : 'outbound' },
        activity_type: 'email_log',
      })
    }

    // 2. Activities table  -  covers front desk + command centre logs
    for (const a of allActivities ?? []) {
      const cat = categorize(a.activity_type)
      if (!cat) continue

      // Skip activity email events if we already have it from email_logs
      // (avoid double-counting when both tables record the same email send)
      if (cat === 'email' && a.activity_type === 'email_sent') continue

      entries.push({
        id: a.id,
        category: cat,
        title: a.title,
        description: a.description ?? null,
        created_at: a.created_at ?? new Date().toISOString(),
        metadata: (a.metadata ?? null) as Record<string, unknown> | null,
        activity_type: a.activity_type,
      })
    }

    // Sort newest first
    entries.sort((a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )

    const counts = {
      call: entries.filter((e) => e.category === 'call').length,
      email: entries.filter((e) => e.category === 'email').length,
      meeting: entries.filter((e) => e.category === 'meeting').length,
      note: entries.filter((e) => e.category === 'note').length,
    }

    return { logEntries: entries, counts }
  }, [allActivities, emailLogs])

  const totalCount = counts.call + counts.email + counts.meeting + counts.note

  // ── Collapse state (default: collapsed) ──────────────────────
  const [expanded, setExpanded] = useState(false)

  // ── Call log dialog ───────────────────────────────────────────
  const [dialogOpen, setDialogOpen] = useState(false)
  const [direction, setDirection] = useState<'inbound' | 'outbound'>('outbound')
  const [outcome, setOutcome] = useState('connected')
  const [durationMinutes, setDurationMinutes] = useState('')
  const [notes, setNotes] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  const contactName = useMemo(() => {
    if (!contact) return 'Client'
    if (contact.contact_type === 'organization') return contact.organization_name ?? 'Client'
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
    const metadata: CallMetadata = { direction, outcome, duration_minutes: duration, notes }
    const title = `${dirLabel} call ${outcome === 'connected' ? 'with' : 'to'} ${contactName}`
    const descParts = [outcomeInfo.label]
    if (duration) descParts.push(`(${formatDuration(duration)})`)
    if (notes) descParts.push(` -  ${notes}`)

    try {
      await createActivity.mutateAsync({
        tenant_id: tenantId,
        activity_type: direction === 'inbound' ? 'phone_inbound' : 'phone_outbound',
        title,
        description: descParts.join(' '),
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
  }, [direction, outcome, durationMinutes, notes, contactName, tenantId, contact?.id, entityType, entityId, userId, createActivity, resetForm])

  return (
    <>
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            {/* ── Collapsible toggle + summary ── */}
            <button
              type="button"
              className="flex items-center gap-1.5 flex-1 min-w-0 text-left group"
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded
                ? <ChevronDown className="h-4 w-4 shrink-0 text-slate-500" />
                : <ChevronRight className="h-4 w-4 shrink-0 text-slate-500" />
              }
              <MessageSquare className="h-4 w-4 shrink-0 text-slate-600" />
              <span className="text-sm font-medium text-slate-700">Communications</span>

              {/* Count badges  -  visible when collapsed */}
              {!expanded && !isLoading && totalCount > 0 && (
                <div className="flex items-center gap-1 ml-1 flex-wrap">
                  {counts.call > 0 && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 gap-0.5 bg-blue-50 text-blue-700 border-blue-200">
                      <Phone className="h-2.5 w-2.5" />
                      {counts.call}
                    </Badge>
                  )}
                  {counts.email > 0 && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 gap-0.5 bg-amber-50 text-amber-700 border-amber-200">
                      <Mail className="h-2.5 w-2.5" />
                      {counts.email}
                    </Badge>
                  )}
                  {counts.meeting > 0 && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 gap-0.5 bg-purple-50 text-purple-700 border-purple-200">
                      <Calendar className="h-2.5 w-2.5" />
                      {counts.meeting}
                    </Badge>
                  )}
                  {counts.note > 0 && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 gap-0.5">
                      <FileText className="h-2.5 w-2.5" />
                      {counts.note}
                    </Badge>
                  )}
                </div>
              )}
              {!expanded && !isLoading && totalCount === 0 && (
                <span className="text-[11px] text-slate-400 ml-1">No logs yet</span>
              )}
            </button>

            {/* ── Quick call log buttons (always visible) ── */}
            <div className="flex items-center gap-1 shrink-0">
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1 text-green-600 border-green-200 hover:bg-green-50"
                onClick={(e) => { e.stopPropagation(); handleQuickLog('inbound') }}
                title="Log inbound call"
              >
                <PhoneIncoming className="h-3 w-3" />
                <span className="hidden sm:inline">In</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1 text-blue-600 border-blue-200 hover:bg-blue-50"
                onClick={(e) => { e.stopPropagation(); handleQuickLog('outbound') }}
                title="Log outbound call"
              >
                <PhoneOutgoing className="h-3 w-3" />
                <span className="hidden sm:inline">Out</span>
              </Button>
            </div>
          </div>

          {/* ── Count summary bar (shown when expanded) ── */}
          {expanded && !isLoading && totalCount > 0 && (
            <div className="flex items-center gap-1.5 mt-2 pl-7 flex-wrap">
              {counts.call > 0 && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0.5 gap-0.5 bg-blue-50 text-blue-700 border-blue-200">
                  <Phone className="h-2.5 w-2.5" />
                  {counts.call} call{counts.call !== 1 ? 's' : ''}
                </Badge>
              )}
              {counts.email > 0 && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0.5 gap-0.5 bg-amber-50 text-amber-700 border-amber-200">
                  <Mail className="h-2.5 w-2.5" />
                  {counts.email} email{counts.email !== 1 ? 's' : ''}
                </Badge>
              )}
              {counts.meeting > 0 && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0.5 gap-0.5 bg-purple-50 text-purple-700 border-purple-200">
                  <Calendar className="h-2.5 w-2.5" />
                  {counts.meeting} meeting{counts.meeting !== 1 ? 's' : ''}
                </Badge>
              )}
              {counts.note > 0 && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0.5 gap-0.5">
                  <FileText className="h-2.5 w-2.5" />
                  {counts.note} note{counts.note !== 1 ? 's' : ''}
                </Badge>
              )}
            </div>
          )}
        </CardHeader>

        {/* ── Expanded log entries ── */}
        {expanded && (
          <CardContent className="pt-0">
            <Separator className="mb-3" />

            {isLoading ? (
              <div className="py-4 text-center text-xs text-slate-400">Loading…</div>
            ) : logEntries.length === 0 ? (
              <div className="py-6 text-center">
                <PhoneMissed className="mx-auto h-8 w-8 text-slate-200 mb-2" />
                <p className="text-sm text-slate-400">No communications logged</p>
                <p className="text-xs text-slate-300 mt-1">
                  Use the In / Out buttons above to log calls
                </p>
              </div>
            ) : (
              <div className="space-y-0.5">
                {logEntries.map((entry) => {
                  const Icon = getCategoryIcon(entry.category, entry.metadata)
                  const colorClass = getCategoryColorClass(entry.category)
                  const meta = entry.metadata ?? {}
                  const outcomeVal = meta.outcome as string | undefined
                  const outcomeInfo = outcomeVal ? getOutcomeInfo(outcomeVal) : null
                  const duration = meta.duration_minutes as number | null | undefined

                  return (
                    <div
                      key={entry.id}
                      className="flex items-start gap-2.5 py-2 px-2 rounded-md hover:bg-slate-50 transition-colors"
                    >
                      {/* Category icon */}
                      <div className={cn(
                        'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full',
                        colorClass,
                      )}>
                        <Icon className="h-3 w-3" />
                      </div>

                      {/* Entry content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs font-medium text-slate-800 leading-snug">
                            {entry.title}
                          </span>
                          {outcomeInfo && (
                            <Badge
                              variant="secondary"
                              className="text-[10px] px-1 py-0 shrink-0"
                              style={{
                                backgroundColor: `${outcomeInfo.color}15`,
                                color: outcomeInfo.color,
                              }}
                            >
                              {outcomeInfo.label}
                            </Badge>
                          )}
                          {!!duration && (
                            <span className="text-[10px] text-slate-400 flex items-center gap-0.5 shrink-0">
                              <Clock className="h-2.5 w-2.5" />
                              {formatDuration(duration)}
                            </span>
                          )}
                        </div>
                        {entry.description && (
                          <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-2">
                            {entry.description}
                          </p>
                        )}
                        <span className="text-[10px] text-slate-400 mt-0.5 block">
                          {formatRelativeDate(entry.created_at)}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        )}
      </Card>

      {/* ── Log call dialog ── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {direction === 'inbound'
                ? <PhoneIncoming className="h-5 w-5 text-green-600" />
                : <PhoneOutgoing className="h-5 w-5 text-blue-600" />
              }
              Log {direction === 'inbound' ? 'Inbound' : 'Outbound'} Call
            </DialogTitle>
            <DialogDescription>
              Log a call with {contactName}. This will appear in the activity feed.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Direction */}
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
                        isActive && d.value === 'outbound' && 'bg-blue-600 hover:bg-blue-700',
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
                Notes
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
                  : 'bg-blue-600 hover:bg-blue-700',
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
