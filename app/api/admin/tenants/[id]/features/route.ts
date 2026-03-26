import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { log } from '@/lib/utils/logger'
import { withPlatformAdmin } from '@/lib/services/with-platform-admin'
import { logPlatformAdminAudit } from '@/lib/services/platform-admin-audit'
import { getEffectiveFeatures, PLATFORM_FEATURE_DEFAULTS } from '@/lib/config/features'
import type { Json } from '@/lib/types/database'
import { withTiming } from '@/lib/middleware/request-timing'

/**
 * GET /api/admin/tenants/[id]/features
 *
 * Platform-admin ONLY  -  returns feature flags for a tenant.
 *
 * Response: { raw, effective, defaults, updated_at }
 */
const handleGet = withPlatformAdmin(async (_request, { params }) => {
  const tenantId = params.id

  const admin = createAdminClient()
  const { data: tenant, error } = await admin
    .from('tenants')
    .select('feature_flags, subscription_tier, updated_at')
    .eq('id', tenantId)
    .single()

  if (error || !tenant) {
    return NextResponse.json({ error: 'Tenant not found.' }, { status: 404 })
  }

  const raw = (tenant.feature_flags ?? {}) as Record<string, boolean>

  return NextResponse.json({
    data: {
      raw,
      effective: getEffectiveFeatures(raw, tenant.subscription_tier),
      defaults: PLATFORM_FEATURE_DEFAULTS,
      subscription_tier: tenant.subscription_tier,
      updated_at: tenant.updated_at,
    },
    error: null,
  })
})

/**
 * PATCH /api/admin/tenants/[id]/features
 *
 * Platform-admin ONLY  -  update feature flag overrides for a tenant.
 * Rate-limited: 30 req/min per IP.
 *
 * Body: { feature_flags: Record<string, boolean>, reason: string, expected_updated_at: string }
 *
 * Optimistic locking: compares expected_updated_at vs current tenants.updated_at.
 * On mismatch, returns 409 with the current state so the client can refresh.
 *
 * Merges provided keys into existing feature_flags (not a full replace).
 */
const handlePatch = withPlatformAdmin(async (request, { params, adminCtx, ip, userAgent, requestId }) => {
  const tenantId = params.id

  const body = await request.json()
  const featureFlags = body.feature_flags as Record<string, boolean> | undefined
  const reason = body.reason as string
  const expectedUpdatedAt = body.expected_updated_at as string

  // ── Validate ──
  if (!featureFlags || typeof featureFlags !== 'object') {
    return NextResponse.json(
      { error: 'feature_flags must be an object of { flag: boolean } pairs.' },
      { status: 400 }
    )
  }

  // Validate all values are booleans
  for (const [key, val] of Object.entries(featureFlags)) {
    if (typeof val !== 'boolean') {
      return NextResponse.json(
        { error: `feature_flags.${key} must be a boolean.` },
        { status: 400 }
      )
    }
  }

  if (typeof reason !== 'string' || reason.trim().length < 5) {
    return NextResponse.json(
      { error: 'reason is required and must be at least 5 characters.' },
      { status: 400 }
    )
  }

  if (typeof expectedUpdatedAt !== 'string') {
    return NextResponse.json(
      { error: 'expected_updated_at is required for optimistic locking.' },
      { status: 400 }
    )
  }

  const admin = createAdminClient()

  // ── Read current state ──
  const { data: tenant, error: readErr } = await admin
    .from('tenants')
    .select('feature_flags, updated_at')
    .eq('id', tenantId)
    .single()

  if (readErr || !tenant) {
    return NextResponse.json({ error: 'Tenant not found.' }, { status: 404 })
  }

  // ── Optimistic locking ──
  if (tenant.updated_at !== expectedUpdatedAt) {
    const currentRaw = (tenant.feature_flags ?? {}) as Record<string, boolean>
    return NextResponse.json(
      {
        error: 'Conflict: tenant was modified since you loaded this page. Please refresh and try again.',
        code: 'OPTIMISTIC_LOCK_CONFLICT',
        current: {
          raw: currentRaw,
          effective: getEffectiveFeatures(currentRaw),
          updated_at: tenant.updated_at,
        },
      },
      { status: 409 }
    )
  }

  // ── Merge flags ──
  const currentFlags = (tenant.feature_flags ?? {}) as Record<string, boolean>
  const mergedFlags = { ...currentFlags, ...featureFlags }

  // ── Update ──
  const { error: updateErr } = await admin
    .from('tenants')
    .update({ feature_flags: mergedFlags as unknown as Json })
    .eq('id', tenantId)

  if (updateErr) {
    return NextResponse.json(
      { error: `Failed to update feature flags: ${updateErr.message}` },
      { status: 500 }
    )
  }

  // ── Audit ──
  logPlatformAdminAudit({
    admin_id: adminCtx.adminId,
    action: 'feature_flags_updated',
    target_type: 'tenant',
    target_id: tenantId,
    tenant_id: tenantId,
    changes: { before: currentFlags, after: mergedFlags },
    reason: reason.trim(),
    ip,
    user_agent: userAgent,
    request_id: requestId,
  })

  log.info('[platform-admin] feature flags updated', {
    tenant_id: tenantId,
    admin_id: adminCtx.adminId ?? 'bearer-token',
    changed_keys: Object.keys(featureFlags),
  })

  // Re-read tier for accurate effective computation
  const { data: updatedTenant } = await admin
    .from('tenants')
    .select('subscription_tier')
    .eq('id', tenantId)
    .single()

  return NextResponse.json({
    data: {
      raw: mergedFlags,
      effective: getEffectiveFeatures(mergedFlags, updatedTenant?.subscription_tier),
      defaults: PLATFORM_FEATURE_DEFAULTS,
      subscription_tier: updatedTenant?.subscription_tier,
    },
    error: null,
  })
})

export const GET = withTiming(handleGet, 'GET /api/admin/tenants/[id]/features')
export const PATCH = withTiming(handlePatch, 'PATCH /api/admin/tenants/[id]/features')
