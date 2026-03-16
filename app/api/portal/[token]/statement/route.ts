/**
 * GET /api/portal/[token]/statement — Client portal consolidated statement
 *
 * Validates the portal token and returns a consolidated client statement
 * for the contact linked to the portal.
 */

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createRateLimiter } from '@/lib/middleware/rate-limit'
import { getClientStatement } from '@/lib/services/analytics/collections-service'
import { validatePortalToken, PortalAuthError } from '@/lib/services/portal-auth'

const rateLimiter = createRateLimiter({ windowMs: 60_000, maxRequests: 30 })

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
    const { allowed, retryAfterMs } = rateLimiter.check(ip)
    if (!allowed) {
      return NextResponse.json(
        { error: 'Too many requests' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil(retryAfterMs / 1000)) } },
      )
    }

    const { token } = await params

    let link: Awaited<ReturnType<typeof validatePortalToken>>
    try {
      link = await validatePortalToken(token)
    } catch (error) {
      if (error instanceof PortalAuthError) {
        return NextResponse.json({ error: error.message }, { status: error.status })
      }
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }

    const admin = createAdminClient()

    // Build a minimal AuthContext for the portal (unauthenticated but tenant-scoped)
    const portalAuth = {
      userId: 'portal',
      authUserId: 'portal',
      tenantId: link.tenant_id,
      role: null,
      supabase: admin as any,
    }

    if (!link.contact_id) {
      return NextResponse.json({ error: 'No contact linked to this portal' }, { status: 400 })
    }

    const statement = await getClientStatement(
      portalAuth,
      link.contact_id,
    )

    return NextResponse.json({
      success: true,
      statement,
      as_of: new Date().toISOString(),
    })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
