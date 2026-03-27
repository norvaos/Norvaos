/**
 * Sovereign Control API  -  Directive 075
 *
 * GET  /api/nexus/sovereign-control
 *   Returns all tenants with their communication intelligence flags,
 *   template limits, and impersonation history.
 *
 * PATCH /api/nexus/sovereign-control
 *   Toggle communication flags for a single tenant or all tenants (global ignite).
 *
 * POST /api/nexus/sovereign-control
 *   Impersonation request  -  logs forensic audit event and returns tenant view context.
 */

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { log } from '@/lib/utils/logger'
import { withNexusAdmin } from '@/lib/services/with-nexus-admin'
import { logPlatformAdminAudit } from '@/lib/services/platform-admin-audit'
import { getEffectiveFeatures, COMM_TEMPLATE_LIMITS } from '@/lib/config/features'
import type { Json } from '@/lib/types/database'
import type { SubscriptionTier } from '@/lib/config/features'

// ── GET: All tenants with comm intelligence status ──────────────────────────

export const GET = withNexusAdmin(async () => {
  const admin = createAdminClient()

  const { data: tenants, error } = await admin
    .from('tenants')
    .select('id, name, slug, subscription_tier, status, feature_flags, logo_url, primary_color, created_at, updated_at')
    .order('name')

  if (error || !tenants) {
    return NextResponse.json({ error: 'Failed to fetch tenants.' }, { status: 500 })
  }

  // Enrich with comm flag status and user/matter counts
  const enriched = await Promise.all(
    tenants.map(async (t) => {
      const raw = (t.feature_flags ?? {}) as Record<string, boolean>
      const effective = getEffectiveFeatures(raw, t.subscription_tier)
      const tier = (t.subscription_tier ?? 'starter') as SubscriptionTier
      const templateMax = typeof raw.comm_template_max === 'number'
        ? raw.comm_template_max
        : COMM_TEMPLATE_LIMITS[tier]

      // Counts
      const [usersRes, mattersRes, commsRes, templatesRes] = await Promise.all([
        admin.from('users').select('*', { count: 'exact', head: true }).eq('tenant_id', t.id).eq('is_active', true),
        admin.from('matters').select('*', { count: 'exact', head: true }).eq('tenant_id', t.id),
        admin.from('communications').select('*', { count: 'exact', head: true }).eq('tenant_id', t.id),
        admin.from('communication_templates').select('*', { count: 'exact', head: true }).eq('tenant_id', t.id).eq('is_active', true),
      ])

      return {
        id: t.id,
        name: t.name,
        slug: t.slug,
        subscription_tier: t.subscription_tier,
        status: t.status,
        logo_url: t.logo_url,
        primary_color: t.primary_color,
        is_internal_test: false, // Will be patched below
        created_at: t.created_at,
        updated_at: t.updated_at,
        counts: {
          users: usersRes.count ?? 0,
          matters: mattersRes.count ?? 0,
          communications: commsRes.count ?? 0,
          templates: templatesRes.count ?? 0,
        },
        comm_flags: {
          hybrid_ai_ingest: effective.hybrid_ai_ingest ?? false,
          ircc_pattern_match: effective.ircc_pattern_match ?? false,
          voip_bridge: effective.voip_bridge ?? false,
          comm_template_max: templateMax,
        },
        raw_overrides: raw,
      }
    })
  )

  // Patch is_internal_test (column exists in DB but not in generated Supabase types)
  const { data: alphaRows } = await admin
    .from('tenants')
    .select('id' as '*')
    .eq('is_internal_test' as 'id', true as never)
  const alphaIds = new Set((alphaRows ?? []).map((r: { id: string }) => r.id))
  for (const t of enriched) {
    t.is_internal_test = alphaIds.has(t.id)
  }

  // Impersonation history (last 20)
  const { data: impersonationLogs } = await admin
    .from('platform_admin_audit_logs')
    .select('*')
    .eq('action', 'tenant_impersonation')
    .order('created_at', { ascending: false })
    .limit(20)

  return NextResponse.json({
    data: {
      tenants: enriched,
      impersonation_history: impersonationLogs ?? [],
      total: enriched.length,
    },
    error: null,
  })
})

