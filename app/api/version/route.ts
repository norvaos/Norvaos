import { NextResponse } from 'next/server'
import { getVersionInfo } from '@/lib/config/version'
import { withTiming } from '@/lib/middleware/request-timing'

/**
 * GET /api/version
 * Public health-check / version endpoint
 * Returns the current app version, build SHA, and environment
 */
async function handleGet() {
  const info = getVersionInfo()

  return NextResponse.json({
    status: 'ok',
    ...info,
  })
}

export const GET = withTiming(handleGet, 'GET /api/version')
