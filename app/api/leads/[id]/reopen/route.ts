import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import { reopenLead } from '@/lib/services/lead-closure-engine'
import { withTiming } from '@/lib/middleware/request-timing'
import type { LeadStage } from '@/lib/config/lead-workflow-definitions'

/**
 * POST /api/leads/[id]/reopen
 *
 * Reopen a previously closed lead. Delegates to the closure engine which
 * handles task strategies, stage transition, and audit logging.
 *
 * Body: {
 *   targetStage: string,                           // Stage to reopen into
 *   reason: string,                                // Why reopening
 *   taskStrategy: 'restore' | 'reopen' | 'regenerate'  // How to handle tasks
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
    const { targetStage, reason, taskStrategy } = body as {
      targetStage?: string
      reason?: string
      taskStrategy?: 'restore' | 'reopen' | 'regenerate'
    }

    if (!targetStage) {
      return NextResponse.json(
        { success: false, error: 'targetStage is required' },
        { status: 400 }
      )
    }

    if (!reason) {
      return NextResponse.json(
        { success: false, error: 'reason is required' },
        { status: 400 }
      )
    }

    if (!taskStrategy || !['restore', 'reopen', 'regenerate'].includes(taskStrategy)) {
      return NextResponse.json(
        { success: false, error: 'taskStrategy must be one of: restore, reopen, regenerate' },
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

    const result = await reopenLead({
      supabase: auth.supabase,
      leadId,
      tenantId: auth.tenantId,
      targetStage: targetStage as LeadStage,
      reason,
      taskStrategy,
      reopenedBy: auth.userId,
    })

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 400 }
      )
    }

    return NextResponse.json({
      success: true,
      reopenRecordId: result.reopenRecordId,
    })
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('[leads/reopen] POST error:', err)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export const POST = withTiming(handlePost, 'POST /api/leads/[id]/reopen')
