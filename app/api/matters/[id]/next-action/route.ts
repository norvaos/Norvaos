import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import { computeNextAction } from '@/lib/services/next-action-engine'
import { withTiming } from '@/lib/middleware/request-timing'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * POST /api/matters/[id]/next-action
 *
 * Recomputes the next action for a matter, persists the result to
 * matters.next_action_* columns, and returns the computed NextAction.
 *
 * Auth: requires authenticated user who belongs to the same tenant as the matter.
 *
 * Returns: { success: true, nextAction: NextAction }
 */
async function handlePost(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: matterId } = await params

    // 1. Authenticate and authorise
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

    // 3. Compute and persist next action
    const nextAction = await computeNextAction(matterId, auth.tenantId, admin)

    return NextResponse.json({ success: true, nextAction }, { status: 200 })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.status }
      )
    }

    console.error('[next-action] Compute failed:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export const POST = withTiming(handlePost, 'POST /api/matters/[id]/next-action')