// ── PATCH: Toggle comm flags (single tenant or global ignite) ───────────────

export const PATCH = withNexusAdmin(async (request, ctx) => {
  const body = await request.json()
  const {
    tenant_id,
    flag,
    value,
    global,
    reason,
  } = body as {
    tenant_id?: string
    flag: string
    value: boolean | number
    global?: boolean
    reason: string
  }

  if (!flag || typeof reason !== 'string' || reason.trim().length < 3) {
    return NextResponse.json(
      { error: 'flag and reason (min 3 chars) are required.' },
      { status: 400 },
    )
  }

  const admin = createAdminClient()

  // ── Global Ignite: toggle for ALL active tenants ──
  if (global) {
    // Directive 078: Scope — 'alpha_only' restricts to is_internal_test firms
    const scope = (body as Record<string, unknown>).scope as string | undefined

    const { data: allTenants, error: fetchErr } = await admin
      .from('tenants')
      .select('id, name, feature_flags')
      .eq('status' as 'id', 'active' as never)

    if (fetchErr || !allTenants) {
      return NextResponse.json({ error: 'Failed to fetch tenants.' }, { status: 500 })
    }

    // Directive 078: If alpha_only, filter to alpha firms
    let targetTenants = allTenants as Array<{ id: string; name: string; feature_flags: Record<string, unknown> | null }>
    if (scope === 'alpha_only') {
      const { data: alphaIds } = await admin
        .from('tenants')
        .select('id' as '*')
        .eq('is_internal_test' as 'id', true as never)
      const alphaSet = new Set((alphaIds ?? []).map((r: { id: string }) => r.id))
      targetTenants = targetTenants.filter((t) => alphaSet.has(t.id))
    }

    // Directive 078: Create snapshot BEFORE flipping bits (1-click rollback)
    const snapshot = targetTenants.map((t) => ({
      tenant_id: t.id,
      tenant_name: t.name,
      previous_flags: t.feature_flags,
    }))

    // Insert into global_config_history (not in Supabase types yet — use admin client with cast)
    let snapshotId: string | null = null
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/global_config_history`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY!,
          'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!}`,
          'Prefer': 'return=representation',
        },
        body: JSON.stringify({
          action: 'global_ignite',
          flag,
          previous_value: { snapshot },
          new_value: { value },
          scope: scope === 'alpha_only' ? 'alpha_only' : 'global',
          tenants_affected: targetTenants.length,
          snapshot: { tenants: snapshot },
          admin_id: ctx.adminCtx.adminId ?? null,
          reason: reason.trim(),
          environment: process.env.NEXT_PUBLIC_DEPLOY_ENV ?? 'production',
          ip: ctx.ip,
          user_agent: ctx.userAgent,
        }),
      })
      const rows = await res.json()
      snapshotId = rows?.[0]?.id ?? null
    } catch {
      log.warn('[sovereign-control] Failed to save config history snapshot')
    }

    let updated = 0
    for (const t of targetTenants) {
      const current = (t.feature_flags ?? {}) as Record<string, unknown>
      const merged = { ...current, [flag]: value }
      const { error: updateErr } = await admin
        .from('tenants')
        .update({ feature_flags: merged as unknown as Json })
        .eq('id', t.id)
      if (!updateErr) updated++
    }

    logPlatformAdminAudit({
      admin_id: ctx.adminCtx.adminId ?? null,
      action: 'global_comm_flag_toggle',
      target_type: 'tenant',
      target_id: 'ALL',
      tenant_id: 'GLOBAL',
      changes: { flag, value, tenants_affected: updated, scope: scope ?? 'global', snapshot_id: snapshotId },
      reason: reason.trim(),
      ip: ctx.ip,
      user_agent: ctx.userAgent,
      request_id: ctx.requestId,
    }).catch(() => {})

    log.info('[sovereign-control] Global ignite', { flag, value, updated, scope: scope ?? 'global' })

    return NextResponse.json({
      data: { flag, value, tenants_updated: updated, total: targetTenants.length, snapshot_id: snapshotId, scope: scope ?? 'global' },
      error: null,
    })
  }

  // ── Single tenant toggle ──
  if (!tenant_id) {
    return NextResponse.json({ error: 'tenant_id is required for single-tenant toggle.' }, { status: 400 })
  }

  const { data: tenant, error: readErr } = await admin
    .from('tenants')
    .select('feature_flags, updated_at')
    .eq('id', tenant_id)
    .single()

  if (readErr || !tenant) {
    return NextResponse.json({ error: 'Tenant not found.' }, { status: 404 })
  }

  const current = (tenant.feature_flags ?? {}) as Record<string, unknown>
  const merged = { ...current, [flag]: value }

  const { error: updateErr } = await admin
    .from('tenants')
    .update({ feature_flags: merged as unknown as Json })
    .eq('id', tenant_id)

  if (updateErr) {
    return NextResponse.json({ error: 'Failed to update.' }, { status: 500 })
  }

  logPlatformAdminAudit({
    admin_id: ctx.adminCtx.adminId ?? null,
    action: 'comm_flag_toggled',
    target_type: 'tenant',
    target_id: tenant_id,
    tenant_id,
    changes: { flag, before: current[flag], after: value },
    reason: reason.trim(),
    ip: ctx.ip,
    user_agent: ctx.userAgent,
    request_id: ctx.requestId,
  }).catch(() => {})

  return NextResponse.json({ data: { tenant_id, flag, value }, error: null })
})

