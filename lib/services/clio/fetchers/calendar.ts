import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'
import { clioPaginateAll } from '../client'

interface ClioCalendarEntry {
  id: number
  summary?: string
  description?: string
  location?: string
  start_at?: string
  end_at?: string
  all_day?: boolean
  calendar_owner?: { id: number; name: string; type: string }
  matter?: { id: number; display_number: string }
  attendees?: { id: number; name: string; type: string }[]
  created_at?: string
  updated_at?: string
}

export async function fetchClioCalendar(
  connectionId: string,
  admin: SupabaseClient<Database>,
): Promise<{ rows: Record<string, string>[]; totalRows: number }> {
  const entries = await clioPaginateAll<ClioCalendarEntry>(
    connectionId, admin, 'calendar_entries',
    ['id', 'summary', 'description', 'location', 'start_at', 'end_at', 'all_day', 'calendar_owner', 'matter', 'attendees', 'created_at', 'updated_at'],
  )

  const rows = entries.map((e) => ({
    __source_id: String(e.id),
    summary: e.summary ?? '',
    description: e.description ?? '',
    location: e.location ?? '',
    startAt: e.start_at ?? '',
    endAt: e.end_at ?? '',
    allDay: e.all_day ? 'true' : 'false',
    calendarOwner: e.calendar_owner?.name ?? '',
    matterId: e.matter ? String(e.matter.id) : '',
    attendees: (e.attendees ?? []).map((a) => a.name).join(', '),
    createdAt: e.created_at ?? '',
  }))

  return { rows, totalRows: rows.length }
}
