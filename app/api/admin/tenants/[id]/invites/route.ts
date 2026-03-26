import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { withPlatformAdmin } from '@/lib/services/with-platform-admin'
import { withTiming } from '@/lib/middleware/request-timing'

/**
 * GET /api/admin/tenants/[id]/invites
 *
 * Platform-admin ONLY  -  list active invites for a tenant.
 * Rate-limited: 30 req/min per IP.
 */
const handleGet = withPlatformAdmin(async (_request, { params }) => {
  const tenantId = params.id
  const admin = createAdminClient()

  const { data: invites, error } = await admin
    .from('user_invites')
    .select('id, email, role_id, status, expires_at, invited_by, created_at')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) {
    return NextResponse.json({ error: 'Failed to fetch invites.' }, { status: 500 })
  }

  // Enrich with role names and inviter names
  const roleIds = [...new Set((invites ?? []).map((i) => i.role_id).filter(Boolean))] as string[]
  const inviterIds = [...new Set((invites ?? []).map((i) => i.invited_by).filter(Boolean))] as string[]

  const [rolesResult, invitersResult] = await Promise.all([
    roleIds.length > 0
      ? admin.from('roles').select('id, name').in('id', roleIds)
      : { data: [] },
    inviterIds.length > 0
      ? admin.from('users').select('id, email, first_name, last_name').in('id', inviterIds)
      : { data: [] },
  ])

  const roleMap = Object.fromEntries((rolesResult.data ?? []).map((r) => [r.id, r.name]))
  const inviterMap = Object.fromEntries(
    (invitersResult.data ?? []).map((u) => [u.id, [u.first_name, u.last_name].filter(Boolean).join(' ') || u.email])
  )

  const enriched = (invites ?? []).map((inv) => ({
    id: inv.id,
    email: inv.email,
    role_name: inv.role_id ? roleMap[inv.role_id] ?? 'Unknown' : 'No Role',
    status: inv.status,
    expires_at: inv.expires_at,
    invited_by: inv.invited_by ? inviterMap[inv.invited_by] ?? 'Unknown' : null,
    created_at: inv.created_at,
  }))

  return NextResponse.json({ data: enriched, error: null })
})

export const GET = withTiming(handleGet, 'GET /api/admin/tenants/[id]/invites')