// ── POST: Impersonation Engine ──────────────────────────────────────────────

export const POST = withNexusAdmin(async (request, ctx) => {
  const body = await request.json()
  const { tenant_id, reason } = body as { tenant_id: string; reason: string }

  if (!tenant_id || !reason || reason.trim().length < 5) {
    return NextResponse.json(
      { error: 'tenant_id and reason (min 5 chars) are required.' },
      { status: 400 },
    )
  }

  const admin = createAdminClient()

  const { data: tenant, error } = await admin
    .from('tenants')
    .select('id, name, slug, subscription_tier, feature_flags, logo_url, primary_color, timezone, jurisdiction_code')
    .eq('id', tenant_id)
    .single()

  if (error || !tenant) {
    return NextResponse.json({ error: 'Tenant not found.' }, { status: 404 })
  }

  // Fetch tenant's users, matters, recent activity
  const [usersRes, mattersRes, activityRes] = await Promise.all([
    admin.from('users').select('id, first_name, last_name, email, role, is_active').eq('tenant_id', tenant_id).order('first_name'),
    admin.from('matters').select('id, title, status, created_at').eq('tenant_id', tenant_id).order('created_at', { ascending: false }).limit(20),
    admin.from('activities').select('*').eq('tenant_id', tenant_id).order('created_at', { ascending: false }).limit(30),
  ])

  // ── FORENSIC LOGGING (Law Society compliance) ──
  await logPlatformAdminAudit({
    admin_id: ctx.adminCtx.adminId ?? null,
    action: 'tenant_impersonation',
    target_type: 'tenant',
    target_id: tenant_id,
    tenant_id,
    changes: {
      impersonation_started: new Date().toISOString(),
      admin_ip: ctx.ip,
      admin_user_agent: ctx.userAgent,
    },
    reason: reason.trim(),
    ip: ctx.ip,
    user_agent: ctx.userAgent,
    request_id: ctx.requestId,
  })

  // Also log to sentinel for security monitoring
  await admin.from('sentinel_audit_log').insert({
    event_type: 'ADMIN_IMPERSONATION',
    severity: 'warning',
    actor_id: ctx.adminCtx.adminId ?? 'bearer-token',
    tenant_id,
    details: {
      action: 'tenant_impersonation',
      reason: reason.trim(),
      ip: ctx.ip,
      user_agent: ctx.userAgent,
    } as unknown as Json,
    ip_address: ctx.ip,
  })

  log.warn('[sovereign-control] Impersonation started', {
    admin_id: ctx.adminCtx.adminId ?? 'bearer-token',
    tenant_id,
    tenant_name: tenant.name,
    reason: reason.trim(),
  })

  return NextResponse.json({
    data: {
      tenant,
      users: usersRes.data ?? [],
      matters: mattersRes.data ?? [],
      recent_activity: activityRes.data ?? [],
      impersonation_token: ctx.requestId, // Reference token for audit trail
      started_at: new Date().toISOString(),
    },
    error: null,
  })
})

