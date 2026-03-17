import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { withTiming } from '@/lib/middleware/request-timing'
import { returnMatterToStage } from '@/lib/services/exception-workflow'
import type { ReturnStageResult } from '@/lib/services/exception-workflow'

/**
 * POST /api/matters/[id]/return-stage
 *
 * Move a matter backward to an earlier stage in its pipeline.
 * Restricted to Lawyer and Admin roles only.
 *
 * Body: {
 *   target_stage_id: string  — the stage to return to (must be earlier than current)
 *   return_reason:   string  — mandatory justification (min 50 chars)
 * }
 *
 * Responses:
 *   200 { success: true, transition: ReturnStageResult }
 *   401 { error: 'Authentication required' }
 *   403 { error: 'Only Lawyers and Admins can return a matter to a previous stage' }
 *   404 { error: 'Matter not found or access denied' }
 *   422 { error: string, field?: string }   — validation or business rule failure
 *   500 { error: 'Internal server error' }
 */
async function handlePost(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: matterId } = await params

    // ── 1. Authenticate ────────────────────────────────────────────────────
    const auth = await authenticateRequest()

    // ── 2. Role check: Lawyer or Admin only ───────────────────────────────
    const roleName = auth.role?.name ?? ''
    if (roleName !== 'Lawyer' && roleName !== 'Admin') {
      return NextResponse.json(
        { error: 'Only Lawyers and Admins can return a matter to a previous stage' },
        { status: 403 }
      )
    }

    // ── 3. Validate request body ──────────────────────────────────────────
    let body: Record<string, unknown>
    try {
      body = await request.json()
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON in request body' },
        { status: 422 }
      )
    }

    const targetStageId = body['target_stage_id']
    const returnReason  = body['return_reason']

    if (!targetStageId || typeof targetStageId !== 'string') {
      return NextResponse.json(
        { error: 'target_stage_id is required', field: 'target_stage_id' },
        { status: 422 }
      )
    }

    if (!returnReason || typeof returnReason !== 'string') {
      return NextResponse.json(
        { error: 'return_reason is required', field: 'return_reason' },
        { status: 422 }
      )
    }

    if (returnReason.trim().length < 50) {
      return NextResponse.json(
        {
          error: 'return_reason must be at least 50 characters',
          field: 'return_reason',
        },
        { status: 422 }
      )
    }

    // ── 4. Confirm matter belongs to this tenant ──────────────────────────
    const { data: matter, error: matterErr } = await auth.supabase
      .from('matters')
      .select('id, tenant_id')
      .eq('id', matterId)
      .eq('tenant_id', auth.tenantId)
      .single()

    if (matterErr || !matter) {
      return NextResponse.json(
        { error: 'Matter not found or access denied' },
        { status: 404 }
      )
    }

    // ── 5. Delegate to service ────────────────────────────────────────────
    const transition: ReturnStageResult = await returnMatterToStage(auth.supabase, {
      matterId,
      tenantId: auth.tenantId,
      targetStageId,
      returnReason,
      performedBy: auth.userId,
    })

    return NextResponse.json(
      { success: true, transition },
      { status: 200 }
    )

  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      )
    }

    if (error instanceof Error) {
      // Known business-rule errors thrown from the service layer
      const knownErrors = [
        'Return reason must be at least 50 characters',
        'Matter has no stage state',
        'Target stage not found',
        'Target stage does not belong to the same pipeline',
        'Current stage definition not found',
        'Target stage is not earlier than current stage',
        'Cannot return stage while critical deficiencies are open',
      ]

      const isKnownError = knownErrors.some((prefix) =>
        error.message.startsWith(prefix)
      )

      if (isKnownError) {
        return NextResponse.json(
          { error: error.message },
          { status: 422 }
        )
      }
    }

    console.error('[return-stage] Unexpected error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export const POST = withTiming(handlePost, 'POST /api/matters/[id]/return-stage')
