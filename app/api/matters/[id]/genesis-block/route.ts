import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { withTiming } from '@/lib/middleware/request-timing'
import {
  generateGenesisBlock,
  getGenesisBlock,
  verifyGenesisBlockIntegrity,
  revokeGenesisBlock,
} from '@/lib/services/genesis-block'

/**
 * GET /api/matters/[id]/genesis-block
 *
 * Fetch the genesis block (Sovereign Birth Certificate) for a matter.
 * Query params:
 *   ?verify=true  -  also verify SHA-256 hash integrity
 */
async function handleGet(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await authenticateRequest()
    const { id: matterId } = await params

    const status = await getGenesisBlock(auth.supabase, matterId)

    const url = new URL(request.url)
    if (url.searchParams.get('verify') === 'true' && status.exists) {
      const integrity = await verifyGenesisBlockIntegrity(auth.supabase, matterId)
      return NextResponse.json({ ...status, integrity })
    }

    return NextResponse.json(status)
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error('[genesis-block] GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/matters/[id]/genesis-block
 *
 * Generate the immutable genesis block for a matter.
 * Idempotent: returns 409 if already exists (revoke first).
 */
async function handlePost(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await authenticateRequest()
    const { id: matterId } = await params

    const body = await request.json().catch(() => ({})) as {
      conflictSearchId?: string
    }

    if (!body.conflictSearchId) {
      return NextResponse.json(
        { error: 'conflictSearchId is required  -  Directive 032: Conflict-to-Genesis Weld' },
        { status: 400 },
      )
    }

    const result = await generateGenesisBlock({
      tenantId: auth.tenantId,
      matterId,
      userId: auth.userId,
      conflictSearchId: body.conflictSearchId,
    })

    if (!result.success) {
      const status = result.error?.includes('already exists') ? 409 : 500
      return NextResponse.json({ error: result.error }, { status })
    }

    return NextResponse.json({
      success: true,
      genesis: result.data,
      message: 'Genesis block sealed  -  Sovereign Birth Certificate created',
    })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error('[genesis-block] POST error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * DELETE /api/matters/[id]/genesis-block
 *
 * Revoke the genesis block (Partner-level only). Does NOT delete  -  marks
 * as revoked with full audit trail. After revocation, POST can be called
 * again to generate a new genesis block.
 *
 * Body: { reason: string } (min 10 characters)
 */
async function handleDelete(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await authenticateRequest()
    const { id: matterId } = await params

    const body = await request.json().catch(() => ({}))
    const reason = (body as { reason?: string }).reason

    if (!reason || typeof reason !== 'string' || reason.trim().length < 10) {
      return NextResponse.json(
        { error: 'Revocation reason is required (minimum 10 characters)' },
        { status: 400 },
      )
    }

    const result = await revokeGenesisBlock({
      tenantId: auth.tenantId,
      matterId,
      userId: auth.userId,
      reason: reason.trim(),
    })

    if (!result.success) {
      const status = result.error?.includes('Partner or Admin') ? 403 : 500
      return NextResponse.json({ error: result.error }, { status })
    }

    return NextResponse.json({
      success: true,
      genesis: result.data,
      message: 'Genesis block revoked  -  Partner audit trail recorded',
    })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error('[genesis-block] DELETE error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export const GET = withTiming(handleGet, 'GET /api/matters/[id]/genesis-block')
export const POST = withTiming(handlePost, 'POST /api/matters/[id]/genesis-block')
export const DELETE = withTiming(handleDelete, 'DELETE /api/matters/[id]/genesis-block')
