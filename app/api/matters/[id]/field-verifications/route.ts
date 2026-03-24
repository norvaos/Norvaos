import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import { withTiming } from '@/lib/middleware/request-timing'

type RouteContext = { params: Promise<{ id: string }> }

/**
 * GET /api/matters/[id]/field-verifications
 *
 * Returns all field verifications for a matter.
 * Client uses this to render verified/stale badges per field.
 */
async function handleGet(
  _request: NextRequest,
  { params }: RouteContext,
) {
  try {
    const { id: matterId } = await params
    const auth = await authenticateRequest()
    requirePermission(auth, 'matters', 'view')

    const { data, error } = await auth.supabase
      .from('field_verifications')
      .select('id, profile_path, verified_value, verified_by, verified_at, notes, verification_status, rejection_reason')
      .eq('matter_id', matterId)
      .eq('tenant_id', auth.tenantId)
      .order('verified_at', { ascending: false })

    if (error) throw error
    return NextResponse.json({ verifications: data ?? [] })
  } catch (err) {
    console.error('[field-verifications] GET error:', err)
    return NextResponse.json({ error: 'Failed to fetch field verifications' }, { status: 500 })
  }
}

/**
 * POST /api/matters/[id]/field-verifications
 *
 * Upserts a field verification (lawyer sign-off).
 * Body: { profile_path, verified_value, notes? }
 * OR bulk: { fields: [{ profile_path, verified_value }] }
 */
async function handlePost(
  request: NextRequest,
  { params }: RouteContext,
) {
  try {
    const { id: matterId } = await params
    const auth = await authenticateRequest()
    requirePermission(auth, 'form_packs', 'create') // Lawyer-level gate

    const body = await request.json()

    // Build upsert rows
    let rows: { profile_path: string; verified_value: unknown; notes?: string | null }[]

    if (Array.isArray(body.fields)) {
      rows = body.fields
    } else if (body.profile_path) {
      rows = [{ profile_path: body.profile_path, verified_value: body.verified_value, notes: body.notes ?? null }]
    } else {
      return NextResponse.json({ error: 'Missing profile_path or fields array' }, { status: 400 })
    }

    const inserts = rows.map((r) => ({
      tenant_id: auth.tenantId,
      matter_id: matterId,
      profile_path: r.profile_path,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      verified_value: r.verified_value as any,
      verified_by: auth.userId,
      notes: r.notes ?? null,
    }))

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (auth.supabase as any)
      .from('field_verifications')
      .upsert(inserts, { onConflict: 'tenant_id,matter_id,profile_path' })

    if (error) throw error
    return NextResponse.json({ ok: true, count: inserts.length })
  } catch (err) {
    console.error('[field-verifications] POST error:', err)
    return NextResponse.json({ error: 'Failed to save field verification' }, { status: 500 })
  }
}

/**
 * DELETE /api/matters/[id]/field-verifications
 *
 * Removes a verification so the field is flagged for re-review.
 * Body: { profile_path }
 */
async function handleDelete(
  request: NextRequest,
  { params }: RouteContext,
) {
  try {
    const { id: matterId } = await params
    const auth = await authenticateRequest()
    requirePermission(auth, 'form_packs', 'create')

    const { profile_path } = await request.json()
    if (!profile_path) {
      return NextResponse.json({ error: 'Missing profile_path' }, { status: 400 })
    }

    const { error } = await auth.supabase
      .from('field_verifications')
      .delete()
      .eq('tenant_id', auth.tenantId)
      .eq('matter_id', matterId)
      .eq('profile_path', profile_path)

    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[field-verifications] DELETE error:', err)
    return NextResponse.json({ error: 'Failed to remove field verification' }, { status: 500 })
  }
}

export const GET = withTiming(handleGet, 'GET /api/matters/[id]/field-verifications')
export const POST = withTiming(handlePost, 'POST /api/matters/[id]/field-verifications')
export const DELETE = withTiming(handleDelete, 'DELETE /api/matters/[id]/field-verifications')
