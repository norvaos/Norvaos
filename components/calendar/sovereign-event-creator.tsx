'use client'

import { useCallback, useState } from 'react'
import { motion } from 'framer-motion'
import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import {
  CalendarIcon,
  Clock,
  MapPin,
  Check,
  ChevronsUpDown,
  AlignLeft,
  Video,
  Users,
  Building,
  Phone,
} from 'lucide-react'
import { toast } from 'sonner'

import { createClient } from '@/lib/supabase/client'
import { useCreateCalendarEvent } from '@/lib/queries/calendar-events'
import { EVENT_TYPES, EVENT_COLORS } from '@/lib/schemas/calendar-event'
import { cn } from '@/lib/utils'
import { SovereignCreator, type SovereignCreatorStep } from '@/components/ui/sovereign-creator'
import { NorvaGuardianTooltip } from '@/components/ui/norva-guardian-tooltip'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'

// ---------------------------------------------------------------------------
// Guardian help text
// ---------------------------------------------------------------------------

const EVENT_HELP = {
  title: 'Give the event a clear name  -  e.g. "Client Meeting: Khan" or "Court Hearing: Smith".',
  type: 'Pick the type so it shows the right colour on the calendar.',
  datetime: 'When does it start and end? For all-day events, just pick the date.',
  location: 'Where is it happening? Can be a physical address, a video link, or "Virtual".',
  matter: 'Link this to a case so everyone on the case can see it on their calendar.',
  verify: 'Check the date and time carefully  -  calendar invitations will be sent automatically.',
} as const

// ---------------------------------------------------------------------------
// Shared styles
// ---------------------------------------------------------------------------

const inputCls = 'w-full rounded-xl border border-gray-200 dark:border-white/[0.1] bg-gray-50 dark:bg-white/[0.04] px-4 py-3 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/25 outline-none transition-shadow focus:border-emerald-500/40 focus:shadow-[0_0_16px_rgba(16,185,129,0.1)] focus:ring-0'
const labelCls = 'mb-2 flex items-center text-xs font-medium uppercase tracking-widest text-gray-500 dark:text-white/50'

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface SovereignEventCreatorProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialDate?: string | null
  tenantId: string
  userId: string
  onSuccess?: () => void
}

