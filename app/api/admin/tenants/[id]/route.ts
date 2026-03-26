import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { withPlatformAdmin } from '@/lib/services/with-platform-admin'
import { getEffectiveFeatures, PLATFORM_FEATURE_DEFAULTS } from '@/lib/config/features'
import { withTiming } from '@/lib/middleware/request-timing'

/**
 * GET /api/admin/tenants/[id]
 *
 * Platform-admin ONLY  -  returns full tenant detail with counts and audit summary.
 * Rate-limited: 30 req/min per IP.
 *
 * Response: { data: { ...tenant, active_users, pending_invites, at_limit,
 *                      feature_flags_raw, feature_flags_effective, feature_defaults,
 *                      recent_audit } }
 */
const handleGet = withPlatformAdmin(async (_request, { params }) => {
  const tenantId = params.id
  const admin = createAdminClient()

  // Fetch tenant + counts + recent audit in parallel
  const [tenantResult, activeResult, pendingResult, auditResult, paAuditResult] = await Promise.all([
    admin
      .from('tenants')
      .select('*')
      .eq('id', tenantId)
      .single(),
    admin
      .from('users')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('is_active', true),
    admin
      .from('user_invites')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('status', 'pending')
      .gt('expires_at', new Date().toISOString()),
    // Recent tenant-scoped audit entries
    admin
      .from('audit_logs')
      .select('id, action, entity_type, entity_id, user_id, changes, metadata, created_at')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(20),
    // Recent platform-admin audit entries for this tenant
    admin
      .from('platform_admin_audit_logs')
      .select('id, admin_id, action, target_type, target_id, changes, reason, ip, created_at')
      .eq('target_id', tenantId)
      .eq('target_type', 'tenant')
      .order('created_at', { ascending: false })
      .limit(20),
  ])

  if (tenantResult.error || !tenantResult.data) {
    return NextResponse.json({ error: 'Tenant not found.' }, { status: 404 })
  }

  const tenant = tenantResult.data
  const activeUsers = activeResult.count ?? 0
  const pendingInvites = pendingResult.count ?? 0

  // Merge and sort audit entries
  const tenantAudit = (auditResult.data ?? []).map((e) => ({
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

  const platformAudit = (paAuditResult.data ?? []).map((e) => ({
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

  const recentAudit = [...tenantAudit, ...platformAudit]
    .sort((a, b) => new Date(b.created_at ?? '').getTime() - new Date(a.created_at ?? '').getTime())
    .slice(0, 20)

  // Compute effective feature flags
  const rawFlags = (tenant.feature_flags ?? {}) as Record<string, boolean>
  const effectiveFlags = getEffectiveFeatures(rawFlags)

  return NextResponse.json({
    data: {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      status: tenant.status,
      max_users: tenant.max_users,
      subscription_tier: tenant.subscription_tier,
      subscription_status: tenant.subscription_status,
      jurisdiction_code: tenant.jurisdiction_code,
      timezone: tenant.timezone,
      currency: tenant.currency,
      custom_domain: tenant.custom_domain,
      portal_domain: tenant.portal_domain,
      active_users: activeUsers,
      pending_invites: pendingInvites,
      at_limit: activeUsers >= (tenant.max_users ?? 0),
      feature_flags_raw: rawFlags,
      feature_flags_effective: effectiveFlags,
      feature_defaults: PLATFORM_FEATURE_DEFAULTS,
      recent_audit: recentAudit,
      created_at: tenant.created_at,
      updated_at: tenant.updated_at,
    },
    error: null,
  })
})

export const GET = withTiming(handleGet, 'GET /api/admin/tenants/[id]')
