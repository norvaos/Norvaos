/**
 * Internal API: Sovereignty event logging  -  Directive 004, Pillar 3
 *
 * POST-only endpoint called from Edge middleware (fire-and-forget)
 * to log PIPEDA data sovereignty check results.
 *
 * Auth: X-Internal-Secret header must match CRON_SECRET.
 */

import { NextResponse } from 'next/server'
import { logSovereigntyEvent } from '@/lib/services/data-sovereignty'

export async function POST(request: Request) {
  // Validate internal secret
  const secret = request.headers.get('x-internal-secret')
  const expected = process.env.CRON_SECRET

  if (!expected || secret !== expected) {
    return NextResponse.json(
      { error: 'Unauthorised' },
      { status: 401 },
    )
  }

  try {
    const body = await request.json()

    await logSovereigntyEvent({
      sourceIp: body.sourceIp ?? null,
      sourceCountry: body.sourceCountry ?? null,
      sourceRegion: body.sourceRegion ?? null,
      requestPath: body.requestPath ?? '',
      requestMethod: body.requestMethod ?? 'GET',
      allowed: body.allowed ?? false,
      blockReason: body.blockReason ?? null,
      userId: body.userId ?? null,
      tenantId: body.tenantId ?? null,
    })

    return NextResponse.json({ ok: true }, { status: 200 })
  } catch (err) {
    console.error('[SovereigntyLog] Failed to process log request:', err)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    )
  }
}
