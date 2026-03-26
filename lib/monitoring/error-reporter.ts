/**
 * Structured error reporting abstraction — Directive 008: System-Wide Telemetry
 *
 * Reports to Sentry when NEXT_PUBLIC_SENTRY_DSN is configured, and
 * always logs to stdout as structured JSON for local observability.
 * Safe to call anywhere — never throws, never blocks the request path.
 *
 * Directive 008 additions:
 *   - reportRLSViolation() — captures RLS policy failures
 *   - reportConflictFailure() — captures conflict engine errors
 *   - reportTrustError() — captures trust accounting anomalies
 *   - reportComplianceViolation() — captures PIPEDA/region violations
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

    console.error(JSON.stringify(entry))

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

    Sentry.captureMessage(message, {
      level: 'warning',
      extra: context as Record<string, unknown>,
    })
  } catch {
    // Logging must never break the request path
  }
}

// ─── Directive 008: Domain-Specific Reporters ─────────────────────────────

/**
 * Report an RLS violation (PostgreSQL 42501 or tenant isolation breach).
 * Tagged as `rls_violation` in Sentry for dashboard filtering.
 */
export function reportRLSViolation(
  error: unknown,
  context: ErrorContext & { tableName?: string; recordId?: string },
): void {
  try {
    const entry = {
      event: 'rls_violation',
      message: error instanceof Error ? error.message : String(error),
      ...context,
      timestamp: new Date().toISOString(),
    }

    console.error(JSON.stringify(entry))

    Sentry.withScope((scope) => {
      scope.setTag('norva_category', 'rls_violation')
      scope.setLevel('error')
      scope.setExtra('tableName', context.tableName)
      scope.setExtra('recordId', context.recordId)
      Sentry.captureException(
        error instanceof Error ? error : new Error(String(error)),
        { extra: context as Record<string, unknown> },
      )
    })
  } catch {
    // Never break request path
  }
}

/**
 * Report a conflict check failure.
 * Tagged as `conflict_check` in Sentry.
 */
export function reportConflictFailure(
  error: unknown,
  context: ErrorContext & { contactId?: string; scanId?: string },
): void {
  try {
    const entry = {
      event: 'conflict_check_failure',
      message: error instanceof Error ? error.message : String(error),
      ...context,
      timestamp: new Date().toISOString(),
    }

    console.error(JSON.stringify(entry))

    Sentry.withScope((scope) => {
      scope.setTag('norva_category', 'conflict_check')
      scope.setLevel('error')
      scope.setExtra('contactId', context.contactId)
      scope.setExtra('scanId', context.scanId)
      Sentry.captureException(
        error instanceof Error ? error : new Error(String(error)),
        { extra: context as Record<string, unknown> },
      )
    })
  } catch {
    // Never break request path
  }
}

/**
 * Report a trust accounting error.
 * Tagged as `trust_accounting` in Sentry with FATAL level.
 */
export function reportTrustError(
  error: unknown,
  context: ErrorContext & { transactionId?: string; matterId?: string; amountCents?: number },
): void {
  try {
    const entry = {
      event: 'trust_accounting_error',
      message: error instanceof Error ? error.message : String(error),
      ...context,
      timestamp: new Date().toISOString(),
    }

    console.error(JSON.stringify(entry))

    Sentry.withScope((scope) => {
      scope.setTag('norva_category', 'trust_accounting')
      scope.setLevel('fatal')
      scope.setExtra('transactionId', context.transactionId)
      scope.setExtra('matterId', context.matterId)
      scope.setExtra('amountCents', context.amountCents)
      Sentry.captureException(
        error instanceof Error ? error : new Error(String(error)),
        { extra: context as Record<string, unknown> },
      )
    })
  } catch {
    // Never break request path
  }
}

/**
 * Report a compliance/sovereignty violation.
 * Tagged as `compliance_violation` in Sentry with FATAL level.
 */
export function reportComplianceViolation(
  message: string,
  context: ErrorContext & { detectedRegion?: string; sourceCountry?: string },
): void {
  try {
    const entry = {
      event: 'compliance_violation',
      message,
      ...context,
      timestamp: new Date().toISOString(),
    }

    console.error(JSON.stringify(entry))

    Sentry.withScope((scope) => {
      scope.setTag('norva_category', 'compliance_violation')
      scope.setLevel('fatal')
      scope.setExtra('detectedRegion', context.detectedRegion)
      scope.setExtra('sourceCountry', context.sourceCountry)
      Sentry.captureMessage(message, { level: 'fatal' })
    })
  } catch {
    // Never break request path
  }
}
