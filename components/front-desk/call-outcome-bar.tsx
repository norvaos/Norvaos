'use client'

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Phone, PhoneOff, Voicemail, PhoneMissed, XCircle, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import { frontDeskKeys } from '@/lib/queries/front-desk-queries'

/**
 * Call Outcome Quick Bar  -  single "Call" button, one dialog to log it.
 *
 * Flow:
 *  1. Click "Call" → dialog opens
 *  2. Pick direction: Inbound | Outbound
 *  3. Pick outcome (Connected, No Answer, Voicemail, Busy, Wrong #)
 *  4. Add notes (required for Connected calls)
 *  5. Confirm → logs via front_desk_log_call action
 */

const OUTCOMES = [
  { value: 'connected',    label: 'Connected',    icon: Phone,       color: 'border-emerald-300 text-emerald-700 hover:bg-emerald-50',  activeColor: 'bg-emerald-600 text-white border-emerald-600' },
  { value: 'no_answer',   label: 'No Answer',    icon: PhoneOff,    color: 'border-amber-300  text-amber-700  hover:bg-amber-50',     activeColor: 'bg-amber-600  text-white border-amber-600' },
  { value: 'voicemail',   label: 'Voicemail',    icon: Voicemail,   color: 'border-blue-300   text-blue-700   hover:bg-blue-50',      activeColor: 'bg-blue-600   text-white border-blue-600' },
  { value: 'busy',        label: 'Busy',         icon: PhoneMissed, color: 'border-orange-300 text-orange-700 hover:bg-orange-50',    activeColor: 'bg-orange-600 text-white border-orange-600' },
  { value: 'wrong_number',label: 'Wrong #',      icon: XCircle,     color: 'border-red-300    text-red-700    hover:bg-red-50',       activeColor: 'bg-red-600    text-white border-red-600' },
]

// Quick-action tags that can be appended to notes for fast logging
const CALL_ACTIONS = [
  { id: 'scheduled_appt',    label: '📅 Booked appointment' },
  { id: 'sent_email',        label: '✉️ Sent follow-up email' },
  { id: 'left_voicemail',    label: '📬 Left voicemail' },
  { id: 'sent_docs',         label: '📄 Sent documents' },
  { id: 'follow_up_needed',  label: '🔔 Follow-up needed' },
  { id: 'issue_resolved',    label: '✅ Issue resolved' },
  { id: 'request_callback',  label: '📞 Requested callback' },
  { id: 'transferred',       label: '🔀 Transferred to staff' },
  { id: 'will_come_in',      label: '🚶 Client will come in' },
  { id: 'docs_requested',    label: '📋 Documents requested' },
]

interface CallOutcomeBarProps {
  contactId: string
}

