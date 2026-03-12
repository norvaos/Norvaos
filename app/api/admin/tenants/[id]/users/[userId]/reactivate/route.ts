import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { withPlatformAdmin } from '@/lib/services/with-platform-admin'
import { logPlatformAdminAudit } from '@/lib/services/platform-admin-audit'
import { checkSeatLimit, seatLimitResponse } from '@/lib/services/seat-limit'
import { withTiming } from '@/lib/middleware/request-timing'

/**
 * POST /api/admin/tenants/[id]/users/[userId]/reactivate
 *
 * Platform-admin ONLY — reactivate a deactivated user (sets is_active = true).
 * Pre-checks seat limit before reactivation.
 *
 * Body: { reason: string }
 */
const handlePost = withPlatformAdmin(async (request, { params, adminCtx, ip, userAgent, requestId }) => {
  const tenantId = params.id
  const userId = params.userId

  const body = await request.json()
  const reason = body.reason as string

  if (typeof reason !== 'string' || reason.trim().length < 5) {
    return NextResponse.json(
      { error: 'reason is required and must be at least 5 characters.' },
      { status: 400 }
    )
  }

  const admin = createAdminClient()

  // ── Verify user exists and belongs to tenant ──
  const { data: user, error: userErr } = await admin
    .from('users')
    .select('id, email, is_active')
    .eq('id', userId)
    .eq('tenant_id', tenantId)
    .single()

  if (userErr || !user) {
    return NextResponse.json({ error: 'User not found in this tenant.' }, { status: 404 })
  }

  if (user.is_active) {
    return NextResponse.json({
      data: { user_id: userId, is_active: true, changed: false },
      error: null,
    })
  }

  // ── Seat-limit pre-check ──
  const seatCheck = await checkSeatLimit(tenantId)
  if (!seatCheck.allowed) {
    return seatLimitResponse(seatCheck)
  }

  // ── Reactivate ──
  const { error: updateErr } = await admin
    .from('users')
    .update({ is_active: true })
    .eq('id', userId)
    .eq('tenant_id', tenantId)

  if (updateErr) {
    return NextResponse.json(
      { error: `Failed to reactivate user: ${updateErr.message}` },
      { status: 500 }
    )
  }

  logPlatformAdminAudit({
    admin_id: adminCtx.adminId,
    action: 'user_reactivated',
    target_type: 'user',
    target_id: userId,
    tenant_id: tenantId,
    changes: { email: user.email, is_active: { before: false, after: true } },
    reason: reason.trim(),
    ip,
    user_agent: userAgent,
    request_id: requestId,
  })

  return NextResponse.json({
    data: { user_id: userId, is_active: true, changed: true },
    error: null,
  })
})

export const POST = withTiming(handlePost, 'POST /api/admin/tenants/[id]/users/[userId]/reactivate')
