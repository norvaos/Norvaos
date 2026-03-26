import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { withNexusAdmin } from '@/lib/services/with-nexus-admin'
import { withTiming } from '@/lib/middleware/request-timing'
import {
  TIER_FEATURES,
  TIER_META,
  getEffectiveFeatures,
  type SubscriptionTier,
} from '@/lib/config/features'

/**
 * GET /api/nexus/feature-matrix
 *
 * Returns the full feature matrix across tiers and per-tenant overrides.
 * Used by the Nexus Dashboard to visualise which firms have which features.
 */
const handleGet = withNexusAdmin(async () => {
  const admin = createAdminClient()

  const { data: tenants } = await admin
    .from('tenants')
    .select('id, name, slug, subscription_tier, feature_flags')
    .order('name')

  // Build per-tenant effective feature map
  const tenantFeatures = (tenants ?? []).map((t) => {
    const raw = (t.feature_flags ?? {}) as Record<string, boolean>
    const tier = (t.subscription_tier ?? 'starter') as SubscriptionTier
    return {
      id: t.id,
      name: t.name,
      slug: t.slug,
      tier,
      overrides: raw,
      effective: getEffectiveFeatures(raw, tier),
    }
  })

  // All feature keys (union of all tier features)
  const allFeatureKeys = Object.keys(TIER_FEATURES.enterprise).sort()

  return NextResponse.json({
    data: {
      tiers: TIER_META,
      tier_features: TIER_FEATURES,
      all_feature_keys: allFeatureKeys,
      tenants: tenantFeatures,
    },
    error: null,
  })
})

export const GET = withTiming(handleGet, 'GET /api/nexus/feature-matrix')
