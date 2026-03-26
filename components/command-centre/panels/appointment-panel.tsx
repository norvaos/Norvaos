'use client'

import { useState, useMemo } from 'react'
import { useCommandCentre } from '../command-centre-context'
import { useAppointments, useBookingPages, useUpdateAppointmentStatus } from '@/lib/queries/booking'
import { CreateAppointmentDialog } from './create-appointment-dialog'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  CalendarCheck,
  ExternalLink,
  Clock,
  Calendar,
  Plus,
  ChevronDown,
  ChevronRight,
  User,
  Video,
  MapPin,
  XCircle,
  UserX,
  Loader2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatDate } from '@/lib/utils/formatters'

// ─── Helpers ────────────────────────────────────────────────────────

function formatAppointmentDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  const today = new Date(new Date().toDateString())
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)

  if (d.getTime() === today.getTime()) return 'Today'
  if (d.getTime() === tomorrow.getTime()) return 'Tomorrow'

  return formatDate(d)
}

function formatTime(time: string): string {
  const [h, m] = time.split(':')
  const hour = parseInt(h)
  const ampm = hour >= 12 ? 'PM' : 'AM'
  const h12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour
  return `${h12}:${m} ${ampm}`
}

function isPast(dateStr: string): boolean {
  return new Date(dateStr + 'T23:59:59') < new Date()
}

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  confirmed: { label: 'Confirmed', className: 'bg-green-100 text-green-700 border-green-200' },
  cancelled: { label: 'Cancelled', className: 'bg-red-100 text-red-700 border-red-200' },
  no_show: { label: 'No Show', className: 'bg-amber-100 text-amber-700 border-amber-200' },
  completed: { label: 'Completed', className: 'bg-slate-100 text-slate-700 border-slate-200' },
}

// ─── Component ──────────────────────────────────────────────────────

