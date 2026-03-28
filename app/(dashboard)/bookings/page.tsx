'use client'

import { useState, useMemo } from 'react'
import {
  CalendarCheck,
  Plus,
  Copy,
  ExternalLink,
  Clock,
  Globe,
  MoreHorizontal,
  User,
  Search,
  AlertTriangle,
  RefreshCw,
  Calendar,
} from 'lucide-react'
import Link from 'next/link'
import { formatDate } from '@/lib/utils/formatters'
import { toast } from 'sonner'

import { useTenant } from '@/lib/hooks/use-tenant'
import { useUser } from '@/lib/hooks/use-user'
import {
  useBookingPages,
  useCreateBookingPage,
  useUpdateBookingPage,
  useDeleteBookingPage,
  useToggleBookingPageStatus,
  useAppointments,
  useUpdateAppointmentStatus,
  type BookingPageWithUser,
} from '@/lib/queries/booking'
import { useMicrosoftConnection, useTriggerSync } from '@/lib/queries/microsoft-integration'
import { APPOINTMENT_STATUSES, BOOKING_DURATIONS } from '@/lib/utils/constants'
import { cn } from '@/lib/utils'

import { EmptyState } from '@/components/shared/empty-state'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
// Label removed — using raw <label> with obsidian glass styling
import { Textarea } from '@/components/ui/textarea'

// ── Helpers ─────────────────────────────────────────────────────────────────

const STATUS_COLOR_MAP: Record<string, string> = Object.fromEntries(
  APPOINTMENT_STATUSES.map((s) => [s.value, s.color])
)

function formatTime12(time24: string): string {
  const [h, m] = time24.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 || 12
  return `${h12}:${m.toString().padStart(2, '0')} ${ampm}`
}

function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

// ── Working Days Checkboxes ─────────────────────────────────────────────────

const DAYS_OF_WEEK = [
  { value: 0, label: 'Sun' },
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
]

// ── Main Page ───────────────────────────────────────────────────────────────

