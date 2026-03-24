/**
 * POST /api/matters/risk-flags/evaluate-all
 *
 * Bulk risk-flag evaluation for all active matters in the tenant.
 * Requires admin permission on the matters resource.
 *
 * Response:
 *   { success: true, total: N, succeeded: N, failed: N }
 */
import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import { evaluateRiskFlags } from '@/lib/services/risk-flag-engine'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(_request: Request) {
  try {
    const auth = await authenticateRequest()
    const admin = createAdminClient()
    requirePermission(auth, 'matters', 'admin')

    const { data: matters } = await admin
      .from('matters')
      .select('id')
      .eq('tenant_id', auth.tenantId)
      .eq('status', 'active')

    const results = await Promise.allSettled(
      (matters ?? []).map((m) =>
        evaluateRiskFlags(admin, auth.tenantId, m.id),
      ),
    )

    return NextResponse.json({
      success: true,
      total: results.length,
      succeeded: results.filter((r) => r.status === 'fulfilled').length,
      failed: results.filter((r) => r.status === 'rejected').length,
    })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
