'use client'

import { useState } from 'react'
import { format, parseISO, formatDistanceToNow } from 'date-fns'
import {
  Pencil,
  Loader2,
  Calendar as CalendarIcon,
  Clock,
  MapPin,
  Briefcase,
  User,
  Trash2,
  Repeat,
} from 'lucide-react'

import { useTenant } from '@/lib/hooks/use-tenant'
import {
  useCalendarEvent,
  useUpdateCalendarEvent,
  useDeleteCalendarEvent,
} from '@/lib/queries/calendar-events'
import { EVENT_TYPES, EVENT_STATUSES, EVENT_COLORS } from '@/lib/schemas/calendar-event'
import {
  type RecurrencePreset,
  describeRecurrence,
  detectPreset,
  getPresetLabel,
  buildRRule,
  parseRRule,
} from '@/lib/utils/recurrence'
import { cn } from '@/lib/utils'

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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

// ── Helpers ─────────────────────────────────────────────────────────────────

function getEventTypeConfig(eventType: string) {
  return EVENT_TYPES.find((t) => t.value === eventType) ?? { value: eventType, label: eventType, color: '#6b7280' }
}

function getStatusConfig(status: string) {
  return EVENT_STATUSES.find((s) => s.value === status) ?? { value: status, label: status }
}

function formatEventDateTime(isoString: string, allDay: boolean): string {
  if (allDay) return format(parseISO(isoString), 'MMM d, yyyy')
  return format(parseISO(isoString), 'MMM d, yyyy h:mm a')
}

// ── Detail Row ──────────────────────────────────────────────────────────────

function DetailRow({
  label,
  icon: Icon,
  children,
}: {
  label: string
  icon: React.ElementType
  children: React.ReactNode
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex items-center gap-2 min-w-[140px] shrink-0 pt-0.5">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm text-muted-foreground">{label}</span>
      </div>
      <div className="flex-1">{children}</div>
    </div>
  )
}

// ── Props ───────────────────────────────────────────────────────────────────

