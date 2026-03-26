import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { withTiming } from '@/lib/middleware/request-timing'
import { logComplianceOverride, getMatterOverrides, revokeOverride } from '@/lib/services/compliance-override'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * GET /api/matters/[id]/compliance-override
 * Fetch active overrides for this matter.
 */
async function handleGet(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await authenticateRequest()
    const { id: matterId } = await params
    const overrides = await getMatterOverrides(auth.supabase as SupabaseClient<any>, matterId)
    return NextResponse.json({ overrides })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error('[compliance-override] GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/matters/[id]/compliance-override
 * Log a new compliance override (Partner PIN + 50-char justification).
 * Body: { overrideType, blockedNode, originalStatus, justification, partnerPin }
 */
async function handlePost(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await authenticateRequest()
    const { id: matterId } = await params

    const body = await request.json().catch(() => ({})) as {
      overrideType?: string
      blockedNode?: string
      originalStatus?: string
      justification?: string
      partnerPin?: string
    }

    if (!body.overrideType || !body.blockedNode || !body.justification || !body.partnerPin) {
      return NextResponse.json(
        { error: 'overrideType, blockedNode, justification, and partnerPin are required' },
        { status: 400 },
      )
    }

    const result = await logComplianceOverride({
      tenantId: auth.tenantId,
      matterId,
      userId: auth.userId,
      overrideType: body.overrideType as any,
      blockedNode: body.blockedNode,
      originalStatus: body.originalStatus ?? 'unknown',
      justification: body.justification,
      partnerPin: body.partnerPin,
    })

    if (!result.success) {
      const status = result.error?.includes('Partner or Admin') ? 403 : 400
      return NextResponse.json({ error: result.error }, { status })
    }

    return NextResponse.json({
      success: true,
      override_id: result.override_id,
      amendment_hash: result.amendment_hash,
      message: 'Norva Compliance Override logged — Genesis amendment recorded',
    })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error('[compliance-override] POST error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * DELETE /api/matters/[id]/compliance-override
 * Revoke an active override.
 * Body: { overrideId, reason }
 */
async function handleDelete(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await authenticateRequest()
    await params // validate params exist

    const body = await request.json().catch(() => ({})) as {
      overrideId?: string
      reason?: string
    }

    if (!body.overrideId || !body.reason) {
      return NextResponse.json(
        { error: 'overrideId and reason are required' },
        { status: 400 },
      )
    }

    const result = await revokeOverride({
      overrideId: body.overrideId,
      userId: auth.userId,
      reason: body.reason,
    })

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }

    return NextResponse.json({ success: true, message: 'Override revoked' })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error('[compliance-override] DELETE error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export const GET = withTiming(handleGet, 'GET /api/matters/[id]/compliance-override')
export const POST = withTiming(handlePost, 'POST /api/matters/[id]/compliance-override')
export const DELETE = withTiming(handleDelete, 'DELETE /api/matters/[id]/compliance-override')
