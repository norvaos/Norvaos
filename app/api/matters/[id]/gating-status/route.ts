import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { withTiming } from '@/lib/middleware/request-timing'
import { createAdminClient } from '@/lib/supabase/admin'
import { evaluateGatingRules, type GatingRule } from '@/lib/services/stage-engine'

/**
 * GET /api/matters/[id]/gating-status
 *
 * Returns the evaluated gating rules for the matter's current stage,
 * including retainer agreement status. Used by the UI to show
 * blockers and readiness indicators.
 *
 * Response: {
 *   matterId, currentStageId, currentStageName,
 *   gatingRules: GatingRule[],
 *   evaluation: { passed, failedRules, conditions },
 *   retainerStatus: { exists, status, meetsGate }
 * }
 */
async function handleGet(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: matterId } = await params
    const auth = await authenticateRequest()
    const admin = createAdminClient()

    // Verify matter belongs to tenant
    const { data: matter, error: matterErr } = await admin
      .from('matters')
      .select('id, tenant_id, matter_type_id, status')
      .eq('id', matterId)
      .eq('tenant_id', auth.tenantId)
      .single()

    if (matterErr || !matter) {
      return NextResponse.json(
        { error: 'Matter not found or access denied' },
        { status: 404 },
      )
    }

    // Get current stage state
    const { data: stageState } = await admin
      .from('matter_stage_state')
      .select('current_stage_id, pipeline_id, stage_history')
      .eq('matter_id', matterId)
      .maybeSingle()

    if (!stageState?.current_stage_id) {
      return NextResponse.json({
        matterId,
        currentStageId: null,
        currentStageName: null,
        gatingRules: [],
        evaluation: { passed: true, failedRules: [], conditions: [] },
        retainerStatus: { exists: false, status: null, meetsGate: false },
      })
    }

    // Get current stage definition with gating rules
    const { data: currentStage } = await admin
      .from('matter_stages')
      .select('id, name, gating_rules, sort_order')
      .eq('id', stageState.current_stage_id)
      .single()

    const gatingRules = (
      Array.isArray(currentStage?.gating_rules)
        ? currentStage.gating_rules
        : []
    ) as unknown as GatingRule[]

    // Evaluate all gating rules
    const evaluation = await evaluateGatingRules(
      admin,
      matterId,
      auth.tenantId,
      gatingRules,
      stageState.stage_history,
    )

    // Get retainer status separately for detailed display
    const { data: retainerRaw } = await admin
      .from('retainer_agreements' as never)
      .select('id, status, signed_at, sent_at')
      .eq('matter_id', matterId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const retainer = retainerRaw as { id: string; status: string; signed_at: string | null; sent_at: string | null } | null
    const retainerStatus = {
      exists: !!retainer,
      status: retainer?.status ?? null,
      signedAt: retainer?.signed_at ?? null,
      sentAt: retainer?.sent_at ?? null,
      meetsGate: retainer?.status === 'signed',
    }

    return NextResponse.json({
      matterId,
      currentStageId: stageState.current_stage_id,
      currentStageName: currentStage?.name ?? null,
      gatingRules,
      evaluation,
      retainerStatus,
    })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error('[gating-status] Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export const GET = withTiming(handleGet, 'GET /api/matters/[id]/gating-status')
