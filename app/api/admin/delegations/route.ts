import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import { createDelegation, revokeDelegation, getActiveDelegations } from '@/lib/services/delegation'
import { withTiming } from '@/lib/middleware/request-timing'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * GET /api/admin/delegations
 * Admin-only  -  requirePermission throws 403 if unauthorised.
 *
 * Returns active delegations for the authenticated user.
 * Any authenticated user can view their own delegations.
 */
async function handleGet() {
  try {
    const auth = await authenticateRequest()
    const admin = createAdminClient()

    const delegations = await getActiveDelegations(admin, auth.userId)

    return NextResponse.json({ success: true, delegations })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/**
 * POST /api/admin/delegations
 *
 * Create a new delegation. The authenticated user is the delegating user.
 * Requires settings:edit permission for admin delegations, or the user
 * can delegate their own matters.
 *
 * Body: { delegateUserId, matterId?, accessLevel, reason?, expiresAt? }
 */
async function handlePost(request: Request) {
  try {
    const auth = await authenticateRequest()
    const admin = createAdminClient()

    const body = await request.json()
    const { delegateUserId, matterId, accessLevel, reason, expiresAt } = body

    if (!delegateUserId || !accessLevel) {
      return NextResponse.json(
        { error: 'delegateUserId and accessLevel are required' },
        { status: 400 },
      )
    }

    if (!['read', 'read_write'].includes(accessLevel)) {
      return NextResponse.json(
        { error: 'accessLevel must be "read" or "read_write"' },
        { status: 400 },
      )
    }

    const delegation = await createDelegation(
      admin,
      auth.userId,
      delegateUserId,
      matterId ?? null,
      accessLevel,
      reason ?? null,
      expiresAt ?? null,
    )

    return NextResponse.json({ success: true, id: delegation.id })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}

/**
 * DELETE /api/admin/delegations?id=<delegationId>
 *
 * Revoke an active delegation.
 */
async function handleDelete(request: Request) {
  try {
    const auth = await authenticateRequest()
    const admin = createAdminClient()

    const { searchParams } = new URL(request.url)
    const delegationId = searchParams.get('id')

    if (!delegationId) {
      return NextResponse.json({ error: 'id parameter is required' }, { status: 400 })
    }

    await revokeDelegation(admin, delegationId, auth.userId)

    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}

export const GET = withTiming(handleGet, 'admin/delegations')
export const POST = withTiming(handlePost, 'admin/delegations')
export const DELETE = withTiming(handleDelete, 'admin/delegations')
