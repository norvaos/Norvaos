import { NextResponse } from 'next/server'
import { z } from 'zod'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import { createAdminClient } from '@/lib/supabase/admin'
import { withTiming } from '@/lib/middleware/request-timing'
import { log } from '@/lib/utils/logger'
import { logAudit } from '@/lib/queries/audit-logs'

const updateUserSchema = z.object({
  first_name: z.string().min(1).max(100).optional(),
  last_name: z.string().min(1).max(100).optional(),
  password: z.string().min(8, 'Password must be at least 8 characters').optional(),
  email: z.string().email('Invalid email address').optional(),
})

async function handlePatch(request: Request, { params }: { params: Promise<{ userId: string }> }) {
  try {
    const { userId } = await params
    const auth = await authenticateRequest()
    requirePermission(auth, 'users', 'update')

    const body = await request.json()
    const parsed = updateUserSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
        { status: 400 }
      )
    }

    const { first_name, last_name, password, email } = parsed.data

    if (!first_name && !last_name && !password && !email) {
      return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
    }

    const admin = createAdminClient()

    // Verify user belongs to this tenant
    const { data: targetUser, error: findErr } = await admin
      .from('users')
      .select('id, first_name, last_name, email, auth_user_id')
      .eq('id', userId)
      .eq('tenant_id', auth.tenantId)
      .single()

    if (findErr || !targetUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const changes: Record<string, unknown> = {}

    // Update name fields in users table
    if (first_name || last_name) {
      const nameUpdate: Record<string, string> = {}
      if (first_name) nameUpdate.first_name = first_name
      if (last_name) nameUpdate.last_name = last_name

      const { error: updateErr } = await admin
        .from('users')
        .update(nameUpdate)
        .eq('id', userId)
        .eq('tenant_id', auth.tenantId)

      if (updateErr) {
        log.error('[update-user] Failed to update name', { error_code: updateErr.code })
        return NextResponse.json({ error: 'Failed to update user.' }, { status: 500 })
      }

      if (first_name) changes.first_name = { from: targetUser.first_name, to: first_name }
      if (last_name) changes.last_name = { from: targetUser.last_name, to: last_name }
    }

    // Update password via auth admin API
    if (password && targetUser.auth_user_id) {
      const { error: authErr } = await admin.auth.admin.updateUserById(targetUser.auth_user_id, {
        password,
      })
      if (authErr) {
        log.error('[update-user] Failed to update password', { error_code: authErr.message })
        return NextResponse.json({ error: 'Failed to update password.' }, { status: 500 })
      }
      changes.password = 'changed'
    }

    // Update email via auth admin API + users table
    if (email) {
      // Best-effort: update auth user if possible (may not exist for pending invites)
      if (targetUser.auth_user_id) {
        const { error: authErr } = await admin.auth.admin.updateUserById(targetUser.auth_user_id, {
          email,
        })
        if (authErr && authErr.message !== 'User not found') {
          log.error('[update-user] Failed to update auth email', { error_code: authErr.message })
          return NextResponse.json({ error: 'Failed to update email.' }, { status: 500 })
        }
        if (authErr?.message === 'User not found') {
          log.warn('[update-user] Auth user not found for email update — updating DB only', { userId })
        }
      }
      // Always update the users table
      const { error: emailUpdateErr } = await admin
        .from('users')
        .update({ email })
        .eq('id', userId)
        .eq('tenant_id', auth.tenantId)
      if (emailUpdateErr) {
        log.error('[update-user] Failed to sync email to users table', { error_code: emailUpdateErr.code })
        return NextResponse.json({ error: 'Failed to update email.' }, { status: 500 })
      }
      changes.email = { from: targetUser.email, to: email }
    }

    logAudit({
      tenantId: auth.tenantId,
      userId: auth.userId,
      entityType: 'user',
      entityId: userId,
      action: 'user_updated',
      changes,
    }).catch(() => {})

    log.info('[update-user] User updated', { tenant_id: auth.tenantId, target_user_id: userId })

    return NextResponse.json({ error: null })
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    return NextResponse.json({ error: 'An unexpected error occurred.' }, { status: 500 })
  }
}

export const PATCH = withTiming(handlePatch, 'PATCH /api/settings/users/[userId]')
