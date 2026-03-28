'use client'

import { useState, useEffect, useMemo } from 'react'
import {
  format,
  addDays,
  isBefore,
  startOfDay,
  isToday,
  isSameDay,
} from 'date-fns'
import {
  Calendar as CalendarIcon,
  Clock,
  User,
  ArrowLeft,
  Check,
  Loader2,
} from 'lucide-react'
import { DayPicker } from 'react-day-picker'
import { cn } from '@/lib/utils'

// ── Types ───────────────────────────────────────────────────────────────────

interface BookingPageData {
  id: string
  tenant_id: string
  slug: string
  title: string
  description: string | null
  duration_minutes: number
  working_hours: { start: string; end: string; days: number[] }
  max_days_ahead: number
  min_notice_hours: number
  theme_color: string | null
  confirmation_message: string | null
  questions: Array<{
    id: string
    label: string
    type: 'text' | 'textarea' | 'select'
    required: boolean
    options?: string[]
  }>
  users: {
    id: string
    first_name: string | null
    last_name: string | null
    avatar_url: string | null
    email: string
  } | null
}

interface TenantData {
  id: string
  name: string
  timezone: string | null
}

interface TimeSlot {
  time: string
  available: boolean
}

type BookingStep = 'date' | 'time' | 'info' | 'confirmed'

// ── Props ───────────────────────────────────────────────────────────────────

interface BookingClientProps {
  bookingPage: BookingPageData
  tenant: TenantData | null
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function formatTime12(time24: string): string {
  const [h, m] = time24.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 || 12
  return `${h12}:${m.toString().padStart(2, '0')} ${ampm}`
}

// ── Main Component ──────────────────────────────────────────────────────────

export default function BookingClient({ bookingPage, tenant }: BookingClientProps) {
  const [step, setStep] = useState<BookingStep>('date')
  const [selectedDate, setSelectedDate] = useState<Date | undefined>()
  const [selectedTime, setSelectedTime] = useState<string | null>(null)
  const [slots, setSlots] = useState<TimeSlot[]>([])
  const [loadingSlots, setLoadingSlots] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [confirmationMessage, setConfirmationMessage] = useState('')
  const [bookingError, setBookingError] = useState<string | null>(null)

  // Form fields
  const [guestName, setGuestName] = useState('')
  const [guestEmail, setGuestEmail] = useState('')
  const [guestPhone, setGuestPhone] = useState('')
  const [guestNotes, setGuestNotes] = useState('')
  const [answers, setAnswers] = useState<Record<string, string>>({})

  const themeColor = bookingPage.theme_color || '#2563eb'
  const userName = bookingPage.users
    ? `${bookingPage.users.first_name ?? ''} ${bookingPage.users.last_name ?? ''}`.trim()
    : 'Team Member'

  // Date constraints
  const disabledDays = useMemo(() => {
    const today = startOfDay(new Date())
    const maxDate = addDays(today, bookingPage.max_days_ahead)
    const workingDays = new Set(bookingPage.working_hours.days)

    return (date: Date) => {
      if (isBefore(date, today) && !isToday(date)) return true
      if (isBefore(maxDate, date)) return true
      if (!workingDays.has(date.getDay())) return true
      return false
    }
  }, [bookingPage.max_days_ahead, bookingPage.working_hours.days])

  // Fetch slots when date is selected
  useEffect(() => {
    if (!selectedDate) return

    const dateStr = format(selectedDate, 'yyyy-MM-dd')
    setLoadingSlots(true)
    setSlots([])
    setSelectedTime(null)

    fetch(`/api/booking/${bookingPage.slug}?date=${dateStr}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.slots) {
          setSlots(data.slots)
        }
      })
      .catch(() => setSlots([]))
      .finally(() => setLoadingSlots(false))
  }, [selectedDate, bookingPage.slug])

  // Handle date selection → advance to time step
  function handleDateSelect(date: Date | undefined) {
    setSelectedDate(date)
    if (date) setStep('time')
  }

  // Handle time selection → advance to info step
  function handleTimeSelect(time: string) {
    setSelectedTime(time)
    setStep('info')
  }

  // Handle form submission
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedDate || !selectedTime) return

    setSubmitting(true)
    setBookingError(null)
    try {
      const res = await fetch(`/api/booking/${bookingPage.slug}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: guestName,
          email: guestEmail,
          phone: guestPhone || undefined,
          date: format(selectedDate, 'yyyy-MM-dd'),
          time: selectedTime,
          notes: guestNotes || undefined,
          answers: Object.keys(answers).length > 0 ? answers : undefined,
        }),
      })

