import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { log } from '@/lib/utils/logger'
import { withPlatformAdmin } from '@/lib/services/with-platform-admin'
import { logPlatformAdminAudit } from '@/lib/services/platform-admin-audit'
import { withTiming } from '@/lib/middleware/request-timing'

const VALID_STATUSES = ['active', 'suspended', 'closed'] as const
type TenantStatus = (typeof VALID_STATUSES)[number]

/**
 * PATCH /api/admin/tenants/[id]/status
 *
 * Platform-admin ONLY — change a tenant's lifecycle status.
 * Rate-limited: 30 req/min per IP.
 *
 * Body: { status: 'active' | 'suspended' | 'closed', reason: string }
 *
 * Guards:
 *   - Cannot transition from 'closed' to any other status (one-way)
 *   - Idempotent: re-sending the same status is a no-op (returns current state)
 */
const handlePatch = withPlatformAdmin(async (request, { params, adminCtx, ip, userAgent, requestId }) => {
  const tenantId = params.id

  const body = await request.json()
  const newStatus = body.status as TenantStatus
  const reason = body.reason as string

  // ── Validate ──
  if (!VALID_STATUSES.includes(newStatus)) {
    return NextResponse.json(
      { error: `status must be one of: ${VALID_STATUSES.join(', ')}` },
      { status: 400 }
    )
  }

  if (typeof reason !== 'string' || reason.trim().length < 5) {
    return NextResponse.json(
      { error: 'reason is required and must be at least 5 characters.' },
      { status: 400 }
    )
  }

  const admin = createAdminClient()

  // ── Read current status ──
  const { data: tenant, error: readErr } = await admin
    .from('tenants')
    .select('status')
    .eq('id', tenantId)
    .single()

  if (readErr || !tenant) {
    return NextResponse.json({ error: 'Tenant not found.' }, { status: 404 })
  }

  const previousStatus = tenant.status

  // Guard: cannot resurrect a closed tenant
  if (previousStatus === 'closed' && newStatus !== 'closed') {
    return NextResponse.json(
      { error: 'Cannot change status of a closed tenant. Closure is permanent.' },
      { status: 409 }
    )
  }

  // Idempotent: no-op if already in target status
  if (previousStatus === newStatus) {
    return NextResponse.json({
      data: { tenant_id: tenantId, status: newStatus, changed: false },
      error: null,
    })
  }

  // ── Update ──
  const { error: updateErr } = await admin
    .from('tenants')
    .update({ status: newStatus })
    .eq('id', tenantId)

  if (updateErr) {
    return NextResponse.json(
      { error: `Failed to update status: ${updateErr.message}` },
      { status: 500 }
    )
  }

  // ── Audit ──
  logPlatformAdminAudit({
    admin_id: adminCtx.adminId,
    action: 'tenant_status_changed',
    target_type: 'tenant',
    target_id: tenantId,
    tenant_id: tenantId,
    changes: { previous: previousStatus, new: newStatus },
    reason: reason.trim(),
    ip,
    user_agent: userAgent,
    request_id: requestId,
  })

  log.info('[platform-admin] tenant status changed', {
    tenant_id: tenantId,
    previous: previousStatus,
    new: newStatus,
    admin_id: adminCtx.adminId ?? 'bearer-token',
  })

  return NextResponse.json({
    data: { tenant_id: tenantId, status: newStatus, previous_status: previousStatus, changed: true },
    error: null,
  })
})

export const PATCH = withTiming(handlePatch, 'PATCH /api/admin/tenants/[id]/status')
