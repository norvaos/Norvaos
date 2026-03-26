import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'
import { clioPaginateAll } from '../client'

interface ClioMatter {
  id: number
  display_number?: string
  description?: string
  status?: string
  open_date?: string
  close_date?: string
  billing_method?: string
  client?: { id: number; name: string }
  practice_area?: { id: number; name: string }
  responsible_attorney?: { id: number; name: string }
  originating_attorney?: { id: number; name: string }
  custom_field_values?: { id: number; field_name: string; value: unknown }[]
  created_at?: string
  updated_at?: string
}

export async function fetchClioMatters(
  connectionId: string,
  admin: SupabaseClient<Database>,
): Promise<{ rows: Record<string, string>[]; totalRows: number }> {
  const matters = await clioPaginateAll<ClioMatter>(
    connectionId, admin, 'matters',
    ['id', 'display_number', 'description', 'status', 'open_date', 'close_date', 'billing_method', 'client', 'practice_area', 'responsible_attorney', 'originating_attorney', 'custom_field_values', 'created_at', 'updated_at'],
  )

  const rows = matters.map((m) => ({
    // Internal fields (__ prefix) bypass column mapping and go straight to relationship resolver
    __source_id: String(m.id),
    __contact_source_id: m.client ? String(m.client.id) : '',
    __practice_area_name: m.practice_area?.name ?? '',
    __responsible_lawyer_name: m.responsible_attorney?.name ?? '',
    // Mapped fields  -  names match adapter sourceColumn / aliases exactly
    'Display Number': (m.display_number ?? '').slice(0, 50),
    'Description': m.description ?? '',
    'Status': m.status ?? '',
    'Open Date': m.open_date ?? '',
    'Close Date': m.close_date ?? '',
    'Billing Method': m.billing_method ?? '',
  }))

  return { rows, totalRows: rows.length }
}
