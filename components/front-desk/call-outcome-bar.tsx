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
 * Call Outcome Quick Bar — one-click call logging with notes prompt.
 *
 * Clicking an outcome button opens a small dialog so the user can add
 * optional notes before committing. This makes the logged activity useful
 * rather than just a bare outcome code.
 */

const CALL_OUTCOMES = [
  { outcome: 'connected',    label: 'Connected',  icon: Phone,       color: 'text-emerald-600 hover:bg-emerald-50 border-emerald-200' },
  { outcome: 'no_answer',    label: 'No Answer',  icon: PhoneOff,    color: 'text-amber-600  hover:bg-amber-50  border-amber-200'  },
  { outcome: 'voicemail',    label: 'Voicemail',  icon: Voicemail,   color: 'text-blue-600   hover:bg-blue-50   border-blue-200'   },
  { outcome: 'busy',         label: 'Busy',       icon: PhoneMissed, color: 'text-orange-600 hover:bg-orange-50 border-orange-200' },
  { outcome: 'wrong_number', label: 'Wrong #',    icon: XCircle,     color: 'text-red-600    hover:bg-red-50    border-red-200'    },
] as const

interface CallOutcomeBarProps {
  contactId: string
}

export function CallOutcomeBar({ contactId }: CallOutcomeBarProps) {
  const queryClient = useQueryClient()

  // Dialog state
  const [selectedOutcome, setSelectedOutcome] = useState<string | null>(null)
  const [notes, setNotes] = useState('')
  const dialogOpen = selectedOutcome !== null

  function openDialog(outcome: string) {
    setSelectedOutcome(outcome)
    setNotes('')
  }

  function closeDialog() {
    setSelectedOutcome(null)
    setNotes('')
  }

  const logCallMutation = useMutation({
    mutationFn: async ({ outcome, callNotes }: { outcome: string; callNotes: string }) => {
      const res = await fetch('/api/actions/front_desk_log_call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: {
            contactId,
            direction: 'inbound',
            outcome,
            notes: callNotes,
          },
          source: 'front_desk',
          idempotencyKey: `log_call:${contactId}:${outcome}:${Date.now()}`,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? 'Failed to log call')
      }

      return res.json()
    },
    onSuccess: (_, { outcome }) => {
      const label = CALL_OUTCOMES.find((o) => o.outcome === outcome)?.label ?? outcome
      toast.success(`Call logged: ${label}`)
      queryClient.invalidateQueries({ queryKey: frontDeskKeys.all })
      closeDialog()
    },
    onError: (err: Error) => {
      toast.error(err.message)
    },
  })

  function handleConfirm() {
    if (!selectedOutcome) return
    logCallMutation.mutate({ outcome: selectedOutcome, callNotes: notes.trim() })
  }

  const selectedConfig = CALL_OUTCOMES.find((o) => o.outcome === selectedOutcome)

  return (
    <>
      {/* ── Quick-tap outcome buttons ── */}
      <div className="flex flex-wrap items-center gap-1.5 px-3 py-2 bg-slate-50 border border-slate-200 rounded-md">
        <div className="flex items-center gap-1 shrink-0">
          <Phone className="w-3.5 h-3.5 text-slate-400" />
          <span className="text-xs text-slate-500 font-medium">Quick Call:</span>
        </div>
        {CALL_OUTCOMES.map(({ outcome, label, icon: Icon, color }) => (
          <Button
            key={outcome}
            variant="outline"
            size="sm"
            className={`h-7 px-2 text-xs gap-1 ${color}`}
            onClick={() => openDialog(outcome)}
            disabled={logCallMutation.isPending}
          >
            <Icon className="w-3 h-3" />
            {label}
          </Button>
        ))}
      </div>

      {/* ── Confirm dialog with optional notes ── */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) closeDialog() }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedConfig && <selectedConfig.icon className="w-4 h-4" />}
              Log Call — {selectedConfig?.label}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="call-notes">Notes <span className="text-muted-foreground text-xs">(optional)</span></Label>
              <Textarea
                id="call-notes"
                placeholder="What was discussed, next steps, follow-up needed…"
                rows={4}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                disabled={logCallMutation.isPending}
                autoFocus
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={closeDialog} disabled={logCallMutation.isPending}>
              Cancel
            </Button>
            <Button onClick={handleConfirm} disabled={logCallMutation.isPending}>
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
