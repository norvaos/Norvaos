import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { withPlatformAdmin } from '@/lib/services/with-platform-admin'
import { withTiming } from '@/lib/middleware/request-timing'

/**
 * GET /api/admin/tenants/[id]/audit
 *
 * Platform-admin ONLY — paginated audit feed for a tenant.
 * Merges tenant-scoped audit_logs + platform_admin_audit_logs.
 * Rate-limited: 30 req/min per IP.
 *
 * Query params:
 *   ?cursor=<iso-date>   — cursor for pagination (created_at of last item)
 *   &limit=50            — results per page (default: 50, max: 100)
 *   &action=<type>       — filter by action type
 */
const handleGet = withPlatformAdmin(async (request, { params }) => {
  const tenantId = params.id
  const url = new URL(request.url)
  const cursor = url.searchParams.get('cursor') || null
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') ?? '50', 10)))
  const actionFilter = url.searchParams.get('action')?.trim() || null

  const admin = createAdminClient()

  // Build parallel queries for both audit sources
  let tenantQuery = admin
    .from('audit_logs')
    .select('id, action, entity_type, entity_id, user_id, changes, metadata, created_at')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(limit)

  let paQuery = admin
    .from('platform_admin_audit_logs')
    .select('id, admin_id, action, target_type, target_id, changes, reason, ip, created_at')
    .eq('target_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (cursor) {
    tenantQuery = tenantQuery.lt('created_at', cursor)
    paQuery = paQuery.lt('created_at', cursor)
  }

  if (actionFilter) {
    tenantQuery = tenantQuery.eq('action', actionFilter)
    paQuery = paQuery.eq('action', actionFilter)
  }

  const [tenantResult, paResult] = await Promise.all([tenantQuery, paQuery])

  // Normalize into a common shape
  const tenantEntries = (tenantResult.data ?? []).map((e) => ({
    id: e.id,
    source: 'tenant' as const,
    action: e.action,
    entity_type: e.entity_type,
    entity_id: e.entity_id,
    actor: (e.metadata as Record<string, unknown>)?.actor as string ?? e.user_id ?? 'unknown',
    reason: (e.metadata as Record<string, unknown>)?.reason as string ?? null,
    changes: e.changes,
    created_at: e.created_at,
  }))

  const paEntries = (paResult.data ?? []).map((e) => ({
    id: e.id,
    source: 'platform-admin' as const,
    action: e.action,
    entity_type: e.target_type,
    entity_id: e.target_id,
    actor: 'platform-admin',
    reason: e.reason,
    changes: e.changes,
    created_at: e.created_at,
  }))

  // Merge, sort, and take the requested limit
  const merged = [...tenantEntries, ...paEntries]
    .sort((a, b) => new Date(b.created_at ?? '').getTime() - new Date(a.created_at ?? '').getTime())
    .slice(0, limit)

  const nextCursor = merged.length === limit ? merged[merged.length - 1].created_at : null

  return NextResponse.json({
    data: merged,
    next_cursor: nextCursor,
    error: null,
  })
})

export const GET = withTiming(handleGet, 'GET /api/admin/tenants/[id]/audit')
