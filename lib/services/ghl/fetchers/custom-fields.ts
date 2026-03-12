import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'
import { ghlFetch } from '../client'

interface GhlCustomField {
  id: string
  name: string
  fieldKey?: string
  dataType?: string
  placeholder?: string
  position?: number
  picklistOptions?: string[]
}

export async function fetchGhlCustomFields(
  connectionId: string,
  admin: SupabaseClient<Database>,
  locationId: string,
): Promise<{ rows: Record<string, string>[]; totalRows: number }> {
  const data = await ghlFetch<{ customFields: GhlCustomField[] }>(
    connectionId, admin, `locations/${locationId}/customFields`,
  )

  const rows = (data.customFields ?? []).map((f) => ({
    __source_id: f.id,
    name: f.name ?? '',
    fieldKey: f.fieldKey ?? '',
    dataType: f.dataType ?? '',
    placeholder: f.placeholder ?? '',
    position: f.position != null ? String(f.position) : '',
    picklistOptions: (f.picklistOptions ?? []).join(', '),
  }))

  return { rows, totalRows: rows.length }
}
