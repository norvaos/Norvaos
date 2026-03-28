/**
 * Higher-order function that wraps platform-admin API route handlers.
 *
 * Eliminates the rate-limit / auth / error-catch boilerplate from every
 * `/api/admin/*` route. The handler receives a pre-authenticated context
 * with all the standard request metadata.
 *
 * Usage:
 *   export const GET = withPlatformAdmin(async (request, ctx) => {
 *     const tenantId = ctx.params.id
 *     // ... business logic only  -  auth, rate-limit, error handling all handled
 *     return NextResponse.json({ data: ... })
 *   })
 */

import { NextResponse } from 'next/server'
import {
  requirePlatformAdmin,
  checkAdminRateLimit,
  extractRequestMeta,
  PlatformAdminError,
  type PlatformAdminContext,
} from '@/lib/services/platform-admin'
import { withRequestId, getRequestId } from '@/lib/utils/request-id'

export interface AdminRouteContext {
  /** Authenticated platform-admin context (adminId, authMethod) */
  adminCtx: PlatformAdminContext
  /** Client IP (from x-forwarded-for / x-real-ip) */
  ip: string | null
  /** Client user-agent */
  userAgent: string | null
  /** Unique request ID for log correlation */
  requestId: string
  /** Resolved route params (e.g. { id: '...', userId: '...' }) */
  params: Record<string, string>
}

type AdminRouteHandler = (
  request: Request,
  ctx: AdminRouteContext,
) => Promise<NextResponse>

/**
 * Wrap a platform-admin route handler with:
 *   1. Rate limiting (30 req/min per IP)
 *   2. Request ID context (withRequestId)
 *   3. requirePlatformAdmin() auth (dual: Bearer + session)
 *   4. Request meta extraction (ip, userAgent, requestId)
 *   5. Route params resolution (await params promise)
 *   6. PlatformAdminError catch → 403 JSON
 *   7. Generic error catch → 500 JSON
 */
export function withPlatformAdmin(handler: AdminRouteHandler) {
  return async function wrappedHandler(
    request: Request,
    routeContext?: { params?: Promise<Record<string, string>> },
  ): Promise<NextResponse | Response> {
    // 1. Rate limit  -  before any auth to prevent DoS
    const rateLimitResponse = await checkAdminRateLimit(request)
    if (rateLimitResponse) return rateLimitResponse

    // 2. Wrap in request ID context for log correlation
    return withRequestId(async () => {
      try {
        // 3. Authenticate  -  throws PlatformAdminError(403) on failure
        const adminCtx = await requirePlatformAdmin(request)

        // 4. Extract request metadata for audit logging
        const { ip, userAgent } = extractRequestMeta(request)
        const requestId = getRequestId()

        // 5. Resolve route params (Next.js App Router params are async)
        const params = routeContext?.params ? await routeContext.params : {}

        // 6. Call the actual handler with full context
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
