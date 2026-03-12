'use client'

import { useState, useEffect, useCallback } from 'react'
import { format, addDays, isBefore, startOfDay } from 'date-fns'
import {
  CalendarDays,
  Clock,
  Plus,
  User,
  Check,
  Loader2,
  MoreHorizontal,
  XCircle,
  UserX,
  ArrowLeft,
  ChevronRight,
  ChevronDown,
  Pencil,
  LogIn,
  Play,
  CheckCircle,
  History,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Calendar } from '@/components/ui/calendar'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

import {
  useAppointments,
  useBookingPages,
  useBookingPage,
  useCreateAppointmentInternal,
  useCancelAppointment,
  useMarkNoShow,
  useRescheduleAppointment,
  useCheckInAppointment,
  useStartAppointment,
  useCompleteAppointment,
  type AppointmentWithDetails,
  type BookingPageWithUser,
} from '@/lib/queries/booking'
import { cn } from '@/lib/utils'
import { useRouter } from 'next/navigation'

// ── Status helpers ──────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  confirmed: { label: 'Confirmed', color: 'bg-emerald-100 text-emerald-700' },
  checked_in: { label: 'Checked In', color: 'bg-amber-100 text-amber-700' },
  in_meeting: { label: 'In Progress', color: 'bg-purple-100 text-purple-700' },
  completed: { label: 'Completed', color: 'bg-blue-100 text-blue-700' },
  cancelled: { label: 'Cancelled', color: 'bg-slate-100 text-slate-500' },
  no_show: { label: 'No Show', color: 'bg-red-100 text-red-700' },
}

const ACTIVE_STATUSES = ['confirmed', 'checked_in', 'in_meeting']

function formatTime12(time: string): string {
  const [h, m] = time.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h
  return `${hour12}:${m.toString().padStart(2, '0')} ${ampm}`
}

function formatDateNice(dateStr: string): string {
  try {
    const d = new Date(dateStr + 'T00:00:00')
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
  } catch {
    return dateStr
  }
}

// ── Main Component ──────────────────────────────────────────────────────────

