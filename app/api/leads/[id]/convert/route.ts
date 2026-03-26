import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import { convertLeadToMatter } from '@/lib/services/lead-conversion-executor'
import { withTiming } from '@/lib/middleware/request-timing'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * POST /api/leads/[id]/convert
 *
 * Convert a lead to a matter. Enforces all conversion gates before proceeding.
 * Returns structured gate results for UI display when blocked.
 *
 * This route does NOT contain business logic  -  all gating, matter creation,
 * audit logging, and state management is in the conversion executor service.
 *
 * Body: {
 *   title: string,
 *   description?: string,
 *   practiceAreaId?: string,
 *   responsibleLawyerId?: string,
 *   originatingLawyerId?: string,
 *   matterTypeId?: string,
 *   caseTypeId?: string,
 *   billingType?: string,
 *   priority?: string,
 *   pipelineId?: string,
 *   stageId?: string,
 * }
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
    const {
      title,
      description,
      practiceAreaId,
      responsibleLawyerId,
      originatingLawyerId,
      matterTypeId,
      caseTypeId,
      billingType,
      priority,
      pipelineId,
      stageId,
    } = body as {
      title?: string
      description?: string
      practiceAreaId?: string
      responsibleLawyerId?: string
      originatingLawyerId?: string
      matterTypeId?: string
      caseTypeId?: string
      billingType?: string
      priority?: string
      pipelineId?: string
      stageId?: string
    }

    if (!title || !title.trim()) {
      return NextResponse.json(
        { success: false, error: 'title is required for matter creation' },
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

    const result = await convertLeadToMatter({
      supabase: admin,
      leadId,
      tenantId: auth.tenantId,
      userId: auth.userId,
      matterData: {
        title: title.trim(),
        description,
        practiceAreaId,
        responsibleLawyerId,
        originatingLawyerId,
        matterTypeId,
        caseTypeId,
        billingType,
        priority,
        pipelineId,
        stageId,
      },
    })

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          error: result.error,
          gateResults: result.gateResults,
          auditEvents: result.auditEvents,
        },
        { status: 400 }
      )
    }

    return NextResponse.json(
      {
        success: true,
        matterId: result.matterId,
        gateResults: result.gateResults,
        auditEvents: result.auditEvents,
      },
      { status: 201 }
    )
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('[leads/convert] POST error:', err)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export const POST = withTiming(handlePost, 'POST /api/leads/[id]/convert')
