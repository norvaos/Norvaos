import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'
import { ghlPaginateAll } from '../client'

interface GhlTransaction {
  _id: string
  contactId?: string
  amount?: number
  currency?: string
  status?: string
  paymentMethod?: string
  entityType?: string
  entityId?: string
  createdAt?: string
  updatedAt?: string
}

export async function fetchGhlPayments(
  connectionId: string,
  admin: SupabaseClient<Database>,
  locationId: string,
): Promise<{ rows: Record<string, string>[]; totalRows: number }> {
  const transactions = await ghlPaginateAll<GhlTransaction>(
    connectionId, admin, 'payments/transactions',
    'data', { altId: locationId, altType: 'location' },
  )

  const rows = transactions.map((t) => ({
    __source_id: t._id,
    contactId: t.contactId ?? '',
    amount: t.amount != null ? String(t.amount) : '',
    currency: t.currency ?? '',
    status: t.status ?? '',
    paymentMethod: t.paymentMethod ?? '',
    entityType: t.entityType ?? '',
    entityId: t.entityId ?? '',
    createdAt: t.createdAt ?? '',
  }))

  return { rows, totalRows: rows.length }
}
