/**
 * SENTINEL API Guard  -  Defense-in-depth tenant isolation at the API layer.
 *
 * Wraps route handlers to intercept any Supabase errors that indicate
 * a cross-tenant access attempt (PostgreSQL error code 42501) and
 * convert them to structured 403 responses.
 *
 * Also provides a utility to validate that request body tenant_id values
 * match the authenticated user's tenant.
 */

import { NextResponse } from 'next/server'
import { AuthError } from '@/lib/services/auth'
import { logSentinelEvent } from '@/lib/services/sentinel-audit'
import { reportRLSViolation, reportError } from '@/lib/monitoring/error-reporter'

// PostgreSQL error code for insufficient_privilege (used by our SENTINEL triggers)
const PG_INSUFFICIENT_PRIVILEGE = '42501'

interface PostgrestError {
  code?: string
  message?: string
  details?: string
}

/**
 * Wrap a route handler with SENTINEL tenant isolation enforcement.
 * Catches PostgreSQL 42501 errors (from our DB triggers) and converts
 * them to structured 403 JSON responses.
 */
export function withSentinelGuard(
  handler: (request: Request, context: unknown) => Promise<NextResponse>,
  routeLabel: string,
) {
  return async (request: Request, context: unknown): Promise<NextResponse> => {
    try {
      return await handler(request, context)
    } catch (error: unknown) {
      // Check for PostgreSQL insufficient_privilege from our triggers
      if (isTenantViolationError(error)) {
        const message = extractMessage(error)

        // Fire-and-forget audit log
        logSentinelEvent({
          eventType: 'TENANT_VIOLATION',
          severity: 'critical',
          details: {
            route: routeLabel,
            error_message: message,
            request_method: request.method,
            request_url: request.url,
          },
        }).catch(() => {})

        // Directive 008: Report to Sentry with full context
        reportRLSViolation(error, {
          route: routeLabel,
          action: 'tenant_violation',
          metadata: { request_method: request.method },
        })

        return NextResponse.json(
          {
            code: 'SENTINEL_TENANT_VIOLATION',
            message: 'Access denied: cross-tenant access is not permitted.',
            details: message,
          },
          { status: 403 },
        )
      }

      // Re-throw AuthErrors for normal handling
      if (error instanceof AuthError) {
        return NextResponse.json(
          { error: error.message },
          { status: error.status },
        )
      }

      // Unknown error  -  don't leak details
      console.error(`[SENTINEL][${routeLabel}] Unhandled error:`, error)

      // Directive 008: Every 500 error captured with full stack trace
      reportError(error, { route: routeLabel, action: 'unhandled_500' })

      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 },
      )
    }
  }
}

/**
 * Validate that a tenant_id in request body matches the authenticated user's tenant.
 * Throws AuthError (403) on mismatch.
 */
export function assertBodyTenantMatch(
  bodyTenantId: string | undefined | null,
  authTenantId: string,
  context: string,
): void {
  if (bodyTenantId && bodyTenantId !== authTenantId) {
    throw new AuthError(
      `SENTINEL-403: Request body tenant_id mismatch in ${context}. ` +
      `Expected: ${authTenantId}, Got: ${bodyTenantId}`,
      403,
    )
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function isTenantViolationError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false

  // Supabase PostgREST error
  const pgError = error as PostgrestError
  if (pgError.code === PG_INSUFFICIENT_PRIVILEGE) return true

  // Nested error from Supabase client
  if ('error' in error) {
    const nested = (error as { error: PostgrestError }).error
    if (nested?.code === PG_INSUFFICIENT_PRIVILEGE) return true
  }

  // Check message for our SENTINEL prefix
  const msg = pgError.message ?? ''
  if (msg.includes('SENTINEL-403')) return true

  return false
}

function extractMessage(error: unknown): string {
  if (!error || typeof error !== 'object') return 'Unknown error'
  const pgError = error as PostgrestError
  return pgError.message ?? pgError.details ?? 'Cross-tenant access violation'
}
