import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'
import { ghlFetch, ghlPaginateAll } from '../client'

interface GhlContact {
  id: string
}

interface GhlTask {
  id: string
  contactId?: string
  title?: string
  body?: string
  dueDate?: string
  status?: string
  assignedTo?: string
  completed?: boolean
  dateAdded?: string
}

export async function fetchGhlTasks(
  connectionId: string,
  admin: SupabaseClient<Database>,
  locationId: string,
): Promise<{ rows: Record<string, string>[]; totalRows: number }> {
  // Get all contacts first so we can iterate their tasks
  const contacts = await ghlPaginateAll<GhlContact>(
    connectionId, admin, 'contacts',
    'contacts', { locationId },
  )

  const rows: Record<string, string>[] = []

  for (const contact of contacts) {
    try {
      const data = await ghlFetch<{ tasks: GhlTask[] }>(
        connectionId, admin, `contacts/${contact.id}/tasks`,
      )

      for (const task of data.tasks ?? []) {
        rows.push({
          __source_id: task.id,
          contactId: task.contactId ?? contact.id,
          title: task.title ?? '',
          body: task.body ?? '',
          dueDate: task.dueDate ?? '',
          status: task.completed ? 'completed' : (task.status ?? ''),
          assignedTo: task.assignedTo ?? '',
          dateAdded: task.dateAdded ?? '',
        })
      }
    } catch {
      // Skip contacts with no tasks or access issues
    }
  }

  return { rows, totalRows: rows.length }
}
