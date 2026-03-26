/**
 * Nexus Portal route wrapper  -  combines:
 *   1. IP restriction (NEXUS_ALLOWED_IPS)
 *   2. Rate limiting (30 req/min)
 *   3. Platform admin auth (Bearer token or session)
 *   4. Request ID context
 *   5. Route params resolution
 *
 * Usage:
 *   export const GET = withNexusAdmin(async (request, ctx) => {
 *     // Only reachable from allowed IPs by authenticated platform admins
 *     return NextResponse.json({ data: ... })
 *   })
 */

import { NextResponse } from 'next/server'
import {
  requirePlatformAdmin,
  checkAdminRateLimit,
  extractRequestMeta,
  PlatformAdminError,
} from '@/lib/services/platform-admin'
import { checkNexusIP } from '@/lib/middleware/nexus-guard'
import { withRequestId, getRequestId } from '@/lib/utils/request-id'
import type { AdminRouteContext } from '@/lib/services/with-platform-admin'

type NexusRouteHandler = (
  request: Request,
  ctx: AdminRouteContext,
) => Promise<NextResponse>

export function withNexusAdmin(handler: NexusRouteHandler) {
  return async function wrappedHandler(
    request: Request,
    routeContext?: { params?: Promise<Record<string, string>> },
  ): Promise<NextResponse | Response> {
    // 1. IP restriction  -  first gate, before any auth
    const ipBlock = checkNexusIP(request)
    if (ipBlock) return ipBlock

    // 2. Rate limit
    const rateLimitResponse = checkAdminRateLimit(request)
    if (rateLimitResponse) return rateLimitResponse

    // 3. Wrap in request ID context
    return withRequestId(async () => {
      try {
        const adminCtx = await requirePlatformAdmin(request)
        const { ip, userAgent } = extractRequestMeta(request)
        const requestId = getRequestId()
        const params = routeContext?.params ? await routeContext.params : {}

        return await handler(request, {
          adminCtx,
          ip,
          userAgent,
          requestId,
          params,
        })
      } catch (err) {
        if (err instanceof PlatformAdminError) {
          return NextResponse.json({ error: err.message }, { status: err.status })
        }
        return NextResponse.json(
          { error: 'An unexpected error occurred.' },
          { status: 500 },
        )
      }
    })
  }
}
