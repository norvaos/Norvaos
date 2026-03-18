'use client'

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Phone, PhoneOff, Voicemail, PhoneMissed, XCircle, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { frontDeskKeys } from '@/lib/queries/front-desk-queries'

/**
 * Call Outcome Quick Bar — one-click call logging
 *
 * Sticky bar at top of ContactWorkPanel when a contact is open.
 * 5 one-click buttons for rapid call outcome logging.
 * Each fires front_desk_log_call immediately with direction='inbound'.
 */

const CALL_OUTCOMES = [
  { outcome: 'connected', label: 'Connected', icon: Phone, color: 'text-emerald-600 hover:bg-emerald-50 border-emerald-200' },
  { outcome: 'no_answer', label: 'No Answer', icon: PhoneOff, color: 'text-amber-600 hover:bg-amber-50 border-amber-200' },
  { outcome: 'voicemail', label: 'Voicemail', icon: Voicemail, color: 'text-blue-600 hover:bg-blue-50 border-blue-200' },
  { outcome: 'busy', label: 'Busy', icon: PhoneMissed, color: 'text-orange-600 hover:bg-orange-50 border-orange-200' },
  { outcome: 'wrong_number', label: 'Wrong #', icon: XCircle, color: 'text-red-600 hover:bg-red-50 border-red-200' },
] as const

interface CallOutcomeBarProps {
  contactId: string
}

export function CallOutcomeBar({ contactId }: CallOutcomeBarProps) {
  const queryClient = useQueryClient()
  const [pendingOutcome, setPendingOutcome] = useState<string | null>(null)

  const logCallMutation = useMutation({
    mutationFn: async (outcome: string) => {
      setPendingOutcome(outcome)
      const res = await fetch('/api/actions/front_desk_log_call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: {
            contactId,
            direction: 'inbound',
            outcome,
            notes: '',
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
    onSuccess: (_, outcome) => {
      toast.success(`Call logged: ${outcome.replace('_', ' ')}`)
      queryClient.invalidateQueries({ queryKey: frontDeskKeys.all })
      setPendingOutcome(null)
    },
    onError: (err: Error) => {
      toast.error(err.message)
      setPendingOutcome(null)
    },
  })

  return (
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
          onClick={() => logCallMutation.mutate(outcome)}
          disabled={logCallMutation.isPending}
        >
          {pendingOutcome === outcome ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <Icon className="w-3 h-3" />
          )}
          {label}
        </Button>
      ))}
    </div>
  )
}

