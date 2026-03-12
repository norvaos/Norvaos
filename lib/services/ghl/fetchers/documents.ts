import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'
import { ghlPaginateAll } from '../client'

interface GhlMedia {
  id: string
  name?: string
  url?: string
  type?: string
  altId?: string
  altType?: string
  parentId?: string
  createdAt?: string
}

export async function fetchGhlDocuments(
  connectionId: string,
  admin: SupabaseClient<Database>,
  locationId: string,
): Promise<{ rows: Record<string, string>[]; totalRows: number }> {
  const medias = await ghlPaginateAll<GhlMedia>(
    connectionId, admin, 'medias/files',
    'files', { altId: locationId, altType: 'location', sortBy: 'createdAt', sortOrder: 'desc' },
  )

  const rows = medias.map((m) => ({
    __source_id: m.id,
    name: m.name ?? '',
    url: m.url ?? '',
    type: m.type ?? '',
    parentId: m.parentId ?? '',
    createdAt: m.createdAt ?? '',
  }))

  return { rows, totalRows: rows.length }
}
