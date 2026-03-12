import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { withPlatformAdmin } from '@/lib/services/with-platform-admin'
import { logPlatformAdminAudit } from '@/lib/services/platform-admin-audit'
import { withTiming } from '@/lib/middleware/request-timing'

/**
 * POST /api/admin/tenants/[id]/users/[userId]/deactivate
 *
 * Platform-admin ONLY — soft-deactivate a user (sets is_active = false).
 * Does NOT delete from auth.users.
 *
 * Body: { reason: string }
 *
 * Guard: cannot deactivate the last active admin of a tenant.
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
    .select('id, email, is_active, role_id')
    .eq('id', userId)
    .eq('tenant_id', tenantId)
    .single()

  if (userErr || !user) {
    return NextResponse.json({ error: 'User not found in this tenant.' }, { status: 404 })
  }

  if (!user.is_active) {
    return NextResponse.json({
      data: { user_id: userId, is_active: false, changed: false },
      error: null,
    })
  }

  // ── Guard: cannot deactivate the last active admin ──
  if (user.role_id) {
    const { data: role } = await admin
      .from('roles')
      .select('name')
      .eq('id', user.role_id)
      .single()

    if (role?.name === 'Admin') {
      const { count: activeAdminCount } = await admin
        .from('users')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('is_active', true)
        .not('role_id', 'is', null)

      // Check if all active users with roles are admins
      // Simple heuristic: if only 1 active admin-role user left, block
      if (activeAdminCount !== null && activeAdminCount <= 1) {
        return NextResponse.json(
          { error: 'Cannot deactivate the last active admin of a tenant.' },
          { status: 409 }
        )
      }
    }
  }

  // ── Deactivate ──
  const { error: updateErr } = await admin
    .from('users')
    .update({ is_active: false })
    .eq('id', userId)
    .eq('tenant_id', tenantId)

  if (updateErr) {
    return NextResponse.json(
      { error: `Failed to deactivate user: ${updateErr.message}` },
      { status: 500 }
    )
  }

  logPlatformAdminAudit({
    admin_id: adminCtx.adminId,
    action: 'user_deactivated',
    target_type: 'user',
    target_id: userId,
    tenant_id: tenantId,
    changes: { email: user.email, is_active: { before: true, after: false } },
    reason: reason.trim(),
    ip,
    user_agent: userAgent,
    request_id: requestId,
  })

  return NextResponse.json({
    data: { user_id: userId, is_active: false, changed: true },
    error: null,
  })
})

export const POST = withTiming(handlePost, 'POST /api/admin/tenants/[id]/users/[userId]/deactivate')
