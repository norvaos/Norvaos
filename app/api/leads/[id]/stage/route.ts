import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import { advanceLeadStage, getAvailableTransitionsWithStatus } from '@/lib/services/lead-stage-engine'
import { withTiming } from '@/lib/middleware/request-timing'
import type { LeadStage } from '@/lib/config/lead-workflow-definitions'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * GET /api/leads/[id]/stage
 *
 * Returns available stage transitions for a lead with their guard status.
 * Evaluates each possible transition's guards against the lead's current state.
 */
async function handleGet(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: leadId } = await params
    const auth = await authenticateRequest()
    const admin = createAdminClient()
    requirePermission(auth, 'leads', 'view')

    // Verify lead belongs to tenant
    const { data: lead, error } = await admin
      .from('leads')
      .select('id, current_stage')
      .eq('id', leadId)
      .eq('tenant_id', auth.tenantId)
      .single()

    if (error || !lead) {
      return NextResponse.json(
        { success: false, error: 'Lead not found or access denied' },
        { status: 404 }
      )
    }

    const transitions = await getAvailableTransitionsWithStatus(
      admin,
      leadId
    )

    return NextResponse.json({
      success: true,
      currentStage: lead.current_stage,
      transitions,
    })
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('[leads/stage] GET error:', err)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/leads/[id]/stage
 *
 * Advance a lead to a new stage. Guards are evaluated by the stage engine.
 * Business logic remains in the service layer — this route only validates
 * input and delegates.
 *
 * Body: { targetStage: string, reason?: string }
 */
async function handlePost(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: leadId } = await params
    const auth = await authenticateRequest()
    const admin = createAdminClient()
    requirePermission(auth, 'leads', 'edit')

    const body = await request.json()
    const { targetStage, reason } = body as {
      targetStage?: string
      reason?: string
    }

    if (!targetStage) {
      return NextResponse.json(
        { success: false, error: 'targetStage is required' },
        { status: 400 }
      )
    }

    // Verify lead belongs to tenant
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

    const result = await advanceLeadStage({
      supabase: admin,
      leadId,
      tenantId: auth.tenantId,
      targetStage: targetStage as LeadStage,
      actorUserId: auth.userId,
      actorType: 'user',
      reason,
    })

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          error: result.error,
          blockedReasons: result.blockedReasons,
        },
        { status: 400 }
      )
    }

    return NextResponse.json({
      success: true,
      previousStage: result.previousStage,
      newStage: targetStage,
    })
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('[leads/stage] POST error:', err)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export const GET = withTiming(handleGet, 'GET /api/leads/[id]/stage')
export const POST = withTiming(handlePost, 'POST /api/leads/[id]/stage')