export function CallOutcomeBar({ contactId }: CallOutcomeBarProps) {
  const queryClient = useQueryClient()
  const [open, setOpen]               = useState(false)
  const [direction, setDirection]     = useState<'inbound' | 'outbound'>('inbound')
  const [outcome, setOutcome]         = useState('')
  const [durationMinutes, setDuration] = useState<number | null>(null)
  const [notes, setNotes]             = useState('')
  const [actionTags, setActionTags]   = useState<Set<string>>(new Set())
  const [submitted, setSubmitted]     = useState(false)

  function toggleTag(id: string) {
    setActionTags((prev) => {
      const next = new Set(prev)
      if (next.has(id)) { next['delete'](id) }
      else next.add(id)
      return next
    })
  }

  function openDialog() {
    setDirection('inbound')
    setOutcome('')
    setDuration(null)
    setNotes('')
    setActionTags(new Set())
    setSubmitted(false)
    setOpen(true)
  }

  function closeDialog() {
    setOpen(false)
  }

  // Build final notes from free-text + selected action tags
  function buildNotes(): string {
    const parts: string[] = []
    if (notes.trim()) parts.push(notes.trim())
    if (actionTags.size > 0) {
      const tagLines = [...actionTags]
        .map((id) => CALL_ACTIONS.find((a) => a.id === id)?.label ?? id)
        .join(' · ')
      parts.push(`Actions: ${tagLines}`)
    }
    return parts.join('\n')
  }

  const notesRequired   = outcome === 'connected'
  const notesEmpty      = !notes.trim()
  const outcomeEmpty    = !outcome
  const durationEmpty   = durationMinutes === null

  const logCallMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/actions/front_desk_log_call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: { contactId, direction, outcome, durationMinutes, notes: buildNotes() },
          source: 'front_desk',
          idempotencyKey: `log_call:${contactId}:${outcome}:${Date.now()}`,
        }),
      })
      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.error ?? 'Failed to log call')
      }
      return res.json()
    },
    onSuccess: () => {
      const label = OUTCOMES.find((o) => o.value === outcome)?.label ?? outcome
      toast.success(`Call logged: ${direction === 'inbound' ? '📲 Inbound' : '📞 Outbound'}  -  ${label}`)
      queryClient.invalidateQueries({ queryKey: frontDeskKeys.all })
      closeDialog()
    },
    onError: (err: Error) => toast.error(err.message),
  })

  function handleConfirm() {
    setSubmitted(true)
    if (outcomeEmpty || durationEmpty) return
    // For connected calls, require notes OR at least one action tag
    const hasContent = !notesEmpty || actionTags.size > 0
    if (notesRequired && !hasContent) return
    logCallMutation.mutate()
  }

  const selectedOutcome = OUTCOMES.find((o) => o.value === outcome)

  return (
    <>
      {/* ── Single quick-call button ── */}
      <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-md">
        <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
        <span className="text-xs text-slate-500 font-medium">Quick Call:</span>
        <Button
          variant="outline"
          size="sm"
          className="h-7 px-3 text-xs gap-1.5 text-emerald-700 border-emerald-300 hover:bg-emerald-50"
          onClick={openDialog}
          disabled={logCallMutation.isPending}
        >
          <Phone className="w-3 h-3" />
          Log a Call
        </Button>
      </div>

      {/* ── Log call dialog ── */}
      <Dialog open={open} onOpenChange={(v) => { if (!v) closeDialog() }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Phone className="w-4 h-4" />
              Log Call
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-1">

            {/* Direction */}
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Direction</Label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setDirection('inbound')}
                  className={`py-2 text-sm font-medium rounded-md border transition-colors ${
                    direction === 'inbound'
                      ? 'bg-emerald-600 text-white border-emerald-600'
                      : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  📲 Inbound
                </button>
                <button
                  type="button"
                  onClick={() => setDirection('outbound')}
                  className={`py-2 text-sm font-medium rounded-md border transition-colors ${
                    direction === 'outbound'
                      ? 'bg-teal-600 text-white border-teal-600'
                      : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  📞 Outbound
                </button>
              </div>
            </div>

            {/* Call Duration  -  mandatory */}
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                Duration <span className="text-red-500">*</span>
              </Label>
              <div className="grid grid-cols-4 gap-1.5">
                {([1, 3, 5, 8, 10, 15, 20, 25] as const).map((min) => (
                  <button
                    key={min}
                    type="button"
                    onClick={() => setDuration(min)}
                    disabled={logCallMutation.isPending}
                    className={`py-1.5 text-sm font-medium rounded-md border transition-colors ${
                      durationMinutes === min
                        ? 'bg-slate-700 text-white border-slate-700'
                        : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    {min === 25 ? '20+' : `${min}m`}
                  </button>
                ))}
              </div>
              {submitted && durationEmpty && (
                <p className="text-xs text-red-600">Please select a call duration.</p>
              )}
            </div>

            {/* Outcome */}
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                Outcome <span className="text-red-500">*</span>
              </Label>
              <div className="grid grid-cols-2 gap-2">
                {OUTCOMES.map(({ value, label, icon: Icon, color, activeColor }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setOutcome(value)}
                    className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-md border transition-colors ${
                      outcome === value ? activeColor : `bg-white ${color}`
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5 shrink-0" />
                    {label}
                  </button>
                ))}
              </div>
              {submitted && outcomeEmpty && (
                <p className="text-xs text-red-600">Please select an outcome.</p>
              )}
            </div>

            {/* Quick Action Tags */}
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                Actions Taken <span className="text-muted-foreground font-normal normal-case">(pick all that apply)</span>
              </Label>
              <div className="flex flex-wrap gap-1.5">
                {CALL_ACTIONS.map(({ id, label }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => toggleTag(id)}
                    disabled={logCallMutation.isPending}
                    className={`px-2 py-1 text-xs rounded-full border transition-colors ${
                      actionTags.has(id)
                        ? 'bg-primary/10 border-primary text-primary font-medium'
                        : 'bg-white border-slate-200 text-slate-600 hover:border-slate-400'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <Label htmlFor="call-notes">
                Notes{' '}
                {notesRequired ? (
                  <span className="text-red-500 text-xs">* or select an action above</span>
                ) : (
                  <span className="text-muted-foreground text-xs">(optional)</span>
                )}
              </Label>
              <Textarea
                id="call-notes"
                placeholder={notesRequired
                  ? 'What was discussed, next steps… (or pick actions above)'
                  : 'Any relevant notes…'}
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                disabled={logCallMutation.isPending}
                className={submitted && notesRequired && notesEmpty && actionTags.size === 0 ? 'border-red-400 focus-visible:ring-red-400' : ''}
              />
              {submitted && notesRequired && notesEmpty && actionTags.size === 0 && (
                <p className="text-xs text-red-600">Add notes or select at least one action above.</p>
              )}
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={closeDialog} disabled={logCallMutation.isPending}>
              Cancel
            </Button>
            <Button
              onClick={handleConfirm}
              disabled={logCallMutation.isPending}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {logCallMutation.isPending ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Logging…</>
              ) : (
                'Log Call'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
