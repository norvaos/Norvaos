'use client'

import { useState, useRef } from 'react'
import { format, parseISO } from 'date-fns'
import {
  Calendar as CalendarIcon,
  Clock,
  MapPin,
  AlignLeft,
  ChevronsUpDown,
  Check,
  Repeat,
} from 'lucide-react'

import { useCreateCalendarEvent } from '@/lib/queries/calendar-events'
import { EVENT_TYPES, EVENT_COLORS } from '@/lib/schemas/calendar-event'
import {
  type RecurrencePreset,
  getPresetLabel,
  buildRRule,
} from '@/lib/utils/recurrence'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { useQuery } from '@tanstack/react-query'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Calendar } from '@/components/ui/calendar'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'

// ── Matter Selector ─────────────────────────────────────────────────────────

function MatterSelector({
  value,
  onChange,
  tenantId,
}: {
  value: string | null
  onChange: (id: string | null) => void
  tenantId: string
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')

  const { data: mattersData } = useQuery({
    queryKey: ['matters', 'select', tenantId, search],
    queryFn: async () => {
      const supabase = createClient()
      let q = supabase
        .from('matters')
        .select('id, title, matter_number')
        .eq('tenant_id', tenantId)
        .order('updated_at', { ascending: false })
        .limit(10)

      if (search) {
        q = q.or(`title.ilike.%${search}%,matter_number.ilike.%${search}%`)
      }

      const { data, error } = await q
      if (error) throw error
      return data as { id: string; title: string; matter_number: string | null }[]
    },
    enabled: !!tenantId,
  })

  const matters = mattersData ?? []
  const selectedMatter = matters.find((m) => m.id === value)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          className="w-full justify-between text-left font-normal"
        >
          <span className="truncate">
            {selectedMatter?.title ?? (value ? 'Loading...' : 'Select matter...')}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search matters..."
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            <CommandEmpty>No matters found.</CommandEmpty>
            <CommandItem
              value="__none__"
              onSelect={() => {
                onChange(null)
                setOpen(false)
              }}
            >
              <Check
                className={cn(
                  'mr-2 h-4 w-4',
                  !value ? 'opacity-100' : 'opacity-0'
                )}
              />
              <span className="text-muted-foreground">None</span>
            </CommandItem>
            {matters.map((m) => (
              <CommandItem
                key={m.id}
                value={m.id}
                onSelect={() => {
                  onChange(m.id)
                  setOpen(false)
                }}
              >
                <Check
                  className={cn(
                    'mr-2 h-4 w-4',
                    value === m.id ? 'opacity-100' : 'opacity-0'
                  )}
                />
                <div className="flex-1 min-w-0">
                  <p className="truncate text-sm">{m.title}</p>
                  {m.matter_number && (
                    <p className="text-xs text-muted-foreground">{m.matter_number}</p>
                  )}
                </div>
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

// ── Event Create Dialog ─────────────────────────────────────────────────────

interface EventCreateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialDate: string | null
  tenantId: string
  userId: string
}

export function EventCreateDialog({
  open,
  onOpenChange,
  initialDate,
  tenantId,
  userId,
}: EventCreateDialogProps) {
  const createEvent = useCreateCalendarEvent()

  // Form state
  const [title, setTitle] = useState('')
  const [eventType, setEventType] = useState('meeting')
  const [startDate, setStartDate] = useState<string | null>(initialDate)
  const [startTime, setStartTime] = useState('09:00')
  const [endDate, setEndDate] = useState<string | null>(initialDate)
  const [endTime, setEndTime] = useState('10:00')
  const [allDay, setAllDay] = useState(false)
  const [color, setColor] = useState('#3b82f6')
  const [showDescription, setShowDescription] = useState(false)
  const [description, setDescription] = useState('')
  const [showLocation, setShowLocation] = useState(false)
  const [location, setLocation] = useState('')
  const [matterId, setMatterId] = useState<string | null>(null)
  const [startPickerOpen, setStartPickerOpen] = useState(false)
  const [endPickerOpen, setEndPickerOpen] = useState(false)

  // Recurrence state
  const [recurrencePreset, setRecurrencePreset] = useState<RecurrencePreset>('none')
  const [recurrenceByDay, setRecurrenceByDay] = useState<string[]>([])
  const [customInterval, setCustomInterval] = useState(1)
  const [customFreq, setCustomFreq] = useState<'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY'>('WEEKLY')

  // Reset state when dialog opens
  const prevOpen = useRef(open)
  if (open && !prevOpen.current) {
    setTitle('')
    setEventType('meeting')
    setStartDate(initialDate)
    setStartTime('09:00')
    setEndDate(initialDate)
    setEndTime('10:00')
    setAllDay(false)
    setColor('#3b82f6')
    setShowDescription(false)
    setDescription('')
    setShowLocation(false)
    setLocation('')
    setMatterId(null)
    setRecurrencePreset('none')
    setRecurrenceByDay([])
    setCustomInterval(1)
    setCustomFreq('WEEKLY')
  }
  prevOpen.current = open

  const canSubmit = title.trim() && startDate && endDate && !createEvent.isPending

  async function handleSubmit() {
    if (!canSubmit) return

    const start_at = allDay
      ? `${startDate}T00:00:00`
      : `${startDate}T${startTime}:00`
    const end_at = allDay
      ? `${endDate}T23:59:59`
      : `${endDate}T${endTime}:00`

    // Build recurrence rule
    let recurrence_rule: string | null = null
    if (recurrencePreset !== 'none') {
      switch (recurrencePreset) {
        case 'daily':
          recurrence_rule = buildRRule({ freq: 'DAILY', interval: 1 })
          break
        case 'weekly':
          recurrence_rule = buildRRule({
            freq: 'WEEKLY',
            interval: 1,
            byDay: recurrenceByDay.length > 0 ? recurrenceByDay : undefined,
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
            freq: customFreq,
            interval: customInterval,
            byDay: customFreq === 'WEEKLY' && recurrenceByDay.length > 0 ? recurrenceByDay : undefined,
          })
          break
      }
    }

    await createEvent.mutateAsync({
      tenant_id: tenantId,
      title: title.trim(),
      description: description.trim() || null,
      location: location.trim() || null,
      start_at,
      end_at,
      all_day: allDay,
      color,
      event_type: eventType,
      matter_id: matterId,
      created_by: userId,
      status: 'confirmed',
      recurrence_rule,
    })

    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Create Event</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Title */}
          <div className="space-y-1.5">
            <Label htmlFor="event-title">Title</Label>
            <Input
              id="event-title"
              placeholder="e.g., Client meeting, Court hearing"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
            />
          </div>

          {/* Event Type + Colour */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Event Type</Label>
              <Select value={eventType} onValueChange={(val) => {
                setEventType(val)
                // Auto-set colour based on event type
                const et = EVENT_TYPES.find((t) => t.value === val)
                if (et) setColor(et.color)
              }}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EVENT_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      <div className="flex items-center gap-2">
                        <div
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: t.color }}
                        />
                        {t.label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Colour</Label>
              <div className="flex items-center gap-1.5 pt-1">
                {EVENT_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={cn(
                      'h-6 w-6 rounded-full border-2 transition-all',
                      color === c
                        ? 'border-slate-900 scale-110'
                        : 'border-transparent hover:scale-105'
                    )}
                    style={{ backgroundColor: c }}
                    onClick={() => setColor(c)}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* All-day toggle */}
          <div className="flex items-center justify-between">
            <Label htmlFor="all-day" className="text-sm">All-day event</Label>
            <Switch
              id="all-day"
              checked={allDay}
              onCheckedChange={setAllDay}
            />
          </div>

          {/* Start date/time */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Start Date</Label>
              <Popover open={startPickerOpen} onOpenChange={setStartPickerOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start text-left font-normal">
                    <CalendarIcon className="mr-2 h-4 w-4 text-muted-foreground" />
                    {startDate
                      ? format(parseISO(startDate), 'MMM d, yyyy')
                      : 'Pick a date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={startDate ? parseISO(startDate) : undefined}
                    onSelect={(date) => {
                      const formatted = date ? format(date, 'yyyy-MM-dd') : null
                      setStartDate(formatted)
                      // Auto-set end date if not set or before start
                      if (formatted && (!endDate || endDate < formatted)) {
                        setEndDate(formatted)
                      }
                      setStartPickerOpen(false)
                    }}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            {!allDay && (
              <div className="space-y-1.5">
                <Label>Start Time</Label>
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <Input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="flex-1"
                  />
                </div>
              </div>
            )}
          </div>

          {/* End date/time */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>End Date</Label>
              <Popover open={endPickerOpen} onOpenChange={setEndPickerOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start text-left font-normal">
                    <CalendarIcon className="mr-2 h-4 w-4 text-muted-foreground" />
                    {endDate
                      ? format(parseISO(endDate), 'MMM d, yyyy')
                      : 'Pick a date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={endDate ? parseISO(endDate) : undefined}
                    onSelect={(date) => {
                      setEndDate(date ? format(date, 'yyyy-MM-dd') : null)
                      setEndPickerOpen(false)
                    }}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            {!allDay && (
              <div className="space-y-1.5">
                <Label>End Time</Label>
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <Input
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="flex-1"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Repeat / Recurrence */}
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5">
                <Repeat className="h-3.5 w-3.5 text-muted-foreground" />
                Repeat
              </Label>
              <Select
                value={recurrencePreset}
                onValueChange={(val) => setRecurrencePreset(val as RecurrencePreset)}
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
            {(recurrencePreset === 'weekly' || (recurrencePreset === 'custom' && customFreq === 'WEEKLY')) && (
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Repeat on</Label>
                <div className="flex gap-1">
                  {(['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'] as const).map((day) => {
                    const labels: Record<string, string> = {
                      MO: 'M', TU: 'T', WE: 'W', TH: 'T', FR: 'F', SA: 'S', SU: 'S',
                    }
                    const isSelected = recurrenceByDay.includes(day)
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
                          setRecurrenceByDay((prev) =>
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
            {recurrencePreset === 'custom' && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Every</Label>
                  <Input
                    type="number"
                    min={1}
                    max={99}
                    value={customInterval}
                    onChange={(e) => setCustomInterval(Math.max(1, parseInt(e.target.value) || 1))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Frequency</Label>
                  <Select
                    value={customFreq}
                    onValueChange={(val) => setCustomFreq(val as typeof customFreq)}
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

          {/* Optional fields: description, location */}
          <div className="flex items-center gap-3">
            {!showDescription && (
              <button
                type="button"
                className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700"
                onClick={() => setShowDescription(true)}
              >
                <AlignLeft className="h-3 w-3" />
                Add description
              </button>
            )}
            {!showLocation && (
              <button
                type="button"
                className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700"
                onClick={() => setShowLocation(true)}
              >
                <MapPin className="h-3 w-3" />
                Add location
              </button>
            )}
          </div>

          {showDescription && (
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea
                placeholder="Add event details..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
              />
            </div>
          )}

          {showLocation && (
            <div className="space-y-1.5">
              <Label>Location</Label>
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <Input
                  placeholder="e.g., Courthouse Room 4B, Zoom link..."
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                />
              </div>
            </div>
          )}

          {/* Matter link */}
          <div className="space-y-1.5">
            <Label>Link to Matter (optional)</Label>
            <MatterSelector
              value={matterId}
              onChange={setMatterId}
              tenantId={tenantId}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {createEvent.isPending ? 'Creating...' : 'Create Event'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