export function SovereignEventCreator({
  open,
  onOpenChange,
  initialDate,
  tenantId,
  userId,
  onSuccess,
}: SovereignEventCreatorProps) {
  const createEvent = useCreateCalendarEvent()

  // ── Form state ──
  const [title, setTitle] = useState('')
  const [eventType, setEventType] = useState('meeting')
  const [startDate, setStartDate] = useState<string | null>(initialDate ?? null)
  const [startTime, setStartTime] = useState('09:00')
  const [endDate, setEndDate] = useState<string | null>(initialDate ?? null)
  const [endTime, setEndTime] = useState('10:00')
  const [allDay, setAllDay] = useState(false)
  const [description, setDescription] = useState('')
  const [location, setLocation] = useState('')
  const [matterId, setMatterId] = useState<string | null>(null)
  const [matterOpen, setMatterOpen] = useState(false)
  const [matterSearch, setMatterSearch] = useState('')
  const [startPickerOpen, setStartPickerOpen] = useState(false)
  const [endPickerOpen, setEndPickerOpen] = useState(false)
  const [color, setColor] = useState('#3b82f6')

  // ── Data hooks ──
  const { data: mattersData } = useQuery({
    queryKey: ['matters', 'select', tenantId, matterSearch],
    queryFn: async () => {
      const supabase = createClient()
      let q = supabase
        .from('matters')
        .select('id, title, matter_number')
        .eq('tenant_id', tenantId)
        .in('status', ['intake', 'active', 'on_hold'])
        .order('updated_at', { ascending: false })
        .limit(20)
      if (matterSearch) {
        q = q.or(`title.ilike.%${matterSearch}%,matter_number.ilike.%${matterSearch}%`)
      }
      const { data, error } = await q
      if (error) throw error
      return data
    },
    enabled: !!tenantId,
  })

  const resetForm = useCallback(() => {
    setTitle('')
    setEventType('meeting')
    setStartDate(initialDate ?? null)
    setStartTime('09:00')
    setEndDate(initialDate ?? null)
    setEndTime('10:00')
    setAllDay(false)
    setDescription('')
    setLocation('')
    setMatterId(null)
    setMatterSearch('')
    setColor('#3b82f6')
  }, [initialDate])

  // ── Validation ──
  const isStep1Valid = title.trim().length > 1
  const isStep2Valid = !!startDate && !!endDate

  // ── Submit ──
  const handleSubmit = useCallback(async () => {
    if (!startDate || !endDate) return

    const start_at = allDay
      ? `${startDate}T00:00:00`
      : `${startDate}T${startTime}:00`
    const end_at = allDay
      ? `${endDate}T23:59:59`
      : `${endDate}T${endTime}:00`

    try {
      await createEvent.mutateAsync({
        tenant_id: tenantId,
        title: title.trim(),
        description: description.trim() || null,
        location: location.trim() || null,
        start_at,
        end_at,
        all_day: allDay,
        event_type: eventType,
        color,
        matter_id: matterId,
        created_by: userId,
        recurrence_rule: null,
      })

      toast.success('Event created successfully')
      resetForm()
      onOpenChange(false)
      onSuccess?.()
    } catch {
      toast.error('Failed to create event')
    }
  }, [startDate, endDate, allDay, startTime, endTime, tenantId, title, description, location, eventType, color, matterId, userId, createEvent, resetForm, onOpenChange, onSuccess])

  const selectedMatter = mattersData?.find((m) => m.id === matterId)

  // ── Event type mapping ──
  const eventTypeButtons = EVENT_TYPES.map((et) => ({
    value: et.value,
    label: et.label,
  }))

  // ── Step definitions ──
  const steps: SovereignCreatorStep[] = [
    {
      label: 'Event',
      isValid: isStep1Valid,
      content: (
        <div className="flex flex-col gap-5 pt-2">
          <div>
            <label className={labelCls}>
              Event Name
              <NorvaGuardianTooltip fieldKey="contact" text={EVENT_HELP.title} />
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What's happening? e.g. 'Client Meeting: Khan'"
              className={inputCls}
              autoFocus
            />
          </div>

          <div>
            <label className={labelCls}>
              Event Type
              <NorvaGuardianTooltip fieldKey="contact" text={EVENT_HELP.type} />
            </label>
            <div className="flex flex-wrap gap-1.5">
              {eventTypeButtons.map((et) => (
                <motion.button
                  key={et.value}
                  type="button"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                  onClick={() => setEventType(et.value)}
                  className={cn(
                    'rounded-lg border px-3 py-1.5 text-xs font-medium transition-all',
                    eventType === et.value
                      ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                      : 'border-gray-200 dark:border-white/[0.06] text-gray-500 dark:text-white/50 hover:border-gray-300 dark:hover:border-white/[0.12]',
                  )}
                >
                  {et.label}
                </motion.button>
              ))}
            </div>
          </div>

          <div>
            <label className={labelCls}>Description (optional)</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add notes, agenda, or preparation details"
              rows={3}
              className={cn(inputCls, 'resize-none')}
            />
          </div>
        </div>
      ),
    },
    {
      label: 'Schedule',
      isValid: isStep2Valid,
      content: (
        <div className="flex flex-col gap-5 pt-2">
          {/* All-day toggle */}
          <div className="flex items-center gap-3">
            <motion.button
              type="button"
              whileTap={{ scale: 0.95 }}
              onClick={() => setAllDay(!allDay)}
              className={cn(
                'flex items-center gap-2 rounded-xl border px-4 py-2.5 text-xs font-medium transition-all',
                allDay
                  ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                  : 'border-gray-200 dark:border-white/[0.06] text-gray-500 dark:text-white/50',
              )}
            >
              <CalendarIcon className="h-3.5 w-3.5" />
              All Day Event
              {allDay && <Check className="ml-1 h-3 w-3 text-emerald-500" />}
            </motion.button>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Start date */}
            <div>
              <label className={labelCls}>
                <CalendarIcon className="mr-1.5 h-3 w-3 text-emerald-500/60" />
                Start Date
              </label>
              <Popover open={startPickerOpen} onOpenChange={setStartPickerOpen}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className={cn(inputCls, 'flex items-center gap-2 text-left', !startDate && 'text-gray-400 dark:text-white/25')}
                  >
                    {startDate ? format(new Date(startDate), 'MMM d, yyyy') : 'Pick a date'}
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={startDate ? new Date(startDate) : undefined}
                    onSelect={(date) => {
                      const iso = date ? format(date, 'yyyy-MM-dd') : null
                      setStartDate(iso)
                      if (!endDate && iso) setEndDate(iso)
                      setStartPickerOpen(false)
                    }}
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* Start time */}
            {!allDay && (
              <div>
                <label className={labelCls}>
                  <Clock className="mr-1.5 h-3 w-3 text-emerald-500/60" />
                  Start Time
                </label>
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className={inputCls}
                />
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* End date */}
            <div>
              <label className={labelCls}>
                <CalendarIcon className="mr-1.5 h-3 w-3 text-emerald-500/60" />
                End Date
              </label>
              <Popover open={endPickerOpen} onOpenChange={setEndPickerOpen}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className={cn(inputCls, 'flex items-center gap-2 text-left', !endDate && 'text-gray-400 dark:text-white/25')}
                  >
                    {endDate ? format(new Date(endDate), 'MMM d, yyyy') : 'Pick a date'}
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={endDate ? new Date(endDate) : undefined}
                    onSelect={(date) => {
                      setEndDate(date ? format(date, 'yyyy-MM-dd') : null)
                      setEndPickerOpen(false)
                    }}
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* End time */}
            {!allDay && (
              <div>
                <label className={labelCls}>
                  <Clock className="mr-1.5 h-3 w-3 text-emerald-500/60" />
                  End Time
                </label>
                <input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className={inputCls}
                />
              </div>
            )}
          </div>

          <div>
            <label className={labelCls}>
              <MapPin className="mr-1.5 h-3 w-3 text-emerald-500/60" />
              Location
              <NorvaGuardianTooltip fieldKey="contact" text={EVENT_HELP.location} />
            </label>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Address, room number, or video link"
              className={inputCls}
            />
          </div>

          {/* Link to matter */}
          <div>
            <label className={labelCls}>
              Link to Case (optional)
              <NorvaGuardianTooltip fieldKey="contact" text={EVENT_HELP.matter} />
            </label>
            <Popover open={matterOpen} onOpenChange={setMatterOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className={cn(inputCls, 'flex items-center justify-between text-left')}
                >
                  <span className={cn('truncate', !matterId && 'text-gray-400 dark:text-white/25')}>
                    {selectedMatter?.title ?? (matterId ? 'Loading...' : 'Search for a case...')}
                  </span>
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 text-gray-300 dark:text-white/20" />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-[340px] p-0" align="start">
                <Command shouldFilter={false}>
                  <CommandInput placeholder="Search cases..." value={matterSearch} onValueChange={setMatterSearch} />
                  <CommandList>
                    <CommandEmpty>No cases found.</CommandEmpty>
                    <CommandItem value="__none__" onSelect={() => { setMatterId(null); setMatterOpen(false) }}>
                      <Check className={cn('mr-2 h-4 w-4', !matterId ? 'opacity-100' : 'opacity-0')} />
                      <span className="text-muted-foreground">None</span>
                    </CommandItem>
                    {mattersData?.map((m) => (
                      <CommandItem key={m.id} value={m.id} onSelect={() => { setMatterId(m.id); setMatterOpen(false) }}>
                        <Check className={cn('mr-2 h-4 w-4', matterId === m.id ? 'opacity-100' : 'opacity-0')} />
                        <div className="flex-1 min-w-0">
                          <p className="truncate text-sm">{m.title}</p>
                          {m.matter_number && <p className="text-xs text-muted-foreground">{m.matter_number}</p>}
                        </div>
                      </CommandItem>
                    ))}
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>
        </div>
      ),
    },
    {
      label: 'Confirm',
      isValid: isStep1Valid && isStep2Valid,
      content: (
        <div className="flex flex-col gap-5 pt-2">
          <div className="flex items-start gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4">
            <Check className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" />
            <div>
              <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">Ready to schedule</p>
              <p className="mt-1 text-xs text-emerald-600/80 dark:text-emerald-400/70">
                {EVENT_HELP.verify}
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200 dark:border-white/[0.06] bg-gray-50 dark:bg-white/[0.02] p-5">
            <h4 className="mb-3 text-[10px] font-medium uppercase tracking-widest text-gray-400 dark:text-white/40">
              Event Summary
            </h4>
            <div className="grid grid-cols-2 gap-y-2.5 gap-x-6 text-xs">
              <div className="text-gray-400 dark:text-white/40">Event</div>
              <div className="font-medium text-gray-700 dark:text-white/80">{title || 'Not entered'}</div>

              <div className="text-gray-400 dark:text-white/40">Type</div>
              <div className="font-medium text-gray-700 dark:text-white/80 capitalize">{eventType}</div>

              <div className="text-gray-400 dark:text-white/40">Date</div>
              <div className="font-medium text-gray-700 dark:text-white/80">
                {startDate ? format(new Date(startDate), 'MMM d, yyyy') : 'Not set'}
                {!allDay && startTime && ` at ${startTime}`}
                {endDate && startDate !== endDate && `  -  ${format(new Date(endDate), 'MMM d, yyyy')}`}
                {!allDay && endTime && endDate === startDate && `  -  ${endTime}`}
              </div>

              {location && (
                <>
                  <div className="text-gray-400 dark:text-white/40">Location</div>
                  <div className="font-medium text-gray-700 dark:text-white/80">{location}</div>
                </>
              )}

              <div className="text-gray-400 dark:text-white/40">Case</div>
              <div className="font-medium text-gray-700 dark:text-white/80">{selectedMatter?.title ?? 'No case linked'}</div>
            </div>
          </div>
        </div>
      ),
    },
  ]

  return (
    <SovereignCreator
      open={open}
      onOpenChange={(v) => {
        if (!v) resetForm()
        onOpenChange(v)
      }}
      title="Norva Event Creator"
      subtitle="Schedule a meeting, hearing, or deadline"
      steps={steps}
      onSubmit={handleSubmit}
      isSubmitting={createEvent.isPending}
      submitLabel="Create Event"
      submittingLabel="Scheduling..."
    />
  )
}
