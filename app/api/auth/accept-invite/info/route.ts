import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { withTiming } from '@/lib/middleware/request-timing'

async function handleGet(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token')

  if (!token) {
    return NextResponse.json({ error: 'Token is required.' }, { status: 400 })
  }

  const admin = createAdminClient()

  const { data: invite, error: inviteErr } = await admin
    .from('user_invites')
    .select('first_name, last_name, email, tenant_id, role_id, status, expires_at')
    .eq('token', token)
    .single()

  if (inviteErr || !invite) {
    return NextResponse.json({ error: 'Invitation not found.' }, { status: 404 })
  }

  if (invite.status !== 'pending') {
    return NextResponse.json(
      { error: `This invitation has already been ${invite.status}.` },
      { status: 410 }
    )
  }

  if (new Date(invite.expires_at) < new Date()) {
    return NextResponse.json(
      { error: 'This invitation has expired. Please ask your administrator to send a new one.' },
      { status: 410 }
    )
  }

  // Fetch tenant name and role name for display
  const [{ data: tenant }, { data: role }] = await Promise.all([
    admin.from('tenants').select('name').eq('id', invite.tenant_id).single(),
    admin.from('roles').select('name').eq('id', invite.role_id).single(),
  ])

  return NextResponse.json({
    data: {
      first_name: invite.first_name,
      last_name: invite.last_name,
      email: invite.email,
      tenant_name: tenant?.name ?? 'Unknown Firm',
      role_name: role?.name ?? 'Team Member',
    },
    error: null,
  })
}

export const GET = withTiming(handleGet, 'GET /api/auth/accept-invite/info')
