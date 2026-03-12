/**
 * Structured error reporting abstraction.
 *
 * Currently logs to stdout as structured JSON. Drop-in replacement
 * for Sentry, Datadog, etc — swap the implementation here, zero
 * call-site changes required.
 */

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
  } catch {
    // Logging must never break the request path
  }
}
