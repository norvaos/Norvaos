import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'
import { clioPaginateAll } from '../client'

interface ClioDocument {
  id: number
  name?: string
  type?: string
  content_type?: string
  latest_document_version?: { id: number; uuid: string }
  parent?: { id: number; type: string; name?: string }
  matter?: { id: number; display_number: string }
  created_at?: string
  updated_at?: string
}

export async function fetchClioDocuments(
  connectionId: string,
  admin: SupabaseClient<Database>,
): Promise<{ rows: Record<string, string>[]; totalRows: number }> {
  const documents = await clioPaginateAll<ClioDocument>(
    connectionId, admin, 'documents',
    ['id', 'name', 'type', 'content_type', 'latest_document_version', 'parent', 'matter', 'created_at', 'updated_at'],
  )

  const rows = documents.map((d) => ({
    __source_id: String(d.id),
    name: d.name ?? '',
    type: d.type ?? '',
    contentType: d.content_type ?? '',
    versionId: d.latest_document_version ? String(d.latest_document_version.id) : '',
    parentType: d.parent?.type ?? '',
    parentId: d.parent ? String(d.parent.id) : '',
    parentName: d.parent?.name ?? '',
    matterId: d.matter ? String(d.matter.id) : '',
    createdAt: d.created_at ?? '',
  }))

  return { rows, totalRows: rows.length }
}
