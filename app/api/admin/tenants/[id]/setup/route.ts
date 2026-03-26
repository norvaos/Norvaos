import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { withPlatformAdmin } from '@/lib/services/with-platform-admin'
import { withTiming } from '@/lib/middleware/request-timing'

/**
 * GET /api/admin/tenants/[id]/setup
 *
 * Platform-admin ONLY  -  tenant setup state.
 * Returns bootstrap log entries, role/practice-area counts,
 * and manual onboarding checklist completions.
 *
 * No cross-tenant leakage: all queries are scoped to the tenantId param
 * and use the admin client (bypasses RLS  -  access is gated by requirePlatformAdmin).
 */
const handleGet = withPlatformAdmin(async (_request, ctx) => {
  const { id: tenantId } = ctx.params
  const admin = createAdminClient()

  // Verify tenant exists
  const { data: tenant } = await admin
    .from('tenants')
    .select('id, name, slug, status, subscription_tier, created_at')
    .eq('id', tenantId)
    .single()

  if (!tenant) {
    return NextResponse.json({ error: 'Tenant not found.' }, { status: 404 })
  }

  // Fetch all data in parallel  -  all queries are tenant-scoped
  const [
    setupLogResult,
    rolesResult,
    practiceAreasResult,
    usersResult,
    checklistResult,
  ] = await Promise.all([
    admin
      .from('tenant_setup_log')
      .select('action, starter_pack, applied_at, applied_by, result')
      .eq('tenant_id', tenantId)
      .order('applied_at', { ascending: true }),

    admin
      .from('roles')
      .select('id, name, is_system')
      .eq('tenant_id', tenantId),

    admin
      .from('practice_areas')
      .select('id, name, is_enabled, is_active')
      .eq('tenant_id', tenantId),

    admin
      .from('users')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('is_active', true),

    admin
      .from('tenant_onboarding_checklist')
      .select('item_key, completed_at, completed_by')
      .eq('tenant_id', tenantId),
  ])

  const bootstrapLog = setupLogResult.data ?? []
  const roles = rolesResult.data ?? []
  const practiceAreas = practiceAreasResult.data ?? []
  const activeUserCount = usersResult.count ?? 0
  const manualCompletions = checklistResult.data ?? []

  // Determine which starter pack was applied (if any)
  const packEntry = bootstrapLog.find((e) => e.action.startsWith('seed_practice_areas_'))
  const appliedStarterPack = packEntry?.starter_pack ?? null

  return NextResponse.json({
    tenant: {
      id:                tenant.id,
      name:              tenant.name,
      slug:              tenant.slug,
      status:            tenant.status,
      subscription_tier: tenant.subscription_tier,
      created_at:        tenant.created_at,
    },
    setup: {
      starter_pack_applied: appliedStarterPack,
      bootstrap_log:        bootstrapLog,
      roles_count:          roles.length,
      roles:                roles.map((r) => ({ name: r.name, is_system: r.is_system })),
      practice_areas_count: practiceAreas.length,
      practice_areas:       practiceAreas.map((p) => ({ name: p.name, is_enabled: p.is_enabled })),
      active_user_count:    activeUserCount,
      manual_checklist_completions: manualCompletions,
    },
    error: null,
  })
})

export const GET = withTiming(handleGet, 'GET /api/admin/tenants/[id]/setup')
