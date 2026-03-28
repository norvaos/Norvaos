'use client'

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * NurtureControl — "Smart Pause" for Stage 4 (Strategy Held)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * When a strategy meeting is completed, the Principal may decide to "pause"
 * follow-up on a lead for a defined period (e.g. "call back in 2 weeks").
 *
 * Actions:
 *   - "Follow-up Required" button → date-picker → sets lead to snoozed
 *   - Lead's visibility_status = 'snoozed' until snooze_until date
 *   - On snooze expiry, the lead appears on Principal's Radar with Emerald Pulse
 *
 * This component renders inline within the lead workspace when the lead is in
 * Stage 4 (Strategy Held) or is currently snoozed.
 */

import { useState, useCallback } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { format, addDays, addWeeks, addMonths } from 'date-fns'
import { CalendarClock, Pause, Play, Clock, CalendarDays } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { cn } from '@/lib/utils'

// ─── Types ───────────────────────────────────────────────────────────────────

interface NurtureControlProps {
  leadId: string
  tenantId: string
  currentStageName: string | null
  visibilityStatus: string | null
  snoozeUntil: string | null
  snoozedAt: string | null
  /** Current user ID for audit trail */
  userId: string
}

// ─── Quick Presets ───────────────────────────────────────────────────────────

const SNOOZE_PRESETS = [
  { label: '3 days',  getFn: () => addDays(new Date(), 3) },
  { label: '1 week',  getFn: () => addWeeks(new Date(), 1) },
  { label: '2 weeks', getFn: () => addWeeks(new Date(), 2) },
  { label: '1 month', getFn: () => addMonths(new Date(), 1) },
  { label: '3 months', getFn: () => addMonths(new Date(), 3) },
] as const

// ─── Snooze Mutation ─────────────────────────────────────────────────────────

function useSnoozeLead() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (input: {
      leadId: string
      tenantId: string
      snoozeUntil: Date
      userId: string
    }) => {
      const supabase = createClient()

      const { error } = await supabase
        .from('leads')
        .update({
          snooze_until: input.snoozeUntil.toISOString(),
          snoozed_at: new Date().toISOString(),
          snoozed_by: input.userId,
          visibility_status: 'snoozed',
        })
        .eq('id', input.leadId)
        .eq('tenant_id', input.tenantId)

      if (error) throw error

      // Log activity
      await supabase.from('activities').insert({
        tenant_id: input.tenantId,
        entity_type: 'lead',
        entity_id: input.leadId,
        activity_type: 'lead_snoozed',
        title: 'Smart Pause activated',
        description: `Lead snoozed until ${format(input.snoozeUntil, 'MMM d, yyyy')}`,
        user_id: input.userId,
        metadata: {
          snooze_until: input.snoozeUntil.toISOString(),
          action: 'smart_pause',
        },
      }).select().single()

      return { snoozeUntil: input.snoozeUntil }
    },
    onSuccess: (data) => {
      toast.success(`Smart Pause active until ${format(data.snoozeUntil, 'MMM d, yyyy')}`)
      qc.invalidateQueries({ queryKey: ['leads'] })
      qc.invalidateQueries({ queryKey: ['lead-detail'] })
      qc.invalidateQueries({ queryKey: ['master-profile'] })
      qc.invalidateQueries({ queryKey: ['principal-radar'] })
    },
    onError: () => {
      toast.error('Failed to snooze lead')
    },
  })
}

function useUnsnoozeLead() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (input: {
      leadId: string
      tenantId: string
      userId: string
    }) => {
      const supabase = createClient()

      const { error } = await supabase
        .from('leads')
        .update({
          snooze_until: null,
          snoozed_at: null,
          snoozed_by: null,
          visibility_status: 'visible',
        })
        .eq('id', input.leadId)
        .eq('tenant_id', input.tenantId)

      if (error) throw error

      // Log activity
      await supabase.from('activities').insert({
        tenant_id: input.tenantId,
        entity_type: 'lead',
        entity_id: input.leadId,
        activity_type: 'lead_unsnoozed',
        title: 'Smart Pause cancelled',
        description: 'Smart Pause cancelled — lead is now visible',
        user_id: input.userId,
        metadata: { action: 'smart_pause_cancelled' },
      }).select().single()
    },
    onSuccess: () => {
      toast.success('Smart Pause cancelled — lead is active')
      qc.invalidateQueries({ queryKey: ['leads'] })
      qc.invalidateQueries({ queryKey: ['lead-detail'] })
      qc.invalidateQueries({ queryKey: ['master-profile'] })
      qc.invalidateQueries({ queryKey: ['principal-radar'] })
    },
    onError: () => {
      toast.error('Failed to unsnooze lead')
    },
  })
}

// ─── Component ───────────────────────────────────────────────────────────────