// ── PUT: Tenant Status Toggle (Suspend / Activate / Close) ──────────────────

export const PUT = withNexusAdmin(async (request, ctx) => {
  const body = await request.json()
  const { tenant_id, status, reason } = body as {
    tenant_id: string
    status: 'active' | 'suspended' | 'closed'
    reason: string
  }

  if (!tenant_id || !status || !reason || reason.trim().length < 3) {
    return NextResponse.json(
      { error: 'tenant_id, status, and reason are required.' },
      { status: 400 },
    )
  }

  if (!['active', 'suspended', 'closed'].includes(status)) {
    return NextResponse.json(
      { error: 'status must be "active", "suspended", or "closed".' },
      { status: 400 },
    )
  }

  const admin = createAdminClient()

  const { data: tenant, error: readErr } = await admin
    .from('tenants')
    .select('id, name, status')
    .eq('id', tenant_id)
    .single()

  if (readErr || !tenant) {
    return NextResponse.json({ error: 'Tenant not found.' }, { status: 404 })
  }

  const previousStatus = tenant.status

  const { error: updateErr } = await admin
    .from('tenants')
    .update({ status })
    .eq('id', tenant_id)

  if (updateErr) {
    return NextResponse.json({ error: 'Failed to update tenant status.' }, { status: 500 })
  }

  // Forensic audit
  await logPlatformAdminAudit({
    admin_id: ctx.adminCtx.adminId ?? null,
    action: status === 'suspended' ? 'tenant_suspended' : status === 'closed' ? 'tenant_closed' : 'tenant_reactivated',
    target_type: 'tenant',
    target_id: tenant_id,
    tenant_id,
    changes: { previous_status: previousStatus, new_status: status },
    reason: reason.trim(),
    ip: ctx.ip,
    user_agent: ctx.userAgent,
    request_id: ctx.requestId,
  }).catch(() => {})

  // Log to sentinel for security monitoring
  await admin.from('sentinel_audit_log').insert({
    event_type: status === 'suspended' ? 'TENANT_SUSPENDED' : 'TENANT_STATUS_CHANGED',
    severity: status === 'suspended' ? 'critical' : 'info',
    actor_id: ctx.adminCtx.adminId ?? 'bearer-token',
    tenant_id,
    details: {
      action: `tenant_status_${status}`,
      previous_status: previousStatus,
      reason: reason.trim(),
    } as unknown as Json,
    ip_address: ctx.ip,
  })

  log.warn('[sovereign-control] Tenant status changed', {
    admin_id: ctx.adminCtx.adminId ?? 'bearer-token',
    tenant_id,
    tenant_name: tenant.name,
    from: previousStatus,
    to: status,
  })

  return NextResponse.json({
    data: { tenant_id, name: tenant.name, previous_status: previousStatus, new_status: status },
    error: null,
  })
})
