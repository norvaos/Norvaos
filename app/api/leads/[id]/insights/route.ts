import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import { generateIntakeInsights, acceptAIInsight } from '@/lib/services/lead-ai-service'
import { withTiming } from '@/lib/middleware/request-timing'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * POST /api/leads/[id]/insights
 *
 * Generate AI insights for a lead. The AI service is assistive-only —
 * outputs are stored as suggestions, never auto-applied.
 */
async function handlePost(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: leadId } = await params
    const auth = await authenticateRequest()
    const admin = createAdminClient()
    requirePermission(auth, 'leads', 'view')

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

    const insight = await generateIntakeInsights(
      admin,
      leadId,
      auth.tenantId
    )

    return NextResponse.json({ success: true, insight })
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('[leads/insights] POST error:', err)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * PUT /api/leads/[id]/insights
 *
 * Accept an AI insight — marks it as human-accepted and logs the decision.
 * This is the explicit human approval step required by the AI-assistive-only rule.
 *
 * Body: { insightId: string, notes?: string }
 */
async function handlePut(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: leadId } = await params
    const auth = await authenticateRequest()
    const admin = createAdminClient()
    requirePermission(auth, 'leads', 'edit')

    const body = await request.json()
    const { insightId, notes } = body as {
      insightId?: string
      notes?: string
    }

    if (!insightId) {
      return NextResponse.json(
        { success: false, error: 'insightId is required' },
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

    await acceptAIInsight(
      admin,
      insightId,
      auth.tenantId,
      leadId,
      auth.userId,
      notes
    )

    return NextResponse.json({ success: true })
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('[leads/insights] PUT error:', err)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export const POST = withTiming(handlePost, 'POST /api/leads/[id]/insights')
export const PUT = withTiming(handlePut, 'PUT /api/leads/[id]/insights')