interface EventDetailSheetProps {
  eventId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

// ── Component ───────────────────────────────────────────────────────────────

export function EventDetailSheet({ eventId, open, onOpenChange }: EventDetailSheetProps) {
  const { tenant } = useTenant()
  const [editing, setEditing] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  // Edit form state
  const [editTitle, setEditTitle] = useState('')
  const [editEventType, setEditEventType] = useState('meeting')
  const [editStartDate, setEditStartDate] = useState('')
  const [editStartTime, setEditStartTime] = useState('09:00')
  const [editEndDate, setEditEndDate] = useState('')
  const [editEndTime, setEditEndTime] = useState('10:00')
  const [editAllDay, setEditAllDay] = useState(false)
  const [editDescription, setEditDescription] = useState('')
  const [editLocation, setEditLocation] = useState('')
  const [editColor, setEditColor] = useState('#3b82f6')
  const [editStatus, setEditStatus] = useState('confirmed')
  const [editRecurrencePreset, setEditRecurrencePreset] = useState<RecurrencePreset>('none')
  const [editRecurrenceByDay, setEditRecurrenceByDay] = useState<string[]>([])
  const [editCustomInterval, setEditCustomInterval] = useState(1)
  const [editCustomFreq, setEditCustomFreq] = useState<'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY'>('WEEKLY')

  const { data: event, isLoading } = useCalendarEvent(eventId ?? '')
  const updateEvent = useUpdateCalendarEvent()
  const deleteEvent = useDeleteCalendarEvent()

  function handleClose() {
    setEditing(false)
    onOpenChange(false)
  }

  function startEditing() {
    if (!event) return
    setEditTitle(event.title)
    setEditEventType(event.event_type)
    setEditStartDate(event.start_at.split('T')[0])
    setEditStartTime(event.start_at.match(/T(\d{2}:\d{2})/)?.[1] ?? '09:00')
    setEditEndDate(event.end_at.split('T')[0])
    setEditEndTime(event.end_at.match(/T(\d{2}:\d{2})/)?.[1] ?? '10:00')
    setEditAllDay(event.all_day)
    setEditDescription(event.description ?? '')
    setEditLocation(event.location ?? '')
    setEditColor(event.color ?? '#3b82f6')
    setEditStatus(event.status)

    // Initialise recurrence state
    const preset = detectPreset(event.recurrence_rule ?? null)
    setEditRecurrencePreset(preset)
    if (event.recurrence_rule) {
      const rule = parseRRule(event.recurrence_rule)
      setEditRecurrenceByDay(rule.byDay ?? [])
      if (preset === 'custom') {
        setEditCustomInterval(rule.interval)
        setEditCustomFreq(rule.freq)
      }
    } else {
      setEditRecurrenceByDay([])
      setEditCustomInterval(1)
      setEditCustomFreq('WEEKLY')
    }

    setEditing(true)
  }

  async function handleEditSubmit() {
    if (!event || !editTitle.trim()) return

    const start_at = editAllDay
      ? `${editStartDate}T00:00:00`
      : `${editStartDate}T${editStartTime}:00`
    const end_at = editAllDay
      ? `${editEndDate}T23:59:59`
      : `${editEndDate}T${editEndTime}:00`

    // Build recurrence rule from edit state
    let recurrence_rule: string | null = null
    if (editRecurrencePreset !== 'none') {
      switch (editRecurrencePreset) {
        case 'daily':
          recurrence_rule = buildRRule({ freq: 'DAILY', interval: 1 })
          break
        case 'weekly':
          recurrence_rule = buildRRule({
            freq: 'WEEKLY',
            interval: 1,
            byDay: editRecurrenceByDay.length > 0 ? editRecurrenceByDay : undefined,
          })
          break
        case 'monthly':
          recurrence_rule = buildRRule({ freq: 'MONTHLY', interval: 1 })
          break
        case 'yearly':
          recurrence_rule = buildRRule({ freq: 'YEARLY', interval: 1 })
          break
        case 'custom':
          recurrence_rule = buildRRule({
            freq: editCustomFreq,
            interval: editCustomInterval,
            byDay: editCustomFreq === 'WEEKLY' && editRecurrenceByDay.length > 0 ? editRecurrenceByDay : undefined,
          })
          break
      }
    }

    await updateEvent.mutateAsync({
      id: event.id,
      title: editTitle.trim(),
      description: editDescription.trim() || null,
      location: editLocation.trim() || null,
      start_at,
      end_at,
      all_day: editAllDay,
      color: editColor,
      event_type: editEventType,
      status: editStatus,
      recurrence_rule,
    })
    setEditing(false)
  }

  function handleDelete() {
    if (!event) return
    deleteEvent.mutate(event.id)
    setDeleteOpen(false)
    handleClose()
  }

  const typeConfig = event ? getEventTypeConfig(event.event_type) : null
  const statusConfig = event ? getStatusConfig(event.status) : null

  return (
    <>
      <Sheet open={open} onOpenChange={handleClose}>
        <SheetContent className="w-full sm:max-w-lg p-0 flex flex-col">
          <SheetHeader className="px-6 pt-6 pb-0">
            <div className="flex items-center justify-between">
              <SheetTitle className="text-lg">
                {isLoading ? <Skeleton className="h-6 w-48" /> : editing ? 'Edit Event' : 'Event Details'}
              </SheetTitle>
              {event && !editing && (
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={startEditing}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
            <SheetDescription className="sr-only">
              {editing ? 'Edit event details' : 'View event details'}
            </SheetDescription>
          </SheetHeader>

          <ScrollArea className="flex-1 px-6 py-4">
            {isLoading ? (
              <EventDetailSkeleton />
            ) : !event ? (
              <div className="py-12 text-center text-muted-foreground">
                Event not found
              </div>
            ) : editing ? (
              /* ── Edit Mode ── */
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label>Title</Label>
                  <Input
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    autoFocus
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Event Type</Label>
                    <Select value={editEventType} onValueChange={setEditEventType}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {EVENT_TYPES.map((t) => (
                          <SelectItem key={t.value} value={t.value}>
                            {t.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label>Status</Label>
                    <Select value={editStatus} onValueChange={setEditStatus}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {EVENT_STATUSES.map((s) => (
                          <SelectItem key={s.value} value={s.value}>
                            {s.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <Label htmlFor="edit-all-day" className="text-sm">All-day event</Label>
                  <Switch
                    id="edit-all-day"
                    checked={editAllDay}
                    onCheckedChange={setEditAllDay}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Start Date</Label>
                    <Input
                      type="date"
                      value={editStartDate}
                      onChange={(e) => setEditStartDate(e.target.value)}
                    />
                  </div>
                  {!editAllDay && (
                    <div className="space-y-1.5">
                      <Label>Start Time</Label>
                      <Input
                        type="time"
                        value={editStartTime}
                        onChange={(e) => setEditStartTime(e.target.value)}
                      />
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>End Date</Label>
                    <Input
                      type="date"
                      value={editEndDate}
                      onChange={(e) => setEditEndDate(e.target.value)}
                    />
                  </div>
                  {!editAllDay && (
                    <div className="space-y-1.5">
                      <Label>End Time</Label>
                      <Input
                        type="time"
                        value={editEndTime}
                        onChange={(e) => setEditEndTime(e.target.value)}
                      />
                    </div>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label>Description</Label>
                  <Textarea
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    rows={3}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label>Location</Label>
                  <Input
                    value={editLocation}
                    onChange={(e) => setEditLocation(e.target.value)}
                    placeholder="e.g., Courthouse Room 4B"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label>Colour</Label>
                  <div className="flex items-center gap-1.5">
                    {EVENT_COLORS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        className={cn(
                          'h-6 w-6 rounded-full border-2 transition-all',
                          editColor === c
                            ? 'border-slate-900 scale-110'
                            : 'border-transparent hover:scale-105'
                        )}
                        style={{ backgroundColor: c }}
                        onClick={() => setEditColor(c)}
                      />
                    ))}
                  </div>
                </div>

                {/* Repeat / Recurrence */}
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label className="flex items-center gap-1.5">
                      <Repeat className="h-3.5 w-3.5 text-muted-foreground" />
                      Repeat
                    </Label>
                    <Select
                      value={editRecurrencePreset}
                      onValueChange={(val) => setEditRecurrencePreset(val as RecurrencePreset)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(['none', 'daily', 'weekly', 'monthly', 'yearly', 'custom'] as RecurrencePreset[]).map(
                          (preset) => (
                            <SelectItem key={preset} value={preset}>
                              {getPresetLabel(preset)}
                            </SelectItem>
                          )
                        )}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Day-of-week picker for weekly */}
                  {(editRecurrencePreset === 'weekly' || (editRecurrencePreset === 'custom' && editCustomFreq === 'WEEKLY')) && (
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Repeat on</Label>
                      <div className="flex gap-1">
                        {(['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'] as const).map((day) => {
                          const labels: Record<string, string> = {
                            MO: 'M', TU: 'T', WE: 'W', TH: 'T', FR: 'F', SA: 'S', SU: 'S',
                          }
                          const isSelected = editRecurrenceByDay.includes(day)
                          return (
                            <button
                              key={day}
                              type="button"
                              className={cn(
                                'h-8 w-8 rounded-full text-xs font-medium transition-colors',
                                isSelected
                                  ? 'bg-primary text-primary-foreground'
                                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
                              )}
                              onClick={() => {
                                setEditRecurrenceByDay((prev) =>
                                  isSelected
                                    ? prev.filter((d) => d !== day)
                                    : [...prev, day]
                                )
                              }}
                              title={day}
                            >
                              {labels[day]}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* Custom frequency + interval */}
                  {editRecurrencePreset === 'custom' && (
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Every</Label>
                        <Input
                          type="number"
                          min={1}
                          max={99}
                          value={editCustomInterval}
                          onChange={(e) => setEditCustomInterval(Math.max(1, parseInt(e.target.value) || 1))}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Frequency</Label>
                        <Select
                          value={editCustomFreq}
                          onValueChange={(val) => setEditCustomFreq(val as typeof editCustomFreq)}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="DAILY">Day(s)</SelectItem>
                            <SelectItem value="WEEKLY">Week(s)</SelectItem>
                            <SelectItem value="MONTHLY">Month(s)</SelectItem>
                            <SelectItem value="YEARLY">Year(s)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex gap-2 pt-2">
                  <Button
                    onClick={handleEditSubmit}
                    disabled={updateEvent.isPending || !editTitle.trim()}
                    className="flex-1"
                  >
                    {updateEvent.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      'Save Changes'
                    )}
                  </Button>
                  <Button variant="ghost" onClick={() => setEditing(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              /* ── View Mode ── */
              <div className="space-y-6">
                {/* Title */}
                <div>
                  <div className="flex items-center gap-2">
                    <div
                      className="h-3 w-3 rounded-full flex-shrink-0"
                      style={{ backgroundColor: event.color ?? '#3b82f6' }}
                    />
                    <h3 className={cn(
                      'text-lg font-semibold',
                      event.status === 'cancelled' && 'text-muted-foreground line-through'
                    )}>
                      {event.title}
                    </h3>
                  </div>
                  {event.description && (
                    <p className="mt-2 text-sm text-muted-foreground whitespace-pre-wrap">
                      {event.description}
                    </p>
                  )}
                </div>

                {/* Action Buttons */}
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={startEditing}>
                    <Pencil className="mr-2 h-4 w-4" />
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive hover:text-destructive"
                    onClick={() => setDeleteOpen(true)}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete
                  </Button>
                </div>

                <Separator />

                {/* Details Grid */}
                <div className="space-y-4">
                  {/* Event Type */}
                  <DetailRow label="Type" icon={CalendarIcon}>
                    <Badge
                      variant="secondary"
                      style={{
                        backgroundColor: `${typeConfig?.color}15`,
                        color: typeConfig?.color,
                        borderColor: `${typeConfig?.color}30`,
                      }}
                      className="border"
                    >
                      {typeConfig?.label}
                    </Badge>
                  </DetailRow>

                  {/* Status */}
                  <DetailRow label="Status" icon={CalendarIcon}>
                    <Badge variant="outline" className="text-xs">
                      {statusConfig?.label}
                    </Badge>
                  </DetailRow>

                  {/* Date/Time */}
                  <DetailRow label="Start" icon={Clock}>
                    <span className="text-sm">
                      {formatEventDateTime(event.start_at, event.all_day)}
                    </span>
                  </DetailRow>

                  <DetailRow label="End" icon={Clock}>
                    <span className="text-sm">
                      {formatEventDateTime(event.end_at, event.all_day)}
                    </span>
                  </DetailRow>

                  {event.all_day && (
                    <DetailRow label="Duration" icon={Clock}>
                      <Badge variant="secondary" className="text-xs">All day</Badge>
                    </DetailRow>
                  )}

                  {/* Recurrence */}
                  {event.recurrence_rule && (
                    <DetailRow label="Repeats" icon={Repeat}>
                      <Badge variant="secondary" className="text-xs">
                        {describeRecurrence(event.recurrence_rule)}
                      </Badge>
                    </DetailRow>
                  )}

                  {/* Location */}
                  {event.location && (
                    <DetailRow label="Location" icon={MapPin}>
                      <span className="text-sm">{event.location}</span>
                    </DetailRow>
                  )}

                  {/* Matter */}
                  {event.matterTitle && (
                    <DetailRow label="Matter" icon={Briefcase}>
                      <span className="text-sm font-medium">{event.matterTitle}</span>
                    </DetailRow>
                  )}

                  {/* Contact */}
                  {event.contactName && (
                    <DetailRow label="Contact" icon={User}>
                      <span className="text-sm">{event.contactName}</span>
                    </DetailRow>
                  )}
                </div>

                <Separator />

                {/* Timestamps */}
                <div className="text-xs text-muted-foreground space-y-1">
                  <p>Created {formatDistanceToNow(new Date(event.created_at), { addSuffix: true })}</p>
                  <p>Last updated {formatDistanceToNow(new Date(event.updated_at), { addSuffix: true })}</p>
                </div>
              </div>
            )}
          </ScrollArea>
        </SheetContent>
      </Sheet>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Event</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this event? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete Event
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

// ── Skeleton ────────────────────────────────────────────────────────────────

function EventDetailSkeleton() {
  return (
    <div className="space-y-6">
      <div>
        <Skeleton className="h-6 w-3/4" />
        <Skeleton className="mt-2 h-4 w-full" />
      </div>
      <div className="flex gap-2">
        <Skeleton className="h-8 w-20" />
        <Skeleton className="h-8 w-20" />
      </div>
      <Separator />
      <div className="space-y-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="h-4 w-[140px]" />
            <Skeleton className="h-5 w-24" />
          </div>
        ))}
      </div>
    </div>
  )
}
