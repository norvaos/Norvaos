import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'
import { ghlFetch } from '../client'

interface GhlTag {
  id: string
  name: string
  locationId?: string
}

export async function fetchGhlTags(
  connectionId: string,
  admin: SupabaseClient<Database>,
  locationId: string,
): Promise<{ rows: Record<string, string>[]; totalRows: number }> {
  const data = await ghlFetch<{ tags: GhlTag[] }>(
    connectionId, admin, `locations/${locationId}/tags`,
  )

  const rows = (data.tags ?? []).map((t) => ({
    __source_id: t.id,
    name: t.name ?? '',
  }))

  return { rows, totalRows: rows.length }
}
