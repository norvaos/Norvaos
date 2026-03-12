import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import { closeLead } from '@/lib/services/lead-closure-engine'
import { withTiming } from '@/lib/middleware/request-timing'
import type { LeadStage } from '@/lib/config/lead-workflow-definitions'

/**
 * POST /api/leads/[id]/close
 *
 * Close a lead with a specific closure stage and reason.
 * Delegates to the closure engine which handles:
 *   - Creating closure record
 *   - Skipping remaining milestone tasks
 *   - Advancing to closure stage
 *   - Activity logging
 *   - Summary recalculation
 *
 * Body: {
 *   closedStage: string,    // e.g., 'closed_no_response', 'closed_not_retained'
 *   reasonCode: string,     // e.g., 'no_response', 'declined_services'
 *   reasonText?: string     // Optional free-text reason
 * }
 */
async function handlePost(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: leadId } = await params
    const auth = await authenticateRequest()
    requirePermission(auth, 'leads', 'edit')

    const body = await request.json()
    const { closedStage, reasonCode, reasonText } = body as {
      closedStage?: string
      reasonCode?: string
      reasonText?: string
    }

    if (!closedStage) {
      return NextResponse.json(
        { success: false, error: 'closedStage is required' },
        { status: 400 }
      )
    }

    if (!reasonCode) {
      return NextResponse.json(
        { success: false, error: 'reasonCode is required' },
        { status: 400 }
      )
    }

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

    const result = await closeLead({
      supabase: auth.supabase,
      leadId,
      tenantId: auth.tenantId,
      closedStage: closedStage as LeadStage,
      reasonCode,
      reasonText,
      closedBy: auth.userId,
    })

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 400 }
      )
    }

    return NextResponse.json({
      success: true,
      closureRecordId: result.closureRecordId,
    })
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('[leads/close] POST error:', err)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export const POST = withTiming(handlePost, 'POST /api/leads/[id]/close')
