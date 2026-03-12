'use client'

import { CommunicationEventCard } from './communication-event-card'
import type { LeadCommunicationEventRow, UserRow } from './lead-workflow-types'

interface CommunicationTimelineProps {
  events: LeadCommunicationEventRow[]
  users: UserRow[] | undefined
}

/**
 * Chronological list of communication events, grouped by date.
 * Events arrive newest-first from the query; this component renders them in
 * that order with date-group headers inserted between clusters.
 */
export function CommunicationTimeline({ events, users }: CommunicationTimelineProps) {
  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <p className="text-sm text-muted-foreground">No communication events yet</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Log calls, emails, or messages to track interactions
        </p>
      </div>
    )
  }

  const grouped = groupByDate(events)

  return (
    <div className="divide-y">
      {grouped.map(({ dateLabel, items }) => (
        <div key={dateLabel}>
          <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm px-3 py-1.5 border-b">
            <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
              {dateLabel}
            </span>
          </div>
          <div className="divide-y">
            {items.map((event) => (
              <CommunicationEventCard key={event.id} event={event} users={users} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Date Grouping Helper ────────────────────────────────────────────────────

function groupByDate(events: LeadCommunicationEventRow[]): Array<{
  dateLabel: string
  items: LeadCommunicationEventRow[]
}> {
  const groups: Array<{ dateLabel: string; items: LeadCommunicationEventRow[] }> = []
  let currentDate = ''

  for (const event of events) {
    const eventDate = new Date(event.occurred_at ?? event.created_at)
    const dateStr = eventDate.toLocaleDateString('en-CA', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })

    if (dateStr !== currentDate) {
      currentDate = dateStr
      const now = new Date()
      const isToday = eventDate.toDateString() === now.toDateString()
      const yesterday = new Date(now)
      yesterday.setDate(yesterday.getDate() - 1)
      const isYesterday = eventDate.toDateString() === yesterday.toDateString()

      const dateLabel = isToday ? 'Today' : isYesterday ? 'Yesterday' : dateStr

      groups.push({ dateLabel, items: [] })
    }

    groups[groups.length - 1].items.push(event)
  }

  return groups
}
