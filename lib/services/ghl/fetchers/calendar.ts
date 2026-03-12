import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'
import { ghlFetch, ghlPaginateAll } from '../client'

interface GhlCalendar {
  id: string
  name?: string
}

interface GhlEvent {
  id: string
  calendarId?: string
  contactId?: string
  title?: string
  startTime?: string
  endTime?: string
  appointmentStatus?: string
  assignedUserId?: string
  notes?: string
  address?: string
  dateAdded?: string
}

export async function fetchGhlCalendarEvents(
  connectionId: string,
  admin: SupabaseClient<Database>,
  locationId: string,
): Promise<{ rows: Record<string, string>[]; totalRows: number }> {
  // First get all calendars
  const calData = await ghlFetch<{ calendars: GhlCalendar[] }>(
    connectionId, admin, 'calendars', { params: { locationId } },
  )

  const rows: Record<string, string>[] = []
  const now = new Date()
  const yearAgo = new Date(now.getFullYear() - 2, now.getMonth(), now.getDate())

  // For each calendar, fetch events
  for (const cal of calData.calendars ?? []) {
    const events = await ghlPaginateAll<GhlEvent>(
      connectionId, admin, 'calendars/events',
      'events',
      { locationId, calendarId: cal.id, startTime: yearAgo.toISOString(), endTime: now.toISOString() },
    )

    for (const evt of events) {
      rows.push({
        __source_id: evt.id,
        calendarId: evt.calendarId ?? cal.id,
        calendarName: cal.name ?? '',
        contactId: evt.contactId ?? '',
        title: evt.title ?? '',
        startTime: evt.startTime ?? '',
        endTime: evt.endTime ?? '',
        status: evt.appointmentStatus ?? '',
        assignedUserId: evt.assignedUserId ?? '',
        notes: evt.notes ?? '',
        address: evt.address ?? '',
        dateAdded: evt.dateAdded ?? '',
      })
    }
  }

  return { rows, totalRows: rows.length }
}
