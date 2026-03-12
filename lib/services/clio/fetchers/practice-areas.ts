import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'
import { clioPaginateAll } from '../client'

interface ClioPracticeArea {
  id: number
  name?: string
  code?: string
  category?: string
  created_at?: string
  updated_at?: string
}

export async function fetchClioPracticeAreas(
  connectionId: string,
  admin: SupabaseClient<Database>,
): Promise<{ rows: Record<string, string>[]; totalRows: number }> {
  const areas = await clioPaginateAll<ClioPracticeArea>(
    connectionId, admin, 'practice_areas',
    ['id', 'name', 'code', 'category', 'created_at', 'updated_at'],
  )

  const rows = areas.map((a) => ({
    __source_id: String(a.id),
    name: a.name ?? '',
    code: a.code ?? '',
    category: a.category ?? '',
    createdAt: a.created_at ?? '',
  }))

  return { rows, totalRows: rows.length }
}
