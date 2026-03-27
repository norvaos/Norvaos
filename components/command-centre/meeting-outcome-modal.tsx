'use client'

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  Meeting Outcome Modal — Gate B Proactive Check-Out
 *  Protocol: ZIA-GOLDEN-002
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 *  Triggers reactively when:
 *    1. A scheduled appointment for this contact has passed its end_time
 *    2. The appointment status is still 'confirmed' (not yet completed)
 *
 *  Gate B only transitions to PASSED when:
 *    - Status is set to COMPLETED
 *    - A Service Stream (matter_type_id) is selected
 *
 *  Also provides a Quick-Log button for the Golden Thread Bar (10-second entry).
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useCommandCentre } from './command-centre-context'
import { useAppointments, useUpdateAppointmentStatus } from '@/lib/queries/booking'
import { useUpdateLead } from '@/lib/queries/leads'
import { useMatterTypes } from '@/lib/queries/matter-types'
import { useQueryClient } from '@tanstack/react-query'
import { masterProfileKeys } from '@/lib/queries/master-profile'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { CalendarCheck, Loader2, CheckCircle2, Briefcase } from 'lucide-react'
import { toast } from 'sonner'

// ─── Types ──────────────────────────────────────────────────────────

interface MeetingOutcomeModalProps {
  /** Controlled open state */
  open: boolean
  onOpenChange: (open: boolean) => void
  /** If provided, use this specific appointment; otherwise auto-detect */
  appointmentId?: string
  /** Quick-log mode: streamlined UI for 10-second entry */
  quickLog?: boolean
}

// ─── Helpers ────────────────────────────────────────────────────────

function isAppointmentPastEndTime(dateStr: string, endTime: string): boolean {
  const [h, m] = endTime.split(':').map(Number)
  const endDate = new Date(dateStr + 'T00:00:00')
  endDate.setHours(h, m, 0, 0)
  return new Date() > endDate
}

// ─── Component ──────────────────────────────────────────────────────

