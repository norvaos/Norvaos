/**
 * Alpha-Firm Designation API  -  Directive 078
 *
 * PATCH /api/nexus/sovereign-control/alpha
 *   Toggle is_internal_test flag on a tenant.
 */

import { NextResponse } from 'next/server'
import { withNexusAdmin } from '@/lib/services/with-nexus-admin'
import { logPlatformAdminAudit } from '@/lib/services/platform-admin-audit'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

export const PATCH = withNexusAdmin(async (request, ctx) => {
  const body = await request.json()
  const { tenant_id, is_internal_test, reason } = body as {
    tenant_id: string
    is_internal_test: boolean
    reason: string
  }

  if (!tenant_id || typeof is_internal_test !== 'boolean' || !reason || reason.trim().length < 3) {
    return NextResponse.json(
      { error: 'tenant_id, is_internal_test, and reason (min 3 chars) are required.' },
      { status: 400 },
    )
  }

  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/tenants?id=eq.${tenant_id}`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SERVICE_KEY,
        'Authorization': `Bearer ${SERVICE_KEY}`,
      },
      body: JSON.stringify({ is_internal_test }),
    },
  )

  if (!res.ok) {
    return NextResponse.json({ error: 'Failed to update alpha designation.' }, { status: 500 })
  }

  await logPlatformAdminAudit({
    admin_id: ctx.adminCtx.adminId ?? null,
    action: is_internal_test ? 'alpha_firm_designated' : 'alpha_firm_removed',
    target_type: 'tenant',
    target_id: tenant_id,
    tenant_id,
    changes: { is_internal_test },
    reason: reason.trim(),
    ip: ctx.ip,
    user_agent: ctx.userAgent,
    request_id: ctx.requestId,
  }).catch(() => {})

  return NextResponse.json({
    data: { tenant_id, is_internal_test },
    error: null,
  })
})
