'use client'

import { useState, useCallback, useMemo } from 'react'
import { useCommandCentre } from '../command-centre-context'
import { useQueryClient } from '@tanstack/react-query'
import { useBookingPages } from '@/lib/queries/booking'
import { createClient } from '@/lib/supabase/client'
import { formatFullName } from '@/lib/utils/formatters'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { CalendarPlus, Loader2, Info } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

// ─── Types ──────────────────────────────────────────────────────────

type AppointmentType = 'free' | 'paid'
type AppointmentFormat = 'in_person' | 'online'
type Duration = 15 | 30 | 60

interface CreateAppointmentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

// ─── Component ──────────────────────────────────────────────────────

export function CreateAppointmentDialog({ open, onOpenChange }: CreateAppointmentDialogProps) {
  const { tenantId, userId, contact, lead, users, entityId } = useCommandCentre()
  const queryClient = useQueryClient()
  const { data: bookingPages } = useBookingPages(tenantId)

  // Resolve the first active booking page (required for insert)
  const activeBookingPageId = useMemo(() => {
    const active = bookingPages?.find((bp) => bp.is_active && bp.status === 'published')
    return active?.id ?? bookingPages?.[0]?.id ?? null
  }, [bookingPages])

  const [appointmentType, setAppointmentType] = useState<AppointmentType>('free')
  const [format, setFormat] = useState<AppointmentFormat>('in_person')
  const [duration, setDuration] = useState<Duration>(30)
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [staffId, setStaffId] = useState(lead?.assigned_to ?? userId)
  const [notes, setNotes] = useState('')
  const [isCreating, setIsCreating] = useState(false)

  const handleCreate = useCallback(async () => {
    if (!date || !time) {
      toast.error('Please select a date and time')
      return
    }
    if (!activeBookingPageId) {
      toast.error('No booking page found. Please create a booking page first.')
      return
    }

    setIsCreating(true)
    try {
      const supabase = createClient()

      // Calculate end time
      const [hours, minutes] = time.split(':').map(Number)
      const totalMinutes = hours * 60 + minutes + duration
      const endHours = Math.floor(totalMinutes / 60) % 24
      const endMins = totalMinutes % 60
      const endTime = `${String(endHours).padStart(2, '0')}:${String(endMins).padStart(2, '0')}`

      const contactName = contact
        ? formatFullName(contact.first_name, contact.last_name) || contact.email_primary || ''
        : ''

      const { error } = await supabase.from('appointments').insert({
        tenant_id: tenantId,
        booking_page_id: activeBookingPageId,
        user_id: staffId,
        contact_id: contact?.id ?? null,
        lead_id: entityId,
        appointment_date: date,
        start_time: `${time}:00`,
        end_time: `${endTime}:00`,
        duration_minutes: duration,
        guest_name: contactName,
        guest_email: contact?.email_primary ?? '',
        guest_phone: contact?.phone_primary ?? null,
        guest_notes: notes || null,
        answers: {
          type: appointmentType,
          format,
        } as Record<string, unknown>,
        status: 'confirmed',
      })

      if (error) throw error

      queryClient.invalidateQueries({ queryKey: ['appointments'] })
      toast.success('Appointment created')

      if (appointmentType === 'paid') {
        toast.info('Payment link integration coming soon')
      }
      if (format === 'online') {
        toast.info('Teams link integration coming soon')
      }

      onOpenChange(false)
      // Reset form
      setDate('')
      setTime('')
      setNotes('')
      setAppointmentType('free')
      setFormat('in_person')
      setDuration(30)
    } catch {
      toast.error('Failed to create appointment')
    } finally {
      setIsCreating(false)
    }
  }, [
    date, time, duration, tenantId, staffId, contact, entityId,
    notes, appointmentType, format, queryClient, onOpenChange, activeBookingPageId,
  ])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <CalendarPlus className="h-4 w-4" />
            New Appointment
          </DialogTitle>
          <DialogDescription>
            Schedule an appointment with {contact ? formatFullName(contact.first_name, contact.last_name) || 'the client' : 'the client'}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Type: Paid / Free */}
          <div className="space-y-1.5">
            <Label className="text-sm">Type</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={appointmentType === 'free' ? 'default' : 'outline'}
                size="sm"
                className="flex-1 h-8 text-xs"
                onClick={() => setAppointmentType('free')}
              >
                Free
              </Button>
              <Button
                type="button"
                variant={appointmentType === 'paid' ? 'default' : 'outline'}
                size="sm"
                className="flex-1 h-8 text-xs"
                onClick={() => setAppointmentType('paid')}
              >
                Paid
              </Button>
            </div>
          </div>

          {/* Duration */}
          <div className="space-y-1.5">
            <Label className="text-sm">Duration</Label>
            <div className="flex gap-2">
              {([15, 30, 60] as Duration[]).map((d) => (
                <Button
                  key={d}
                  type="button"
                  variant={duration === d ? 'default' : 'outline'}
                  size="sm"
                  className="flex-1 h-8 text-xs"
                  onClick={() => setDuration(d)}
                >
                  {d} min
                </Button>
              ))}
            </div>
          </div>

          {/* Format: In-Person / Online */}
          <div className="space-y-1.5">
            <Label className="text-sm">Format</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={format === 'in_person' ? 'default' : 'outline'}
                size="sm"
                className="flex-1 h-8 text-xs"
                onClick={() => setFormat('in_person')}
              >
                In-Person
              </Button>
              <Button
                type="button"
                variant={format === 'online' ? 'default' : 'outline'}
                size="sm"
                className="flex-1 h-8 text-xs"
                onClick={() => setFormat('online')}
              >
                Online
              </Button>
            </div>
          </div>

          {/* Date + Time */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-sm">Date</Label>
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Time</Label>
              <Input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="h-9"
              />
            </div>
          </div>

          {/* Staff */}
          <div className="space-y-1.5">
            <Label className="text-sm">Staff Member</Label>
            <Select value={staffId} onValueChange={setStaffId}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Select staff..." />
              </SelectTrigger>
              <SelectContent>
                {users.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.first_name} {u.last_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label className="text-sm">Notes (optional)</Label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any notes for this appointment..."
              className="h-9"
            />
          </div>

          {/* Info banners */}
          {appointmentType === 'paid' && (
            <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
              <Info className="mt-0.5 h-3.5 w-3.5 text-amber-500 shrink-0" />
              <p className="text-xs text-amber-700">
                Payment link will be sent to the lead (integration coming soon).
              </p>
            </div>
          )}
          {format === 'online' && (
            <div className="flex items-start gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2">
              <Info className="mt-0.5 h-3.5 w-3.5 text-blue-500 shrink-0" />
              <p className="text-xs text-blue-700">
                Teams link will be sent automatically (integration coming soon).
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isCreating}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={isCreating || !date || !time}>
            {isCreating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create Appointment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