export function ContactBookingsTab({
  contactId,
  contactName,
  tenantId,
}: {
  contactId: string
  contactName: string
  tenantId: string
}) {
  const [bookingOpen, setBookingOpen] = useState(false)
  const [pastExpanded, setPastExpanded] = useState(false)
  const [cancelTarget, setCancelTarget] = useState<AppointmentWithDetails | null>(null)
  const [noShowTarget, setNoShowTarget] = useState<AppointmentWithDetails | null>(null)
  const [rescheduleTarget, setRescheduleTarget] = useState<AppointmentWithDetails | null>(null)

  const { data: appointments, isLoading } = useAppointments(tenantId, { contactId })
  const cancelMutation = useCancelAppointment()
  const noShowMutation = useMarkNoShow()

  const router = useRouter()
  const checkInMutation = useCheckInAppointment()
  const startMutation = useStartAppointment()
  const completeMutation = useCompleteAppointment()

  const today = new Date().toISOString().split('T')[0]
  const upcoming = (appointments ?? []).filter(
    (a) => a.appointment_date >= today && ACTIVE_STATUSES.includes(a.status)
  )
  const past = (appointments ?? []).filter(
    (a) => a.appointment_date < today || !ACTIVE_STATUSES.includes(a.status)
  )

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div />
        <Button size="sm" onClick={() => setBookingOpen(true)}>
          <Plus className="mr-1.5 size-3.5" />
          New Appointment
        </Button>
      </div>

      {/* Loading */}
      {isLoading && (
        <Card>
          <CardContent className="py-6">
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full rounded-lg" />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty state */}
      {!isLoading && (!appointments || appointments.length === 0) && (
        <Card>
          <CardContent className="py-12 text-center">
            <CalendarDays className="mx-auto mb-3 size-10 text-muted-foreground/50" />
            <p className="text-sm font-medium text-slate-900">No appointments</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Book an appointment with this contact to get started.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Upcoming */}
      {upcoming.length > 0 && (
        <div>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Upcoming
          </h4>
          <div className="space-y-2">
            {upcoming.map((appt) => (
              <AppointmentCard
                key={appt.id}
                appointment={appt}
                onCancel={() => setCancelTarget(appt)}
                onNoShow={() => setNoShowTarget(appt)}
                onReschedule={() => setRescheduleTarget(appt)}
                onCheckIn={() => checkInMutation.mutate(appt.id)}
                onStart={() => {
                  startMutation.mutate(appt.id, {
                    onSuccess: (data) => {
                      if (data.matterId) {
                        router.push(`/matters/${data.matterId}`)
                      } else if (data.leadId) {
                        router.push(`/command/lead/${data.leadId}`)
                      }
                    },
                  })
                }}
                onComplete={() => completeMutation.mutate({ appointmentId: appt.id })}
              />
            ))}
          </div>
        </div>
      )}

      {/* Past / Completed (collapsible) */}
      {past.length > 0 && (
        <div>
          <button
            onClick={() => setPastExpanded(!pastExpanded)}
            className="mb-2 flex w-full items-center gap-2 text-left group"
          >
            <div className={cn(
              'flex size-5 items-center justify-center rounded transition-transform',
              pastExpanded && 'rotate-0'
            )}>
              {pastExpanded ? (
                <ChevronDown className="size-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="size-4 text-muted-foreground" />
              )}
            </div>
            <History className="size-3.5 text-muted-foreground" />
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground group-hover:text-slate-700 transition-colors">
              Past & Completed
            </h4>
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 ml-1">
              {past.length}
            </Badge>
          </button>
          {pastExpanded && (
            <div className="space-y-2">
              {past.map((appt) => (
                <AppointmentCard key={appt.id} appointment={appt} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Booking Dialog */}
      <BookingDialog
        open={bookingOpen}
        onOpenChange={setBookingOpen}
        contactId={contactId}
        contactName={contactName}
        tenantId={tenantId}
      />

      {/* Cancel Confirmation */}
      <AlertDialog open={!!cancelTarget} onOpenChange={(open) => !open && setCancelTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel Appointment</AlertDialogTitle>
            <AlertDialogDescription>
              Cancel the appointment on {cancelTarget ? formatDateNice(cancelTarget.appointment_date) : ''} at{' '}
              {cancelTarget ? formatTime12(cancelTarget.start_time) : ''}? A cancellation email will be sent to the client.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (cancelTarget) {
                  cancelMutation.mutate({ appointmentId: cancelTarget.id })
                  setCancelTarget(null)
                }
              }}
            >
              Cancel Appointment
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* No-Show Confirmation */}
      <AlertDialog open={!!noShowTarget} onOpenChange={(open) => !open && setNoShowTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mark as No-Show</AlertDialogTitle>
            <AlertDialogDescription>
              Mark the appointment on {noShowTarget ? formatDateNice(noShowTarget.appointment_date) : ''} as a no-show? A notification email will be sent to the client.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (noShowTarget) {
                  noShowMutation.mutate(noShowTarget.id)
                  setNoShowTarget(null)
                }
              }}
            >
              Mark No-Show
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reschedule Dialog */}
      <RescheduleDialog
        appointment={rescheduleTarget}
        onClose={() => setRescheduleTarget(null)}
        tenantId={tenantId}
      />
    </div>
  )
}

// ── Appointment Card ────────────────────────────────────────────────────────

function AppointmentCard({
  appointment,
  onCancel,
  onNoShow,
  onReschedule,
  onCheckIn,
  onStart,
  onComplete,
}: {
  appointment: AppointmentWithDetails
  onCancel?: () => void
  onNoShow?: () => void
  onReschedule?: () => void
  onCheckIn?: () => void
  onStart?: () => void
  onComplete?: () => void
}) {
  const statusInfo = STATUS_CONFIG[appointment.status] ?? { label: appointment.status, color: 'bg-slate-100 text-slate-600' }
  const lawyerName = [appointment.user_first_name, appointment.user_last_name].filter(Boolean).join(' ') || 'Lawyer'
  const hasDropdown = appointment.status === 'confirmed' && (onCancel || onNoShow || onReschedule)

  return (
    <Card className="transition-colors hover:bg-muted/30">
      <CardContent className="flex items-center gap-4 py-3 px-4">
        {/* Date block */}
        <div className="flex flex-col items-center min-w-[48px] text-center">
          <span className="text-xs font-medium text-muted-foreground">
            {new Date(appointment.appointment_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short' })}
          </span>
          <span className="text-lg font-bold text-slate-900">
            {new Date(appointment.appointment_date + 'T00:00:00').getDate()}
          </span>
        </div>

        {/* Details */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-slate-900">
              {formatTime12(appointment.start_time)} – {formatTime12(appointment.end_time)}
            </span>
            <Badge variant="secondary" className={cn('text-[10px] px-1.5 py-0', statusInfo.color)}>
              {statusInfo.label}
            </Badge>
          </div>
          <div className="mt-0.5 flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <User className="size-3" />
              {lawyerName}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="size-3" />
              {appointment.duration_minutes} min
            </span>
            {appointment.booking_page_title && (
              <span className="truncate">{appointment.booking_page_title}</span>
            )}
          </div>
        </div>

        {/* Lifecycle action buttons */}
        {appointment.status === 'confirmed' && onCheckIn && (
          <Button size="sm" variant="outline" className="shrink-0" onClick={onCheckIn}>
            <LogIn className="mr-1.5 size-3.5" />
            Check In
          </Button>
        )}
        {appointment.status === 'checked_in' && onStart && (
          <Button size="sm" className="shrink-0" onClick={onStart}>
            <Play className="mr-1.5 size-3.5" />
            Start
          </Button>
        )}
        {appointment.status === 'in_meeting' && onComplete && (
          <Button size="sm" variant="outline" className="shrink-0" onClick={onComplete}>
            <CheckCircle className="mr-1.5 size-3.5" />
            Complete
          </Button>
        )}

        {/* Dropdown for secondary actions */}
        {hasDropdown && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="size-8">
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {onReschedule && (
                <DropdownMenuItem onClick={onReschedule}>
                  <Pencil className="mr-2 size-4" />
                  Reschedule
                </DropdownMenuItem>
              )}
              {onCancel && (
                <DropdownMenuItem onClick={onCancel}>
                  <XCircle className="mr-2 size-4" />
                  Cancel
                </DropdownMenuItem>
              )}
              {onNoShow && (
                <DropdownMenuItem onClick={onNoShow}>
                  <UserX className="mr-2 size-4" />
                  No-Show
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </CardContent>
    </Card>
  )
}

// ── Booking Dialog (4-step stepper) ─────────────────────────────────────────

type BookingStep = 'lawyer' | 'date' | 'time' | 'confirm'

interface TimeSlot {
  time: string
  available: boolean
}

function BookingDialog({
  open,
  onOpenChange,
  contactId,
  contactName,
  tenantId,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  contactId: string
  contactName: string
  tenantId: string
}) {
  const { data: bookingPages, isLoading: pagesLoading } = useBookingPages(tenantId)
  const createAppointment = useCreateAppointmentInternal()

  const [step, setStep] = useState<BookingStep>('lawyer')
  const [selectedPage, setSelectedPage] = useState<BookingPageWithUser | null>(null)
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined)
  const [selectedTime, setSelectedTime] = useState<string | null>(null)
  const [notes, setNotes] = useState('')
  const [slots, setSlots] = useState<TimeSlot[]>([])
  const [slotsLoading, setSlotsLoading] = useState(false)

  // Published pages only
  const publishedPages = (bookingPages ?? []).filter((p) => p.status === 'published')

  // Auto-skip lawyer step if only 1 page
  useEffect(() => {
    if (open && publishedPages.length === 1 && step === 'lawyer') {
      setSelectedPage(publishedPages[0])
      setStep('date')
    }
  }, [open, publishedPages.length, step])

  // Reset on close
  useEffect(() => {
    if (!open) {
      setStep(publishedPages.length === 1 ? 'date' : 'lawyer')
      setSelectedPage(publishedPages.length === 1 ? publishedPages[0] : null)
      setSelectedDate(undefined)
      setSelectedTime(null)
      setNotes('')
      setSlots([])
    }
  }, [open])

  // Fetch slots when date changes
  const fetchSlots = useCallback(async (slug: string, date: string) => {
    setSlotsLoading(true)
    setSlots([])
    try {
      const res = await fetch(`/api/booking/${slug}?date=${date}`)
      const data = await res.json()
      if (data.success && data.slots) {
        setSlots(data.slots.filter((s: TimeSlot) => s.available))
      }
    } catch {
      setSlots([])
    } finally {
      setSlotsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (selectedPage && selectedDate) {
      const dateStr = format(selectedDate, 'yyyy-MM-dd')
      fetchSlots(selectedPage.slug, dateStr)
    }
  }, [selectedPage, selectedDate, fetchSlots])

  function handleSelectPage(page: BookingPageWithUser) {
    setSelectedPage(page)
    setStep('date')
  }

  function handleSelectDate(date: Date | undefined) {
    setSelectedDate(date)
    setSelectedTime(null)
    if (date) setStep('time')
  }

  function handleSelectTime(time: string) {
    setSelectedTime(time)
    setStep('confirm')
  }

  function handleBack() {
    if (step === 'confirm') setStep('time')
    else if (step === 'time') setStep('date')
    else if (step === 'date') {
      if (publishedPages.length > 1) setStep('lawyer')
    }
  }

  async function handleConfirm() {
    if (!selectedPage || !selectedDate || !selectedTime) return
    await createAppointment.mutateAsync({
      bookingPageId: selectedPage.id,
      contactId,
      date: format(selectedDate, 'yyyy-MM-dd'),
      time: selectedTime,
      notes: notes || undefined,
    })
    onOpenChange(false)
  }

  // Disable dates outside working days and past dates
  const workingHours = selectedPage?.working_hours as { start: string; end: string; days: number[] } | null
  const maxDays = selectedPage?.max_days_ahead ?? 30

  function isDateDisabled(date: Date): boolean {
    if (isBefore(date, startOfDay(new Date()))) return true
    if (date > addDays(new Date(), maxDays)) return true
    if (workingHours && !workingHours.days.includes(date.getDay())) return true
    return false
  }

  const stepIndex = step === 'lawyer' ? 0 : step === 'date' ? 1 : step === 'time' ? 2 : 3

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {step !== 'lawyer' && step !== 'date' && (
              <Button variant="ghost" size="icon" className="size-7 -ml-1" onClick={handleBack}>
                <ArrowLeft className="size-4" />
              </Button>
            )}
            {step === 'date' && publishedPages.length > 1 && (
              <Button variant="ghost" size="icon" className="size-7 -ml-1" onClick={handleBack}>
                <ArrowLeft className="size-4" />
              </Button>
            )}
            {step === 'lawyer' && 'Select Lawyer'}
            {step === 'date' && 'Pick a Date'}
            {step === 'time' && 'Pick a Time'}
            {step === 'confirm' && 'Confirm Appointment'}
          </DialogTitle>

          {/* Step indicator */}
          <div className="flex items-center gap-1 pt-1">
            {(publishedPages.length > 1 ? ['Lawyer', 'Date', 'Time', 'Confirm'] : ['Date', 'Time', 'Confirm']).map((label, i) => {
              const adjustedIndex = publishedPages.length > 1 ? stepIndex : stepIndex - 1
              return (
                <div key={label} className="flex items-center gap-1">
                  <div
                    className={cn(
                      'h-1 flex-1 rounded-full transition-colors',
                      i <= adjustedIndex ? 'bg-primary' : 'bg-muted'
                    )}
                    style={{ width: `${100 / (publishedPages.length > 1 ? 4 : 3)}%` }}
                  />
                </div>
              )
            })}
          </div>
        </DialogHeader>

        <div className="mt-2">
          {/* Step 1: Select Lawyer */}
          {step === 'lawyer' && (
            <div className="space-y-2">
              {pagesLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 2 }).map((_, i) => (
                    <Skeleton key={i} className="h-16 w-full rounded-lg" />
                  ))}
                </div>
              ) : publishedPages.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  No booking pages available. Create one in Settings &rarr; Booking Pages.
                </div>
              ) : (
                publishedPages.map((page) => {
                  const lawyerName = page.users
                    ? [page.users.first_name, page.users.last_name].filter(Boolean).join(' ')
                    : 'Unknown'
                  return (
                    <button
                      key={page.id}
                      onClick={() => handleSelectPage(page)}
                      className="w-full flex items-center gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-muted/50"
                    >
                      <div className="flex size-9 items-center justify-center rounded-full bg-primary/10 text-primary">
                        <User className="size-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{lawyerName}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {page.title} &middot; {page.duration_minutes} min
                        </p>
                      </div>
                      <ChevronRight className="size-4 text-muted-foreground" />
                    </button>
                  )
                })
              )}
            </div>
          )}

          {/* Step 2: Pick Date */}
          {step === 'date' && (
            <div className="flex justify-center">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={handleSelectDate}
                disabled={isDateDisabled}
              />
            </div>
          )}

          {/* Step 3: Pick Time */}
          {step === 'time' && (
            <div>
              <p className="mb-3 text-sm text-muted-foreground">
                {selectedDate && format(selectedDate, 'EEEE, MMMM d, yyyy')}
              </p>
              {slotsLoading ? (
                <div className="grid grid-cols-3 gap-2">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="h-10 rounded-md" />
                  ))}
                </div>
              ) : slots.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  No available slots on this date. Please pick another day.
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {slots.map((slot) => (
                    <button
                      key={slot.time}
                      onClick={() => handleSelectTime(slot.time)}
                      className={cn(
                        'rounded-md border px-3 py-2 text-sm font-medium transition-colors',
                        selectedTime === slot.time
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'hover:bg-muted/50'
                      )}
                    >
                      {formatTime12(slot.time)}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Step 4: Confirm */}
          {step === 'confirm' && selectedPage && selectedDate && selectedTime && (
            <div className="space-y-4">
              {/* Summary card */}
              <div className="rounded-lg border bg-muted/30 p-4 space-y-2.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Contact</span>
                  <span className="font-medium">{contactName}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Lawyer</span>
                  <span className="font-medium">
                    {selectedPage.users
                      ? [selectedPage.users.first_name, selectedPage.users.last_name].filter(Boolean).join(' ')
                      : 'Unknown'}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Date</span>
                  <span className="font-medium">{format(selectedDate, 'EEE, MMM d, yyyy')}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Time</span>
                  <span className="font-medium">{formatTime12(selectedTime)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Duration</span>
                  <span className="font-medium">{selectedPage.duration_minutes} min</span>
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="text-sm font-medium text-slate-700">Notes (optional)</label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Add notes for this appointment..."
                  className="mt-1.5"
                  rows={2}
                />
              </div>

              <Button
                className="w-full"
                onClick={handleConfirm}
                disabled={createAppointment.isPending}
              >
                {createAppointment.isPending ? (
                  <Loader2 className="mr-2 size-4 animate-spin" />
                ) : (
                  <Check className="mr-2 size-4" />
                )}
                Confirm Appointment
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ── Reschedule Dialog (date + time picker) ──────────────────────────────────

function RescheduleDialog({
  appointment,
  onClose,
  tenantId,
}: {
  appointment: AppointmentWithDetails | null
  onClose: () => void
  tenantId: string
}) {
  const rescheduleMutation = useRescheduleAppointment()
  const { data: bookingPage } = useBookingPage(appointment?.booking_page_id ?? null)

  const [rescheduleStep, setRescheduleStep] = useState<'date' | 'time'>('date')
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined)
  const [selectedTime, setSelectedTime] = useState<string | null>(null)
  const [slots, setSlots] = useState<TimeSlot[]>([])
  const [slotsLoading, setSlotsLoading] = useState(false)

  // Reset on open/close
  useEffect(() => {
    if (appointment) {
      setRescheduleStep('date')
      setSelectedDate(undefined)
      setSelectedTime(null)
      setSlots([])
    }
  }, [appointment])

  // Fetch slots when date changes
  useEffect(() => {
    if (bookingPage && selectedDate) {
      const dateStr = format(selectedDate, 'yyyy-MM-dd')
      setSlotsLoading(true)
      setSlots([])
      fetch(`/api/booking/${bookingPage.slug}?date=${dateStr}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.success && data.slots) {
            setSlots(data.slots.filter((s: TimeSlot) => s.available))
          }
        })
        .catch(() => setSlots([]))
        .finally(() => setSlotsLoading(false))
    }
  }, [bookingPage, selectedDate])

  const workingHours = bookingPage?.working_hours as { start: string; end: string; days: number[] } | null
  const maxDays = bookingPage?.max_days_ahead ?? 30

  function isDateDisabled(date: Date): boolean {
    if (isBefore(date, startOfDay(new Date()))) return true
    if (date > addDays(new Date(), maxDays)) return true
    if (workingHours && !workingHours.days.includes(date.getDay())) return true
    return false
  }

  function handleDateSelect(date: Date | undefined) {
    setSelectedDate(date)
    setSelectedTime(null)
    if (date) setRescheduleStep('time')
  }

  async function handleConfirmReschedule() {
    if (!appointment || !selectedDate || !selectedTime) return
    await rescheduleMutation.mutateAsync({
      appointmentId: appointment.id,
      date: format(selectedDate, 'yyyy-MM-dd'),
      time: selectedTime,
    })
    onClose()
  }

  return (
    <Dialog open={!!appointment} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {rescheduleStep === 'time' && (
              <Button variant="ghost" size="icon" className="size-7 -ml-1" onClick={() => setRescheduleStep('date')}>
                <ArrowLeft className="size-4" />
              </Button>
            )}
            {rescheduleStep === 'date' ? 'Pick New Date' : 'Pick New Time'}
          </DialogTitle>
        </DialogHeader>

        <div className="mt-2">
          {rescheduleStep === 'date' && (
            <div className="flex justify-center">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={handleDateSelect}
                disabled={isDateDisabled}
              />
            </div>
          )}

          {rescheduleStep === 'time' && (
            <div>
              <p className="mb-3 text-sm text-muted-foreground">
                {selectedDate && format(selectedDate, 'EEEE, MMMM d, yyyy')}
              </p>
              {slotsLoading ? (
                <div className="grid grid-cols-3 gap-2">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="h-10 rounded-md" />
                  ))}
                </div>
              ) : slots.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  No available slots on this date. Please pick another day.
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-3 gap-2">
                    {slots.map((slot) => (
                      <button
                        key={slot.time}
                        onClick={() => setSelectedTime(slot.time)}
                        className={cn(
                          'rounded-md border px-3 py-2 text-sm font-medium transition-colors',
                          selectedTime === slot.time
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'hover:bg-muted/50'
                        )}
                      >
                        {formatTime12(slot.time)}
                      </button>
                    ))}
                  </div>
                  {selectedTime && (
                    <Button
                      className="w-full mt-4"
                      onClick={handleConfirmReschedule}
                      disabled={rescheduleMutation.isPending}
                    >
                      {rescheduleMutation.isPending ? (
                        <Loader2 className="mr-2 size-4 animate-spin" />
                      ) : (
                        <Check className="mr-2 size-4" />
                      )}
                      Confirm Reschedule
                    </Button>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
