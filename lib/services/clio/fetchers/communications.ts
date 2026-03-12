import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'
import { clioPaginateAll } from '../client'

interface ClioCommunication {
  id: number
  subject?: string
  body?: string
  type?: string
  date?: string
  received_at?: string
  senders?: { id: number; name: string; type: string }[]
  receivers?: { id: number; name: string; type: string }[]
  matter?: { id: number; display_number: string }
  created_at?: string
  updated_at?: string
}

export async function fetchClioCommunications(
  connectionId: string,
  admin: SupabaseClient<Database>,
): Promise<{ rows: Record<string, string>[]; totalRows: number }> {
  const comms = await clioPaginateAll<ClioCommunication>(
    connectionId, admin, 'communications',
    ['id', 'subject', 'body', 'type', 'date', 'received_at', 'senders', 'receivers', 'matter', 'created_at', 'updated_at'],
  )

  const rows = comms.map((c) => ({
    __source_id: String(c.id),
    subject: c.subject ?? '',
    body: c.body ?? '',
    type: c.type ?? '',
    date: c.date ?? '',
    receivedAt: c.received_at ?? '',
    senders: (c.senders ?? []).map((s) => s.name).join(', '),
    receivers: (c.receivers ?? []).map((r) => r.name).join(', '),
    matterId: c.matter ? String(c.matter.id) : '',
    createdAt: c.created_at ?? '',
  }))

  return { rows, totalRows: rows.length }
}
