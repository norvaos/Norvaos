import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'
import { clioFetch } from '../client'

/**
 * Clio trust balance structure.
 * Clio exposes trust balances through the /api/v4/trust_line_items or
 * /api/v4/bills endpoints, but the cleanest approach for migration is
 * fetching matter-level trust balances from /api/v4/matters with trust fields.
 *
 * We fetch all matters with their trust_balance field, then produce one
 * row per matter that has a non-zero trust balance.
 */
interface ClioMatterTrust {
  id: number
  display_number?: string
  description?: string
  client?: { id: number; name: string }
  trust_balance?: number
  currency?: { code: string }
}

interface ClioTrustLineItem {
  id: number
  date?: string
  amount?: number
  type?: string
  note?: string
  matter?: { id: number; display_number: string }
  contact?: { id: number; name: string }
  created_at?: string
}

export async function fetchClioTrustBalances(
  connectionId: string,
  admin: SupabaseClient<Database>,
): Promise<{ rows: Record<string, string>[]; totalRows: number }> {
  // Strategy: fetch trust line items if available, otherwise fall back to matter-level balances
  let rows: Record<string, string>[] = []

  try {
    // Try trust_line_items endpoint first (available in Clio Manage)
    const response = await clioFetch<{ data: ClioTrustLineItem[] }>(
      connectionId,
      admin,
      'trust_line_items',
      { fields: ['id', 'date', 'amount', 'type', 'note', 'matter', 'contact', 'created_at'] },
    )

    if (response.data && response.data.length > 0) {
      // Aggregate by matter  -  sum deposits to get net trust balance per matter
      const matterBalances = new Map<number, {
        matterId: number
        contactId?: number
        contactName?: string
        totalAmount: number
        currency: string
        latestDate: string
      }>()

      for (const item of response.data) {
        if (!item.matter?.id || item.amount == null) continue

        const existing = matterBalances.get(item.matter.id)
        if (existing) {
          existing.totalAmount += item.amount
          if (item.date && item.date > existing.latestDate) {
            existing.latestDate = item.date
          }
        } else {
          matterBalances.set(item.matter.id, {
            matterId: item.matter.id,
            contactId: item.contact?.id,
            contactName: item.contact?.name,
            totalAmount: item.amount,
            currency: 'CAD',
            latestDate: item.date ?? item.created_at ?? '',
          })
        }
      }

      rows = Array.from(matterBalances.values())
        .filter((m) => m.totalAmount > 0) // Only positive balances
        .map((m) => ({
          __source_id: `trust_${m.matterId}`,
          matterId: String(m.matterId),
          contactId: m.contactId ? String(m.contactId) : '',
          amount: String(m.totalAmount),
          description: 'Opening balance  -  migrated from Clio',
          date: m.latestDate,
          currency: m.currency,
          referenceNumber: `CLIO-TRUST-${m.matterId}`,
          paymentMethod: 'migration',
        }))
    }
  } catch {
    // trust_line_items not available  -  fall back to matter-level balances
  }

  // Fallback: if trust_line_items failed or returned nothing, try matter-level trust_balance
  if (rows.length === 0) {
    try {
      const response = await clioFetch<{ data: ClioMatterTrust[] }>(
        connectionId,
        admin,
        'matters',
        {
          fields: ['id', 'display_number', 'description', 'client', 'trust_balance', 'currency'],
          params: { limit: '200' },
        },
      )

      if (response.data) {
        rows = response.data
          .filter((m) => m.trust_balance != null && m.trust_balance > 0)
          .map((m) => ({
            __source_id: `trust_${m.id}`,
            matterId: String(m.id),
            contactId: m.client ? String(m.client.id) : '',
            amount: String(m.trust_balance!),
            description: `Opening balance  -  migrated from Clio (${m.display_number ?? ''})`,
            date: new Date().toISOString().split('T')[0],
            currency: m.currency?.code ?? 'CAD',
            referenceNumber: `CLIO-TRUST-${m.id}`,
            paymentMethod: 'migration',
          }))
      }
    } catch {
      // If both approaches fail, return empty  -  the adapter will show 0 rows
    }
  }

  return { rows, totalRows: rows.length }
}
