import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { getMatterAccessInfo } from '@/lib/services/matter-access'
import { requirePermission } from '@/lib/services/require-role'
import { withTiming } from '@/lib/middleware/request-timing'

/**
 * GET /api/matters/[id]/access
 *
 * Returns the current user's access info for a specific matter.
 * Includes which access path grants access (if any).
 */
async function handleGet(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: matterId } = await params
    const auth = await authenticateRequest()
    requirePermission(auth, 'matters', 'view')

    const access = await getMatterAccessInfo(auth.supabase, auth.userId, matterId)

    return NextResponse.json({ success: true, access })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export const GET = withTiming(handleGet, 'matters/[id]/access')
