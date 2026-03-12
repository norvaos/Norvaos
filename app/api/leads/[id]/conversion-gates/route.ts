import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import { evaluateConversionGates } from '@/lib/services/lead-conversion-gate'
import { getWorkspaceWorkflowConfig } from '@/lib/services/workspace-config-service'
import { withTiming } from '@/lib/middleware/request-timing'

/**
 * GET /api/leads/[id]/conversion-gates
 *
 * Evaluate all conversion gates for a lead without executing conversion.
 * Returns the current status of each gate — useful for UI pre-checks
 * and showing the user what needs to be resolved before converting.
 */
async function handleGet(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: leadId } = await params
    const auth = await authenticateRequest()
    requirePermission(auth, 'leads', 'view')

    // Verify lead belongs to tenant
    const { data: lead, error: leadErr } = await auth.supabase
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

    const config = await getWorkspaceWorkflowConfig(auth.supabase, auth.tenantId)
    const result = await evaluateConversionGates(
      auth.supabase,
      leadId,
      auth.tenantId,
      config
    )

    return NextResponse.json({
      success: true,
      canConvert: result.canConvert,
      blockedReasons: result.blockedReasons,
      gateResults: result.gateResults,
    })
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('[leads/conversion-gates] GET error:', err)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export const GET = withTiming(handleGet, 'GET /api/leads/[id]/conversion-gates')
