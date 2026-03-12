import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'
import { clioPaginateAll } from '../client'

interface ClioDocumentCategory {
  id: number
  name?: string
  created_at?: string
  updated_at?: string
}

export async function fetchClioDocumentCategories(
  connectionId: string,
  admin: SupabaseClient<Database>,
): Promise<{ rows: Record<string, string>[]; totalRows: number }> {
  const categories = await clioPaginateAll<ClioDocumentCategory>(
    connectionId, admin, 'document_categories',
    ['id', 'name', 'created_at', 'updated_at'],
  )

  const rows = categories.map((c) => ({
    __source_id: String(c.id),
    name: c.name ?? '',
    createdAt: c.created_at ?? '',
  }))

  return { rows, totalRows: rows.length }
}
