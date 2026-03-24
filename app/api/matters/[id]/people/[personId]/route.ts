import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import { revalidateIntake } from '@/lib/services/intake-revalidate'
import { logAuditServer } from '@/lib/queries/audit-logs'
import { invalidateGating } from '@/lib/services/cache-invalidation'
import { withTiming } from '@/lib/middleware/request-timing'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * PUT /api/matters/[id]/people/[personId]
 *
 * Update an existing person on a matter and auto-revalidate the intake.
 * Accepts partial update fields in the request body.
 *
 * Returns: { success, person, validation, risk, completionPct, intakeStatus }
 */
async function handlePut(
  request: Request,
  { params }: { params: Promise<{ id: string; personId: string }> }
) {
  try {
    const { id: matterId, personId } = await params

    // 1. Authenticate and get tenant context
    const auth = await authenticateRequest()
    const admin = createAdminClient()
    requirePermission(auth, 'contacts', 'edit')

    // 2. Verify the matter belongs to this tenant
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

    // 3. Verify person belongs to this matter
    const { data: existing, error: personErr } = await admin
      .from('matter_people')
      .select('*')
      .eq('id', personId)
      .eq('matter_id', matterId)
      .single()

    if (personErr || !existing) {
      return NextResponse.json(
        { success: false, error: 'Person not found on this matter' },
        { status: 404 }
      )
    }

    // 4. Snapshot for audit trail (only changed fields)
    const before = { ...existing }

    // 5. Parse update body
    const body = await request.json()

    // 6. Update the person record
    const { data: updated, error: updateErr } = await admin
      .from('matter_people')
      .update(body)
      .eq('id', personId)
      .select()
      .single()

    if (updateErr || !updated) {
      console.error('Failed to update person:', updateErr)
      return NextResponse.json(
        { success: false, error: 'Failed to update person' },
        { status: 500 }
      )
    }

    // 7. Auto-revalidate
    const revalidation = await revalidateIntake(admin, matterId)
    const { success: _revalSuccess, ...revalidationData } = revalidation

    // 8. Build audit diff (only fields that actually changed)
    const changedBefore: Record<string, unknown> = {}
    const changedAfter: Record<string, unknown> = {}
    for (const key of Object.keys(body)) {
      if (JSON.stringify((before as any)[key]) !== JSON.stringify((body as any)[key])) {
        changedBefore[key] = (before as any)[key]
        changedAfter[key] = (body as any)[key]
      }
    }

    // 9. Audit log (fire-and-forget)
    logAuditServer({
      supabase: admin,
      tenantId: auth.tenantId,
      userId: auth.userId,
      entityType: 'matter_people',
      entityId: personId,
      action: 'person_updated',
      changes: { before: changedBefore, after: changedAfter },
      metadata: { matter_id: matterId },
    })

    // 10. Invalidate gating cache
    await invalidateGating(auth.tenantId, matterId)

    // 11. Return combined result
    return NextResponse.json({
      success: true,
      person: updated,
      ...revalidationData,
    })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.status }
      )
    }

    console.error('Update person error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/matters/[id]/people/[personId]
 *
 * Soft-delete a person on a matter (set is_active = false) and auto-revalidate.
 *
 * Returns: { success, validation, risk, completionPct, intakeStatus }
 */
async function handleDelete(
  request: Request,
  { params }: { params: Promise<{ id: string; personId: string }> }
) {
  try {
    const { id: matterId, personId } = await params

    // 1. Authenticate and get tenant context
    const auth = await authenticateRequest()
    const admin = createAdminClient()
    requirePermission(auth, 'matters', 'delete')

    // 2. Verify the matter belongs to this tenant
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

    // 3. Verify person belongs to this matter and fetch name for audit
    const { data: person, error: personErr } = await admin
      .from('matter_people')
      .select('id, first_name, last_name, person_role')
      .eq('id', personId)
      .eq('matter_id', matterId)
      .single()

    if (personErr || !person) {
      return NextResponse.json(
        { success: false, error: 'Person not found on this matter' },
        { status: 404 }
      )
    }

    // 4. Soft-delete (set is_active = false)
    const { error: deleteErr } = await admin
      .from('matter_people')
      .update({ is_active: false })
      .eq('id', personId)

    if (deleteErr) {
      console.error('Failed to soft-delete person:', deleteErr)
      return NextResponse.json(
        { success: false, error: 'Failed to remove person' },
        { status: 500 }
      )
    }

    // 5. Auto-revalidate
    const revalidation = await revalidateIntake(admin, matterId)
    const { success: _revalSuccess, ...revalidationData } = revalidation

    // 6. Audit log (fire-and-forget)
    logAuditServer({
      supabase: admin,
      tenantId: auth.tenantId,
      userId: auth.userId,
      entityType: 'matter_people',
      entityId: personId,
      action: 'person_removed',
      changes: {
        person_role: person.person_role,
        first_name: person.first_name,
        last_name: person.last_name,
      },
      metadata: { matter_id: matterId },
    })

    // 7. Invalidate gating cache
    await invalidateGating(auth.tenantId, matterId)

    // 8. Return combined result
    return NextResponse.json({
      success: true,
      ...revalidationData,
    })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.status }
      )
    }

    console.error('Delete person error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export const PUT = withTiming(handlePut, 'PUT /api/matters/[id]/people/[personId]')
export const DELETE = withTiming(handleDelete, 'DELETE /api/matters/[id]/people/[personId]')

const admin = createAdminClient()