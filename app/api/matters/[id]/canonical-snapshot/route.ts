import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import { withTiming } from '@/lib/middleware/request-timing'
import { createSnapshot, getSnapshot } from '@/lib/services/canonical-profile'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * GET /api/matters/[id]/canonical-snapshot
 *
 * Returns the canonical profile snapshot for a matter.
 * Query params: ?profileId=... (required)
 * Requires matters:read permission.
 */
async function handleGet(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: matterId } = await params
    const auth = await authenticateRequest()
    const admin = createAdminClient()
    requirePermission(auth, 'matters', 'read')

    const url = new URL(request.url)
    const profileId = url.searchParams.get('profileId')

    // Verify matter belongs to this tenant
    const { data: matter, error: matterErr } = await admin
      .from('matters')
      .select('id')
      .eq('id', matterId)
      .eq('tenant_id', auth.tenantId)
      .single()

    if (matterErr || !matter) {
      return NextResponse.json(
        { success: false, error: 'Matter not found or access denied' },
        { status: 404 }
      )
    }

    if (!profileId) {
      // Return all snapshots for this matter
      const { data: snapshots, error: snapErr } = await admin
        .from('canonical_profile_snapshots')
        .select('*')
        .eq('matter_id', matterId)
        .order('created_at', { ascending: false })

      if (snapErr) throw snapErr
      return NextResponse.json({ success: true, snapshots })
    }

    const snapshot = await getSnapshot(admin, profileId, matterId)
    return NextResponse.json({ success: true, snapshot })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.status }
      )
    }
    console.error('Get canonical snapshot error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/matters/[id]/canonical-snapshot
 *
 * Creates/updates a canonical profile snapshot for the matter.
 * Body: { profileId }
 * Requires matters:update permission.
 */
async function handlePost(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: matterId } = await params
    const auth = await authenticateRequest()
    const admin = createAdminClient()
    requirePermission(auth, 'matters', 'update')

    // Verify matter belongs to this tenant
    const { data: matter, error: matterErr } = await admin
      .from('matters')
      .select('id')
      .eq('id', matterId)
      .eq('tenant_id', auth.tenantId)
      .single()

    if (matterErr || !matter) {
      return NextResponse.json(
        { success: false, error: 'Matter not found or access denied' },
        { status: 404 }
      )
    }

    const body = await request.json()
    const { profileId } = body

    if (!profileId) {
      return NextResponse.json(
        { success: false, error: 'Missing required field: profileId' },
        { status: 400 }
      )
    }

    const snapshot = await createSnapshot(admin, profileId, matterId)

    return NextResponse.json(
      { success: true, snapshot },
      { status: 201 }
    )
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.status }
      )
    }
    console.error('Create canonical snapshot error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export const GET = withTiming(handleGet, 'GET /api/matters/[id]/canonical-snapshot')
export const POST = withTiming(handlePost, 'POST /api/matters/[id]/canonical-snapshot')
