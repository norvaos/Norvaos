import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import { createAdminClient } from '@/lib/supabase/admin'
import { withTiming } from '@/lib/middleware/request-timing'
import { log } from '@/lib/utils/logger'
import { logAuditServer } from '@/lib/queries/audit-logs'

/**
 * POST /api/settings/users/[userId]/deactivate
 *
 * Deactivates a user by setting is_active = false.
 * Requires settings:edit permission.
 *
 * Guards:
 * - Cannot deactivate yourself
 * - Cannot deactivate the last active Admin in the tenant
 */
async function handlePost(
  _request: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const { userId } = await params
    const auth = await authenticateRequest()
    requirePermission(auth, 'settings', 'edit')

    // Cannot deactivate yourself
    if (userId === auth.userId) {
      return NextResponse.json(
        { error: 'You cannot deactivate your own account.' },
        { status: 400 }
      )
    }

    const admin = createAdminClient()

    // Verify target user belongs to this tenant and is currently active
    const { data: targetUser, error: findErr } = await admin
      .from('users')
      .select('id, email, is_active, role_id')
      .eq('id', userId)
      .eq('tenant_id', auth.tenantId)
      .single()

    if (findErr || !targetUser) {
      return NextResponse.json({ error: 'User not found.' }, { status: 404 })
    }

    if (!targetUser.is_active) {
      return NextResponse.json(
        { error: 'User is already deactivated.' },
        { status: 400 }
      )
    }

    // Guard: cannot remove the last active Admin
    if (targetUser.role_id) {
      const { data: roleRow } = await admin
        .from('roles')
        .select('name')
        .eq('id', targetUser.role_id)
        .eq('tenant_id', auth.tenantId)
        .single()

      if (roleRow?.name === 'Admin') {
        const { count } = await admin
          .from('users')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', auth.tenantId)
          .eq('is_active', true)
          .eq('role_id', targetUser.role_id)

        if ((count ?? 0) <= 1) {
          return NextResponse.json(
            { error: 'Cannot deactivate the last active Admin in the tenant.' },
            { status: 400 }
          )
        }
      }
    }

    // Deactivate
    const { error: updateErr } = await admin
      .from('users')
      .update({ is_active: false })
      .eq('id', userId)
      .eq('tenant_id', auth.tenantId)

    if (updateErr) {
      log.error('[deactivate-user] Failed to deactivate user', { error_code: updateErr.code })
      return NextResponse.json({ error: 'Failed to deactivate user.' }, { status: 500 })
    }

    await logAuditServer({
      supabase: auth.supabase,
      tenantId: auth.tenantId,
      userId: auth.userId,
      entityType: 'user',
      entityId: userId,
      action: 'user_deactivated',
      changes: { is_active: { from: true, to: false }, email: targetUser.email },
    })

    log.info('[deactivate-user] User deactivated', {
      tenant_id: auth.tenantId,
      target_user_id: userId,
    })

    return NextResponse.json({ error: null })
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    return NextResponse.json({ error: 'An unexpected error occurred.' }, { status: 500 })
  }
}

export const POST = withTiming(handlePost, 'POST /api/settings/users/[userId]/deactivate')
