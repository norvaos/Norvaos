import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { withTiming } from '@/lib/middleware/request-timing'
import { requirePermission } from '@/lib/services/require-role'
import { getRecentSentinelEvents } from '@/lib/services/sentinel-audit'

/**
 * GET /api/security/tenant-violations
 *
 * Platform admin only. Returns recent tenant violation events from
 * the immutable sentinel_audit_log.
 *
 * Query params:
 *   ?limit=50       — max records (default 50, max 200)
 *   ?severity=critical — filter by severity
 *   ?tenant_id=uuid — filter by tenant
 */
async function handleGet(request: Request) {
  try {
    const auth = await authenticateRequest()

    // Only Admin role can view security logs
    requirePermission(auth, 'settings', 'edit')

    const url = new URL(request.url)
    const limit = Math.min(
      parseInt(url.searchParams.get('limit') ?? '50', 10),
      200,
    )
    const severity = url.searchParams.get('severity') as 'info' | 'warning' | 'critical' | 'breach' | null
    const tenantId = url.searchParams.get('tenant_id')

    const events = await getRecentSentinelEvents({
      limit,
      severity: severity ?? undefined,
      eventType: 'TENANT_VIOLATION',
      tenantId: tenantId ?? undefined,
    })

    return NextResponse.json({
      events,
      count: events.length,
      limit,
    })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error('[security/tenant-violations] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export const GET = withTiming(handleGet, 'GET /api/security/tenant-violations')
