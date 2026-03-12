import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { sendInternalEmail } from '@/lib/services/email-service'
import { log } from '@/lib/utils/logger'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkSeatLimit, seatLimitResponse, logSeatLimitDenial } from '@/lib/services/seat-limit'
import { requirePermission } from '@/lib/services/require-role'
import { withTiming } from '@/lib/middleware/request-timing'
import { z } from 'zod'

const inviteUserSchema = z.object({
  email: z.string().email('Invalid email address'),
  first_name: z.string().min(1, 'First name is required').max(100),
  last_name: z.string().min(1, 'Last name is required').max(100),
  role_id: z.string().uuid().optional().nullable(),
})

/**
 * POST /api/settings/users/invite
 *
 * Invite a new user to the tenant.
 *
 * Requires: users:create permission.
 * Restriction: Only Admins can assign the Admin role to invitees.
 */
async function handlePost(request: Request) {
  try {
    const auth = await authenticateRequest()

    // ── Permission check: users:create required (Phase 7 Fix 1) ──
    const inviterRole = requirePermission(auth, 'users', 'create')

    const body = await request.json()
    const parsed = inviteUserSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
        { status: 400 }
      )
    }

    const { email, first_name, last_name, role_id } = parsed.data

    const admin = createAdminClient()

    // Resolve role: use provided role_id or fall back to Admin role for the tenant
    let role: { id: string; name: string } | null = null

    if (role_id) {
      // Validate provided role belongs to this tenant
      const { data: roleData, error: roleErr } = await admin
        .from('roles')
        .select('id, name')
        .eq('id', role_id)
        .eq('tenant_id', auth.tenantId)
        .single()

      if (roleErr || !roleData) {
        return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
      }
      role = roleData
    } else {
      // Auto-assign the Admin role (created during signup)
      const { data: adminRole, error: adminRoleErr } = await admin
        .from('roles')
        .select('id, name')
        .eq('tenant_id', auth.tenantId)
        .eq('name', 'Admin')
        .single()

      if (adminRoleErr || !adminRole) {
        // Fall back to first available role for the tenant
        const { data: firstRole } = await admin
          .from('roles')
          .select('id, name')
          .eq('tenant_id', auth.tenantId)
          .order('created_at')
          .limit(1)
          .single()

        if (!firstRole) {
          return NextResponse.json(
            { error: 'No roles exist for this firm. Please create a role first.' },
            { status: 400 }
          )
        }
        role = firstRole
      } else {
        role = adminRole
      }
    }

    // ── Role assignment restriction: only Admins can assign Admin role ──
    if (role.name === 'Admin' && inviterRole.name !== 'Admin') {
      return NextResponse.json(
        { error: 'Only administrators can assign the Admin role.' },
        { status: 403 }
      )
    }

    // ── Seat-limit precheck (v1: active users only + pending invite cap) ──
    const seatCheck = await checkSeatLimit(auth.tenantId)

    if (!seatCheck.allowed) {
      const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
        ?? request.headers.get('x-real-ip')
        ?? null
      const userAgent = request.headers.get('user-agent') ?? null

      logSeatLimitDenial({
        tenant_id: auth.tenantId,
        active_user_count: seatCheck.active_user_count,
        pending_invites: seatCheck.pending_invites,
        max_users: seatCheck.max_users,
        entry_point: 'invite',
        user_id: auth.userId,
        ip,
        user_agent: userAgent,
        reason: seatCheck.reason ?? null,
      })

      return seatLimitResponse(seatCheck)
    }

    // Check for duplicate email — parallel (existing user + pending invite)
    const [{ data: existingUser }, { data: existingInvite }] = await Promise.all([
      admin
        .from('users')
        .select('id')
        .eq('tenant_id', auth.tenantId)
        .eq('email', email)
        .maybeSingle(),
      admin
        .from('user_invites')
        .select('id')
        .eq('tenant_id', auth.tenantId)
        .eq('email', email)
        .eq('status', 'pending')
        .maybeSingle(),
    ])

    if (existingUser) {
      return NextResponse.json(
        { error: 'A user with this email already exists in your firm.' },
        { status: 409 }
      )
    }

    if (existingInvite) {
      return NextResponse.json(
        { error: 'A pending invitation already exists for this email.' },
        { status: 409 }
      )
    }

    // Generate token (same pattern as portal_links)
    const token = `${crypto.randomUUID()}-${crypto.randomUUID()}`

    // Create invite record
    const { data: invite, error: inviteErr } = await admin
      .from('user_invites')
      .insert({
        tenant_id: auth.tenantId,
        email,
        first_name,
        last_name,
        role_id: role.id,
        token,
        invited_by: auth.userId,
      })
      .select()
      .single()

    if (inviteErr) {
      log.error('[invite] Failed to create invite', { tenant_id: auth.tenantId, error_code: inviteErr.code })
      return NextResponse.json(
        { error: `Failed to create invitation: ${inviteErr.message}` },
        { status: 500 }
      )
    }

    // Fetch tenant name for email (lightweight query)
    const { data: tenantData } = await admin
      .from('tenants')
      .select('name')
      .eq('id', auth.tenantId)
      .single()

    // Send invite email (non-blocking)
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const acceptUrl = `${baseUrl}/invite/${token}`

    sendInternalEmail({
      supabase: admin,
      tenantId: auth.tenantId,
      recipientEmail: email,
      recipientName: `${first_name} ${last_name}`,
      title: `You've been invited to ${tenantData?.name ?? 'a firm'}`,
      message: `You have been invited to join ${tenantData?.name ?? 'the firm'} as ${role.name}. Click the link below to set up your account. This invitation expires in 7 days.`,
      entityType: 'invite' as any,
      entityId: acceptUrl,
    }).catch((err) => {
      log.error('[invite] Failed to send invite email', { tenant_id: auth.tenantId, error_code: String(err) })
    })

    log.info('[invite] User invited', {
      tenant_id: auth.tenantId,
      user_id: auth.userId,
    })

    return NextResponse.json({ data: invite, error: null })
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    return NextResponse.json(
      { error: 'An unexpected error occurred.' },
      { status: 500 }
    )
  }
}

export const POST = withTiming(handlePost, 'POST /api/settings/users/invite')
