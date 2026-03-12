import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { withPlatformAdmin } from '@/lib/services/with-platform-admin'
import { withTiming } from '@/lib/middleware/request-timing'

/**
 * GET /api/admin/tenants/[id]/users
 *
 * Platform-admin ONLY — list users for a tenant.
 * Rate-limited: 30 req/min per IP.
 *
 * Query params:
 *   ?search=john     — filter by name or email (case-insensitive)
 *   &page=1          — 1-based page number
 *   &per_page=25     — results per page (max 100)
 */
const handleGet = withPlatformAdmin(async (request, { params }) => {
  const tenantId = params.id

  const url = new URL(request.url)
  const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10))
  const perPage = Math.min(100, Math.max(1, parseInt(url.searchParams.get('per_page') ?? '25', 10)))
  const search = url.searchParams.get('search')?.trim() || null

  const admin = createAdminClient()
  const offset = (page - 1) * perPage

  let query = admin
    .from('users')
    .select('id, first_name, last_name, email, role_id, is_active, last_login_at, created_at', { count: 'exact' })
    .eq('tenant_id', tenantId)

  if (search) {
    query = query.or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%,email.ilike.%${search}%`)
  }

  const { data: users, error, count } = await query
    .order('created_at', { ascending: false })
    .range(offset, offset + perPage - 1)

  if (error) {
    return NextResponse.json({ error: 'Failed to fetch users.' }, { status: 500 })
  }

  // Enrich with role names
  const roleIds = [...new Set((users ?? []).map((u) => u.role_id).filter(Boolean))] as string[]
  let roleMap: Record<string, string> = {}

  if (roleIds.length > 0) {
    const { data: roles } = await admin
      .from('roles')
      .select('id, name')
      .in('id', roleIds)

    roleMap = Object.fromEntries((roles ?? []).map((r) => [r.id, r.name]))
  }

  const enriched = (users ?? []).map((u) => ({
    id: u.id,
    full_name: [u.first_name, u.last_name].filter(Boolean).join(' ') || u.email,
    email: u.email,
    role_name: u.role_id ? roleMap[u.role_id] ?? 'Unknown' : 'No Role',
    is_active: u.is_active,
    last_sign_in_at: u.last_login_at,
    created_at: u.created_at,
  }))

  return NextResponse.json({
    data: enriched,
    total: count ?? 0,
    page,
    per_page: perPage,
    error: null,
  })
})

export const GET = withTiming(handleGet, 'GET /api/admin/tenants/[id]/users')
