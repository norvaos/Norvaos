/**
 * Request timing middleware for API route handlers.
 *
 * Phase 7 Fix 7: Enhanced to log request_id, status, route, and duration_ms
 * on every request. Sets X-Response-Time and X-Request-Id headers.
 *
 * Phase 8: Added db_calls_count instrumentation. Use incrementDbCalls() from
 * any server-side code to count Supabase round-trips per request.
 *
 * Usage:
 *   import { withTiming } from '@/lib/middleware/request-timing'
 *
 *   async function handlePost(request: Request): Promise<NextResponse> { ... }
 *   export const POST = withTiming(handlePost, 'POST /api/actions/[actionType]')
 */

import { log } from '@/lib/utils/logger'
import { NextResponse } from 'next/server'
import { AsyncLocalStorage } from 'node:async_hooks'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RouteHandler = (...args: any[]) => Promise<Response | NextResponse>

// ─── DB Call Counter (request-scoped) ────────────────────────────────────────
// AsyncLocalStorage holds a counter per request. Incremented by instrumenting
// the admin client or any Supabase .from() call.

interface RequestMetrics {
  dbCalls: number
}

const metricsStore = new AsyncLocalStorage<RequestMetrics>()

/** Increment the DB call counter for the current request. */
export function incrementDbCalls(count = 1): void {
  const metrics = metricsStore.getStore()
  if (metrics) {
    metrics.dbCalls += count
  }
}

/** Get current request's DB call count (for testing/inspection). */
export function getDbCallCount(): number {
  return metricsStore.getStore()?.dbCalls ?? 0
}

/**
 * Wrap a route handler with performance timing and request correlation.
 *
 * Logs structured JSON with: route, duration_ms, status, request_id, db_calls
 * Sets response headers: X-Response-Time, X-Request-Id, X-DB-Calls
 */
export function withTiming<T extends RouteHandler>(
  handler: T,
  routeName: string,
): T {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const wrapped = async (...args: any[]) => {
    const requestId = crypto.randomUUID()
    const start = performance.now()

    // Run handler within metrics scope
    return metricsStore.run({ dbCalls: 0 }, async () => {
      try {
        const response = await handler(...args)
        const duration = Math.round(performance.now() - start)
        const dbCalls = metricsStore.getStore()?.dbCalls ?? 0

        log.info(`[api] ${routeName}`, {
          route: routeName,
          duration_ms: duration,
          status: response.status,
          request_id: requestId,
          db_calls: dbCalls,
        })

        // Set timing + correlation headers
        if (response instanceof NextResponse) {
          response.headers.set('X-Response-Time', `${duration}ms`)
          response.headers.set('X-Request-Id', requestId)
          response.headers.set('X-DB-Calls', String(dbCalls))
        }

        return response
      } catch (err) {
        const duration = Math.round(performance.now() - start)
        const dbCalls = metricsStore.getStore()?.dbCalls ?? 0
        log.error(`[api] ${routeName} failed`, {
          route: routeName,
          duration_ms: duration,
          status: 500,
          request_id: requestId,
          db_calls: dbCalls,
          error_message: err instanceof Error ? err.message : 'Unknown',
        })
        throw err
      }
    })
  }

  return wrapped as T
}
