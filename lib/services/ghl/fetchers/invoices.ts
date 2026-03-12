import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'
import { ghlPaginateAll } from '../client'

interface GhlInvoice {
  _id: string
  name?: string
  title?: string
  contactId?: string
  status?: string
  totalAmount?: number
  amountDue?: number
  currency?: string
  invoiceNumber?: string
  issueDate?: string
  dueDate?: string
  createdAt?: string
  updatedAt?: string
}

export async function fetchGhlInvoices(
  connectionId: string,
  admin: SupabaseClient<Database>,
  locationId: string,
): Promise<{ rows: Record<string, string>[]; totalRows: number }> {
  const invoices = await ghlPaginateAll<GhlInvoice>(
    connectionId, admin, 'invoices',
    'invoices', { altId: locationId, altType: 'location' },
  )

  const rows = invoices.map((inv) => ({
    __source_id: inv._id,
    name: inv.name ?? inv.title ?? '',
    contactId: inv.contactId ?? '',
    status: inv.status ?? '',
    totalAmount: inv.totalAmount != null ? String(inv.totalAmount) : '',
    amountDue: inv.amountDue != null ? String(inv.amountDue) : '',
    currency: inv.currency ?? '',
    invoiceNumber: inv.invoiceNumber ?? '',
    issueDate: inv.issueDate ?? '',
    dueDate: inv.dueDate ?? '',
    createdAt: inv.createdAt ?? '',
  }))

  return { rows, totalRows: rows.length }
}
