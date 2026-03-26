'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { getTranslations, type PortalLocale } from '@/lib/utils/portal-translations'

// ── Types ────────────────────────────────────────────────────────────────────

interface BookingPageConfig {
  id: string
  title: string
  description?: string
  duration_minutes: number
  working_hours: { start: string; end: string; days: number[] }
  max_days_ahead: number
  min_notice_hours?: number
  theme_color?: string
  confirmation_message?: string
}

interface TimeSlot {
  time: string
  available: boolean
}

interface GuestInfo {
  name: string
  email: string
  phone: string
}

type MeetingType = 'in_person' | 'video' | 'phone'

type Step = 'date' | 'time' | 'details' | 'confirmed'

interface PortalBookingProps {
  token: string
  primaryColor?: string | null
  language?: PortalLocale
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(time: string): string {
  const [h, m] = time.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const hour = h === 0 ? 12 : h > 12 ? h - 12 : h
  return `${hour}:${m.toString().padStart(2, '0')} ${ampm}`
}

function formatDateDisplay(date: Date): string {
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatDateShort(date: Date): string {
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

function toDateStr(date: Date): string {
  const y = date.getFullYear()
  const m = (date.getMonth() + 1).toString().padStart(2, '0')
  const d = date.getDate().toString().padStart(2, '0')
  return `${y}-${m}-${d}`
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

// ── Icons ────────────────────────────────────────────────────────────────────

function SpinnerIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={`${className} animate-spin`} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )
}

function ChevronLeftIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 18l-6-6 6-6" />
    </svg>
  )
}

function ChevronRightIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 18l6-6-6-6" />
    </svg>
  )
}

function ArrowLeftIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 12H5M12 19l-7-7 7-7" />
    </svg>
  )
}

function CheckCircleIcon() {
  return (
    <svg className="h-12 w-12 text-green-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <path d="M22 4L12 14.01l-3-3" />
    </svg>
  )
}

function CalendarIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  )
}

function ClockIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
    </svg>
  )
}

// ── Meeting Type Options ─────────────────────────────────────────────────────

const MEETING_TYPES: { value: MeetingType; icon: string; labelKey: string; fallback: string }[] = [
  { value: 'in_person', icon: '🏢', labelKey: 'booking_meeting_in_person', fallback: 'In-Person' },
  { value: 'video', icon: '📹', labelKey: 'booking_meeting_video', fallback: 'Video Call' },
  { value: 'phone', icon: '📞', labelKey: 'booking_meeting_phone', fallback: 'Phone Call' },
]

const DAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

// ── Custom Calendar Component ────────────────────────────────────────────────

