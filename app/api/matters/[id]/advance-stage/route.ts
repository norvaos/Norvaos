import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import { advanceGenericStage, advanceImmigrationStage } from '@/lib/services/stage-engine'
import { invalidateGating, invalidateMatter } from '@/lib/services/cache-invalidation'
import { dispatchNotification } from '@/lib/services/notification-engine'
import { withTiming } from '@/lib/middleware/request-timing'
import { evaluateRiskFlags } from '@/lib/services/risk-flag-engine'
import type { NorvaOSGateFailure } from '@/lib/types/errors'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * POST /api/matters/[id]/advance-stage
 *
 * Server-side stage advancement with gating enforcement.
 * Handles both immigration and generic (Real Estate, etc.) stage systems.
 *
 * Body: { targetStageId: string, system: 'immigration' | 'generic' }
 * Returns: { success: true, stageName } | { success: false, error, failedRules? }
 *
 * On success, writes an immutable entry to stage_transition_log so Zone E
 * (audit rail) can display full transition history.
 */
async function handlePost(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: matterId } = await params

    // 1. Authenticate, authorise, and get tenant context
    const auth = await authenticateRequest()
    const admin = createAdminClient()
    requirePermission(auth, 'matters', 'edit')

    // 2. Parse request body
    const body = await request.json()
    const { targetStageId, system } = body as {
      targetStageId?: string
      system?: 'immigration' | 'generic'
    }

    if (!targetStageId) {
      return NextResponse.json(
        { success: false, error: 'targetStageId is required' },
        { status: 400 }
      )
    }

    if (!system || !['immigration', 'generic'].includes(system)) {
      return NextResponse.json(
        { success: false, error: 'system must be "immigration" or "generic"' },
        { status: 400 }
      )
    }

    // 3. Verify the matter belongs to the authenticated user's tenant
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

    // 4. Capture the current stage BEFORE advancing so the log has from/to names.
    //    Run in parallel with the stage-names lookup for targetStageId.
    const [stageStateResult, stageNamesResult] = await Promise.all([
      admin
        .from('matter_stage_state')
        .select('current_stage_id')
        .eq('matter_id', matterId)
        .maybeSingle(),
      admin
        .from('matter_stages')
        .select('id, name')
        .in('id', [targetStageId]),          // will be augmented with fromStageId below
    ])

    const fromStageId = stageStateResult.data?.current_stage_id ?? null

    // If fromStage differs from target, fetch its name too (single round-trip)
    let stageNameMap: Record<string, string> = {}
    if (stageNamesResult.data) {
      stageNameMap = Object.fromEntries(stageNamesResult.data.map(s => [s.id, s.name]))
    }

    // Fetch from-stage name if we have an ID and it wasn't already fetched
    if (fromStageId && !stageNameMap[fromStageId]) {
      const { data: fromStageRow } = await admin
        .from('matter_stages')
        .select('id, name')
        .eq('id', fromStageId)
        .single()
      if (fromStageRow) stageNameMap[fromStageId] = fromStageRow.name
    }

    const fromStageName = fromStageId ? (stageNameMap[fromStageId] ?? null) : null

    // 5. Dispatch to appropriate stage engine
    const engineParams = {
      supabase: admin,
      matterId,
      tenantId: auth.tenantId,
      targetStageId,
      userId: auth.userId,
    }

    const result = system === 'immigration'
      ? await advanceImmigrationStage(engineParams)
      : await advanceGenericStage(engineParams)

    // 6. On success: invalidate caches, write audit log entry, notify lawyer
    if (result.success) {
      const toStageName = stageNameMap[targetStageId] ?? result.stageName ?? null

      // 6a. Invalidate caches
      await Promise.all([
        invalidateGating(auth.tenantId, matterId),
        invalidateMatter(auth.tenantId, matterId),
      ])

      // 6b. Fire-and-forget risk flag evaluation on every successful stage advance.
      evaluateRiskFlags(admin, auth.tenantId, matterId)
        .catch((e) => console.error('[advance-stage] Risk flag evaluation failed:', e))

      // 6b-ii. Fire-and-forget readiness recompute — forward auth cookie.
      fetch(`${process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'}/api/matters/${matterId}/readiness`, {
        method: 'POST',
        headers: { cookie: request.headers.get('cookie') ?? '' },
      }).catch((e: unknown) => console.error('[advance-stage] Readiness recompute failed:', e))

      // 6b-iii. Fire-and-forget next action recompute.
      fetch(`${process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'}/api/matters/${matterId}/next-action`, {
        method: 'POST',
        headers: { cookie: request.headers.get('cookie') ?? '' },
      }).catch((e: unknown) => console.error('[advance-stage] Next action recompute failed:', e))

      // 6c. Write to stage_transition_log — fire-and-forget, non-fatal.
      //     Zone E (audit rail) reads from this table.
      //     gate_snapshot now carries the full per-condition evaluation result.
      admin
        .from('stage_transition_log')
        .insert({
          tenant_id:       auth.tenantId,
          matter_id:       matterId,
          from_stage_id:   fromStageId,
          to_stage_id:     targetStageId,
          from_stage_name: fromStageName,
          to_stage_name:   toStageName,
          transition_type: 'advance',
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          gate_snapshot:   result.gateSnapshot as any,
          transitioned_by: auth.userId,
        })
        .then(({ error: logErr }) => {
          if (logErr) {
            console.error('[advance-stage] Failed to write stage_transition_log:', logErr.message)
          }
        })

      // 6d. Notify responsible lawyer
      const { data: matterDetail } = await admin
        .from('matters')
        .select('responsible_lawyer_id')
        .eq('id', matterId)
        .single()

      const recipientIds = matterDetail?.responsible_lawyer_id
        && matterDetail.responsible_lawyer_id !== auth.userId
        ? [matterDetail.responsible_lawyer_id]
        : []

      if (recipientIds.length > 0) {
        dispatchNotification(admin, {
          tenantId:        auth.tenantId,
          eventType:       'stage_change',
          recipientUserIds: recipientIds,
          title:           `Stage changed: ${toStageName ?? 'New Stage'}`,
          message:         `Matter advanced from "${fromStageName ?? '—'}" to "${toStageName ?? 'New Stage'}".`,
          entityType:      'matter',
          entityId:        matterId,
          priority:        'normal',
        }).catch(() => {})
      }

      return NextResponse.json(result, { status: 200 })
    } else {
      // Gate failure: return structured 422 with NorvaOSGateFailure payload.
      // This lets the UI distinguish a gate block (422) from a bad request (400)
      // and surface actionable messaging about which conditions failed.
      const failedConditions = result.conditions ?? []
      const hasGateConditions = failedConditions.length > 0

      if (hasGateConditions) {
        const gateFailure: NorvaOSGateFailure = {
          code: 'GATE_CONDITIONS_NOT_MET',
          title: 'Stage Advancement Blocked',
          message: result.error,
          action: 'Resolve the listed conditions before advancing to the next stage.',
          owner: 'lawyer',
          failedConditions: failedConditions.filter((c) => !c.passed),
        }

        // Gate failures from the stage engine (including require_retainer_agreement)
        // surface automatically via failedConditions above. The block below adds
        // retainer-specific context so the UI can render a targeted CTA.
        const responseBody: Record<string, unknown> = {
          success: false,
          error: gateFailure.title,
          code: gateFailure.code,
          gateFailure,
          failedRules: result.failedRules ?? [],
        }

        const retainerCondition = failedConditions.find(
          (c) => c.conditionId === 'require_retainer_agreement'
        )
        if (retainerCondition && !retainerCondition.passed) {
          responseBody.retainerGate = {
            blocked: true,
            details: retainerCondition.details,
            action: 'Generate and sign a Retainer Agreement before advancing.',
            owner: 'billing',
          }
        }

        return NextResponse.json(responseBody, { status: 422 })
      }

      // Non-gate failure (e.g. missing pipeline, DB error) — keep 400
      return NextResponse.json(result, { status: 400 })
    }
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.status }
      )
    }

    console.error('Stage advancement error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export const POST = withTiming(handlePost, 'POST /api/matters/[id]/advance-stage')

const admin = createAdminClient()