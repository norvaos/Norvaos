/**
 * Sovereign Control Rollback API  -  Directive 078
 *
 * POST /api/nexus/sovereign-control/rollback
 *   Roll back a Global Ignite by restoring feature_flags from snapshot.
 */

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { withNexusAdmin } from '@/lib/services/with-nexus-admin'
import { logPlatformAdminAudit } from '@/lib/services/platform-admin-audit'
import { log } from '@/lib/utils/logger'
import type { Json } from '@/lib/types/database'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

async function fetchConfigHistory(snapshotId: string) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/global_config_history?id=eq.${snapshotId}&rolled_back_at=is.null&limit=1`,
    {
      headers: {
        'apikey': SERVICE_KEY,
        'Authorization': `Bearer ${SERVICE_KEY}`,
      },
    },
  )
  const rows = await res.json()
  return rows?.[0] ?? null
}

export const POST = withNexusAdmin(async (request, ctx) => {
  const body = await request.json()
  const { snapshot_id, reason } = body as { snapshot_id: string; reason: string }

  if (!snapshot_id || !reason || reason.trim().length < 3) {
    return NextResponse.json(
      { error: 'snapshot_id and reason (min 3 chars) are required.' },
      { status: 400 },
    )
  }

  const admin = createAdminClient()

  // Fetch the snapshot
  const history = await fetchConfigHistory(snapshot_id)

  if (!history) {
    return NextResponse.json(
      { error: 'Snapshot not found or already rolled back.' },
      { status: 404 },
    )
  }

  const snapshot = history.snapshot as { tenants: Array<{ tenant_id: string; tenant_name: string; previous_flags: Record<string, unknown> }> } | null

  if (!snapshot?.tenants?.length) {
    return NextResponse.json(
      { error: 'Snapshot contains no tenant data.' },
      { status: 400 },
    )
  }

  // Restore each tenant's feature_flags to snapshot state
  let restored = 0
  for (const entry of snapshot.tenants) {
    const { error: updateErr } = await admin
      .from('tenants')
      .update({ feature_flags: (entry.previous_flags ?? {}) as unknown as Json })
      .eq('id', entry.tenant_id)
    if (!updateErr) restored++
  }

  // Mark snapshot as rolled back
  await fetch(
    `${SUPABASE_URL}/rest/v1/global_config_history?id=eq.${snapshot_id}`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SERVICE_KEY,
        'Authorization': `Bearer ${SERVICE_KEY}`,
      },
      body: JSON.stringify({
        rolled_back_at: new Date().toISOString(),
        rolled_back_by: ctx.adminCtx.adminId ?? 'bearer-token',
      }),
    },
  )

  // Audit
  await logPlatformAdminAudit({
    admin_id: ctx.adminCtx.adminId ?? null,
    action: 'global_ignite_rollback',
    target_type: 'tenant',
    target_id: 'ALL',
    tenant_id: 'GLOBAL',
    changes: { snapshot_id, tenants_restored: restored },
    reason: reason.trim(),
    ip: ctx.ip,
    user_agent: ctx.userAgent,
    request_id: ctx.requestId,
  }).catch(() => {})

  log.warn('[sovereign-control] Global Ignite ROLLED BACK', {
    snapshot_id,
    restored,
    admin_id: ctx.adminCtx.adminId ?? 'bearer-token',
  })

  return NextResponse.json({
    data: { snapshot_id, tenants_restored: restored, total: snapshot.tenants.length },
    error: null,
  })
})
