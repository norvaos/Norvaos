import { NextResponse } from 'next/server'
import { z } from 'zod'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import { createAdminClient } from '@/lib/supabase/admin'
import { withTiming } from '@/lib/middleware/request-timing'
import { log } from '@/lib/utils/logger'
import { logAuditServer } from '@/lib/queries/audit-logs'

const updateUserSchema = z.object({
  first_name: z.string().min(1).max(100).optional(),
  last_name: z.string().min(1).max(100).optional(),
  password: z.string().min(8, 'Password must be at least 8 characters').optional(),
  email: z.string().email('Invalid email address').optional(),
  is_active: z.boolean().optional(),
  role_id: z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, 'Invalid role ID').optional(),
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

    const { first_name, last_name, password, email, is_active, role_id } = parsed.data

    if (!first_name && !last_name && !password && !email && is_active === undefined && !role_id) {
      return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
    }

    const admin = createAdminClient()

    // Verify user belongs to this tenant
    const { data: targetUser, error: findErr } = await admin
      .from('users')
      .select('id, first_name, last_name, email, auth_user_id, is_active, role_id')
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

    // Reactivate: set is_active = true (soft-delete reversal)
    if (is_active === true && targetUser.is_active === false) {
      const { error: reactivateErr } = await admin
        .from('users')
        .update({ is_active: true })
        .eq('id', userId)
        .eq('tenant_id', auth.tenantId)

      if (reactivateErr) {
        log.error('[update-user] Failed to reactivate user', { error_code: reactivateErr.code })
        return NextResponse.json({ error: 'Failed to reactivate user.' }, { status: 500 })
      }

      changes.is_active = { from: false, to: true }

      await logAuditServer({
        supabase: auth.supabase,
        tenantId: auth.tenantId,
        userId: auth.userId,
        entityType: 'user',
        entityId: userId,
        action: 'user_reactivated',
        changes,
      })

      log.info('[update-user] User reactivated', { tenant_id: auth.tenantId, target_user_id: userId })
      return NextResponse.json({ error: null })
    }

    // Role update
    if (role_id && role_id !== targetUser.role_id) {
      // Verify role belongs to this tenant
      const { data: newRole, error: roleErr } = await admin
        .from('roles')
        .select('id, name')
        .eq('id', role_id)
        .eq('tenant_id', auth.tenantId)
        .single()

      if (roleErr || !newRole) {
        return NextResponse.json({ error: 'Role not found.' }, { status: 404 })
      }

      // Guard: cannot remove the last active Admin by changing their role away from Admin
      if (targetUser.role_id) {
        const { data: currentRole } = await admin
          .from('roles')
          .select('name')
          .eq('id', targetUser.role_id)
          .eq('tenant_id', auth.tenantId)
          .single()

        if (currentRole?.name === 'Admin' && newRole.name !== 'Admin') {
          const { count } = await admin
            .from('users')
            .select('id', { count: 'exact', head: true })
            .eq('tenant_id', auth.tenantId)
            .eq('is_active', true)
            .eq('role_id', targetUser.role_id)

          if ((count ?? 0) <= 1) {
            return NextResponse.json(
              { error: 'Cannot change the role of the last active Admin.' },
              { status: 400 }
            )
          }
        }
      }

      const { error: roleUpdateErr } = await admin
        .from('users')
        .update({ role_id })
        .eq('id', userId)
        .eq('tenant_id', auth.tenantId)

      if (roleUpdateErr) {
        log.error('[update-user] Failed to update role', { error_code: roleUpdateErr.code })
        return NextResponse.json({ error: 'Failed to update role.' }, { status: 500 })
      }

      changes.role_id = { from: targetUser.role_id, to: role_id, new_role_name: newRole.name }
    }

    if (Object.keys(changes).length === 0) {
      return NextResponse.json({ error: null })
    }

    const action = 'role_id' in changes ? 'role_changed' : 'user_updated'

    await logAuditServer({
      supabase: auth.supabase,
      tenantId: auth.tenantId,
      userId: auth.userId,
      entityType: 'user',
      entityId: userId,
      action,
      changes,
    })

    log.info('[update-user] User updated', { tenant_id: auth.tenantId, target_user_id: userId, action })

    return NextResponse.json({ error: null })
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    return NextResponse.json({ error: 'An unexpected error occurred.' }, { status: 500 })
  }
}

export const PATCH = withTiming(handlePatch, 'PATCH /api/settings/users/[userId]')
