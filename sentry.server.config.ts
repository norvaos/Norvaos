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

    // Performance: 20% of server-side transactions
    tracesSampleRate: 0.2,
  })
}
