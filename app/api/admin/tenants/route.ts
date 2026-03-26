import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { log } from '@/lib/utils/logger'
import { withPlatformAdmin } from '@/lib/services/with-platform-admin'
import { withTiming } from '@/lib/middleware/request-timing'
import { logPlatformAdminAction } from '@/lib/services/platform-admin'

/**
 * GET /api/admin/tenants
 *
 * Platform-admin ONLY  -  returns all tenants with seat-limit counts.
 * Supports dual auth: Bearer token (CLI) or session (portal login).
 * Rate-limited: 30 req/min per IP.
 *
 * Query params:
 *   ?page=1           -  1-based page number (default: 1)
 *   &per_page=25      -  results per page (default: 25, max: 100)
 *   &search=acme      -  filter by name or slug (case-insensitive)
 *   &status=active    -  filter by tenant status (active/suspended/closed)
 *
 * Response: { data: [...], total, page, per_page }
 */
const handleGet = withPlatformAdmin(async (request) => {
  const url = new URL(request.url)
  const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10))
  const perPage = Math.min(100, Math.max(1, parseInt(url.searchParams.get('per_page') ?? '25', 10)))
  const search = url.searchParams.get('search')?.trim() || null
  const statusFilter = url.searchParams.get('status')?.trim() || null

  const admin = createAdminClient()

  // Build tenant query with filters
  let query = admin
    .from('tenants')
    .select('id, name, slug, max_users, subscription_tier, status', { count: 'exact' })

  if (search) {
    query = query.or(`name.ilike.%${search}%,slug.ilike.%${search}%`)
  }

  if (statusFilter && ['active', 'suspended', 'closed'].includes(statusFilter)) {
    query = query.eq('status', statusFilter)
  }

  const offset = (page - 1) * perPage

  const { data: tenants, error: tenantsErr, count: totalCount } = await query
    .order('name')
    .range(offset, offset + perPage - 1)

  if (tenantsErr || !tenants) {
    log.error('[admin/tenants] Failed to fetch tenants', { error_code: tenantsErr?.code })
    return NextResponse.json(
      { error: 'Failed to fetch tenants.' },
      { status: 500 }
    )
  }

  // For each tenant, fetch active_users and pending_invites counts in parallel
  const enriched = await Promise.all(
    tenants.map(async (tenant) => {
      const [activeResult, pendingResult] = await Promise.all([
        admin
          .from('users')
          .select('*', { count: 'exact', head: true })
          .eq('tenant_id', tenant.id)
          .eq('is_active', true),
        admin
          .from('user_invites')
          .select('*', { count: 'exact', head: true })
          .eq('tenant_id', tenant.id)
          .eq('status', 'pending')
          .gt('expires_at', new Date().toISOString()),
      ])

      const activeUsers = activeResult.count ?? 0
      const pendingInvites = pendingResult.count ?? 0

      return {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        max_users: tenant.max_users,
        subscription_tier: tenant.subscription_tier,
        status: tenant.status,
        active_users: activeUsers,
        pending_invites: pendingInvites,
        at_limit: activeUsers >= (tenant.max_users ?? 0),
      }
    })
  )

  return NextResponse.json({
    data: enriched,
    total: totalCount ?? 0,
    page,
    per_page: perPage,
    error: null,
  })
})

export const GET = withTiming(handleGet, 'GET /api/admin/tenants')

// ── POST /api/admin/tenants ───────────────────────────────────────────────────

const createTenantSchema = z.object({
  name: z.string().min(2).max(100),
  slug: z.string().min(2).max(60).regex(/^[a-z0-9-]+$/, 'Slug must be lowercase letters, numbers, and hyphens only').optional(),
  subscription_tier: z.enum(['starter', 'professional', 'enterprise']).default('starter'),
  max_users: z.number().int().min(1).max(1000).default(10),
  timezone: z.string().default('America/Toronto'),
})

/**
 * POST /api/admin/tenants
 *
 * Platform-admin ONLY  -  create a new tenant.
 * Slug auto-generated from name if not provided.
 * Duplicate slug returns 409.
 */
const handlePost = withPlatformAdmin(async (request, ctx) => {
  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })

  const parsed = createTenantSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid input.' },
      { status: 400 },
    )
  }

  const { name, subscription_tier, max_users, timezone } = parsed.data

  // Auto-generate slug from name if not provided
  const slug = parsed.data.slug
    ?? name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60)

  const admin = createAdminClient()

  // Duplicate slug check
  const { data: existing } = await admin
    .from('tenants')
    .select('id')
    .eq('slug', slug)
    .single()

  if (existing) {
    return NextResponse.json(
      { error: `A tenant with slug "${slug}" already exists.` },
      { status: 409 },
    )
  }

  const { data: tenant, error: createErr } = await admin
    .from('tenants')
    .insert({
      name,
      slug,
      subscription_tier,
      subscription_status: 'trialing',
      max_users,
      timezone,
      status: 'active',
    })
    .select('id, name, slug, subscription_tier, max_users, status, created_at')
    .single()

  if (createErr || !tenant) {
    log.error('[admin/tenants] Failed to create tenant', { error_code: createErr?.code })
    return NextResponse.json({ error: 'Failed to create tenant.' }, { status: 500 })
  }

  logPlatformAdminAction({
    tenant_id: tenant.id,
    action: 'tenant_created',
    entity_type: 'tenant',
    entity_id: tenant.id,
    changes: { name, slug, subscription_tier, max_users, timezone },
    reason: 'Tenant created via platform-admin API',
    ip: ctx.ip,
    user_agent: ctx.userAgent,
    request_id: ctx.requestId,
  }).catch(() => {})

  log.info('[admin/tenants] Tenant created', { tenant_id: tenant.id, slug })

  return NextResponse.json({ data: tenant, error: null }, { status: 201 })
})

export const POST = withTiming(handlePost, 'POST /api/admin/tenants')
