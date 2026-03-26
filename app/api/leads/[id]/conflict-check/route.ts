import { NextResponse } from 'next/server'
import { authenticateRequest } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import { createAdminClient } from '@/lib/supabase/admin'
import { runAndPersistConflictCheck } from '@/lib/services/conflict-check-alpha'

/**
 * POST /api/leads/[id]/conflict-check
 *
 * Run the alpha conflict check: searches same-tenant contacts by email
 * and passport number. Updates leads.conflict_status accordingly.
 *
 * Sentinel Guard: The RPC is SECURITY DEFINER with strict tenant isolation.
 * It NEVER reveals cross-tenant data.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: leadId } = await params
    const auth = await authenticateRequest()
    requirePermission(auth, 'leads', 'edit')

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

    const result = await runAndPersistConflictCheck(admin, leadId)

    return NextResponse.json({
      success: true,
      ...result,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to run conflict check'
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    )
  }
}
