import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'
import { clioPaginateAll } from '../client'

interface ClioRelationship {
  id: number
  description?: string
  contact?: { id: number; name: string; type: string }
  matter?: { id: number; display_number: string }
  created_at?: string
  updated_at?: string
}

export async function fetchClioRelationships(
  connectionId: string,
  admin: SupabaseClient<Database>,
): Promise<{ rows: Record<string, string>[]; totalRows: number }> {
  const relationships = await clioPaginateAll<ClioRelationship>(
    connectionId, admin, 'relationships',
    ['id', 'description', 'contact', 'matter', 'created_at', 'updated_at'],
  )

  const rows = relationships.map((r) => ({
    __source_id: String(r.id),
    description: r.description ?? '',
    contactId: r.contact ? String(r.contact.id) : '',
    contactName: r.contact?.name ?? '',
    contactType: r.contact?.type ?? '',
    matterId: r.matter ? String(r.matter.id) : '',
    createdAt: r.created_at ?? '',
  }))

  return { rows, totalRows: rows.length }
}
