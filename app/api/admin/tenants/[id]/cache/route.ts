import { NextResponse } from 'next/server'
import { withPlatformAdmin } from '@/lib/services/with-platform-admin'
import { logPlatformAdminAudit } from '@/lib/services/platform-admin-audit'
import { prefixDel, cacheKey, isRedisEnabled } from '@/lib/services/cache'
import { withTiming } from '@/lib/middleware/request-timing'

/**
 * POST /api/admin/tenants/[id]/cache
 *
 * Platform-admin ONLY  -  purge all cached data for a tenant.
 *
 * Body: { reason: string }
 */
const handlePost = withPlatformAdmin(async (request, { params, adminCtx, ip, userAgent, requestId }) => {
  const tenantId = params.id

  const body = await request.json()
  const reason = body.reason as string

  if (typeof reason !== 'string' || reason.trim().length < 5) {
    return NextResponse.json(
      { error: 'reason is required and must be at least 5 characters.' },
      { status: 400 }
    )
  }

  if (!isRedisEnabled()) {
    return NextResponse.json({
      data: { tenant_id: tenantId, purged: false, message: 'Redis not enabled  -  no cache to purge.' },
      error: null,
    })
  }

  // Purge all keys for this tenant
  const pattern = cacheKey(tenantId, '*')
  await prefixDel(pattern)

  logPlatformAdminAudit({
    admin_id: adminCtx.adminId,
    action: 'cache_purged',
    target_type: 'tenant',
    target_id: tenantId,
    tenant_id: tenantId,
    changes: { pattern },
    reason: reason.trim(),
    ip,
    user_agent: userAgent,
    request_id: requestId,
  })

  return NextResponse.json({
    data: { tenant_id: tenantId, purged: true, pattern },
    error: null,
  })
})

export const POST = withTiming(handlePost, 'POST /api/admin/tenants/[id]/cache')
