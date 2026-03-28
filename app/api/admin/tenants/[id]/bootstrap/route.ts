import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { log } from '@/lib/utils/logger'
import { withPlatformAdmin } from '@/lib/services/with-platform-admin'
import { withTiming } from '@/lib/middleware/request-timing'
import { logPlatformAdminAction } from '@/lib/services/platform-admin'
import type { Json } from '@/lib/types/database'

// ── Starter pack definitions ──────────────────────────────────────────────────

const SYSTEM_ROLES = [
  {
    name: 'Admin',
    description: 'Full access to all firm settings and data.',
    is_system: true,
    permissions: { all: true },
  },
  {
    name: 'Lawyer',
    description: 'Manage matters, contacts, tasks, and trust accounting.',
    is_system: true,
    permissions: {
      leads:             { view: true, create: true, edit: true, delete: false },
      matters:           { view: true, create: true, edit: true, delete: false },
      contacts:          { view: true, create: true, edit: true, delete: false },
      tasks:             { view: true, create: true, edit: true, delete: true },
      conflicts:         { view: true, create: true, approve: true },
      trust_accounting:  { view: true, create: true, edit: true, approve: true },
    },
  },
  {
    name: 'Paralegal',
    description: 'Support matters and contacts; limited billing access.',
    is_system: false,
    permissions: {
      leads:            { view: true },
      matters:          { view: true },
      contacts:         { view: true },
      tasks:            { view: true, create: true, edit: true },
      trust_accounting: { view: true, create: true },
    },
  },
  {
    name: 'Clerk',
    description: 'Read-only access to matters, contacts, and leads.',
    is_system: false,
    permissions: {
      leads:            { view: true },
      matters:          { view: true },
      contacts:         { view: true },
      trust_accounting: { view: true },
    },
  },
]

const STARTER_PACKS: Record<string, { practiceAreas: { name: string; color: string }[] }> = {
  immigration_canada: {
    practiceAreas: [
      { name: 'Immigration', color: '#6366f1' },
      { name: 'Refugee',     color: '#8b5cf6' },
    ],
  },
  real_estate_ontario: {
    practiceAreas: [
      { name: 'Real Estate', color: '#10b981' },
      { name: 'Corporate',   color: '#0ea5e9' },
    ],
  },
  general_practice: {
    practiceAreas: [
      { name: 'General Practice',  color: '#6366f1' },
      { name: 'Family Law',        color: '#f59e0b' },
      { name: 'Civil Litigation',  color: '#ef4444' },
    ],
  },
}

const bootstrapSchema = z.object({
  starter_pack: z.enum(['immigration_canada', 'real_estate_ontario', 'general_practice']),
})

/**
 * POST /api/admin/tenants/[id]/bootstrap
 *
 * Platform-admin ONLY  -  apply a starter pack to a tenant.
 * Idempotent: repeated calls skip already-applied actions (checked via tenant_setup_log).
 *
 * Seeded per run:
 *   - 4 system roles (Admin, Lawyer, Paralegal, Clerk)  -  skipped if already exist
 *   - Practice areas from the chosen starter pack  -  skipped if already exist
 *
 * Each action is recorded in tenant_setup_log with UNIQUE(tenant_id, action).
 * Audit row written per bootstrap call regardless (to track re-attempts).
 */
