import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import { initiateRefusalNextStep } from '@/lib/services/outcome-event-engine'
import { withTiming } from '@/lib/middleware/request-timing'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * POST /api/matters/[id]/next-step
 *
 * Initiate the next step after a refusal: reconsideration, JR, appeal,
 * fresh application, or no action.
 *
 * Creates a new linked matter with carried-forward data from canonical
 * profile snapshots.
 *
 * Body: { next_action: 'reconsideration' | 'judicial_review' | 'appeal' | 'fresh_application' | 'no_action' }
 */
async function handlePost(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await authenticateRequest()
    const admin = createAdminClient()
    requirePermission(auth, 'matters', 'edit')
    const { id: matterId } = await params

    // Verify matter belongs to tenant
    const { data: matter, error: matterError } = await admin
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
    const { next_action } = body

    const validActions = ['reconsideration', 'judicial_review', 'appeal', 'fresh_application', 'no_action']
    if (!next_action || !validActions.includes(next_action)) {
      return NextResponse.json(
        { error: `next_action must be one of: ${validActions.join(', ')}` },
        { status: 400 }
      )
    }

    const result = await initiateRefusalNextStep(
      admin,
      matterId,
      next_action,
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
      newMatterId: result.newMatterId ?? null,
    })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      )
    }

    console.error('Next step error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export const POST = withTiming(handlePost, 'POST /api/matters/[id]/next-step')