      const data = await res.json()
      if (data.success) {
        setConfirmationMessage(data.confirmation_message || bookingPage.confirmation_message || 'Booking confirmed!')
        setStep('confirmed')
      } else {
        setBookingError(data.error || 'Failed to book. Please try again.')
      }
    } catch {
      setBookingError('An error occurred. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const availableSlots = slots.filter((s) => s.available)

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-xl">
        {/* Header */}
        <div
          className="px-8 py-6"
          style={{ backgroundColor: themeColor }}
        >
          <div className="flex items-center gap-4">
            {bookingPage.users?.avatar_url ? (
              <img
                src={bookingPage.users.avatar_url}
                alt={userName}
                className="h-12 w-12 rounded-full border-2 border-white/30 object-cover"
              />
            ) : (
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/20">
                <User className="h-6 w-6 text-white" />
              </div>
            )}
            <div>
              <h1 className="text-xl font-bold text-white">{bookingPage.title}</h1>
              <p className="text-sm text-white/80">{userName}{tenant ? ` · ${tenant.name}` : ''}</p>
            </div>
          </div>
          {bookingPage.description && (
            <p className="mt-3 text-sm text-white/70">{bookingPage.description}</p>
          )}
          <div className="mt-3 flex items-center gap-4 text-sm text-white/80">
            <span className="flex items-center gap-1">
              <Clock className="h-4 w-4" />
              {bookingPage.duration_minutes} min
            </span>
            {selectedDate && (
              <span className="flex items-center gap-1">
                <CalendarIcon className="h-4 w-4" />
                {format(selectedDate, 'EEE, MMM d')}
                {selectedTime && ` at ${formatTime12(selectedTime)}`}
              </span>
            )}
          </div>
        </div>

        {/* Body */}
        <div className="p-8">
          {/* ── Step: Date ── */}
          {step === 'date' && (
            <div>
              <h2 className="mb-4 text-lg font-semibold text-slate-900">
                Select a Date
              </h2>
              <div className="w-full">
                <DayPicker
                  mode="single"
                  selected={selectedDate}
                  onSelect={handleDateSelect}
                  disabled={disabledDays}
                  showOutsideDays={false}
                  classNames={{
                    root: 'w-full',
                    months: 'w-full',
                    month: 'w-full',
                    month_caption: 'flex items-center justify-between px-1 mb-3',
                    caption_label: 'text-base font-semibold text-slate-900',
                    nav: 'flex items-center gap-1',
                    button_previous: 'h-9 w-9 flex items-center justify-center rounded-full hover:bg-slate-100 text-slate-600 transition-colors',
                    button_next: 'h-9 w-9 flex items-center justify-center rounded-full hover:bg-slate-100 text-slate-600 transition-colors',
                    weeks: 'w-full',
                    weekdays: 'grid grid-cols-7 mb-1',
                    weekday: 'text-center text-xs font-medium text-slate-400 py-1',
                    week: 'grid grid-cols-7',
                    day: 'flex items-center justify-center p-0',
                    day_button: cn(
                      'w-full aspect-square flex items-center justify-center rounded-lg text-sm font-medium',
                      'hover:bg-slate-100 transition-colors cursor-pointer',
                      'disabled:text-slate-300 disabled:cursor-not-allowed disabled:hover:bg-transparent',
                    ),
                    today: 'font-bold ring-1 ring-slate-300 rounded-lg',
                    selected: 'text-white rounded-lg',
                    outside: 'opacity-0 pointer-events-none',
                    disabled: 'text-slate-300 cursor-not-allowed',
                  }}
                  modifiersStyles={{
                    selected: { backgroundColor: themeColor },
                  }}
                />
              </div>
            </div>
          )}

          {/* ── Step: Time ── */}
          {step === 'time' && selectedDate && (
            <div>
              <div className="mb-4 flex items-center gap-2">
                <button
                  onClick={() => setStep('date')}
                  className="rounded-full p-1 hover:bg-slate-100"
                >
                  <ArrowLeft className="h-5 w-5 text-slate-600" />
                </button>
                <h2 className="text-lg font-semibold text-slate-900">
                  Select a Time  -  {format(selectedDate, 'EEEE, MMMM d')}
                </h2>
              </div>

              {loadingSlots ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
                  <span className="ml-2 text-sm text-slate-500">Loading available times...</span>
                </div>
              ) : availableSlots.length === 0 ? (
                <div className="py-12 text-center">
                  <Clock className="mx-auto h-10 w-10 text-slate-300" />
                  <p className="mt-2 text-sm text-slate-500">No available times for this date.</p>
                  <button
                    onClick={() => setStep('date')}
                    className="mt-3 text-sm font-medium hover:underline"
                    style={{ color: themeColor }}
                  >
                    Choose another date
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {availableSlots.map((slot) => (
                    <button
                      key={slot.time}
                      onClick={() => handleTimeSelect(slot.time)}
                      className={cn(
                        'rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors',
                        selectedTime === slot.time
                          ? 'border-transparent text-white'
                          : 'border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                      )}
                      style={
                        selectedTime === slot.time
                          ? { backgroundColor: themeColor }
                          : undefined
                      }
                    >
                      {formatTime12(slot.time)}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Step: Info ── */}
          {step === 'info' && selectedDate && selectedTime && (
            <div>
              <div className="mb-4 flex items-center gap-2">
                <button
                  onClick={() => setStep('time')}
                  className="rounded-full p-1 hover:bg-slate-100"
                >
                  <ArrowLeft className="h-5 w-5 text-slate-600" />
                </button>
                <h2 className="text-lg font-semibold text-slate-900">
                  Your Details
                </h2>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    Full Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={guestName}
                    onChange={(e) => setGuestName(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    placeholder="John Smith"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    Email <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="email"
                    required
                    value={guestEmail}
                    onChange={(e) => setGuestEmail(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    placeholder="john@example.com"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    Phone
                  </label>
                  <input
                    type="tel"
                    value={guestPhone}
                    onChange={(e) => setGuestPhone(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    placeholder="+1 (555) 123-4567"
                  />
                </div>

                {/* Custom questions */}
                {bookingPage.questions.map((q) => (
                  <div key={q.id}>
                    <label className="mb-1 block text-sm font-medium text-slate-700">
                      {q.label} {q.required && <span className="text-red-500">*</span>}
                    </label>
                    {q.type === 'textarea' ? (
                      <textarea
                        required={q.required}
                        value={answers[q.id] ?? ''}
                        onChange={(e) =>
                          setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))
                        }
                        rows={3}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    ) : q.type === 'select' ? (
                      <select
                        required={q.required}
                        value={answers[q.id] ?? ''}
                        onChange={(e) =>
                          setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))
                        }
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      >
                        <option value="">Select...</option>
                        {q.options?.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        required={q.required}
                        value={answers[q.id] ?? ''}
                        onChange={(e) =>
                          setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))
                        }
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    )}
                  </div>
                ))}

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    Additional Notes
                  </label>
                  <textarea
                    value={guestNotes}
                    onChange={(e) => setGuestNotes(e.target.value)}
                    rows={3}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    placeholder="Anything you'd like us to know before the meeting..."
                  />
                </div>

                {bookingError && (
                  <div className="rounded-lg border border-red-500/20 bg-red-950/30 px-4 py-3 text-sm text-red-400">
                    {bookingError}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={submitting}
                  className="flex w-full items-center justify-center rounded-lg px-4 py-3 text-sm font-semibold text-white transition-opacity disabled:opacity-50"
                  style={{ backgroundColor: themeColor }}
                >
                  {submitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Booking...
                    </>
                  ) : (
                    'Confirm Booking'
                  )}
                </button>
              </form>
            </div>
          )}

          {/* ── Step: Confirmed ── */}
          {step === 'confirmed' && selectedDate && selectedTime && (
            <div className="py-8 text-center">
              <div
                className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full"
                style={{ backgroundColor: `${themeColor}15` }}
              >
                <Check className="h-8 w-8" style={{ color: themeColor }} />
              </div>
              <h2 className="text-xl font-bold text-slate-900">Booking Confirmed!</h2>
              <p className="mt-2 text-sm text-slate-600">
                {confirmationMessage}
              </p>
              <div className="mx-auto mt-6 max-w-sm rounded-lg border bg-slate-50 p-4 text-left text-sm">
                <div className="flex items-center gap-2 text-slate-700">
                  <CalendarIcon className="h-4 w-4 text-slate-400" />
                  <span className="font-medium">{format(selectedDate, 'EEEE, MMMM d, yyyy')}</span>
                </div>
                <div className="mt-2 flex items-center gap-2 text-slate-700">
                  <Clock className="h-4 w-4 text-slate-400" />
                  <span>{formatTime12(selectedTime)} · {bookingPage.duration_minutes} minutes</span>
                </div>
                <div className="mt-2 flex items-center gap-2 text-slate-700">
                  <User className="h-4 w-4 text-slate-400" />
                  <span>with {userName}</span>
                </div>
              </div>
              <p className="mt-6 text-xs text-slate-400">
                A confirmation will be sent to {guestEmail}
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t bg-slate-50 px-8 py-3 text-center text-xs text-slate-400">
          Powered by {tenant?.name ?? 'NorvaOS'}
        </div>
      </div>
    </div>
  )
}
