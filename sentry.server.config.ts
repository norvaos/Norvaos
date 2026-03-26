import * as Sentry from '@sentry/nextjs'

/**
 * Sentry Server Configuration  -  Directive 008: System-Wide Telemetry
 *
 * Captures:
 *   - All 500 errors with full stack traces
 *   - RLS violations (PostgreSQL error code 42501)
 *   - Conflict check failures
 *   - Trust accounting errors
 *   - SENTINEL security events
 *
 * No silent failures. If the app glitches, we know before the user does.
 */

function deriveEnvironment(): string {
  const url = process.env.NEXT_PUBLIC_APP_URL || ''
  if (url.includes('localhost') || url.includes('127.0.0.1')) return 'development'
  if (url.includes('staging') || url.includes('preview')) return 'staging'
  return 'production'
}

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN

if (dsn) {
  Sentry.init({
    dsn,
    environment: deriveEnvironment(),
    release: process.env.NEXT_PUBLIC_BUILD_SHA || undefined,

    // Performance: 20% of server-side transactions
    tracesSampleRate: 0.2,

    // Directive 008: Classify and tag events for zero-silent-failure monitoring
    beforeSend(event, hint) {
      const error = hint?.originalException

      // Tag RLS violations (PostgreSQL 42501  -  insufficient_privilege)
      if (error instanceof Error) {
        const msg = error.message || ''

        if (msg.includes('42501') || msg.includes('insufficient_privilege') || msg.includes('row-level security')) {
          event.tags = { ...event.tags, norva_category: 'rls_violation' }
          event.level = 'error'
          event.fingerprint = ['rls-violation', msg.slice(0, 100)]
        }

        // Tag trust accounting errors
        if (msg.includes('trust') && (msg.includes('ledger') || msg.includes('balance') || msg.includes('immutable'))) {
          event.tags = { ...event.tags, norva_category: 'trust_accounting' }
          event.level = 'fatal'
        }

        // Tag conflict check failures
        if (msg.includes('conflict') && (msg.includes('scan') || msg.includes('engine'))) {
          event.tags = { ...event.tags, norva_category: 'conflict_check' }
          event.level = 'error'
        }

        // Tag compliance errors
        if (msg.includes('CRITICAL_COMPLIANCE_ERROR') || msg.includes('PIPEDA')) {
          event.tags = { ...event.tags, norva_category: 'compliance_violation' }
          event.level = 'fatal'
        }

        // Tag SENTINEL events
        if (msg.includes('SENTINEL') || msg.includes('sentinel')) {
          event.tags = { ...event.tags, norva_category: 'sentinel_security' }
        }

        // Tag immutability violations
        if (msg.includes('IMMUTABLE_VIOLATION') || msg.includes('immutable')) {
          event.tags = { ...event.tags, norva_category: 'immutability_violation' }
          event.level = 'fatal'
        }
      }

      return event
    },
  })
}