export function AppointmentPanel() {
  const { tenantId, contact, users } = useCommandCentre()

  // Fetch appointments filtered to this contact (server-side filter  -  no longer fetches ALL)
  const { data: appointments, isLoading: apptLoading } = useAppointments(
    tenantId,
    { contactId: contact?.id }
  )
  const { data: bookingPages } = useBookingPages(tenantId)
  const updateStatus = useUpdateAppointmentStatus()

  const [createOpen, setCreateOpen] = useState(false)
  const [detailAppt, setDetailAppt] = useState<(typeof contactAppointments)[0] | null>(null)
  const [showPast, setShowPast] = useState(false)
  const [actionPending, setActionPending] = useState(false)

  // Appointments now pre-filtered by contact_id  -  just alias
  const contactAppointments = useMemo(() => {
    return appointments ?? []
  }, [appointments])

  // Split into upcoming + past
  const { upcoming, past } = useMemo(() => {
    const up: typeof contactAppointments = []
    const pa: typeof contactAppointments = []
    for (const appt of contactAppointments) {
      if (isPast(appt.appointment_date) || appt.status === 'cancelled' || appt.status === 'no_show') {
        pa.push(appt)
      } else {
        up.push(appt)
      }
    }
    // Sort upcoming ascending, past descending
    up.sort((a, b) => a.appointment_date.localeCompare(b.appointment_date))
    pa.sort((a, b) => b.appointment_date.localeCompare(a.appointment_date))
    return { upcoming: up, past: pa }
  }, [contactAppointments])

  // Find booking page for "Book via Portal" link
  const activeBookingPage = useMemo(() => {
    return bookingPages?.find((bp) => bp.is_active && bp.status === 'published')
  }, [bookingPages])

  const bookingUrl = activeBookingPage
    ? `/booking/${activeBookingPage.slug}${contact?.email_primary ? `?prefill_email=${encodeURIComponent(contact.email_primary)}` : ''}`
    : null

  // Staff name resolver
  const getStaffName = (id: string | null) => {
    if (!id) return 'Unassigned'
    const u = users.find((u) => u.id === id)
    return u ? `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim() || u.email : 'Unknown'
  }

  // Actions
  const handleCancel = async () => {
    if (!detailAppt) return
    setActionPending(true)
    try {
      await updateStatus.mutateAsync({ id: detailAppt.id, tenantId, status: 'cancelled' })
      setDetailAppt(null)
    } finally {
      setActionPending(false)
    }
  }

  const handleNoShow = async () => {
    if (!detailAppt) return
    setActionPending(true)
    try {
      await updateStatus.mutateAsync({ id: detailAppt.id, tenantId, status: 'no_show' })
      setDetailAppt(null)
    } finally {
      setActionPending(false)
    }
  }

  // Appointment row component
  const AppointmentRow = ({ appt, muted }: { appt: (typeof contactAppointments)[0]; muted?: boolean }) => {
    const statusConfig = STATUS_CONFIG[appt.status] ?? STATUS_CONFIG.confirmed
    const answers = (appt.answers ?? {}) as Record<string, unknown>
    const apptFormat = answers.format as string | undefined
    const apptType = answers.type as string | undefined

    return (
      <button
        type="button"
        className={cn(
          'flex items-center gap-3 px-3 py-2.5 rounded-lg border border-slate-100 bg-slate-50/50 w-full text-left hover:bg-slate-100 transition-colors',
          muted && 'opacity-60'
        )}
        onClick={() => setDetailAppt(appt)}
      >
        <div className="shrink-0 text-center min-w-[60px]">
          <p className="text-xs font-medium text-slate-700">
            {formatAppointmentDate(appt.appointment_date)}
          </p>
          <p className="text-[11px] text-slate-500">
            {formatTime(appt.start_time)}
          </p>
        </div>
        <div className="w-px h-8 bg-slate-200 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <Badge variant="outline" className={cn('text-[10px]', statusConfig.className)}>
              {statusConfig.label}
            </Badge>
            {apptFormat === 'online' && (
              <Video className="h-3 w-3 text-blue-500" />
            )}
            {apptFormat === 'in_person' && (
              <MapPin className="h-3 w-3 text-slate-400" />
            )}
            {apptType === 'paid' && (
              <Badge variant="secondary" className="text-[10px]">Paid</Badge>
            )}
          </div>
          {appt.guest_notes && (
            <p className="text-xs text-slate-500 truncate mt-0.5">{appt.guest_notes}</p>
          )}
        </div>
        <div className="text-xs text-slate-400 shrink-0 flex items-center gap-1">
          <Clock className="h-3 w-3" />
          {appt.duration_minutes ?? 30}m
        </div>
      </button>
    )
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2 text-slate-700">
            <CalendarCheck className="h-4 w-4" />
            Appointments
            {contactAppointments.length > 0 && (
              <Badge variant="secondary" className="text-xs ml-1">
                {contactAppointments.length}
              </Badge>
            )}
          </CardTitle>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1"
              onClick={() => setCreateOpen(true)}
            >
              <Plus className="h-3.5 w-3.5" />
              New
            </Button>
            {bookingUrl && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs gap-1"
                asChild
              >
                <a href={bookingUrl} target="_blank" rel="noopener noreferrer">
                  <Calendar className="h-3.5 w-3.5" />
                  Portal
                  <ExternalLink className="h-3 w-3" />
                </a>
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* Loading */}
        {apptLoading && (
          <div className="space-y-2">
            {Array.from({ length: 2 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        )}

        {/* Empty state */}
        {!apptLoading && contactAppointments.length === 0 && (
          <div className="text-center py-6">
            <CalendarCheck className="h-8 w-8 text-slate-300 mx-auto mb-2" />
            <p className="text-sm text-slate-500">No appointments</p>
            <Button
              variant="ghost"
              size="sm"
              className="text-xs mt-2 gap-1"
              onClick={() => setCreateOpen(true)}
            >
              <Plus className="h-3 w-3" />
              Create an appointment
            </Button>
          </div>
        )}

        {/* Upcoming */}
        {upcoming.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-slate-500 px-1">Upcoming</p>
            {upcoming.map((appt) => (
              <AppointmentRow key={appt.id} appt={appt} />
            ))}
          </div>
        )}

        {/* Past */}
        {past.length > 0 && (
          <div className="mt-3">
            <button
              type="button"
              className="flex items-center gap-1 text-xs font-medium text-slate-400 mb-2 px-1"
              onClick={() => setShowPast(!showPast)}
            >
              {showPast ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <ChevronRight className="h-3 w-3" />
              )}
              Past ({past.length})
            </button>
            {showPast && (
              <div className="space-y-2">
                {past.map((appt) => (
                  <AppointmentRow key={appt.id} appt={appt} muted />
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>

      {/* Create appointment dialog */}
      <CreateAppointmentDialog open={createOpen} onOpenChange={setCreateOpen} />

      {/* Appointment detail sheet */}
      <Sheet open={!!detailAppt} onOpenChange={(open) => { if (!open) setDetailAppt(null) }}>
        <SheetContent side="right" className="w-full sm:w-[380px] sm:max-w-[380px]">
          <SheetHeader>
            <SheetTitle className="text-base">Appointment Details</SheetTitle>
            <SheetDescription className="sr-only">Appointment detail view</SheetDescription>
          </SheetHeader>
          {detailAppt && (
            <div className="space-y-4 mt-4">
              {/* Status */}
              <Badge
                variant="outline"
                className={cn('text-xs', (STATUS_CONFIG[detailAppt.status] ?? STATUS_CONFIG.confirmed).className)}
              >
                {(STATUS_CONFIG[detailAppt.status] ?? STATUS_CONFIG.confirmed).label}
              </Badge>

              {/* Date & Time */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <Calendar className="h-4 w-4 text-slate-400" />
                  <span>{formatAppointmentDate(detailAppt.appointment_date)}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Clock className="h-4 w-4 text-slate-400" />
                  <span>
                    {formatTime(detailAppt.start_time)} – {formatTime(detailAppt.end_time)}
                    <span className="text-slate-400 ml-1">({detailAppt.duration_minutes ?? 30} min)</span>
                  </span>
                </div>
              </div>

              {/* Type & Format */}
              {detailAppt.answers && (
                <div className="flex items-center gap-2">
                  {(detailAppt.answers as Record<string, unknown>).type === 'paid' && (
                    <Badge variant="secondary" className="text-xs">Paid</Badge>
                  )}
                  {(detailAppt.answers as Record<string, unknown>).type === 'free' && (
                    <Badge variant="secondary" className="text-xs">Free</Badge>
                  )}
                  {(detailAppt.answers as Record<string, unknown>).format === 'online' && (
                    <Badge variant="outline" className="text-xs gap-1">
                      <Video className="h-3 w-3" />
                      Online
                    </Badge>
                  )}
                  {(detailAppt.answers as Record<string, unknown>).format === 'in_person' && (
                    <Badge variant="outline" className="text-xs gap-1">
                      <MapPin className="h-3 w-3" />
                      In-Person
                    </Badge>
                  )}
                </div>
              )}

              {/* Staff */}
              <div className="flex items-center gap-2 text-sm">
                <User className="h-4 w-4 text-slate-400" />
                <span>{getStaffName(detailAppt.user_id)}</span>
              </div>

              {/* Guest notes */}
              {detailAppt.guest_notes && (
                <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs font-medium text-slate-500 mb-1">Notes</p>
                  <p className="text-sm text-slate-700">{detailAppt.guest_notes}</p>
                </div>
              )}

              {/* Actions */}
              {detailAppt.status === 'confirmed' && (
                <div className="flex items-center gap-2 pt-2 border-t">
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs gap-1 text-red-600 border-red-200 hover:bg-red-50"
                    onClick={handleCancel}
                    disabled={actionPending}
                  >
                    {actionPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <XCircle className="h-3.5 w-3.5" />}
                    Cancel
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs gap-1 text-amber-600 border-amber-200 hover:bg-amber-50"
                    onClick={handleNoShow}
                    disabled={actionPending}
                  >
                    {actionPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserX className="h-3.5 w-3.5" />}
                    No-Show
                  </Button>
                </div>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </Card>
  )
}
