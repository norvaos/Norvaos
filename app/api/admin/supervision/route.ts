import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import { addSupervision, removeSupervision, getSupervisees } from '@/lib/services/supervision'
import { withTiming } from '@/lib/middleware/request-timing'

/**
 * GET /api/admin/supervision
 * Admin-only — requirePermission throws 403 if unauthorised.
 *
 * Returns supervision relationships. By default returns supervisees
 * of the authenticated user. Pass ?userId=X for admin view.
 * Requires settings:view permission for viewing other users.
 */
async function handleGet(request: Request) {
  try {
    const auth = await authenticateRequest()

    const { searchParams } = new URL(request.url)
    const targetUserId = searchParams.get('userId')

    // If requesting another user's supervision, require admin permission
    if (targetUserId && targetUserId !== auth.userId) {
      requirePermission(auth, 'settings', 'view')
    }

    const userId = targetUserId || auth.userId
    const supervision = await getSupervisees(auth.supabase, userId)

    return NextResponse.json({ success: true, supervision })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/**
 * POST /api/admin/supervision
 *
 * Add a supervisor ↔ supervisee relationship.
 * Requires settings:edit permission.
 *
 * Body: { supervisorId, superviseeId }
 */
async function handlePost(request: Request) {
  try {
    const auth = await authenticateRequest()
    requirePermission(auth, 'settings', 'edit')

    const body = await request.json()
    const { supervisorId, superviseeId } = body

    if (!supervisorId || !superviseeId) {
      return NextResponse.json(
        { error: 'supervisorId and superviseeId are required' },
        { status: 400 },
      )
    }

    const supervision = await addSupervision(
      auth.supabase,
      supervisorId,
      superviseeId,
      auth.userId,
    )

    return NextResponse.json({ success: true, id: supervision.id })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}

/**
 * DELETE /api/admin/supervision?id=<supervisionId>
 *
 * Remove (deactivate) a supervision relationship.
 * Requires settings:edit permission.
 */
async function handleDelete(request: Request) {
  try {
    const auth = await authenticateRequest()
    requirePermission(auth, 'settings', 'edit')

    const { searchParams } = new URL(request.url)
    const supervisionId = searchParams.get('id')

    if (!supervisionId) {
      return NextResponse.json({ error: 'id parameter is required' }, { status: 400 })
    }

    await removeSupervision(auth.supabase, supervisionId, auth.userId)

    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}

export const GET = withTiming(handleGet, 'admin/supervision')
export const POST = withTiming(handlePost, 'admin/supervision')
export const DELETE = withTiming(handleDelete, 'admin/supervision')
