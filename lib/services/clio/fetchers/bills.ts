import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'
import { clioPaginateAll } from '../client'

interface ClioBill {
  id: number
  number?: string
  subject?: string
  status?: string
  issued_at?: string
  due_at?: string
  total?: number
  sub_total?: number
  tax_total?: number
  balance?: number
  currency?: { code: string }
  matter?: { id: number; display_number: string }
  client?: { id: number; name: string }
  created_at?: string
  updated_at?: string
}

export async function fetchClioBills(
  connectionId: string,
  admin: SupabaseClient<Database>,
): Promise<{ rows: Record<string, string>[]; totalRows: number }> {
  const bills = await clioPaginateAll<ClioBill>(
    connectionId, admin, 'bills',
    ['id', 'number', 'subject', 'status', 'issued_at', 'due_at', 'total', 'sub_total', 'tax_total', 'balance', 'currency', 'matter', 'client', 'created_at', 'updated_at'],
  )

  const rows = bills.map((b) => ({
    __source_id: String(b.id),
    number: b.number ?? '',
    subject: b.subject ?? '',
    status: b.status ?? '',
    issuedAt: b.issued_at ?? '',
    dueAt: b.due_at ?? '',
    total: b.total != null ? String(b.total) : '',
    subTotal: b.sub_total != null ? String(b.sub_total) : '',
    taxTotal: b.tax_total != null ? String(b.tax_total) : '',
    balance: b.balance != null ? String(b.balance) : '',
    currency: b.currency?.code ?? '',
    matterId: b.matter ? String(b.matter.id) : '',
    clientId: b.client ? String(b.client.id) : '',
    clientName: b.client?.name ?? '',
    createdAt: b.created_at ?? '',
  }))

  return { rows, totalRows: rows.length }
}