function MiniCalendar({
  selectedDate,
  onSelect,
  workingDays,
  maxDaysAhead,
  accentColor,
}: {
  selectedDate?: Date
  onSelect: (date: Date) => void
  workingDays: number[]
  maxDaysAhead: number
  accentColor: string
}) {
  const today = useMemo(() => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return d
  }, [])

  const maxDate = useMemo(() => {
    const d = new Date(today)
    d.setDate(d.getDate() + maxDaysAhead)
    return d
  }, [today, maxDaysAhead])

  const [viewMonth, setViewMonth] = useState(() => today.getMonth())
  const [viewYear, setViewYear] = useState(() => today.getFullYear())

  const monthLabel = useMemo(() => {
    return new Date(viewYear, viewMonth).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  }, [viewMonth, viewYear])

  // Generate calendar grid
  const calendarDays = useMemo(() => {
    const firstDay = new Date(viewYear, viewMonth, 1).getDay()
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()
    const rows: (Date | null)[][] = []
    let currentRow: (Date | null)[] = []

    // Leading blanks
    for (let i = 0; i < firstDay; i++) currentRow.push(null)

    for (let day = 1; day <= daysInMonth; day++) {
      currentRow.push(new Date(viewYear, viewMonth, day))
      if (currentRow.length === 7) {
        rows.push(currentRow)
        currentRow = []
      }
    }
    // Trailing blanks
    if (currentRow.length > 0) {
      while (currentRow.length < 7) currentRow.push(null)
      rows.push(currentRow)
    }
    return rows
  }, [viewMonth, viewYear])

  const isDayDisabled = useCallback(
    (date: Date) => {
      if (date < today) return true
      if (date > maxDate) return true
      if (!workingDays.includes(date.getDay())) return true
      return false
    },
    [today, maxDate, workingDays]
  )

  const canGoPrev = viewYear > today.getFullYear() || (viewYear === today.getFullYear() && viewMonth > today.getMonth())
  const canGoNext = viewYear < maxDate.getFullYear() || (viewYear === maxDate.getFullYear() && viewMonth < maxDate.getMonth())

  return (
    <div className="select-none">
      {/* Month navigation */}
      <div className="flex items-center justify-between mb-4 px-1">
        <button
          type="button"
          onClick={() => {
            if (viewMonth === 0) { setViewMonth(11); setViewYear(viewYear - 1) }
            else setViewMonth(viewMonth - 1)
          }}
          disabled={!canGoPrev}
          className="flex h-8 w-8 items-center justify-center rounded-full text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:pointer-events-none transition-colors"
        >
          <ChevronLeftIcon />
        </button>
        <span className="text-sm font-semibold text-slate-800">{monthLabel}</span>
        <button
          type="button"
          onClick={() => {
            if (viewMonth === 11) { setViewMonth(0); setViewYear(viewYear + 1) }
            else setViewMonth(viewMonth + 1)
          }}
          disabled={!canGoNext}
          className="flex h-8 w-8 items-center justify-center rounded-full text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:pointer-events-none transition-colors"
        >
          <ChevronRightIcon />
        </button>
      </div>

      {/* Day headers + grid */}
      <table className="w-full border-collapse">
        <thead>
          <tr>
            {DAY_LABELS.map((d) => (
              <th key={d} className="py-1 text-center text-[11px] font-semibold text-slate-400 uppercase tracking-wide">
                {d}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {calendarDays.map((row, ri) => (
            <tr key={ri}>
              {row.map((date, ci) => {
                if (!date) {
                  return <td key={`blank-${ri}-${ci}`} className="p-0.5" />
                }
                const disabled = isDayDisabled(date)
                const isToday = isSameDay(date, today)
                const isSelected = selectedDate && isSameDay(date, selectedDate)

                return (
                  <td key={toDateStr(date)} className="p-0.5 text-center">
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => onSelect(date)}
                      className={`relative inline-flex items-center justify-center h-9 w-9 rounded-full text-[13px] transition-all
                        ${disabled ? 'text-slate-300 cursor-not-allowed' : 'text-slate-700 hover:bg-slate-100 cursor-pointer font-medium'}
                        ${isSelected ? 'text-white font-semibold' : ''}
                        ${isToday && !isSelected ? 'font-bold' : ''}
                      `}
                      style={isSelected ? { backgroundColor: accentColor } : undefined}
                    >
                      {date.getDate()}
                      {isToday && !isSelected && (
                        <span
                          className="absolute bottom-0.5 left-1/2 -translate-x-1/2 h-1 w-1 rounded-full"
                          style={{ backgroundColor: accentColor }}
                        />
                      )}
                    </button>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Main Component ──────────────────────────────────────────────────────────

export function PortalBooking({ token, primaryColor, language = 'en' }: PortalBookingProps) {
  console.log('[PortalBooking] v2 rendering')
  const tr = getTranslations(language)
  const accentColor = primaryColor || '#2563eb'

  // State
  const [loading, setLoading] = useState(true)
  const [bookingPage, setBookingPage] = useState<BookingPageConfig | null>(null)
  const [lawyerName, setLawyerName] = useState('')
  const [guestInfo, setGuestInfo] = useState<GuestInfo>({ name: '', email: '', phone: '' })

  const [step, setStep] = useState<Step>('date')
  const [selectedDate, setSelectedDate] = useState<Date | undefined>()
  const [slots, setSlots] = useState<TimeSlot[]>([])
  const [slotsLoading, setSlotsLoading] = useState(false)
  const [selectedTime, setSelectedTime] = useState<string | null>(null)
  const [meetingType, setMeetingType] = useState<MeetingType>('video')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmationMessage, setConfirmationMessage] = useState('')

  // Fetch booking page config on mount
  useEffect(() => {
    async function fetchConfig() {
      try {
        const res = await fetch(`/api/portal/${token}/booking`)
        const data = await res.json()
        if (data.available && data.bookingPage) {
          setBookingPage(data.bookingPage)
          setLawyerName(data.lawyerName ?? '')
          setGuestInfo(data.guestInfo ?? { name: '', email: '', phone: '' })
        }
      } catch {
        // Silently fail  -  booking just won't show
      } finally {
        setLoading(false)
      }
    }
    fetchConfig()
  }, [token])

  // Fetch slots when date is selected
  const fetchSlots = useCallback(async (date: Date) => {
    if (!bookingPage) return
    setSlotsLoading(true)
    setSlots([])
    setError(null)
    try {
      const dateStr = toDateStr(date)
      const res = await fetch(`/api/portal/${token}/booking?date=${dateStr}`)
      const data = await res.json()
      setSlots(data.slots ?? [])
    } catch {
      setError('Failed to load available times.')
    } finally {
      setSlotsLoading(false)
    }
  }, [token, bookingPage])

  // Handle date selection
  const handleDateSelect = useCallback((date: Date) => {
    setSelectedDate(date)
    setSelectedTime(null)
    setStep('time')
    fetchSlots(date)
  }, [fetchSlots])

  // Handle time selection
  const handleTimeSelect = useCallback((time: string) => {
    setSelectedTime(time)
    setStep('details')
  }, [])

  // Handle booking submission
  const handleSubmit = useCallback(async () => {
    if (!selectedDate || !selectedTime) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(`/api/portal/${token}/booking`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: toDateStr(selectedDate),
          time: selectedTime,
          meeting_type: meetingType,
          notes: notes.trim() || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        if (res.status === 409) {
          setError(tr.booking_conflict ?? 'This time slot is no longer available. Please choose another time.')
          setStep('time')
          fetchSlots(selectedDate)
          return
        }
        throw new Error(data.error || 'Booking failed')
      }
      setConfirmationMessage(data.confirmation_message || tr.booking_confirmed_message || 'Your appointment has been scheduled.')
      setStep('confirmed')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Booking failed')
    } finally {
      setSubmitting(false)
    }
  }, [token, selectedDate, selectedTime, meetingType, notes, tr, fetchSlots])

  // Don't render if loading or no booking page
  if (loading) return null
  if (!bookingPage) return null

  const workingDays = bookingPage.working_hours.days
  const initials = lawyerName
    ? lawyerName.split(' ').map((n) => n[0]).join('').substring(0, 2).toUpperCase()
    : ''

  return (
    <div className="mb-6">
      {/* ── Lawyer card ── */}
      <div className="flex items-center gap-3 mb-4 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        {lawyerName ? (
          <div
            className="flex h-10 w-10 items-center justify-center rounded-full text-white text-sm font-bold shrink-0 shadow-sm"
            style={{ backgroundColor: accentColor }}
          >
            {initials}
          </div>
        ) : (
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-500 shrink-0">
            <CalendarIcon />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-slate-900 truncate">
            {lawyerName || (tr.booking_title ?? 'Book an Appointment')}
          </h3>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="flex items-center gap-1 text-xs text-slate-500">
              <ClockIcon />
              {bookingPage.duration_minutes} min
            </span>
            {lawyerName && (
              <span className="text-xs text-slate-400">
                &middot; {tr.booking_title ?? 'Book an Appointment'}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── Error banner ── */}
      {error && (
        <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      )}

      {/* ── Step 1: Calendar ── */}
      {step === 'date' && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <MiniCalendar
            selectedDate={selectedDate}
            onSelect={handleDateSelect}
            workingDays={workingDays}
            maxDaysAhead={bookingPage.max_days_ahead || 30}
            accentColor={accentColor}
          />
        </div>
      )}

      {/* ── Step 2: Time slots ── */}
      {step === 'time' && selectedDate && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <button
            type="button"
            onClick={() => setStep('date')}
            className="flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-700 mb-3 transition-colors"
          >
            <ArrowLeftIcon />
            {tr.booking_back ?? 'Back'}
          </button>

          <div className="flex items-center gap-2 mb-4 pb-3 border-b border-slate-100">
            <div
              className="flex h-8 w-8 items-center justify-center rounded-lg text-white"
              style={{ backgroundColor: accentColor }}
            >
              <CalendarIcon />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-800">{formatDateShort(selectedDate)}</p>
              <p className="text-xs text-slate-500">Select a time below</p>
            </div>
          </div>

          {slotsLoading ? (
            <div className="flex items-center justify-center py-10">
              <SpinnerIcon className="h-5 w-5 text-slate-400" />
            </div>
          ) : slots.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-sm text-slate-500">{tr.booking_no_slots ?? 'No available times for this date.'}</p>
              <button
                type="button"
                onClick={() => setStep('date')}
                className="mt-2 text-xs font-medium hover:underline"
                style={{ color: accentColor }}
              >
                {tr.booking_choose_another_date ?? 'Choose another date'}
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {slots.map((slot) => (
                <button
                  key={slot.time}
                  type="button"
                  onClick={() => handleTimeSelect(slot.time)}
                  className="rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-medium text-slate-700 transition-all hover:shadow-sm hover:border-slate-300 active:scale-[0.97]"
                  style={{ ['--hover-border' as string]: accentColor }}
                  onMouseEnter={(e) => (e.currentTarget.style.borderColor = accentColor)}
                  onMouseLeave={(e) => (e.currentTarget.style.borderColor = '')}
                >
                  {formatTime(slot.time)}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Step 3: Meeting details ── */}
      {step === 'details' && selectedDate && selectedTime && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <button
            type="button"
            onClick={() => setStep('time')}
            className="flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-700 mb-3 transition-colors"
          >
            <ArrowLeftIcon />
            {tr.booking_back ?? 'Back'}
          </button>

          {/* Summary */}
          <div className="rounded-lg bg-slate-50 border border-slate-100 p-3 mb-4">
            <div className="flex items-center gap-2">
              <div
                className="flex h-8 w-8 items-center justify-center rounded-lg text-white shrink-0"
                style={{ backgroundColor: accentColor }}
              >
                <CalendarIcon />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-800">
                  {formatDateShort(selectedDate)} &middot; {formatTime(selectedTime)}
                </p>
                <p className="text-xs text-slate-500">
                  {bookingPage.duration_minutes} min{lawyerName ? ` with ${lawyerName}` : ''}
                </p>
              </div>
            </div>
          </div>

          {/* Meeting type */}
          <label className="block text-xs font-medium text-slate-700 mb-2">
            {tr.booking_meeting_type ?? 'Meeting Type'}
          </label>
          <div className="grid grid-cols-3 gap-2 mb-4">
            {MEETING_TYPES.map((mt) => {
              const isActive = meetingType === mt.value
              return (
                <button
                  key={mt.value}
                  type="button"
                  onClick={() => setMeetingType(mt.value)}
                  className={`flex flex-col items-center gap-1.5 rounded-xl border-2 p-3 text-xs font-medium transition-all ${
                    isActive
                      ? 'bg-white shadow-sm'
                      : 'border-transparent bg-slate-50 text-slate-600 hover:bg-slate-100'
                  }`}
                  style={isActive ? { borderColor: accentColor, color: accentColor } : undefined}
                >
                  <span className="text-lg">{mt.icon}</span>
                  {(tr as unknown as Record<string, string>)[mt.labelKey] ?? mt.fallback}
                </button>
              )
            })}
          </div>

          {/* Your info (read-only) */}
          {guestInfo.name && (
            <div className="mb-4">
              <label className="block text-xs font-medium text-slate-700 mb-1">
                {tr.booking_your_info ?? 'Your Information'}
              </label>
              <div className="rounded-lg bg-slate-50 border border-slate-100 px-3 py-2 text-xs text-slate-600">
                <p className="font-medium">{guestInfo.name}</p>
                {guestInfo.email && <p>{guestInfo.email}</p>}
                {guestInfo.phone && <p>{guestInfo.phone}</p>}
              </div>
            </div>
          )}

          {/* Notes */}
          <label className="block text-xs font-medium text-slate-700 mb-1">
            {tr.booking_notes_label ?? 'Additional Notes'}
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={tr.booking_notes_placeholder ?? 'Anything you would like us to know before the meeting...'}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none resize-none"
            rows={3}
          />

          {/* Submit */}
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="mt-4 w-full rounded-xl px-4 py-3 text-sm font-semibold text-white transition-all shadow-sm disabled:opacity-60 active:scale-[0.98]"
            style={{ backgroundColor: accentColor }}
          >
            {submitting ? (
              <span className="flex items-center justify-center gap-2">
                <SpinnerIcon className="h-4 w-4" />
                {tr.booking_confirming ?? 'Booking...'}
              </span>
            ) : (
              tr.booking_confirm_button ?? 'Confirm Booking'
            )}
          </button>
        </div>
      )}

      {/* ── Step 4: Confirmation ── */}
      {step === 'confirmed' && selectedDate && selectedTime && (
        <div className="rounded-xl border border-green-200 bg-green-50 p-5 text-center shadow-sm">
          <div className="flex justify-center mb-3">
            <CheckCircleIcon />
          </div>
          <h4 className="text-sm font-bold text-slate-800 mb-1">
            {tr.booking_confirmed_title ?? 'Booking Confirmed!'}
          </h4>
          <p className="text-xs text-slate-500 mb-4">{confirmationMessage}</p>
          <div className="rounded-lg bg-white border border-green-200 p-3 text-left">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-green-100 text-green-600 shrink-0">
                <CalendarIcon />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-800">{formatDateShort(selectedDate)}</p>
                <p className="text-xs text-slate-500">
                  {formatTime(selectedTime)} &middot; {bookingPage.duration_minutes} min
                </p>
              </div>
            </div>
            <div className="mt-2 pt-2 border-t border-slate-100 flex items-center gap-2 text-xs text-slate-600">
              <span className="text-base">{MEETING_TYPES.find((m) => m.value === meetingType)?.icon}</span>
              <span className="font-medium">
                {MEETING_TYPES.find((m) => m.value === meetingType)?.fallback ?? meetingType}
              </span>
              {lawyerName && <span className="text-slate-400">&middot; with {lawyerName}</span>}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
