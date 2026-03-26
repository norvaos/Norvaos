import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { withNexusAdmin } from '@/lib/services/with-nexus-admin'
import { withTiming } from '@/lib/middleware/request-timing'
import { TIER_META, getTierCoverage, type SubscriptionTier } from '@/lib/config/features'

/**
 * GET /api/nexus/overview
 *
 * Nexus Dashboard overview  -  revenue, tenant growth, tier distribution.
 * IP-restricted + platform-admin auth.
 */
const handleGet = withNexusAdmin(async () => {
  const admin = createAdminClient()

  // Parallel queries for dashboard data
  const [tenantsResult, usersResult, mattersResult] = await Promise.all([
    admin
      .from('tenants')
      .select('id, name, slug, subscription_tier, subscription_status, max_users, created_at, status'),
    admin
      .from('users')
      .select('id, tenant_id', { count: 'exact', head: true }),
    admin
      .from('matters')
      .select('id, tenant_id', { count: 'exact', head: true }),
  ])

  const tenants = tenantsResult.data ?? []

  // ── Tier distribution ──
  const tierDistribution: Record<string, number> = {
    starter: 0,
    professional: 0,
    enterprise: 0,
    unknown: 0,
  }
  const statusDistribution: Record<string, number> = {
    active: 0,
    trialing: 0,
    past_due: 0,
    canceled: 0,
    unknown: 0,
  }

  for (const t of tenants) {
    const tier = t.subscription_tier?.toLowerCase() ?? 'unknown'
    tierDistribution[tier] = (tierDistribution[tier] ?? 0) + 1

    const status = t.subscription_status?.toLowerCase() ?? 'unknown'
    statusDistribution[status] = (statusDistribution[status] ?? 0) + 1
  }

  // ── Tier coverage stats ──
  const tierCoverage = (['starter', 'professional', 'enterprise'] as SubscriptionTier[]).map((tier) => ({
    tier,
    ...TIER_META[tier],
    ...getTierCoverage(tier),
    tenant_count: tierDistribution[tier] ?? 0,
  }))

  // ── Growth: tenants created in last 30 days ──
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const newTenants = tenants.filter(
    (t) => t.created_at && t.created_at >= thirtyDaysAgo,
  ).length

  return NextResponse.json({
    data: {
      totals: {
        tenants: tenants.length,
        users: usersResult.count ?? 0,
        matters: mattersResult.count ?? 0,
        new_tenants_30d: newTenants,
      },
      tier_distribution: tierDistribution,
      status_distribution: statusDistribution,
      tier_coverage: tierCoverage,
      tenants: tenants.map((t) => ({
        id: t.id,
        name: t.name,
        slug: t.slug,
        subscription_tier: t.subscription_tier,
        subscription_status: t.subscription_status,
        max_users: t.max_users,
        created_at: t.created_at,
        status: t.status,
      })),
    },
    error: null,
  })
})

export const GET = withTiming(handleGet, 'GET /api/nexus/overview')
