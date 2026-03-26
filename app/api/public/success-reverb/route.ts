import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

/**
 * GET /api/public/success-reverb
 *
 * Public (unauthenticated) API that returns anonymised firm-wide approval
 * statistics. Designed for embedding on the firm's marketing website to
 * attract new leads ("Success Loop").
 *
 * Security:
 *   - No PII, no matter titles, no client names
 *   - Uses service-role key server-side only (never exposed to browser)
 *   - CORS restricted to NEXT_PUBLIC_SITE_URL
 *   - Rate-limited by Vercel/Netlify edge (no in-process throttle)
 *   - Results cached for 5 minutes (Cache-Control)
 *
 * Query params:
 *   - tenant: tenant slug (required — identifies the firm)
 */

const CACHE_MAX_AGE = 300 // 5 minutes

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const tenantSlug = searchParams.get('tenant')

  if (!tenantSlug) {
    return NextResponse.json({ error: 'Missing tenant parameter' }, { status: 400 })
  }

  // Build a service-role client (server-side only — key is never sent to browser)
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  // Resolve tenant by slug
  const { data: tenant, error: tenantErr } = await supabase
    .from('tenants')
    .select('id, firm_name')
    .eq('slug', tenantSlug)
    .maybeSingle()

  if (tenantErr || !tenant) {
    return NextResponse.json({ error: 'Firm not found' }, { status: 404 })
  }

  // Aggregate anonymised stats
  const [
    { count: totalMatters },
    { count: closedWon },
    { count: closedLost },
    { count: activeMatters },
  ] = await Promise.all([
    supabase
      .from('matters')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenant.id)
      .not('status', 'in', '("archived","import_reverted")'),
    supabase
      .from('matters')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenant.id)
      .eq('status', 'closed_won'),
    supabase
      .from('matters')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenant.id)
      .eq('status', 'closed_lost'),
    supabase
      .from('matters')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenant.id)
      .eq('status', 'active'),
  ])

  const total = totalMatters ?? 0
  const won = closedWon ?? 0
  const lost = closedLost ?? 0
  const active = activeMatters ?? 0
  const decided = won + lost
  const approvalRate = decided > 0 ? Math.round((won / decided) * 100) : null

  const payload = {
    firm: tenant.firm_name,
    stats: {
      /** Total cases handled (all time, excluding archived) */
      total_cases_handled: total,
      /** Currently active matters */
      active_cases: active,
      /** Win rate = closed_won / (closed_won + closed_lost). Null if < 5 decided. */
      approval_rate_pct: decided >= 5 ? approvalRate : null,
      /** Total decided (won + lost) */
      total_decided: decided,
    },
    /** ISO timestamp of when this snapshot was computed */
    computed_at: new Date().toISOString(),
  }

  return NextResponse.json(payload, {
    headers: {
      'Cache-Control': `public, s-maxage=${CACHE_MAX_AGE}, stale-while-revalidate=60`,
      'Access-Control-Allow-Origin': process.env.NEXT_PUBLIC_SITE_URL ?? '*',
      'Access-Control-Allow-Methods': 'GET',
    },
  })
}
