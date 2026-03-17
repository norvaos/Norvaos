import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import { advanceGenericStage, advanceImmigrationStage } from '@/lib/services/stage-engine'
import { invalidateGating, invalidateMatter } from '@/lib/services/cache-invalidation'
import { dispatchNotification } from '@/lib/services/notification-engine'
import { withTiming } from '@/lib/middleware/request-timing'

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
    const { data: matter, error: matterErr } = await auth.supabase
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
      auth.supabase
        .from('matter_stage_state')
        .select('current_stage_id')
        .eq('matter_id', matterId)
        .maybeSingle(),
      auth.supabase
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
      const { data: fromStageRow } = await auth.supabase
        .from('matter_stages')
        .select('id, name')
        .eq('id', fromStageId)
        .single()
      if (fromStageRow) stageNameMap[fromStageId] = fromStageRow.name
    }

    const fromStageName = fromStageId ? (stageNameMap[fromStageId] ?? null) : null

    // 5. Dispatch to appropriate stage engine
    const engineParams = {
      supabase: auth.supabase,
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

      // 6b. Write to stage_transition_log — fire-and-forget, non-fatal.
      //     Zone E (audit rail) reads from this table.
      auth.supabase
        .from('stage_transition_log')
        .insert({
          tenant_id:       auth.tenantId,
          matter_id:       matterId,
          from_stage_id:   fromStageId,
          to_stage_id:     targetStageId,
          from_stage_name: fromStageName,
          to_stage_name:   toStageName,
          transition_type: 'advance',
          gate_snapshot:   {},
          transitioned_by: auth.userId,
        })
        .then(({ error: logErr }) => {
          if (logErr) {
            console.error('[advance-stage] Failed to write stage_transition_log:', logErr.message)
          }
        })

      // 6c. Notify responsible lawyer
      const { data: matterDetail } = await auth.supabase
        .from('matters')
        .select('responsible_lawyer_id')
        .eq('id', matterId)
        .single()

      const recipientIds = matterDetail?.responsible_lawyer_id
        && matterDetail.responsible_lawyer_id !== auth.userId
        ? [matterDetail.responsible_lawyer_id]
        : []

      if (recipientIds.length > 0) {
        dispatchNotification(auth.supabase, {
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
