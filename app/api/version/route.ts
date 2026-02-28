import { NextResponse } from 'next/server'
import { getVersionInfo } from '@/lib/config/version'

/**
 * GET /api/version
 * Public health-check / version endpoint
 * Returns the current app version, build SHA, and environment
 */
export async function GET() {
  const info = getVersionInfo()

  return NextResponse.json({
    status: 'ok',
    ...info,
  })
}
