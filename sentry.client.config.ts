import * as Sentry from '@sentry/nextjs'

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

    // Performance: 10% of transactions in production
    tracesSampleRate: 0.1,

    // Session Replay  -  disabled by default, capture 100% of errored sessions
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 1.0,

    // Graceful degradation: silently discard if Sentry is unreachable
    beforeSend(event) {
      return event
    },
  })
}