export function NurtureControl({
  leadId,
  tenantId,
  currentStageName,
  visibilityStatus,
  snoozeUntil,
  snoozedAt,
  userId,
}: NurtureControlProps) {
  const [calendarOpen, setCalendarOpen] = useState(false)
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined)

  const snoozeMutation = useSnoozeLead()
  const unsnoozeMutation = useUnsnoozeLead()

  const isSnoozed = visibilityStatus === 'snoozed' && snoozeUntil
  const isStrategyHeld = currentStageName?.toLowerCase().includes('strategy held')
  const snoozeExpired = isSnoozed && new Date(snoozeUntil) < new Date()

  // Only show for Stage 4 (Strategy Held) or currently snoozed leads
  if (!isStrategyHeld && !isSnoozed) return null

  const handleSnooze = useCallback((date: Date) => {
    snoozeMutation.mutate({
      leadId,
      tenantId,
      snoozeUntil: date,
      userId,
    })
    setCalendarOpen(false)
    setSelectedDate(undefined)
  }, [leadId, tenantId, userId, snoozeMutation])

  const handleUnsnooze = useCallback(() => {
    unsnoozeMutation.mutate({ leadId, tenantId, userId })
  }, [leadId, tenantId, userId, unsnoozeMutation])

  // ── Snoozed State ──────────────────────────────────────────────────────────
  if (isSnoozed) {
    const expiryDate = new Date(snoozeUntil)
    const isExpired = snoozeExpired

    return (
      <div
        className={cn(
          'rounded-lg border px-4 py-3',
          isExpired
            ? 'border-emerald-500/30 bg-emerald-950/30 animate-pulse'
            : 'border-amber-500/20 bg-amber-950/30'
        )}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isExpired ? (
              <Play className="size-4 text-emerald-600" />
            ) : (
              <Pause className="size-4 text-amber-600" />
            )}
            <div>
              <p className={cn(
                'text-xs font-semibold',
                isExpired ? 'text-emerald-400' : 'text-amber-400'
              )}>
                {isExpired ? '✦ Smart Pause Expired — Follow-up Required' : '⏸ Smart Pause Active'}
              </p>
              <p className={cn(
                'text-xs mt-0.5',
                isExpired ? 'text-emerald-600' : 'text-amber-600'
              )}>
                {isExpired
                  ? `Snooze expired ${format(expiryDate, 'MMM d, yyyy')} — this lead needs attention now`
                  : `Paused until ${format(expiryDate, 'MMM d, yyyy')}${snoozedAt ? ` · snoozed ${format(new Date(snoozedAt), 'MMM d')}` : ''}`
                }
              </p>
            </div>
          </div>
          <Button
            size="sm"
            variant={isExpired ? 'default' : 'outline'}
            className={cn(
              'text-xs',
              isExpired && 'bg-emerald-600 hover:bg-emerald-700'
            )}
            onClick={handleUnsnooze}
            disabled={unsnoozeMutation.isPending}
          >
            {isExpired ? (
              <>
                <Play className="mr-1 size-3" />
                Resume Now
              </>
            ) : (
              <>
                <Play className="mr-1 size-3" />
                Cancel Pause
              </>
            )}
          </Button>
        </div>
      </div>
    )
  }

  // ── Strategy Held — Snooze Picker ──────────────────────────────────────────
  return (
    <div className="rounded-lg border border-indigo-200 bg-indigo-50/50 px-4 py-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CalendarClock className="size-4 text-indigo-600" />
          <div>
            <p className="text-xs font-semibold text-indigo-700">
              ✦ Smart Pause — Strategy Decision Junction
            </p>
            <p className="text-xs text-indigo-600 mt-0.5">
              Set a follow-up date. The lead will re-appear on the Principal&apos;s Radar when the pause expires.
            </p>
          </div>
        </div>

        <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
          <PopoverTrigger asChild>
            <Button
              size="sm"
              variant="outline"
              className="text-xs border-indigo-300 text-indigo-700 hover:bg-indigo-100"
              disabled={snoozeMutation.isPending}
            >
              <Clock className="mr-1 size-3" />
              Follow-up Required
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="end">
            <div className="p-3 border-b">
              <p className="text-xs font-semibold text-foreground/80 mb-2">Quick presets</p>
              <div className="flex flex-wrap gap-1.5">
                {SNOOZE_PRESETS.map((preset) => (
                  <Button
                    key={preset.label}
                    size="sm"
                    variant="outline"
                    className="text-xs h-7 px-2"
                    onClick={() => handleSnooze(preset.getFn())}
                  >
                    {preset.label}
                  </Button>
                ))}
              </div>
            </div>
            <div className="p-3 border-b">
              <p className="text-xs font-semibold text-foreground/80 mb-2">
                <CalendarDays className="inline size-3 mr-1" />
                Or pick a date
              </p>
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={(date) => {
                  if (date) {
                    setSelectedDate(date)
                  }
                }}
                disabled={(date) => date < new Date()}
                initialFocus
                className="rounded-md"
              />
            </div>
            {selectedDate && (
              <div className="p-3 flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                  Snooze until {format(selectedDate, 'MMM d, yyyy')}
                </span>
                <Button
                  size="sm"
                  className="text-xs bg-indigo-600 hover:bg-indigo-700"
                  onClick={() => handleSnooze(selectedDate)}
                >
                  Confirm
                </Button>
              </div>
            )}
          </PopoverContent>
        </Popover>
      </div>
    </div>
  )
}
