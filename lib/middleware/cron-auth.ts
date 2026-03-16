import { NextResponse } from 'next/server'
import { log } from '@/lib/utils/logger'

/**
 * Authenticate a cron job request using CRON_SECRET bearer token.
 * In development (no CRON_SECRET set), allows all requests.
 * Returns null if authenticated, or a 401 NextResponse if not.
 */
export function verifyCronAuth(request: Request): NextResponse | null {
  return authenticateCron(request, 'unknown')
}

export function authenticateCron(request: Request, cronName: string): NextResponse | null {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    log.warn('[cron] CRON_SECRET not set — allowing request in development', { cron_name: cronName })
    return null
  }
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${cronSecret}`) {
    log.error('[cron] Unauthorized cron request', { cron_name: cronName })
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return null
}
