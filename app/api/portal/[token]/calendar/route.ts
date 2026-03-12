import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createRateLimiter } from '@/lib/middleware/rate-limit'

const tokenLookupLimiter = createRateLimiter({ windowMs: 60_000, maxRequests: 30 })

// ── Token Validation ──────────────────────────────────────────────────────

async function validateToken(admin: ReturnType<typeof createAdminClient>, token: string) {
  const { data: link, error: linkError } = await admin
    .from('portal_links')
    .select('id, matter_id, tenant_id, contact_id, expires_at, is_active')
    .eq('token', token)
    .eq('is_active', true)
    .single()

  if (linkError || !link) {
    return { error: NextResponse.json({ error: 'Invalid token' }, { status: 404 }) }
  }

  if (new Date(link.expires_at) < new Date()) {
    return { error: NextResponse.json({ error: 'Link expired' }, { status: 410 }) }
  }

  return { link }
}

// ── GET /api/portal/[token]/calendar ──────────────────────────────────────

/**
 * Fetch upcoming calendar events for the matter associated with this portal link.
 * Returns events from the next 90 days. Read-only.
 */
async function handleGet(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
    const { allowed, retryAfterMs } = tokenLookupLimiter.check(ip)
    if (!allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil(retryAfterMs / 1000)) } }
      )
    }

    const { token } = await params
    const admin = createAdminClient()
    const result = await validateToken(admin, token)
    if (result.error) return result.error

    const { link } = result

    // Fetch upcoming calendar events for this matter (next 90 days)
    const now = new Date().toISOString()
    const ninetyDaysLater = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: events, error } = await (admin as any)
      .from('calendar_events')
      .select('id, title, start_at, end_at, location, event_type, all_day, status')
      .eq('matter_id', link.matter_id)
      .eq('is_active', true)
      .eq('is_client_visible', true)
      .neq('status', 'cancelled')
      .gte('start_at', now)
      .lte('start_at', ninetyDaysLater)
      .order('start_at', { ascending: true })

    if (error) throw error

    return NextResponse.json({ events: events ?? [] })
  } catch (err) {
    console.error('[Portal Calendar] Error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export { handleGet as GET }
