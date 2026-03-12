import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'
import { ghlFetch, ghlPaginateAll } from '../client'

interface GhlContact {
  id: string
}

interface GhlNote {
  id: string
  contactId?: string
  body?: string
  dateAdded?: string
  userId?: string
}

export async function fetchGhlNotes(
  connectionId: string,
  admin: SupabaseClient<Database>,
  locationId: string,
): Promise<{ rows: Record<string, string>[]; totalRows: number }> {
  // Get all contacts first so we can iterate their notes
  const contacts = await ghlPaginateAll<GhlContact>(
    connectionId, admin, 'contacts',
    'contacts', { locationId },
  )

  const rows: Record<string, string>[] = []

  for (const contact of contacts) {
    try {
      const data = await ghlFetch<{ notes: GhlNote[] }>(
        connectionId, admin, `contacts/${contact.id}/notes`,
      )

      for (const note of data.notes ?? []) {
        rows.push({
          __source_id: note.id,
          contactId: note.contactId ?? contact.id,
          body: note.body ?? '',
          dateAdded: note.dateAdded ?? '',
          userId: note.userId ?? '',
        })
      }
    } catch {
      // Skip contacts with no notes or access issues
    }
  }

  return { rows, totalRows: rows.length }
}
