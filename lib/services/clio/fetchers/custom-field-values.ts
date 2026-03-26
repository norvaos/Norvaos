import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'
import { clioPaginateAll } from '../client'

/**
 * Fetches Clio matters with their custom_field_values and produces one row
 * per matter with all custom field values merged into a single JSONB blob.
 *
 * Clio API: GET /api/v4/matters?fields=id,custom_field_values{id,value,custom_field}
 *
 * Output: one row per matter that has at least one custom field value.
 * The `data` column is a JSON string: { "field_name": "value", ... }
 */

interface ClioCustomFieldValue {
  id: number
  value?: string | number | boolean | null
  custom_field?: {
    id: number
    name: string
    field_type?: string
  }
}

interface ClioMatterWithCustomFields {
  id: number
  custom_field_values?: ClioCustomFieldValue[]
}

export async function fetchClioCustomFieldValues(
  connectionId: string,
  admin: SupabaseClient<Database>,
): Promise<{ rows: Record<string, string>[]; totalRows: number }> {
  const matters = await clioPaginateAll<ClioMatterWithCustomFields>(
    connectionId, admin, 'matters',
    ['id', 'custom_field_values'],
  )

  const rows: Record<string, string>[] = []

  for (const matter of matters) {
    const cfv = matter.custom_field_values
    if (!cfv || cfv.length === 0) continue

    // Build a clean key→value map from Clio custom field values
    const data: Record<string, unknown> = {}
    for (const entry of cfv) {
      if (!entry.custom_field?.name || entry.value == null) continue
      // Use snake_case key derived from field name
      const key = entry.custom_field.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_|_$/g, '')
      data[key] = entry.value
    }

    if (Object.keys(data).length === 0) continue

    rows.push({
      __source_id: `cfv_${matter.id}`,
      matterId: String(matter.id),
      data: JSON.stringify(data),
    })
  }

  return { rows, totalRows: rows.length }
}
