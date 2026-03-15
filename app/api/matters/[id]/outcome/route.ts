import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import { recordOutcomeEvent } from '@/lib/services/outcome-event-engine'
import { withTiming } from '@/lib/middleware/request-timing'

/**
 * POST /api/matters/[id]/outcome
 *
 * Record a matter outcome event (approval, refusal, biometric, etc.).
 *
 * Body: { event_type: string, outcome_data: object }
 */
async function handlePost(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await authenticateRequest()
    requirePermission(auth, 'matters', 'edit')
    const { id: matterId } = await params

    // Verify matter belongs to tenant
    const { data: matter, error: matterError } = await auth.supabase
      .from('matters')
      .select('id, tenant_id')
      .eq('id', matterId)
      .eq('tenant_id', auth.tenantId)
      .single()

    if (matterError || !matter) {
      return NextResponse.json(
        { error: 'Matter not found' },
        { status: 404 }
      )
    }

    const body = await request.json()
    const { event_type, outcome_data } = body

    if (!event_type) {
      return NextResponse.json(
        { error: 'event_type is required' },
        { status: 400 }
      )
    }

    const validTypes = [
      'acknowledgement', 'biometric', 'medical', 'passport_request',
      'pfl', 'approval', 'refusal', 'withdrawal', 'return',
    ]
    if (!validTypes.includes(event_type)) {
      return NextResponse.json(
        { error: `Invalid event_type. Must be one of: ${validTypes.join(', ')}` },
        { status: 400 }
      )
    }

    const result = await recordOutcomeEvent(
      auth.supabase,
      matterId,
      event_type,
      outcome_data ?? {},
      auth.userId
    )

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: 400 }
      )
    }

    return NextResponse.json({
      success: true,
      outcomeEventId: result.outcomeEventId,
    })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      )
    }

    console.error('Record outcome error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * GET /api/matters/[id]/outcome
 *
 * List all outcome events for a matter.
 */
async function handleGet(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await authenticateRequest()
    requirePermission(auth, 'matters', 'view')
    const { id: matterId } = await params

    // Verify matter belongs to tenant
    const { data: matter, error: matterError } = await auth.supabase
      .from('matters')
      .select('id, tenant_id')
      .eq('id', matterId)
      .eq('tenant_id', auth.tenantId)
      .single()

    if (matterError || !matter) {
      return NextResponse.json(
        { error: 'Matter not found' },
        { status: 404 }
      )
    }

    const { data: outcomes, error: outcomesError } = await auth.supabase
      .from('matter_outcome_events')
      .select('*')
      .eq('matter_id', matterId)
      .order('created_at', { ascending: false })

    if (outcomesError) {
      return NextResponse.json(
        { error: outcomesError.message },
        { status: 500 }
      )
    }

    return NextResponse.json({ outcomes })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      )
    }

    console.error('List outcomes error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export const POST = withTiming(handlePost, 'POST /api/matters/[id]/outcome')
export const GET = withTiming(handleGet, 'GET /api/matters/[id]/outcome')
