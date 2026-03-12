import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'
import { clioPaginateAll } from '../client'

interface ClioNote {
  id: number
  subject?: string
  detail?: string
  type?: string
  date?: string
  regarding?: { id: number; type: string; name?: string }
  created_at?: string
  updated_at?: string
}

export async function fetchClioNotes(
  connectionId: string,
  admin: SupabaseClient<Database>,
): Promise<{ rows: Record<string, string>[]; totalRows: number }> {
  const notes = await clioPaginateAll<ClioNote>(
    connectionId, admin, 'notes',
    ['id', 'subject', 'detail', 'type', 'date', 'regarding', 'created_at', 'updated_at'],
  )

  const rows = notes.map((n) => ({
    __source_id: String(n.id),
    subject: n.subject ?? '',
    detail: n.detail ?? '',
    type: n.type ?? '',
    date: n.date ?? '',
    regardingType: n.regarding?.type ?? '',
    regardingId: n.regarding ? String(n.regarding.id) : '',
    regardingName: n.regarding?.name ?? '',
    createdAt: n.created_at ?? '',
  }))

  return { rows, totalRows: rows.length }
}
