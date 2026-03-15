import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import { grantBreakGlass, revokeBreakGlass, getActiveBreakGlassGrants } from '@/lib/services/break-glass'
import { withTiming } from '@/lib/middleware/request-timing'

/**
 * GET /api/admin/break-glass
 * Admin-only — requirePermission throws 403 if unauthorised.
 *
 * Returns all active break-glass grants for the tenant.
 * Requires settings:view permission.
 */
async function handleGet() {
  try {
    const auth = await authenticateRequest()
    requirePermission(auth, 'settings', 'view')

    const grants = await getActiveBreakGlassGrants(auth.supabase, auth.tenantId)

    return NextResponse.json({ success: true, grants })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/**
 * POST /api/admin/break-glass
 *
 * Grant break-glass access to a user. Max 72 hours.
 * Requires settings:edit permission.
 *
 * Body: { grantedTo, matterId?, reason, expiresAt }
 */
async function handlePost(request: Request) {
  try {
    const auth = await authenticateRequest()
    requirePermission(auth, 'settings', 'edit')

    const body = await request.json()
    const { grantedTo, matterId, reason, expiresAt } = body

    if (!grantedTo || !reason || !expiresAt) {
      return NextResponse.json(
        { error: 'grantedTo, reason, and expiresAt are required' },
        { status: 400 },
      )
    }

    const grant = await grantBreakGlass(
      auth.supabase,
      grantedTo,
      auth.userId,
      matterId ?? null,
      reason,
      expiresAt,
    )

    return NextResponse.json({ success: true, id: grant.id })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}

/**
 * DELETE /api/admin/break-glass?id=<grantId>
 *
 * Revoke an active break-glass grant.
 * Requires settings:edit permission.
 */
async function handleDelete(request: Request) {
  try {
    const auth = await authenticateRequest()
    requirePermission(auth, 'settings', 'edit')

    const { searchParams } = new URL(request.url)
    const grantId = searchParams.get('id')

    if (!grantId) {
      return NextResponse.json({ error: 'id parameter is required' }, { status: 400 })
    }

    await revokeBreakGlass(auth.supabase, grantId, auth.userId)

    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}

export const GET = withTiming(handleGet, 'admin/break-glass')
export const POST = withTiming(handlePost, 'admin/break-glass')
export const DELETE = withTiming(handleDelete, 'admin/break-glass')
