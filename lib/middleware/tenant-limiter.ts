/**
 * Per-tenant concurrency limiter backed by Redis.
 *
 * Uses a sliding-window counter per (tenant, route) pair.
 * When Redis is not configured, all requests are allowed (pass-through).
 *
 * Scale Fix Pack v1: prevents a single tenant from monopolizing
 * shared resources (PDF generation, document upload, etc.)
 */

import { incr, expire, cacheKey, isRedisEnabled } from '@/lib/services/cache'
import { log } from '@/lib/utils/logger'

interface RouteLimit {
  /** Maximum requests allowed in the window */
  maxRequests: number
  /** Window size in seconds */
  windowSeconds: number
}

const ROUTE_LIMITS: Record<string, RouteLimit> = {
  'invoices/pdf':       { maxRequests: 3, windowSeconds: 60 },
  'reports/export':     { maxRequests: 2, windowSeconds: 60 },
  'documents/upload':   { maxRequests: 10, windowSeconds: 60 },
  'documents/review':   { maxRequests: 10, windowSeconds: 60 },
  'ircc/generate-pdf':  { maxRequests: 2, windowSeconds: 60 },
}

export interface LimitResult {
  allowed: boolean
  remaining: number
  retryAfterSeconds: number
}

/**
 * Check if a tenant has exceeded their rate limit for a given route.
 *
 * @param tenantId - The tenant's UUID
 * @param routeKey - One of the keys in ROUTE_LIMITS (e.g. 'invoices/pdf')
 * @returns LimitResult  -  allowed: true if request can proceed
 */
export async function checkTenantLimit(
  tenantId: string,
  routeKey: string
): Promise<LimitResult> {
  // Pass-through when Redis is not configured
  if (!isRedisEnabled()) {
    return { allowed: true, remaining: Infinity, retryAfterSeconds: 0 }
  }

  const config = ROUTE_LIMITS[routeKey]
  if (!config) {
    // No limit defined for this route  -  allow
    return { allowed: true, remaining: Infinity, retryAfterSeconds: 0 }
  }

  const key = cacheKey(tenantId, 'limit', routeKey)

  try {
    const count = await incr(key)

    // Set TTL on first increment (new window)
    if (count === 1) {
      await expire(key, config.windowSeconds)
    }

    if (count > config.maxRequests) {
      log.warn('Rate limit exceeded', {
        tenant_id: tenantId,
        route: routeKey,
        error_code: 'RATE_LIMIT_EXCEEDED',
        current_count: count,
        max_requests: config.maxRequests,
        window_seconds: config.windowSeconds,
      })

      return {
        allowed: false,
        remaining: 0,
        retryAfterSeconds: config.windowSeconds,
      }
    }

    return {
      allowed: true,
      remaining: config.maxRequests - count,
      retryAfterSeconds: 0,
    }
  } catch {
    // Redis failure = allow request (fail-open for availability)
    return { allowed: true, remaining: Infinity, retryAfterSeconds: 0 }
  }
}

/**
 * Helper to build a 429 Response when rate limited.
 */
export function rateLimitResponse(result: LimitResult): Response {
  return Response.json(
    { error: 'Too many requests. Please try again later.' },
    {
      status: 429,
      headers: {
        'Retry-After': String(result.retryAfterSeconds),
      },
    }
  )
}
