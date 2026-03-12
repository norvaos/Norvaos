import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { log } from '@/lib/utils/logger'
import { checkSeatLimit, seatLimitResponse, logSeatLimitDenial } from '@/lib/services/seat-limit'
import { withTiming } from '@/lib/middleware/request-timing'

async function handlePost(request: Request) {
  try {
    const body = await request.json()
    const { token, password } = body

    if (!token || !password) {
      return NextResponse.json(
        { error: 'Token and password are required.' },
        { status: 400 }
      )
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: 'Password must be at least 8 characters.' },
        { status: 400 }
      )
    }

    const admin = createAdminClient()

    // Look up invite
    const { data: invite, error: inviteErr } = await admin
      .from('user_invites')
      .select('*')
      .eq('token', token)
      .eq('status', 'pending')
      .single()

    if (inviteErr || !invite) {
      return NextResponse.json(
        { error: 'Invalid or expired invitation.' },
        { status: 404 }
      )
    }

    // Check expiry
    if (new Date(invite.expires_at) < new Date()) {
      await admin
        .from('user_invites')
        .update({ status: 'expired' })
        .eq('id', invite.id)

      return NextResponse.json(
        { error: 'This invitation has expired. Please ask your administrator to send a new one.' },
        { status: 410 }
      )
    }

    // ── Seat-limit precheck BEFORE createUser (v1: active users only) ──
    // This prevents creating an orphaned auth user that would fail on INSERT.
    const seatCheck = await checkSeatLimit(invite.tenant_id)

    if (!seatCheck.allowed) {
      const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
        ?? request.headers.get('x-real-ip')
        ?? null
      const userAgent = request.headers.get('user-agent') ?? null

      logSeatLimitDenial({
        tenant_id: invite.tenant_id,
        active_user_count: seatCheck.active_user_count,
        pending_invites: seatCheck.pending_invites,
        max_users: seatCheck.max_users,
        entry_point: 'accept-invite',
        user_id: null,
        ip,
        user_agent: userAgent,
      })

      return seatLimitResponse(seatCheck)
    }

    // Create auth user
    const { data: authData, error: authError } = await admin.auth.admin.createUser({
      email: invite.email,
      password,
      email_confirm: true,
      user_metadata: {
        first_name: invite.first_name,
        last_name: invite.last_name,
      },
    })

    if (authError) {
      return NextResponse.json(
        { error: `Failed to create account: ${authError.message}` },
        { status: 400 }
      )
    }

    // Create user record (DB trigger enforces max_users as backstop)
    const { error: userErr } = await admin
      .from('users')
      .insert({
        tenant_id: invite.tenant_id,
        auth_user_id: authData.user.id,
        email: invite.email,
        first_name: invite.first_name,
        last_name: invite.last_name,
        role_id: invite.role_id,
        is_active: true,
        notification_prefs: { email: true, push: true, in_app: true },
        device_tokens: [],
        calendar_sync_enabled: false,
        settings: {},
      })

    if (userErr) {
      // Clean up auth user on failure
      await admin.auth.admin.deleteUser(authData.user.id)

      // Check if it's a max_users trigger error (concurrency backstop)
      if (userErr.message?.includes('User limit reached')) {
        // Re-query for canonical 409 response body
        const backstopCheck = await checkSeatLimit(invite.tenant_id)

        const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
          ?? request.headers.get('x-real-ip')
          ?? null
        const userAgent = request.headers.get('user-agent') ?? null

        logSeatLimitDenial({
          tenant_id: invite.tenant_id,
          active_user_count: backstopCheck.active_user_count,
          pending_invites: backstopCheck.pending_invites,
          max_users: backstopCheck.max_users,
          entry_point: 'accept-invite-trigger-backstop',
          user_id: null,
          ip,
          user_agent: userAgent,
        })

        return seatLimitResponse(backstopCheck)
      }

      return NextResponse.json(
        { error: `Failed to create user: ${userErr.message}` },
        { status: 500 }
      )
    }

    // Mark invite as accepted
    await admin
      .from('user_invites')
      .update({ status: 'accepted', accepted_at: new Date().toISOString() })
      .eq('id', invite.id)

    log.info('[accept-invite] Invite accepted', {
      tenant_id: invite.tenant_id,
    })

    return NextResponse.json({ data: { success: true }, error: null })
  } catch {
    return NextResponse.json(
      { error: 'An unexpected error occurred.' },
      { status: 500 }
    )
  }
}

export const POST = withTiming(handlePost, 'POST /api/auth/accept-invite')
