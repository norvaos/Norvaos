/**
 * Structured error reporting abstraction.
 *
 * Reports to Sentry when NEXT_PUBLIC_SENTRY_DSN is configured, and
 * always logs to stdout as structured JSON for local observability.
 * Safe to call anywhere — never throws, never blocks the request path.
 */

import * as Sentry from '@sentry/nextjs'

export interface ErrorContext {
  userId?: string
  tenantId?: string
  route?: string
  action?: string
  metadata?: Record<string, unknown>
}

/**
 * Report an error with structured context.
 *
 * Safe to call anywhere — never throws, never blocks the request path.
 */
export function reportError(error: unknown, context?: ErrorContext): void {
  try {
    const entry = {
      event: 'error',
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack?.split('\n').slice(0, 5) : undefined,
      ...context,
      timestamp: new Date().toISOString(),
    }

    // Structured JSON log — consumed by observability dashboards
    console.error(JSON.stringify(entry))

    // Forward to Sentry (no-op if DSN is not configured)
    Sentry.captureException(error instanceof Error ? error : new Error(String(error)), {
      extra: context as Record<string, unknown>,
    })
  } catch {
    // Logging must never break the request path
  }
}

/**
 * Report a warning-level event (not an error, but worth noting).
 */
export function reportWarning(message: string, context?: ErrorContext): void {
  try {
    const entry = {
      event: 'warning',
      message,
      ...context,
      timestamp: new Date().toISOString(),
    }

    console.warn(JSON.stringify(entry))

    // Forward to Sentry (no-op if DSN is not configured)
    Sentry.captureMessage(message, {
      level: 'warning',
      extra: context as Record<string, unknown>,
    })
  } catch {
    // Logging must never break the request path
  }
}
