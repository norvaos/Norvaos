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
    __source_id: String(m.id),
    displayNumber: m.display_number ?? '',
    description: m.description ?? '',
    status: m.status ?? '',
    openDate: m.open_date ?? '',
    closeDate: m.close_date ?? '',
    billingMethod: m.billing_method ?? '',
    clientId: m.client ? String(m.client.id) : '',
    clientName: m.client?.name ?? '',
    practiceArea: m.practice_area?.name ?? '',
    practiceAreaId: m.practice_area ? String(m.practice_area.id) : '',
    responsibleAttorney: m.responsible_attorney?.name ?? '',
    originatingAttorney: m.originating_attorney?.name ?? '',
    customFields: m.custom_field_values ? JSON.stringify(m.custom_field_values) : '',
    createdAt: m.created_at ?? '',
  }))

  return { rows, totalRows: rows.length }
}
