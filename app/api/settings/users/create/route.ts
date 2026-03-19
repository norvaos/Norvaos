import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { log } from '@/lib/utils/logger'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkSeatLimit, seatLimitResponse, logSeatLimitDenial } from '@/lib/services/seat-limit'
import { requirePermission } from '@/lib/services/require-role'
import { withTiming } from '@/lib/middleware/request-timing'
import { z } from 'zod'

const createUserSchema = z.object({
  email: z.string().email('Invalid email address'),
  first_name: z.string().min(1, 'First name is required').max(100),
  last_name: z.string().min(1, 'Last name is required').max(100),
  role_id: z.string().uuid('Please select a role').optional().nullable(),
})

/** Generates a strong random 14-char temp password */
function generateTempPassword(): string {
  const upper  = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
  const lower  = 'abcdefghjkmnpqrstuvwxyz'
  const digits = '23456789'
  const syms   = '!@#$%'
  const all    = upper + lower + digits + syms

  // Guarantee at least one of each class
  const pick = (set: string) => set[Math.floor(Math.random() * set.length)]
  const base = [pick(upper), pick(lower), pick(digits), pick(syms)]
  for (let i = 0; i < 10; i++) base.push(pick(all))

  // Fisher-Yates shuffle
  for (let i = base.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[base[i], base[j]] = [base[j], base[i]]
  }
  return base.join('')
}

/**
 * POST /api/settings/users/create
 *
 * Creates a user account directly (no invite email).
 * Generates a random temporary password that the user must change on first login.
 *
 * Returns: { data: { user_id, temp_password } }
 */
async function handlePost(request: Request) {
  try {
    const auth = await authenticateRequest()
    requirePermission(auth, 'users', 'create')

    const body = await request.json()
    const parsed = createUserSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
        { status: 400 }
      )
    }

    const { email, first_name, last_name, role_id } = parsed.data
    const admin = createAdminClient()

    // Resolve role
    let role: { id: string; name: string } | null = null

    if (role_id) {
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
      // Fall back to first available role
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
    }

    // Seat-limit check
    const seatCheck = await checkSeatLimit(auth.tenantId)
    if (!seatCheck.allowed) {
      const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null
      const userAgent = request.headers.get('user-agent') ?? null
      logSeatLimitDenial({
        tenant_id: auth.tenantId,
        active_user_count: seatCheck.active_user_count,
        pending_invites: seatCheck.pending_invites,
        max_users: seatCheck.max_users,
        entry_point: 'create',
        user_id: auth.userId,
        ip,
        user_agent: userAgent,
        reason: seatCheck.reason ?? null,
      })
      return seatLimitResponse(seatCheck)
    }

    // Duplicate check
    const { data: existingUser } = await admin
      .from('users')
      .select('id')
      .eq('tenant_id', auth.tenantId)
      .eq('email', email)
      .maybeSingle()

    if (existingUser) {
      return NextResponse.json(
        { error: 'A user with this email already exists in your firm.' },
        { status: 409 }
      )
    }

    const tempPassword = generateTempPassword()

    // Create Supabase auth user
    const { data: authUser, error: authErr } = await admin.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true, // skip email confirmation — admin-created accounts are pre-confirmed
      user_metadata: {
        first_name,
        last_name,
        tenant_id: auth.tenantId,
      },
    })

    if (authErr || !authUser.user) {
      log.error('[create-user] Auth user creation failed', {
        tenant_id: auth.tenantId,
        error_code: authErr?.message,
      })
      return NextResponse.json(
        { error: authErr?.message ?? 'Failed to create auth user' },
        { status: 500 }
      )
    }

    // Insert user row — must_change_password = true so they're forced to reset on first login
    const { data: userRow, error: userErr } = await admin
      .from('users')
      .insert({
        auth_user_id: authUser.user.id,
        tenant_id: auth.tenantId,
        email,
        first_name,
        last_name,
        role_id: role.id,
        is_active: true,
        must_change_password: true,
      } as any)
      .select('id')
      .single()

    if (userErr) {
      // Rollback: delete the auth user we just created
      await admin.auth.admin.deleteUser(authUser.user.id).catch(() => null)
      log.error('[create-user] User row insert failed', {
        tenant_id: auth.tenantId,
        error_code: userErr.code,
      })
      return NextResponse.json(
        { error: `Failed to create user record: ${userErr.message}` },
        { status: 500 }
      )
    }

    log.info('[create-user] User created directly', {
      tenant_id: auth.tenantId,
      created_by: auth.userId,
      new_user_id: userRow.id,
    })

    return NextResponse.json({
      data: {
        user_id: userRow.id,
        temp_password: tempPassword,
      },
      error: null,
    })
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    return NextResponse.json({ error: 'An unexpected error occurred.' }, { status: 500 })
  }
}

export const POST = withTiming(handlePost, 'POST /api/settings/users/create')
