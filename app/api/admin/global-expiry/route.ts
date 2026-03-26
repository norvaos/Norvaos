import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { requirePermission } from '@/lib/services/require-role'
import { withTiming } from '@/lib/middleware/request-timing'
import { log } from '@/lib/utils/logger'

/**
 * GET /api/admin/global-expiry
 *
 * Returns all clients with expiring documents from contact_status_records,
 * sorted by days to expiry. Each row includes a colour band:
 *   grey  = >180 days
 *   amber = 90–180 days
 *   red   = <90 days
 */

type ExpiryRow = {
  id: string
  contact_id: string
  status_type: string
  expiry_date: string
  matter_id: string | null
  contacts: { first_name: string | null; last_name: string | null } | null
  matters: { matter_number: string | null } | null
}

function colourBand(daysToExpiry: number): 'red' | 'amber' | 'grey' {
  if (daysToExpiry < 90) return 'red'
  if (daysToExpiry <= 180) return 'amber'
  return 'grey'
}

async function handleGet() {
  try {
    const auth = await authenticateRequest()
    requirePermission(auth, 'settings', 'view')
    const admin = createAdminClient()

    const { data: rows, error } = await (admin
      .from('contact_status_records' as any)
      .select(
        'id, contact_id, status_type, expiry_date, matter_id, contacts(first_name, last_name), matters(matter_number)'
      ) as any)
      .eq('tenant_id', auth.tenantId)
      .not('expiry_date', 'is', null)
      .order('expiry_date', { ascending: true })

    if (error) {
      log.error('[admin/global-expiry] Query failed', { error_message: error.message })
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const items = ((rows ?? []) as ExpiryRow[]).map((r) => {
      const expiry = new Date(r.expiry_date)
      expiry.setHours(0, 0, 0, 0)
      const daysToExpiry = Math.ceil(
        (expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
      )

      return {
        contact_id: r.contact_id,
        contact_name: [r.contacts?.first_name, r.contacts?.last_name]
          .filter(Boolean)
          .join(' ') || 'Unknown',
        status_type: r.status_type,
        expiry_date: r.expiry_date,
        days_to_expiry: daysToExpiry,
        matter_id: r.matter_id,
        matter_number: r.matters?.matter_number ?? null,
        colour_band: colourBand(daysToExpiry),
      }
    })

    return NextResponse.json({ items, count: items.length })
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    log.error('[admin/global-expiry] Unexpected error', {
      error_message: err instanceof Error ? err.message : 'Unknown',
    })
    return NextResponse.json({ error: 'An unexpected error occurred.' }, { status: 500 })
  }
}

export const GET = withTiming(handleGet, 'GET /api/admin/global-expiry')
