import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'
import { clioPaginateAll } from '../client'

interface ClioCustomField {
  id: number
  name?: string
  field_type?: string
  parent_type?: string
  displayed?: boolean
  required?: boolean
  picklist_options?: { id: number; option: string }[]
  created_at?: string
  updated_at?: string
}

export async function fetchClioCustomFields(
  connectionId: string,
  admin: SupabaseClient<Database>,
): Promise<{ rows: Record<string, string>[]; totalRows: number }> {
  const fields = await clioPaginateAll<ClioCustomField>(
    connectionId, admin, 'custom_fields',
    ['id', 'name', 'field_type', 'parent_type', 'displayed', 'required', 'picklist_options', 'created_at', 'updated_at'],
  )

  const rows = fields.map((f) => ({
    __source_id: String(f.id),
    name: f.name ?? '',
    fieldType: f.field_type ?? '',
    parentType: f.parent_type ?? '',
    displayed: f.displayed ? 'true' : 'false',
    required: f.required ? 'true' : 'false',
    picklistOptions: (f.picklist_options ?? []).map((o) => o.option).join(', '),
    createdAt: f.created_at ?? '',
  }))

  return { rows, totalRows: rows.length }
}
