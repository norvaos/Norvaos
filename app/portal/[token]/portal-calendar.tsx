'use client'

import { useState, useEffect } from 'react'
import {
  getTranslations,
  type PortalLocale,
} from '@/lib/utils/portal-translations'

// ── Types ────────────────────────────────────────────────────────────────────

interface CalendarEvent {
  id: string
  title: string
  start_at: string
  end_at: string | null
  location: string | null
  event_type: string | null
  all_day: boolean
  status: string
}

interface PortalCalendarProps {
  token: string
  primaryColor?: string
  language?: PortalLocale
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatEventDate(dateStr: string): string {
  try {
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-CA', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  } catch {
    return dateStr
  }
}

function formatEventTime(dateStr: string): string {
  try {
    const date = new Date(dateStr)
    return date.toLocaleTimeString('en-CA', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    })
  } catch {
    return ''
  }
}

function formatTimeRange(startAt: string, endAt: string | null): string {
  const start = formatEventTime(startAt)
  if (!endAt) return start
  const end = formatEventTime(endAt)
  return `${start} – ${end}`
}

function isToday(dateStr: string): boolean {
  const date = new Date(dateStr)
  const today = new Date()
  return (
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate()
  )
}

function getEventTypeLabel(type: string | null): string {
  if (!type) return ''
  return type
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

function getEventTypeColor(type: string | null): string {
  if (!type) return 'bg-slate-100 text-slate-600 border-slate-200'
  const t = type.toLowerCase()
  if (t.includes('hearing') || t.includes('court'))
    return 'bg-red-950/30 text-red-600 border-red-500/20'
  if (t.includes('meeting') || t.includes('consultation'))
    return 'bg-blue-950/30 text-blue-600 border-blue-500/20'
  if (t.includes('deadline') || t.includes('filing'))
    return 'bg-amber-950/30 text-amber-600 border-amber-500/20'
  if (t.includes('appointment') || t.includes('biometric'))
    return 'bg-purple-950/30 text-purple-600 border-purple-500/20'
  return 'bg-slate-100 text-slate-600 border-slate-200'
}

/** Group events by date string (YYYY-MM-DD) preserving order */
function groupByDate(events: CalendarEvent[]): Map<string, CalendarEvent[]> {
  const map = new Map<string, CalendarEvent[]>()
  for (const event of events) {
    const dateKey = new Date(event.start_at).toISOString().split('T')[0]
    if (!map.has(dateKey)) map.set(dateKey, [])
    map.get(dateKey)!.push(event)
  }
  return map
}

// ── Component ────────────────────────────────────────────────────────────────

export function PortalCalendar({ token, primaryColor, language = 'en' }: PortalCalendarProps) {
  const tr = getTranslations(language)
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    async function fetchEvents() {
      try {
        const res = await fetch(`/api/portal/${token}/calendar`)
        if (!res.ok) throw new Error('Failed to fetch events')
        const data = await res.json()
        setEvents(data.events ?? [])
      } catch {
        setError(true)
      } finally {
        setLoading(false)
      }
    }
    fetchEvents()
  }, [token])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Loading...
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="mx-auto h-12 w-12 rounded-2xl bg-gradient-to-br from-red-50 to-white flex items-center justify-center mb-3 shadow-sm">
          <svg className="h-5 w-5 text-red-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </div>
        <p className="text-sm font-medium text-slate-500">{tr.error_generic}</p>
      </div>
    )
  }

  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="mx-auto h-12 w-12 rounded-2xl flex items-center justify-center mb-3 shadow-sm" style={{ backgroundColor: `${primaryColor || '#3b82f6'}10` }}>
          <svg className="h-5 w-5" style={{ color: primaryColor || '#3b82f6' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
        </div>
        <p className="text-sm font-medium text-slate-500">{tr.no_upcoming_events ?? 'No upcoming events scheduled.'}</p>
      </div>
    )
  }

  const grouped = groupByDate(events)

  return (
    <div className="space-y-4">
      {Array.from(grouped.entries()).map(([dateKey, dateEvents]) => {
        const today = isToday(dateEvents[0].start_at)
        return (
          <div key={dateKey}>
            {/* Date header */}
            <div className="flex items-center gap-2 mb-2 px-1">
              <span className={`text-xs font-semibold uppercase tracking-wider ${
                today ? 'text-blue-600' : 'text-slate-500'
              }`}>
                {formatEventDate(dateEvents[0].start_at)}
              </span>
              {today && (
                <span
                  className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold text-white shadow-sm"
                  style={{ background: `linear-gradient(135deg, ${primaryColor || '#3b82f6'}, ${primaryColor || '#3b82f6'}cc)` }}
                >
                  {tr.calendar_today ?? 'Today'}
                </span>
              )}
            </div>

            {/* Events for this date */}
            <div className="space-y-2">
              {dateEvents.map((event) => (
                <div
                  key={event.id}
                  className="rounded-2xl border border-slate-200/60 bg-gradient-to-br from-slate-50/30 to-white p-4 backdrop-blur-sm transition-all hover:shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800">{event.title}</p>

                      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                        {/* Time */}
                        <span className="flex items-center gap-1">
                          <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="12" cy="12" r="10" />
                            <polyline points="12 6 12 12 16 14" />
                          </svg>
                          {event.all_day
                            ? (tr.calendar_all_day ?? 'All Day')
                            : formatTimeRange(event.start_at, event.end_at)}
                        </span>

                        {/* Location */}
                        {event.location && (
                          <span className="flex items-center gap-1">
                            <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" />
                              <circle cx="12" cy="10" r="3" />
                            </svg>
                            {event.location}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Event type badge */}
                    {event.event_type && (
                      <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium shrink-0 ${getEventTypeColor(event.event_type)}`}>
                        {getEventTypeLabel(event.event_type)}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
