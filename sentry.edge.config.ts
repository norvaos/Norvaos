import * as Sentry from '@sentry/nextjs'

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN

if (dsn) {
  Sentry.init({
    dsn,
    environment: (() => {
      const url = process.env.NEXT_PUBLIC_APP_URL || ''
      if (url.includes('localhost') || url.includes('127.0.0.1')) return 'development'
      if (url.includes('staging') || url.includes('preview')) return 'staging'
      return 'production'
    })(),
    release: process.env.NEXT_PUBLIC_BUILD_SHA || undefined,

    // Minimal config for edge runtime
    tracesSampleRate: 0.1,
  })
}
