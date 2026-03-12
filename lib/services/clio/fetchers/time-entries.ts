import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'
import { clioPaginateAll } from '../client'

interface ClioActivity {
  id: number
  type?: string
  date?: string
  quantity?: number
  quantity_in_hours?: number
  price?: number
  total?: number
  note?: string
  flat_rate?: boolean
  billed?: boolean
  non_billable?: boolean
  user?: { id: number; name: string }
  matter?: { id: number; display_number: string }
  activity_description?: { id: number; name: string }
  created_at?: string
  updated_at?: string
}

export async function fetchClioTimeEntries(
  connectionId: string,
  admin: SupabaseClient<Database>,
): Promise<{ rows: Record<string, string>[]; totalRows: number }> {
  const activities = await clioPaginateAll<ClioActivity>(
    connectionId, admin, 'activities',
    ['id', 'type', 'date', 'quantity', 'quantity_in_hours', 'price', 'total', 'note', 'flat_rate', 'billed', 'non_billable', 'user', 'matter', 'activity_description', 'created_at', 'updated_at'],
  )

  const rows = activities.map((a) => ({
    __source_id: String(a.id),
    type: a.type ?? '',
    date: a.date ?? '',
    quantity: a.quantity != null ? String(a.quantity) : '',
    quantityInHours: a.quantity_in_hours != null ? String(a.quantity_in_hours) : '',
    price: a.price != null ? String(a.price) : '',
    total: a.total != null ? String(a.total) : '',
    note: a.note ?? '',
    flatRate: a.flat_rate ? 'true' : 'false',
    billed: a.billed ? 'true' : 'false',
    nonBillable: a.non_billable ? 'true' : 'false',
    userName: a.user?.name ?? '',
    userId: a.user ? String(a.user.id) : '',
    matterId: a.matter ? String(a.matter.id) : '',
    activityDescription: a.activity_description?.name ?? '',
    createdAt: a.created_at ?? '',
  }))

  return { rows, totalRows: rows.length }
}
