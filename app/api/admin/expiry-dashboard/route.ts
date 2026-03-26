import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { withTiming } from '@/lib/middleware/request-timing'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * GET /api/admin/expiry-dashboard
 *
 * Returns all contacts with upcoming document expiries, sorted by urgency.
 * Powers the Global Expiry Dashboard (Directive 021).
 */
async function handleGet(_request: Request) {
  try {
    const auth = await authenticateRequest()
    const supabase = auth.supabase as SupabaseClient<any>

    // Fetch all contact_status_records with expiry dates, joined with contacts and matters
    const { data: records, error } = await supabase
      .from('contact_status_records')
      .select(`
        id,
        contact_id,
        status_type,
        expiry_date,
        matter_id,
        contacts!contact_status_records_contact_id_fkey(first_name, last_name),
        matters!contact_status_records_matter_id_fkey(id, title)
      `)
      .not('expiry_date', 'is', null)
      .gte('expiry_date', new Date(Date.now() - 90 * 86400000).toISOString().split('T')[0]) // include recently expired (90d)
      .order('expiry_date', { ascending: true })

    if (error) {
      console.error('[expiry-dashboard] Query error:', error)
      return NextResponse.json({ error: 'Failed to fetch expiry data' }, { status: 500 })
    }

    const now = Date.now()
    const entries = (records ?? []).map((r: any) => {
      const expiryMs = new Date(r.expiry_date).getTime()
      const daysUntilExpiry = Math.ceil((expiryMs - now) / (1000 * 60 * 60 * 24))
      const contact = r.contacts as any
      const matter = r.matters as any

      return {
        contact_id: r.contact_id,
        contact_name: contact
          ? `${contact.first_name ?? ''} ${contact.last_name ?? ''}`.trim()
          : 'Unknown',
        document_type: r.status_type,
        expiry_date: r.expiry_date,
        days_until_expiry: daysUntilExpiry,
        matter_id: matter?.id ?? r.matter_id,
        matter_title: matter?.title ?? null,
      }
    })

    // Sort by days until expiry (most urgent first)
    entries.sort((a: any, b: any) => a.days_until_expiry - b.days_until_expiry)

    return NextResponse.json({
      entries,
      scanned_at: new Date().toISOString(),
      total: entries.length,
    })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error('[expiry-dashboard] GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export const GET = withTiming(handleGet, 'GET /api/admin/expiry-dashboard')
