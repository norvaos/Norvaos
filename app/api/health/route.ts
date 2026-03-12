import { NextResponse } from 'next/server'
import { APP_VERSION, BUILD_SHA, BUILD_TIME } from '@/lib/config/version'
import { withTiming } from '@/lib/middleware/request-timing'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Health check endpoint.
 *
 * Returns 200 with basic app metadata. Used by uptime monitors,
 * load balancers, and deployment smoke tests.
 *
 * Includes a lightweight DB connectivity check (SELECT 1) so load balancers
 * and uptime monitors can detect Supabase connectivity issues.
 *
 * GET /api/health
 */
async function handleGet() {
  let dbStatus: 'ok' | 'error' = 'ok'
  let dbLatencyMs: number | null = null

  try {
    const admin = createAdminClient()
    const start = performance.now()
    const { error } = await admin.from('tenants').select('id').limit(1)
    dbLatencyMs = Math.round(performance.now() - start)
    if (error) dbStatus = 'error'
  } catch {
    dbStatus = 'error'
  }

  const overallStatus = dbStatus === 'ok' ? 'ok' : 'degraded'
  const httpStatus = dbStatus === 'ok' ? 200 : 503

  return NextResponse.json(
    {
      status: overallStatus,
      version: APP_VERSION,
      sha: BUILD_SHA,
      buildTime: BUILD_TIME,
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV ?? 'unknown',
      checks: {
        database: { status: dbStatus, latency_ms: dbLatencyMs },
      },
    },
    {
      status: httpStatus,
      headers: {
        'Cache-Control': 'no-store',
      },
    }
  )
}

export const GET = withTiming(handleGet, 'GET /api/health')