export function MeetingOutcomeModal({
  open,
  onOpenChange,
  appointmentId,
  quickLog = false,
}: MeetingOutcomeModalProps) {
  const { tenantId, contact, lead, entityId } = useCommandCentre()
  const queryClient = useQueryClient()

  // Appointments for this contact
  const { data: appointments } = useAppointments(tenantId, { contactId: contact?.id })

  // Find the target appointment
  const targetAppointment = useMemo(() => {
    if (!appointments) return null
    if (appointmentId) {
      return appointments.find((a) => a.id === appointmentId) ?? null
    }
    // Auto-detect: find the most recent confirmed appointment that has passed its end time
    return appointments.find(
      (a) =>
        a.status === 'confirmed' &&
        isAppointmentPastEndTime(a.appointment_date, a.end_time),
    ) ?? null
  }, [appointments, appointmentId])

  // Matter types for the service stream selector
  const { data: matterTypes } = useMatterTypes(
    tenantId,
    lead?.practice_area_id || undefined,
  )

  const updateStatus = useUpdateAppointmentStatus()
  const updateLead = useUpdateLead()

  const [selectedMatterTypeId, setSelectedMatterTypeId] = useState(
    lead?.matter_type_id ?? '',
  )
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Sync matter type selection with lead data
  useEffect(() => {
    if (lead?.matter_type_id && !selectedMatterTypeId) {
      setSelectedMatterTypeId(lead.matter_type_id)
    }
  }, [lead?.matter_type_id, selectedMatterTypeId])

  const canComplete = !!selectedMatterTypeId && !!targetAppointment

  const handleComplete = useCallback(async () => {
    if (!canComplete || !targetAppointment) return
    setIsSubmitting(true)

    try {
      // 1. Mark appointment as completed
      await updateStatus.mutateAsync({
        id: targetAppointment.id,
        tenantId,
        status: 'completed',
      })

      // 2. Set the matter type on the lead if not already set
      if (!lead?.matter_type_id || lead.matter_type_id !== selectedMatterTypeId) {
        await updateLead.mutateAsync({
          id: entityId,
          matter_type_id: selectedMatterTypeId,
        })
      }

      // 3. Invalidate master profile to re-evaluate Gate B
      queryClient.invalidateQueries({ queryKey: masterProfileKeys.all })

      toast.success('Meeting completed — service stream confirmed. Gate B cleared.')
      onOpenChange(false)
    } catch (err) {
      toast.error('Failed to log meeting outcome')
      console.error('[MeetingOutcome]', err)
    } finally {
      setIsSubmitting(false)
    }
  }, [
    canComplete,
    targetAppointment,
    tenantId,
    lead,
    selectedMatterTypeId,
    entityId,
    updateStatus,
    updateLead,
    queryClient,
    onOpenChange,
  ])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={quickLog ? 'max-w-sm' : 'max-w-md'}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarCheck className="h-5 w-5 text-blue-500" />
            {quickLog ? 'Quick Meeting Log' : 'Meeting Outcome — Check-Out'}
          </DialogTitle>
          <DialogDescription>
            {quickLog
              ? 'Log the meeting outcome and confirm the service stream in 10 seconds.'
              : 'This meeting has passed its scheduled end time. Confirm the outcome to advance the engagement.'}
          </DialogDescription>
        </DialogHeader>

        {/* Appointment info */}
        {targetAppointment && (
          <div className="rounded-md border border-blue-100 bg-blue-50/50 p-3 flex items-center gap-3">
            <CalendarCheck className="h-5 w-5 text-blue-400 shrink-0" />
            <div>
              <p className="text-sm font-medium text-slate-700">
                {new Date(targetAppointment.appointment_date + 'T00:00:00').toLocaleDateString('en-CA', {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                })}
                {' '}at{' '}
                {targetAppointment.start_time.slice(0, 5)}
              </p>
              <p className="text-xs text-slate-500">
                {targetAppointment.duration_minutes}min consultation
              </p>
            </div>
            <Badge className="ml-auto bg-amber-50 text-amber-700 border-amber-200 text-[10px]">
              Pending Outcome
            </Badge>
          </div>
        )}

        {!targetAppointment && (
          <div className="rounded-md border border-slate-200 bg-slate-50 p-4 text-center">
            <p className="text-sm text-slate-500">
              No appointments require check-out at this time.
            </p>
          </div>
        )}

        {/* Service Stream selector */}
        <div className="space-y-1.5">
          <Label className="text-sm font-medium flex items-center gap-1.5">
            <Briefcase className="h-3 w-3" />
            Service Stream (Matter Type) *
          </Label>
          <Select
            value={selectedMatterTypeId}
            onValueChange={setSelectedMatterTypeId}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select the service stream..." />
            </SelectTrigger>
            <SelectContent>
              {(matterTypes ?? []).map((mt) => (
                <SelectItem key={mt.id} value={mt.id}>
                  {mt.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {!selectedMatterTypeId && (
            <p className="text-[10px] text-amber-600">
              Required — Gate B will not clear without a confirmed service stream
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            {quickLog ? 'Dismiss' : 'Skip for Now'}
          </Button>
          <Button
            onClick={handleComplete}
            disabled={!canComplete || isSubmitting}
            className="gap-1.5"
          >
            {isSubmitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )}
            Mark Completed
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Auto-Trigger Hook ──────────────────────────────────────────────

/**
 * useAutoMeetingCheckout — detects when a confirmed appointment passes
 * its end time and surfaces a boolean flag for the UI to trigger the modal.
 */
export function useAutoMeetingCheckout(contactId: string | undefined, tenantId: string) {
  const { data: appointments } = useAppointments(tenantId, { contactId })
  const [shouldShow, setShouldShow] = useState(false)
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!appointments?.length) {
      setShouldShow(false)
      return
    }

    const checkPastAppointments = () => {
      const pastConfirmed = appointments.find(
        (a) =>
          a.status === 'confirmed' &&
          !dismissedIds.has(a.id) &&
          isAppointmentPastEndTime(a.appointment_date, a.end_time),
      )
      setShouldShow(!!pastConfirmed)
    }

    // Check immediately and then every 60 seconds
    checkPastAppointments()
    const interval = setInterval(checkPastAppointments, 60_000)
    return () => clearInterval(interval)
  }, [appointments, dismissedIds])

  const dismiss = useCallback((appointmentId: string) => {
    setDismissedIds((prev) => new Set(prev).add(appointmentId))
    setShouldShow(false)
  }, [])

  return { shouldShow, dismiss }
}
