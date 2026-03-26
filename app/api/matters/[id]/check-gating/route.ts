import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import {
  evaluateGatingRules,
  getEffectiveGatingRules,
  type GatingRule,
} from '@/lib/services/stage-engine'
import { withTiming } from '@/lib/middleware/request-timing'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * GET /api/matters/[id]/check-gating
 *
 * Pre-evaluates gating rules for ALL stages in the matter's pipeline.
 * Returns which stages are blocked and why  -  powers the lock indicators
 * on the StagePipelineBar.
 *
 * CRITICAL: This route imports and calls the exact same evaluateGatingRules()
 * and getEffectiveGatingRules() functions used by advanceGenericStage(),
 * ensuring zero UI/enforcement drift.
 *
 * Returns: { gatingErrors: Record<stageId, string[]> }
 */
async function handleGet(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: matterId } = await params

    // 1. Authenticate, authorize, and get tenant context
    const auth = await authenticateRequest()
    const admin = createAdminClient()
    requirePermission(auth, 'matters', 'view')

    // 2. Verify the matter belongs to the authenticated user's tenant
    const { data: matter, error: matterErr } = await admin
      .from('matters')
      .select('id, tenant_id')
      .eq('id', matterId)
      .eq('tenant_id', auth.tenantId)
      .single()

    if (matterErr || !matter) {
      return NextResponse.json(
        { success: false, error: 'Matter not found or access denied' },
        { status: 404 }
      )
    }

    // 3. Fetch matter_stage_state to get pipeline_id + stage_history
    const { data: stageState } = await admin
      .from('matter_stage_state')
      .select('pipeline_id, current_stage_id, stage_history')
      .eq('matter_id', matterId)
      .maybeSingle()

    if (!stageState?.pipeline_id) {
      // No pipeline assigned  -  no gating to evaluate
      return NextResponse.json({ gatingErrors: {} })
    }

    // 4. Fetch all stages in the pipeline (ordered by sort_order)
    const { data: stages } = await admin
      .from('matter_stages')
      .select('id, name, sort_order, gating_rules')
      .eq('pipeline_id', stageState.pipeline_id)
      .order('sort_order')

    if (!stages || stages.length === 0) {
      return NextResponse.json({ gatingErrors: {} })
    }

    // 5. Evaluate gating rules for each stage
    const gatingErrors: Record<string, string[]> = {}

    for (const stage of stages) {
      // Cast gating_rules  -  same pattern as advanceGenericStage
      const rawRules = (Array.isArray(stage.gating_rules)
        ? stage.gating_rules
        : []) as unknown as GatingRule[]

      // Resolve effective rules  -  applies default baseline for enforcement-enabled types
      // Passes sort_order so early stages (0–1) are not blocked by default baseline
      const effectiveRules = await getEffectiveGatingRules(
        admin,
        matterId,
        rawRules,
        stage.sort_order
      )

      if (effectiveRules.length > 0) {
        const result = await evaluateGatingRules(
          admin,
          matterId,
          auth.tenantId,
          effectiveRules,
          stageState.stage_history
        )

        if (!result.passed) {
          gatingErrors[stage.id] = result.failedRules
        }
      }
    }

    return NextResponse.json({ gatingErrors })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.status }
      )
    }

    console.error('Check gating error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export const GET = withTiming(handleGet, 'GET /api/matters/[id]/check-gating')