const handlePost = withPlatformAdmin(async (request, ctx) => {
  const { id: tenantId } = ctx.params

  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })

  const parsed = bootstrapSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid starter pack.' },
      { status: 400 },
    )
  }

  const { starter_pack } = parsed.data
  const admin = createAdminClient()

  // Verify tenant exists
  const { data: tenant } = await admin
    .from('tenants')
    .select('id, name')
    .eq('id', tenantId)
    .single()

  if (!tenant) {
    return NextResponse.json({ error: 'Tenant not found.' }, { status: 404 })
  }

  const pack = STARTER_PACKS[starter_pack]
  const appliedBy = ctx.adminCtx.adminId ?? 'platform-admin'

  const summary: { roles: { created: string[]; skipped: string[] }; practice_areas: { created: string[]; skipped: string[] } } = {
    roles:          { created: [], skipped: [] },
    practice_areas: { created: [], skipped: [] },
  }

  // ── 1. Seed roles (idempotent per role name) ────────────────────────────────
  for (const role of SYSTEM_ROLES) {
    const actionKey = `seed_role_${role.name.toLowerCase()}`

    // Check setup log first  -  skip if already applied
    const { data: logEntry } = await admin
      .from('tenant_setup_log')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('action', actionKey)
      .single()

    if (logEntry) {
      summary.roles.skipped.push(role.name)
      continue
    }

    // Check if role already exists in roles table (may have been created outside bootstrap)
    const { data: existingRole } = await admin
      .from('roles')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('name', role.name)
      .single()

    if (!existingRole) {
      const { error: roleErr } = await admin.from('roles').insert({
        tenant_id:   tenantId,
        name:        role.name,
        description: role.description,
        is_system:   role.is_system,
        permissions: role.permissions as unknown as Json,
      })

      if (roleErr) {
        log.error('[bootstrap] Failed to seed role', { role: role.name, error_code: roleErr.code })
      }
    }

    // Record in setup log  -  ON CONFLICT DO NOTHING handles the race case
    await admin.from('tenant_setup_log').insert({
      tenant_id:   tenantId,
      action:      actionKey,
      starter_pack,
      applied_by:  appliedBy,
      result:      { role: role.name, was_new: !existingRole } as unknown as Json,
    }).select().single()

    summary.roles.created.push(role.name)
  }

  // ── 2. Seed practice areas (idempotent per pack) ────────────────────────────
  const packActionKey = `seed_practice_areas_${starter_pack}`

  const { data: packLogEntry } = await admin
    .from('tenant_setup_log')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('action', packActionKey)
    .single()

  if (packLogEntry) {
    summary.practice_areas.skipped = pack.practiceAreas.map((p) => p.name)
  } else {
    for (const area of pack.practiceAreas) {
      // Check if practice area already exists
      const { data: existingArea } = await admin
        .from('practice_areas')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('name', area.name)
        .single()

      if (!existingArea) {
        const { error: areaErr } = await admin.from('practice_areas').insert({
          tenant_id:  tenantId,
          name:       area.name,
          color:      area.color,
          is_active:  true,
          is_enabled: true,
        })

        if (areaErr) {
          log.error('[bootstrap] Failed to seed practice area', { name: area.name, error_code: areaErr.code })
          summary.practice_areas.skipped.push(area.name)
          continue
        }
      }

      summary.practice_areas.created.push(area.name)
    }

    // Record pack application in setup log
    await admin.from('tenant_setup_log').insert({
      tenant_id:   tenantId,
      action:      packActionKey,
      starter_pack,
      applied_by:  appliedBy,
      result:      summary.practice_areas as unknown as Json,
    }).select().single()
  }

  // ── 3. NorvaOS Standard Master: 7-Stage Sovereign Pipeline (immutable) ──────
  const pipelineActionKey = 'seed_golden_thread_pipeline'
  const { data: pipelineLogEntry } = await admin
    .from('tenant_setup_log')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('action', pipelineActionKey)
    .single()

  if (!pipelineLogEntry) {
    const { data: existingPipeline } = await admin
      .from('pipelines')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('name', 'NorvaOS Standard')
      .maybeSingle()

    if (!existingPipeline) {
      const { data: pipeline } = await admin
        .from('pipelines')
        .insert({
          tenant_id: tenantId,
          name: 'NorvaOS Standard',
          pipeline_type: 'lead',
          is_default: true,
          is_active: true,
        } as never)
        .select('id')
        .single() as unknown as { data: { id: string } | null }

      if (pipeline?.id) {
        const pid = pipeline.id
        await admin.from('pipeline_stages').insert([
          { tenant_id: tenantId, pipeline_id: pid, name: 'Inquiry',          sort_order: 1, color: '#3b82f6', description: 'New inbound lead received.',                            is_win_stage: false, is_lost_stage: false, win_probability: 5,   rotting_days: 2  },
          { tenant_id: tenantId, pipeline_id: pid, name: 'Contacted',        sort_order: 2, color: '#6366f1', description: 'First outbound contact made.',                           is_win_stage: false, is_lost_stage: false, win_probability: 15,  rotting_days: 3  },
          { tenant_id: tenantId, pipeline_id: pid, name: 'Meeting Set',      sort_order: 3, color: '#8b5cf6', description: 'Strategy meeting scheduled.',                            is_win_stage: false, is_lost_stage: false, win_probability: 30,  rotting_days: 5  },
          { tenant_id: tenantId, pipeline_id: pid, name: 'Strategy Held',    sort_order: 4, color: '#f59e0b', description: 'Strategy meeting completed. Smart Pause junction.',      is_win_stage: false, is_lost_stage: false, win_probability: 50,  rotting_days: 7  },
          { tenant_id: tenantId, pipeline_id: pid, name: 'Retainer Sent',    sort_order: 5, color: '#f97316', description: 'Retainer agreement sent.',                               is_win_stage: false, is_lost_stage: false, win_probability: 70,  rotting_days: 10 },
          { tenant_id: tenantId, pipeline_id: pid, name: 'Payment Pending',  sort_order: 6, color: '#eab308', description: 'Invoice or Stripe payment link active.',                 is_win_stage: false, is_lost_stage: false, win_probability: 85,  rotting_days: 14 },
          { tenant_id: tenantId, pipeline_id: pid, name: 'Won / Onboarded',  sort_order: 7, color: '#10b981', description: 'Payment received. Matter created. Client onboarded.',    is_win_stage: true,  is_lost_stage: false, win_probability: 100, rotting_days: null },
        ] as never)
      }
    }

    await admin.from('tenant_setup_log').insert({
      tenant_id: tenantId,
      action: pipelineActionKey,
      starter_pack,
      applied_by: appliedBy,
      result: { pipeline: 'NorvaOS Standard', stages: 7 } as unknown as Json,
    }).select().single()
  }

  // ── 4. Audit log ────────────────────────────────────────────────────────────
  logPlatformAdminAction({
    tenant_id:   tenantId,
    action:      'tenant_bootstrapped',
    entity_type: 'tenant',
    entity_id:   tenantId,
    changes:     { starter_pack, summary } as Record<string, unknown>,
    reason:      `Starter pack "${starter_pack}" applied`,
    ip:          ctx.ip,
    user_agent:  ctx.userAgent,
    request_id:  ctx.requestId,
  }).catch(() => {})

  log.info('[bootstrap] Tenant bootstrapped', {
    tenant_id:    tenantId,
    starter_pack,
    roles_created: summary.roles.created.length,
    areas_created: summary.practice_areas.created.length,
  })

  return NextResponse.json({
    tenantId,
    starter_pack,
    summary,
    error: null,
  })
})

export const POST = withTiming(handlePost, 'POST /api/admin/tenants/[id]/bootstrap')
