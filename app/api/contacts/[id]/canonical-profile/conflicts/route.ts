import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import { withTiming } from '@/lib/middleware/request-timing'
import { resolveConflict } from '@/lib/services/canonical-profile'
import type { ConflictResolution } from '@/lib/services/canonical-profile'

/**
 * GET /api/contacts/[id]/canonical-profile/conflicts
 *
 * Returns pending conflicts for a contact's canonical profile.
 * Query params: ?status=pending (default)
 * Requires contacts:read permission.
 */
async function handleGet(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: contactId } = await params
    const auth = await authenticateRequest()
    requirePermission(auth, 'contacts', 'read')

    const url = new URL(request.url)
    const status = url.searchParams.get('status') ?? 'pending'

    // Get profile for this contact
    const { data: profile, error: profileErr } = await auth.supabase
      .from('canonical_profiles')
      .select('id')
      .eq('contact_id', contactId)
      .maybeSingle()

    if (profileErr) throw profileErr

    if (!profile) {
      return NextResponse.json({ success: true, conflicts: [] })
    }

    const { data: conflicts, error: conflictsErr } = await auth.supabase
      .from('canonical_profile_conflicts')
      .select('*')
      .eq('profile_id', profile.id)
      .eq('resolution', status)
      .order('created_at', { ascending: false })

    if (conflictsErr) throw conflictsErr

    return NextResponse.json({ success: true, conflicts })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.status }
      )
    }
    console.error('Get canonical conflicts error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/contacts/[id]/canonical-profile/conflicts
 *
 * Resolve a conflict.
 * Body: { conflictId, resolution: 'accept_new' | 'keep_existing' | 'manual' }
 * Requires contacts:update permission.
 */
async function handlePost(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: contactId } = await params
    const auth = await authenticateRequest()
    requirePermission(auth, 'contacts', 'update')

    // Verify contact belongs to this tenant
    const { data: contact, error: contactErr } = await auth.supabase
      .from('contacts')
      .select('id')
      .eq('id', contactId)
      .eq('tenant_id', auth.tenantId)
      .single()

    if (contactErr || !contact) {
      return NextResponse.json(
        { success: false, error: 'Contact not found or access denied' },
        { status: 404 }
      )
    }

    const body = await request.json()
    const { conflictId, resolution } = body

    if (!conflictId || !resolution) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: conflictId, resolution' },
        { status: 400 }
      )
    }

    const validResolutions: ConflictResolution[] = ['accept_new', 'keep_existing', 'manual']
    if (!validResolutions.includes(resolution)) {
      return NextResponse.json(
        { success: false, error: `Invalid resolution. Must be one of: ${validResolutions.join(', ')}` },
        { status: 400 }
      )
    }

    await resolveConflict(
      auth.supabase,
      conflictId,
      resolution as ConflictResolution,
      auth.userId,
    )

    return NextResponse.json({ success: true, resolved: true })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.status }
      )
    }
    console.error('Resolve canonical conflict error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export const GET = withTiming(handleGet, 'GET /api/contacts/[id]/canonical-profile/conflicts')
export const POST = withTiming(handlePost, 'POST /api/contacts/[id]/canonical-profile/conflicts')
