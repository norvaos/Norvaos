/**
 * Platform-admin auth module  -  NorvaOS Super Admin Portal.
 *
 * Two auth paths:
 *   1. Bearer token (CLI / external tooling): PLATFORM_ADMIN_SECRET env var
 *   2. Session-based (portal login): auth.users → platform_admins DB table
 *
 * `checkPlatformAdmin(request)`  -  low-level Bearer token check (backward compat)
 * `requirePlatformAdmin(request)`  -  full dual-auth gate, throws on failure
 *
 * RESTRICTION: Both functions must ONLY be called from routes under /api/admin/*.
 * This is enforced by structural regression tests.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * TOKEN ROTATION RUNBOOK
 * ════════════════════════════════════════════════════════════════════════════
 *
 * The token check is a direct string-equality comparison against the
 * PLATFORM_ADMIN_SECRET env var on every request  -  no caching, no sessions.
 * Rotation is therefore immediate:
 *
 *   1. Generate a new secret:  `openssl rand -hex 32`
 *   2. Update the PLATFORM_ADMIN_SECRET env var in your deployment platform
 *      (Vercel → Settings → Environment Variables → Edit → Save).
 *   3. Redeploy (Vercel redeploys automatically on env var change; if not,
 *      trigger a redeploy manually).
 *   4. Old token stops working INSTANTLY  -  the new serverless instances read
 *      the updated env var, and the direct equality check rejects old values.
 *   5. Update all external tooling / CLI scripts with the new secret.
 *   6. Verify: call GET /api/admin/tenants with the OLD token → expect 403.
 *   7. Verify: call GET /api/admin/tenants with the NEW token → expect 200.
 *
 * There is no grace period, no dual-token window, no cached credential.
 * The check is `token === process.env.PLATFORM_ADMIN_SECRET`  -  nothing more.
 * ════════════════════════════════════════════════════════════════════════════
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { authenticateRequest } from '@/lib/services/auth'
import { log } from '@/lib/utils/logger'
import { createRateLimiter } from '@/lib/middleware/rate-limit'
import type { Json } from '@/lib/types/database'
import { checkAdminActionSpike } from '@/lib/utils/alerts'

// ── Types ────────────────────────────────────────────────────────────────────

export interface PlatformAdminResult {
  isPlatformAdmin: boolean
}

export interface PlatformAdminContext {
  isPlatformAdmin: true
  /** UUID from platform_admins table (null for Bearer token auth) */
  adminId: string | null
  authMethod: 'bearer-token' | 'session'
}

export class PlatformAdminError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = 'PlatformAdminError'
    this.status = status
  }
}

// ── Rate limiter: 30 requests per minute per IP for admin routes ──
const adminRateLimiter = createRateLimiter({ maxRequests: 30, windowMs: 60_000 })

/**
 * Check whether the incoming request carries a valid platform-admin Bearer token.
 *
 * Returns `{ isPlatformAdmin: false }` if:
 *   - PLATFORM_ADMIN_SECRET env var is not set
 *   - No Authorization header or wrong format
 *   - Token does not match
 */
export function checkPlatformAdmin(request: Request): PlatformAdminResult {
  const secret = process.env.PLATFORM_ADMIN_SECRET
  if (!secret) {
    return { isPlatformAdmin: false }
  }

  const authHeader = request.headers.get('authorization')
  if (!authHeader) {
    return { isPlatformAdmin: false }
  }

  const match = authHeader.match(/^Bearer\s+(.+)$/i)
  if (!match) {
    return { isPlatformAdmin: false }
  }

  const token = match[1]
  return { isPlatformAdmin: token === secret }
}

/**
 * Full platform-admin gate  -  supports both Bearer token AND session-based auth.
 *
 * Usage in route handlers:
 *   const adminCtx = await requirePlatformAdmin(request)
 *   // adminCtx.adminId is set for session auth, null for Bearer token
 *
 * Throws `PlatformAdminError` (status 403) on failure, logging IP + path.
 */