export default function BookingsPage() {
  const { tenant } = useTenant()
  const { appUser } = useUser()
  const tenantId = tenant?.id ?? ''
  const userId = appUser?.id ?? ''

  // Data
  const { data: bookingPages, isLoading: pagesLoading } = useBookingPages(tenantId)
  const { data: appointments, isLoading: appointmentsLoading } = useAppointments(tenantId, { upcoming: true })

  // Microsoft calendar sync status
  const { data: msConnection } = useMicrosoftConnection(userId)
  const triggerSync = useTriggerSync()

  // Mutations
  const createPage = useCreateBookingPage()
  const updatePage = useUpdateBookingPage()
  const deletePage = useDeleteBookingPage()
  const toggleStatus = useToggleBookingPageStatus()
  const updateAppointment = useUpdateAppointmentStatus()

  // Dialog state
  const [createOpen, setCreateOpen] = useState(false)
  const [editingPage, setEditingPage] = useState<BookingPageWithUser | null>(null)

  // Form state
  const [formTitle, setFormTitle] = useState('')
  const [formSlug, setFormSlug] = useState('')
  const [formDescription, setFormDescription] = useState('')
  const [formDuration, setFormDuration] = useState(30)
  const [formBuffer, setFormBuffer] = useState(0)
  const [formStartTime, setFormStartTime] = useState('09:00')
  const [formEndTime, setFormEndTime] = useState('17:00')
  const [formDays, setFormDays] = useState<number[]>([1, 2, 3, 4, 5])
  const [formMaxDays, setFormMaxDays] = useState(30)
  const [formMinNotice, setFormMinNotice] = useState(24)
  const [formColor, setFormColor] = useState('#2563eb')

  // Search
  const [appointmentSearch, setAppointmentSearch] = useState('')

  // Calendar sync status helpers
  const calendarSyncEnabled = msConnection?.calendar_sync_enabled ?? false
  const msConnected = !!msConnection?.is_active
  const lastCalendarSync = msConnection?.last_calendar_sync_at

  function resetForm() {
    setFormTitle('')
    setFormSlug('')
    setFormDescription('')
    setFormDuration(30)
    setFormBuffer(0)
    setFormStartTime('09:00')
    setFormEndTime('17:00')
    setFormDays([1, 2, 3, 4, 5])
    setFormMaxDays(30)
    setFormMinNotice(24)
    setFormColor('#2563eb')
  }

  function openCreate() {
    resetForm()
    setEditingPage(null)
    setCreateOpen(true)
  }

  function openEdit(page: BookingPageWithUser) {
    setEditingPage(page)
    setFormTitle(page.title)
    setFormSlug(page.slug)
    setFormDescription(page.description ?? '')
    setFormDuration(page.duration_minutes)
    setFormBuffer(page.buffer_minutes)
    const wh = page.working_hours as { start: string; end: string; days: number[] }
    setFormStartTime(wh.start)
    setFormEndTime(wh.end)
    setFormDays(wh.days)
    setFormMaxDays(page.max_days_ahead)
    setFormMinNotice(page.min_notice_hours)
    setFormColor(page.theme_color ?? '#2563eb')
    setCreateOpen(true)
  }

  async function handleSave() {
    if (!formTitle.trim()) {
      toast.error('Title is required')
      return
    }
    const slug = formSlug || generateSlug(formTitle)

    const payload = {
      title: formTitle.trim(),
      slug,
      description: formDescription.trim() || null,
      duration_minutes: formDuration,
      buffer_minutes: formBuffer,
      working_hours: { start: formStartTime, end: formEndTime, days: formDays } as import('@/lib/types/database').Json,
      max_days_ahead: formMaxDays,
      min_notice_hours: formMinNotice,
      theme_color: formColor,
    }

    try {
      if (editingPage) {
        await updatePage.mutateAsync({
          id: editingPage.id,
          tenantId,
          data: payload,
        })
      } else {
        await createPage.mutateAsync({
          ...payload,
          tenant_id: tenantId,
          user_id: userId,
        })
      }
      setCreateOpen(false)
      resetForm()
    } catch {
      // Error toast handled by mutation
    }
  }

  function copyLink(slug: string) {
    const url = `${window.location.origin}/booking/${slug}`
    navigator.clipboard.writeText(url)
    toast.success('Booking link copied!')
  }

  const filteredAppointments = useMemo(() => {
    if (!appointments) return []
    if (!appointmentSearch.trim()) return appointments
    const q = appointmentSearch.toLowerCase()
    return appointments.filter(
      (a) =>
        a.guest_name.toLowerCase().includes(q) ||
        a.guest_email.toLowerCase().includes(q)
    )
  }, [appointments, appointmentSearch])

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Bookings</h1>
          <p className="text-sm text-muted-foreground">
            Manage appointment types, booking pages, and view upcoming appointments
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" />
          New Appointment Type
        </Button>
      </div>

      {/* ── Calendar Sync Status Banner ── */}
      {!msConnected && (
        <div className="flex items-center gap-3 rounded-lg border border-amber-500/20 bg-amber-950/30 px-4 py-3">
          <AlertTriangle className="h-5 w-5 flex-shrink-0 text-amber-600" />
          <div className="flex-1">
            <p className="text-sm font-medium text-amber-400">
              Outlook Calendar not connected
            </p>
            <p className="text-xs text-amber-600">
              Connect your Microsoft 365 account to automatically block busy times from your Outlook calendar when clients book appointments.
            </p>
          </div>
          <Link href="/settings/integrations">
            <Button variant="outline" size="sm" className="border-amber-500/30 text-amber-400 hover:bg-amber-950/40">
              Connect
            </Button>
          </Link>
        </div>
      )}
      {msConnected && !calendarSyncEnabled && (
        <div className="flex items-center gap-3 rounded-lg border border-amber-500/20 bg-amber-950/30 px-4 py-3">
          <Calendar className="h-5 w-5 flex-shrink-0 text-amber-600" />
          <div className="flex-1">
            <p className="text-sm font-medium text-amber-400">
              Calendar sync is disabled
            </p>
            <p className="text-xs text-amber-600">
              Your Microsoft account is connected but calendar sync is turned off. Enable it so your Outlook busy times are reflected in booking availability.
            </p>
          </div>
          <Link href="/settings/integrations">
            <Button variant="outline" size="sm" className="border-amber-500/30 text-amber-400 hover:bg-amber-950/40">
              Enable Sync
            </Button>
          </Link>
        </div>
      )}
      {msConnected && calendarSyncEnabled && (
        <div className="flex items-center gap-3 rounded-lg border border-emerald-500/20 bg-emerald-950/30 px-4 py-3">
          <Calendar className="h-5 w-5 flex-shrink-0 text-green-600" />
          <div className="flex-1">
            <p className="text-sm font-medium text-emerald-400">
              Outlook Calendar synced
            </p>
            <p className="text-xs text-green-600">
              {lastCalendarSync
                ? `Last synced: ${new Date(lastCalendarSync).toLocaleString()}`
                : 'Initial sync pending  -  will happen automatically on next booking page load.'}
              {' '}Busy times are automatically blocked in booking availability.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="border-emerald-500/30 text-emerald-400 hover:bg-emerald-950/40"
            onClick={() => triggerSync.mutate('calendar')}
            disabled={triggerSync.isPending}
          >
            {triggerSync.isPending ? (
              <RefreshCw className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            )}
            Sync Now
          </Button>
        </div>
      )}

      {/* Tabs */}
      <Tabs defaultValue="types" className="space-y-4">
        <TabsList>
          <TabsTrigger value="types">
            Appointment Types
            {bookingPages && (
              <Badge variant="secondary" className="ml-2 text-xs">
                {bookingPages.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="appointments">
            Appointments
            {appointments && (
              <Badge variant="secondary" className="ml-2 text-xs">
                {appointments.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ── Tab: Appointment Types (Booking Pages) ── */}
        <TabsContent value="types">
          {pagesLoading ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-40 rounded-xl" />
              ))}
            </div>
          ) : !bookingPages || bookingPages.length === 0 ? (
            <EmptyState
              icon={CalendarCheck}
              title="No appointment types"
              description="Create an appointment type (e.g., 15 min call, 30 min consultation, 60 min full session) to let clients book with you."
              actionLabel="New Appointment Type"
              onAction={openCreate}
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {bookingPages.map((page) => {
                const user = page.users
                const name = user
                  ? `${user.first_name ?? ''} ${user.last_name ?? ''}`.trim()
                  : 'Team Member'

                return (
                  <div
                    key={page.id}
                    className="rounded-xl border bg-white p-5"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div
                          className="flex h-10 w-10 items-center justify-center rounded-full"
                          style={{ backgroundColor: `${page.theme_color ?? '#2563eb'}15` }}
                        >
                          <CalendarCheck
                            className="h-5 w-5"
                            style={{ color: page.theme_color ?? '#2563eb' }}
                          />
                        </div>
                        <div>
                          <h3 className="font-semibold text-slate-900">{page.title}</h3>
                          <p className="text-xs text-slate-500">{name}</p>
                        </div>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openEdit(page)}>
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => copyLink(page.slug)}>
                            Copy Link
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() =>
                              window.open(`/booking/${page.slug}`, '_blank')
                            }
                          >
                            Preview
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() =>
                              toggleStatus.mutate({
                                id: page.id,
                                tenantId,
                                status: page.status === 'published' ? 'draft' : 'published',
                              })
                            }
                          >
                            {page.status === 'published' ? 'Unpublish' : 'Publish'}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-red-600"
                            onClick={() =>
                              deletePage.mutate({ id: page.id, tenantId })
                            }
                          >
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>

                    {page.description && (
                      <p className="mt-2 line-clamp-2 text-xs text-slate-500">
                        {page.description}
                      </p>
                    )}

                    <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" />
                        {page.duration_minutes} min
                      </span>
                      <span className="flex items-center gap-1">
                        <Globe className="h-3.5 w-3.5" />
                        {page.timezone}
                      </span>
                      <Badge
                        variant={page.status === 'published' ? 'default' : 'secondary'}
                        className="text-xs"
                      >
                        {page.status === 'published' ? 'Published' : 'Draft'}
                      </Badge>
                    </div>

                    <div className="mt-3 flex items-center gap-2">
                      <button
                        onClick={() => copyLink(page.slug)}
                        className="flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs text-slate-600 transition-colors hover:bg-slate-50"
                      >
                        <Copy className="h-3 w-3" />
                        Copy Link
                      </button>
                      <a
                        href={`/booking/${page.slug}`}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs text-slate-600 transition-colors hover:bg-slate-50"
                      >
                        <ExternalLink className="h-3 w-3" />
                        Open
                      </a>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </TabsContent>

        {/* ── Tab: Appointments ── */}
        <TabsContent value="appointments">
          {appointmentsLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-16" />
              ))}
            </div>
          ) : !appointments || appointments.length === 0 ? (
            <EmptyState
              icon={CalendarCheck}
              title="No upcoming appointments"
              description="Appointments will appear here once clients book through your appointment types."
            />
          ) : (
            <div className="space-y-4">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  placeholder="Search by guest name or email..."
                  value={appointmentSearch}
                  onChange={(e) => setAppointmentSearch(e.target.value)}
                  className="pl-9"
                />
              </div>

              {/* Table */}
              <div className="rounded-lg border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-slate-50 text-left text-xs font-medium text-slate-500">
                      <th className="px-4 py-3">Date & Time</th>
                      <th className="px-4 py-3">Guest</th>
                      <th className="px-4 py-3">Lawyer</th>
                      <th className="px-4 py-3">Duration</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAppointments.map((apt) => {
                      const lawyerName = (apt.user_first_name || apt.user_last_name)
                        ? `${apt.user_first_name ?? ''} ${apt.user_last_name ?? ''}`.trim()
                        : ' - '
                      const statusColor = STATUS_COLOR_MAP[apt.status] ?? '#6b7280'

                      return (
                        <tr key={apt.id} className="border-b last:border-0">
                          <td className="px-4 py-3">
                            <div className="font-medium text-slate-900">
                              {formatDate(apt.appointment_date)}
                            </div>
                            <div className="text-xs text-slate-500">
                              {formatTime12(apt.start_time)} – {formatTime12(apt.end_time)}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="font-medium text-slate-900">{apt.guest_name}</div>
                            <div className="text-xs text-slate-500">{apt.guest_email}</div>
                          </td>
                          <td className="px-4 py-3 text-slate-600">{lawyerName}</td>
                          <td className="px-4 py-3 text-slate-600">{apt.duration_minutes} min</td>
                          <td className="px-4 py-3">
                            <Badge
                              variant="outline"
                              className="text-xs"
                              style={{ borderColor: statusColor, color: statusColor }}
                            >
                              {APPOINTMENT_STATUSES.find((s) => s.value === apt.status)?.label ?? apt.status}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-7 w-7">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                {apt.status === 'confirmed' && (
                                  <>
                                    <DropdownMenuItem
                                      onClick={() =>
                                        updateAppointment.mutate({
                                          id: apt.id,
                                          tenantId,
                                          status: 'completed',
                                        })
                                      }
                                    >
                                      Mark Completed
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      onClick={() =>
                                        updateAppointment.mutate({
                                          id: apt.id,
                                          tenantId,
                                          status: 'no_show',
                                        })
                                      }
                                    >
                                      Mark No Show
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      className="text-red-600"
                                      onClick={() =>
                                        updateAppointment.mutate({
                                          id: apt.id,
                                          tenantId,
                                          status: 'cancelled',
                                        })
                                      }
                                    >
                                      Cancel
                                    </DropdownMenuItem>
                                  </>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* ── Create / Edit Dialog ── */}
      {/* ── Obsidian Glass Modal — Appointment Type Creator ── */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent
          className="max-h-[85vh] overflow-y-auto sm:max-w-lg border-white/[0.08] shadow-2xl"
          style={{
            background: 'linear-gradient(180deg, rgba(2,6,23,0.92) 0%, rgba(2,6,23,0.96) 100%)',
            backdropFilter: 'blur(40px)',
            WebkitBackdropFilter: 'blur(40px)',
          }}
        >
          <DialogHeader>
            <DialogTitle className="text-white font-sans font-bold tracking-tight">
              {editingPage ? 'Edit Appointment Type' : 'New Appointment Type'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-5 py-2">
            {/* Title */}
            <div>
              <label className="block text-[11px] font-mono uppercase tracking-wider text-zinc-400 mb-1.5">Title</label>
              <Input
                value={formTitle}
                onChange={(e) => {
                  setFormTitle(e.target.value)
                  if (!editingPage) setFormSlug(generateSlug(e.target.value))
                }}
                placeholder="30 Minute Consultation"
                className="bg-white/[0.04] border-white/[0.08] text-white placeholder:text-zinc-600 font-sans focus:border-emerald-500/50 focus:ring-emerald-500/20"
              />
              <p className="mt-1 text-[10px] text-zinc-500 font-mono">
                This name is shown to clients (e.g., &quot;15 Min Phone Call&quot;, &quot;60 Min Full Consultation&quot;)
              </p>
            </div>

            {/* Slug */}
            <div>
              <label className="block text-[11px] font-mono uppercase tracking-wider text-zinc-400 mb-1.5">URL Slug</label>
              <Input
                value={formSlug}
                onChange={(e) => setFormSlug(e.target.value)}
                placeholder="30-minute-consultation"
                className="bg-white/[0.04] border-white/[0.08] text-white placeholder:text-zinc-600 font-mono focus:border-emerald-500/50 focus:ring-emerald-500/20"
              />
              <p className="mt-1 text-[10px] text-zinc-500 font-mono">
                Your booking URL: /booking/{formSlug || 'your-slug'}
              </p>
            </div>

            {/* Description */}
            <div>
              <label className="block text-[11px] font-mono uppercase tracking-wider text-zinc-400 mb-1.5">Description</label>
              <Textarea
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder="Brief description of this consultation type..."
                rows={2}
                className="bg-white/[0.04] border-white/[0.08] text-white placeholder:text-zinc-600 font-sans focus:border-emerald-500/50 focus:ring-emerald-500/20"
              />
            </div>

            {/* Duration + Buffer */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] font-mono uppercase tracking-wider text-zinc-400 mb-1.5">Duration</label>
                <Select
                  value={String(formDuration)}
                  onValueChange={(v) => setFormDuration(Number(v))}
                >
                  <SelectTrigger className="bg-white/[0.04] border-white/[0.08] text-white font-sans focus:border-emerald-500/50 focus:ring-emerald-500/20">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {BOOKING_DURATIONS.map((d) => (
                      <SelectItem key={d.value} value={String(d.value)}>
                        {d.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="block text-[11px] font-mono uppercase tracking-wider text-zinc-400 mb-1.5">Buffer Between</label>
                <Select
                  value={String(formBuffer)}
                  onValueChange={(v) => setFormBuffer(Number(v))}
                >
                  <SelectTrigger className="bg-white/[0.04] border-white/[0.08] text-white font-sans focus:border-emerald-500/50 focus:ring-emerald-500/20">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">No buffer</SelectItem>
                    <SelectItem value="5">5 min</SelectItem>
                    <SelectItem value="10">10 min</SelectItem>
                    <SelectItem value="15">15 min</SelectItem>
                    <SelectItem value="30">30 min</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Working Hours */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] font-mono uppercase tracking-wider text-zinc-400 mb-1.5">Start Time</label>
                <Input
                  type="time"
                  value={formStartTime}
                  onChange={(e) => setFormStartTime(e.target.value)}
                  className="bg-white/[0.04] border-white/[0.08] text-white font-mono focus:border-emerald-500/50 focus:ring-emerald-500/20"
                />
              </div>
              <div>
                <label className="block text-[11px] font-mono uppercase tracking-wider text-zinc-400 mb-1.5">End Time</label>
                <Input
                  type="time"
                  value={formEndTime}
                  onChange={(e) => setFormEndTime(e.target.value)}
                  className="bg-white/[0.04] border-white/[0.08] text-white font-mono focus:border-emerald-500/50 focus:ring-emerald-500/20"
                />
              </div>
            </div>

            {/* Working Days */}
            <div>
              <label className="block text-[11px] font-mono uppercase tracking-wider text-zinc-400 mb-1.5">Working Days</label>
              <div className="mt-2 flex flex-wrap gap-2">
                {DAYS_OF_WEEK.map((day) => (
                  <button
                    key={day.value}
                    type="button"
                    onClick={() =>
                      setFormDays((prev) =>
                        prev.includes(day.value)
                          ? prev.filter((d) => d !== day.value)
                          : [...prev, day.value].sort()
                      )
                    }
                    className={cn(
                      'rounded-md border px-3 py-1.5 text-xs font-medium font-mono transition-colors',
                      formDays.includes(day.value)
                        ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-400'
                        : 'border-white/[0.08] text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-300'
                    )}
                  >
                    {day.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Advance Booking + Notice */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] font-mono uppercase tracking-wider text-zinc-400 mb-1.5">Max Days Ahead</label>
                <Input
                  type="number"
                  min={1}
                  max={365}
                  value={formMaxDays}
                  onChange={(e) => setFormMaxDays(Number(e.target.value))}
                  className="bg-white/[0.04] border-white/[0.08] text-white font-mono focus:border-emerald-500/50 focus:ring-emerald-500/20"
                />
              </div>
              <div>
                <label className="block text-[11px] font-mono uppercase tracking-wider text-zinc-400 mb-1.5">Min Notice (hours)</label>
                <Input
                  type="number"
                  min={0}
                  max={168}
                  value={formMinNotice}
                  onChange={(e) => setFormMinNotice(Number(e.target.value))}
                  className="bg-white/[0.04] border-white/[0.08] text-white font-mono focus:border-emerald-500/50 focus:ring-emerald-500/20"
                />
              </div>
            </div>

            {/* Theme Color */}
            <div>
              <label className="block text-[11px] font-mono uppercase tracking-wider text-zinc-400 mb-1.5">Theme Colour</label>
              <div className="mt-1 flex items-center gap-2">
                <input
                  type="color"
                  value={formColor}
                  onChange={(e) => setFormColor(e.target.value)}
                  className="h-8 w-8 cursor-pointer rounded border border-white/[0.08] bg-transparent"
                />
                <Input
                  value={formColor}
                  onChange={(e) => setFormColor(e.target.value)}
                  className="w-28 bg-white/[0.04] border-white/[0.08] text-white font-mono focus:border-emerald-500/50 focus:ring-emerald-500/20"
                  placeholder="#10b981"
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCreateOpen(false)}
              className="border-white/[0.08] bg-white/[0.04] text-zinc-300 hover:bg-white/[0.08] hover:text-white font-mono text-xs uppercase tracking-wider"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={createPage.isPending || updatePage.isPending}
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-mono text-xs uppercase tracking-wider shadow-lg shadow-emerald-500/20 disabled:bg-zinc-800 disabled:text-zinc-600 disabled:shadow-none"
            >
              {createPage.isPending || updatePage.isPending ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
