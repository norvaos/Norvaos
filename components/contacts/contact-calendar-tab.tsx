'use client'

import { CalendarDays, Clock, MapPin, Video, Users } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { useContactCalendarEvents } from '@/lib/queries/calendar-events'
import { formatDate } from '@/lib/utils/formatters'

const EVENT_TYPE_LABELS: Record<string, { label: string; color: string }> = {
  meeting: { label: 'Meeting', color: 'bg-blue-100 text-blue-400' },
  consultation: { label: 'Consultation', color: 'bg-indigo-100 text-indigo-700' },
  court_date: { label: 'Court', color: 'bg-red-100 text-red-400' },
  deadline: { label: 'Deadline', color: 'bg-amber-100 text-amber-400' },
  reminder: { label: 'Reminder', color: 'bg-green-100 text-emerald-400' },
  other: { label: 'Event', color: 'bg-slate-100 text-slate-600' },
}

function formatTime(isoString: string): string {
  try {
    const d = new Date(isoString)
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
  } catch {
    return ''
  }
}

export function ContactCalendarTab({
  contactId,
  tenantId,
}: {
  contactId: string
  tenantId: string
}) {
  const { data: events, isLoading } = useContactCalendarEvents(contactId, tenantId)

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-6">
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded-lg" />
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  if (!events || events.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <CalendarDays className="mx-auto mb-3 size-10 text-muted-foreground/50" />
          <p className="text-sm font-medium text-slate-900">No calendar events</p>
          <p className="mt-1 text-sm text-muted-foreground">
            No events linked to this contact yet.
          </p>
        </CardContent>
      </Card>
    )
  }

  const now = new Date()
  const upcoming = events.filter((e) => new Date(e.start_at) >= now)
  const past = events.filter((e) => new Date(e.start_at) < now)

  // Re-sort: upcoming ascending, past descending
  upcoming.sort((a, b) => a.start_at.localeCompare(b.start_at))

  return (
    <div className="space-y-4">
      {upcoming.length > 0 && (
        <div>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Upcoming
          </h4>
          <div className="space-y-2">
            {upcoming.map((event) => (
              <EventCard key={event.id} event={event} />
            ))}
          </div>
        </div>
      )}

      {past.length > 0 && (
        <div>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Past
          </h4>
          <div className="space-y-2">
            {past.map((event) => (
              <EventCard key={event.id} event={event} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function EventCard({ event }: { event: { id: string; title: string; start_at: string; end_at: string; event_type: string; location: string | null; all_day: boolean; color: string | null } }) {
  const typeInfo = EVENT_TYPE_LABELS[event.event_type] ?? EVENT_TYPE_LABELS.other

  return (
    <Card className="transition-colors hover:bg-muted/30">
      <CardContent className="flex items-start gap-4 py-3 px-4">
        <div className="flex flex-col items-center min-w-[48px] text-center">
          <span className="text-xs font-medium text-muted-foreground">
            {new Date(event.start_at).toLocaleDateString('en-US', { month: 'short' })}
          </span>
          <span className="text-lg font-bold text-slate-900">
            {new Date(event.start_at).getDate()}
          </span>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-slate-900 truncate">{event.title}</p>
            <Badge variant="secondary" className={`text-[10px] px-1.5 py-0 ${typeInfo.color}`}>
              {typeInfo.label}
            </Badge>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            {!event.all_day && (
              <span className="flex items-center gap-1">
                <Clock className="size-3" />
                {formatTime(event.start_at)}
                {event.end_at && ` – ${formatTime(event.end_at)}`}
              </span>
            )}
            {event.all_day && (
              <span className="flex items-center gap-1">
                <CalendarDays className="size-3" />
                All day
              </span>
            )}
            {event.location && (
              <span className="flex items-center gap-1">
                <MapPin className="size-3" />
                {event.location}
              </span>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
