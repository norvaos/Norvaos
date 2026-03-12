import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import { matterPersonSchema } from '@/lib/schemas/matter-people'
import { revalidateIntake } from '@/lib/services/intake-revalidate'
import { logAuditServer } from '@/lib/queries/audit-logs'
import { invalidateGating } from '@/lib/services/cache-invalidation'
import { withTiming } from '@/lib/middleware/request-timing'

/**
 * POST /api/matters/[id]/people
 *
 * Create a new person on a matter and auto-revalidate the intake.
 * Body is validated against matterPersonSchema.
 *
 * Returns: { success, person, validation, risk, completionPct, intakeStatus }
 */
async function handlePost(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: matterId } = await params

    // 1. Authenticate and get tenant context
    const auth = await authenticateRequest()
    requirePermission(auth, 'contacts', 'create')

    // 2. Verify the matter belongs to this tenant
    const { data: matter, error: matterErr } = await auth.supabase
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

    // 3. Parse and validate request body
    const body = await request.json()
    const parsed = matterPersonSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', issues: parsed.error.issues },
        { status: 400 }
      )
    }

    // 4. Insert new person
    const { data: person, error: insertErr } = await auth.supabase
      .from('matter_people')
      .insert({
        tenant_id: auth.tenantId,
        matter_id: matterId,
        ...parsed.data,
      })
      .select()
      .single()

    if (insertErr || !person) {
      console.error('Failed to insert person:', insertErr)
      return NextResponse.json(
        { success: false, error: 'Failed to create person' },
        { status: 500 }
      )
    }

    // 5. Auto-revalidate
    const revalidation = await revalidateIntake(auth.supabase, matterId)
    const { success: _revalSuccess, ...revalidationData } = revalidation

    // 6. Audit log (fire-and-forget)
    logAuditServer({
      supabase: auth.supabase,
      tenantId: auth.tenantId,
      userId: auth.userId,
      entityType: 'matter_people',
      entityId: person.id,
      action: 'person_created',
      changes: {
        person_role: parsed.data.person_role,
        first_name: parsed.data.first_name,
        last_name: parsed.data.last_name,
      },
      metadata: { matter_id: matterId },
    })

    // 7. Invalidate gating cache
    await invalidateGating(auth.tenantId, matterId)

    // 8. Return combined result
    return NextResponse.json({
      success: true,
      person,
      ...revalidationData,
    })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.status }
      )
    }

    console.error('Create person error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export const POST = withTiming(handlePost, 'POST /api/matters/[id]/people')
