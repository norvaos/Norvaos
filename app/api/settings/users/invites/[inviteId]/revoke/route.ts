import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import { createAdminClient } from '@/lib/supabase/admin'
import { withTiming } from '@/lib/middleware/request-timing'
import { log } from '@/lib/utils/logger'
import { logAuditServer } from '@/lib/queries/audit-logs'

/**
 * POST /api/settings/users/invites/[inviteId]/revoke
 *
 * Revokes a pending invitation by setting status = 'revoked'.
 * Requires settings:edit permission.
 */
async function handlePost(
  _request: Request,
  { params }: { params: Promise<{ inviteId: string }> }
) {
  try {
    const { inviteId } = await params
    const auth = await authenticateRequest()
    requirePermission(auth, 'settings', 'edit')

    const admin = createAdminClient()

    // Verify invite belongs to this tenant and is pending
    const { data: invite, error: findErr } = await admin
      .from('user_invites')
      .select('id, email, status')
      .eq('id', inviteId)
      .eq('tenant_id', auth.tenantId)
      .single()

    if (findErr || !invite) {
      return NextResponse.json({ error: 'Invitation not found.' }, { status: 404 })
    }

    if (invite.status !== 'pending') {
      return NextResponse.json(
        { error: 'Only pending invitations can be revoked.' },
        { status: 400 }
      )
    }

    const { error: updateErr } = await admin
      .from('user_invites')
      .update({ status: 'revoked' })
      .eq('id', inviteId)
      .eq('tenant_id', auth.tenantId)

    if (updateErr) {
      log.error('[revoke-invite] Failed to revoke invitation', { error_code: updateErr.code })
      return NextResponse.json({ error: 'Failed to revoke invitation.' }, { status: 500 })
    }

    await logAuditServer({
      supabase: auth.supabase,
      tenantId: auth.tenantId,
      userId: auth.userId,
      entityType: 'user_invite',
      entityId: inviteId,
      action: 'invite_revoked',
      changes: { email: invite.email, status: { from: 'pending', to: 'revoked' } },
    })

    log.info('[revoke-invite] Invitation revoked', {
      tenant_id: auth.tenantId,
      invite_id: inviteId,
    })

    return NextResponse.json({ error: null })
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    return NextResponse.json({ error: 'An unexpected error occurred.' }, { status: 500 })
  }
}

export const POST = withTiming(handlePost, 'POST /api/settings/users/invites/[inviteId]/revoke')
