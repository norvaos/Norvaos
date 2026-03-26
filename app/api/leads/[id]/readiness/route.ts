import { NextResponse } from 'next/server'
import { authenticateRequest } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import { createAdminClient } from '@/lib/supabase/admin'
import { calculateAndPersistReadiness } from '@/lib/services/lead-readiness-engine'

/**
 * GET /api/leads/[id]/readiness
 *
 * Calculate lead readiness score via fn_calculate_lead_readiness RPC.
 * Persists the result to leads.readiness_score and leads.readiness_breakdown.
 * Budget: < 10ms RPC execution.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: leadId } = await params
    const auth = await authenticateRequest()
    requirePermission(auth, 'leads', 'view')

    const admin = createAdminClient()

    // Verify lead belongs to tenant (lean: 2 columns)
    const { data: lead, error: leadErr } = await admin
      .from('leads')
      .select('id, tenant_id')
      .eq('id', leadId)
      .eq('tenant_id', auth.tenantId)
      .single()

    if (leadErr || !lead) {
      return NextResponse.json(
        { success: false, error: 'Lead not found or access denied' },
        { status: 404 }
      )
    }

    const result = await calculateAndPersistReadiness(admin, leadId)

    return NextResponse.json({
      success: true,
      ...result,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to calculate readiness'
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    )
  }
}
