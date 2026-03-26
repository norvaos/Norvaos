/**
 * GET /api/support/health
 *
 * Returns system health status for the authenticated tenant.
 * Requires: settings:view permission (admin/staff only).
 *
 * Response includes database, email, and job queue health.
 * No internal diagnostic data (stack traces, raw errors) is returned to clients.
 *
 * Team 3 / Module 4  -  Support and Implementation Tooling
 */

import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import { getSystemHealth } from '@/lib/services/support/health-service'
import { log } from '@/lib/utils/logger'

export async function GET() {
  try {
    const auth = await authenticateRequest()
    requirePermission(auth, 'settings', 'view')

    log.info('support.health.accessed', {
      tenant_id: auth.tenantId,
      user_id: auth.userId,
    })

    const health = await getSystemHealth(auth.tenantId)

    return NextResponse.json({ data: health }, { status: 200 })
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }

    log.error('support.health.unexpected_error', {
      error_message: err instanceof Error ? err.message : 'Unknown error',
    })

    // Never expose internal error details to clients
    return NextResponse.json(
      { error: 'Health check unavailable  -  check server logs.' },
      { status: 500 },
    )
  }
}