export async function requirePlatformAdmin(request: Request): Promise<PlatformAdminContext> {
  const { ip } = extractRequestMeta(request)
  const path = new URL(request.url).pathname

  // Path 1: Bearer token (CLI / external tooling)
  const { isPlatformAdmin } = checkPlatformAdmin(request)
  if (isPlatformAdmin) {
    return { isPlatformAdmin: true, adminId: null, authMethod: 'bearer-token' }
  }

  // Path 2: Session-based (portal login)  -  check auth.users → platform_admins
  try {
    const auth = await authenticateRequest()
    const admin = createAdminClient()
    const { data } = await admin
      .from('platform_admins')
      .select('id')
      .eq('user_id', auth.authUserId)
      .is('revoked_at', null)
      .single()

    if (data) {
      return { isPlatformAdmin: true, adminId: data.id, authMethod: 'session' }
    }
  } catch {
    // Not authenticated or not in platform_admins table  -  fall through to denial
  }

  // Denied  -  log attempt for security observability
  log.warn('[platform-admin] Unauthorized access attempt', {
    ip: ip ?? 'unknown',
    path,
  })

  throw new PlatformAdminError('Forbidden: platform-admin access required.', 403)
}

/**
 * Rate-limit check for admin routes. Returns null if allowed, or a 429 Response if denied.
 *
 * Key: IP address from x-forwarded-for or x-real-ip.
 */
export async function checkAdminRateLimit(request: Request): Promise<Response | null> {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? request.headers.get('x-real-ip')
    ?? 'unknown'

  const { allowed, retryAfterMs } = await adminRateLimiter.check(ip)
  if (!allowed) {
    return Response.json(
      { error: 'Too many requests to admin routes. Please try again later.' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil(retryAfterMs / 1000)) } }
    )
  }
  return null
}

// ── Utility for extracting IP and UA ──

export function extractRequestMeta(request: Request): { ip: string | null; userAgent: string | null } {
  return {
    ip: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      ?? request.headers.get('x-real-ip')
      ?? null,
    userAgent: request.headers.get('user-agent') ?? null,
  }
}

/**
 * Log a platform-admin action to audit_logs and activities.
 *
 * Every platform-admin mutation MUST call this. Fire-and-forget.
 */
export async function logPlatformAdminAction(params: {
  tenant_id: string
  action: string
  entity_type: string
  entity_id: string
  changes: Record<string, unknown>
  reason: string
  ip: string | null
  user_agent: string | null
  request_id?: string
}): Promise<void> {
  const {
    tenant_id,
    action,
    entity_type,
    entity_id,
    changes,
    reason,
    ip,
    user_agent,
    request_id,
  } = params

  log.info(`[platform-admin] ${action}`, {
    tenant_id,
    user_id: 'platform-admin',
    ip: ip ?? undefined,
    request_id: request_id ?? undefined,
  })

  const admin = createAdminClient()

  await Promise.allSettled([
    admin.from('audit_logs').insert({
      tenant_id,
      user_id: null,
      action,
      entity_type,
      entity_id,
      changes: changes as Json,
      metadata: {
        actor: 'platform-admin',
        reason,
        ip,
        user_agent,
        request_id: request_id ?? null,
      } as Json,
    }),

    admin.from('activities').insert({
      tenant_id,
      activity_type: action,
      title: `Platform admin: ${action}`,
      description: `${action} by platform-admin. Reason: ${reason}`,
      entity_type,
      entity_id,
      user_id: null,
      metadata: {
        actor: 'platform-admin',
        reason,
        ip,
        user_agent,
        request_id: request_id ?? null,
      } as Json,
    }),
  ])

  // ── Observability: fire-and-forget spike detection ──
  checkAdminActionSpike().catch(() => {})
}

// ── Re-export the route wrapper for convenience ──
export { withPlatformAdmin, type AdminRouteContext } from './with-platform-admin'
