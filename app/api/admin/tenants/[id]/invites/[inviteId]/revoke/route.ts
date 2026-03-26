import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { withPlatformAdmin } from '@/lib/services/with-platform-admin'
import { logPlatformAdminAudit } from '@/lib/services/platform-admin-audit'
import { withTiming } from '@/lib/middleware/request-timing'

/**
 * POST /api/admin/tenants/[id]/invites/[inviteId]/revoke
 *
 * Platform-admin ONLY  -  revoke a pending invite.
 *
 * Body: { reason: string }
 */
const handlePost = withPlatformAdmin(async (request, { params, adminCtx, ip, userAgent, requestId }) => {
  const tenantId = params.id
  const inviteId = params.inviteId

  const body = await request.json()
  const reason = body.reason as string

  if (typeof reason !== 'string' || reason.trim().length < 5) {
    return NextResponse.json(
      { error: 'reason is required and must be at least 5 characters.' },
      { status: 400 }
    )
  }

  const admin = createAdminClient()

  // ── Verify invite exists and is pending ──
  const { data: invite, error: inviteErr } = await admin
    .from('user_invites')
    .select('id, email, status')
    .eq('id', inviteId)
    .eq('tenant_id', tenantId)
    .single()

  if (inviteErr || !invite) {
    return NextResponse.json({ error: 'Invite not found in this tenant.' }, { status: 404 })
  }

  if (invite.status !== 'pending') {
    return NextResponse.json({
      data: { invite_id: inviteId, status: invite.status, changed: false },
      error: null,
    })
  }

  // ── Revoke ──
  const { error: updateErr } = await admin
    .from('user_invites')
    .update({ status: 'revoked' })
    .eq('id', inviteId)
    .eq('tenant_id', tenantId)

  if (updateErr) {
    return NextResponse.json(
      { error: `Failed to revoke invite: ${updateErr.message}` },
      { status: 500 }
    )
  }

  logPlatformAdminAudit({
    admin_id: adminCtx.adminId,
    action: 'invite_revoked',
    target_type: 'invite',
    target_id: inviteId,
    tenant_id: tenantId,
    changes: { email: invite.email, status: { before: 'pending', after: 'revoked' } },
    reason: reason.trim(),
    ip,
    user_agent: userAgent,
    request_id: requestId,
  })

  return NextResponse.json({
    data: { invite_id: inviteId, status: 'revoked', changed: true },
    error: null,
  })
})

export const POST = withTiming(handlePost, 'POST /api/admin/tenants/[id]/invites/[inviteId]/revoke')
