import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import { matterIntakeSchema } from '@/lib/schemas/matter-intake'
import { revalidateIntake } from '@/lib/services/intake-revalidate'
import { logAuditServer } from '@/lib/queries/audit-logs'
import { invalidateGating, invalidateMattersList } from '@/lib/services/cache-invalidation'
import { withTiming } from '@/lib/middleware/request-timing'

/**
 * POST /api/matters/[id]/save-intake
 *
 * Save (upsert) matter intake data and auto-revalidate.
 * Body is validated against matterIntakeSchema.
 *
 * Returns: { success, intake, validation, risk, completionPct, intakeStatus }
 */
async function handlePost(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: matterId } = await params

    // 1. Authenticate and get tenant context
    const auth = await authenticateRequest()
    requirePermission(auth, 'matters', 'edit')

    // 2. Verify the matter belongs to this tenant
    const { data: matter, error: matterErr } = await auth.supabase
      .from('matters')
      .select('id, tenant_id, matter_type_id')
      .eq('id', matterId)
      .eq('tenant_id', auth.tenantId)
      .single()

    if (matterErr || !matter) {
      return NextResponse.json(
        { success: false, error: 'Matter not found or access denied' },
        { status: 404 }
      )
    }

    // 2b. Auto-derive program_category from matter type
    let derivedProgramCategory: string | null = null
    if (matter.matter_type_id) {
      const { data: matterType } = await auth.supabase
        .from('matter_types')
        .select('program_category_key')
        .eq('id', matter.matter_type_id)
        .single()
      derivedProgramCategory = matterType?.program_category_key ?? null
    }

    // 3. Parse and validate request body
    const body = await request.json()
    const parsed = matterIntakeSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', issues: parsed.error.issues },
        { status: 400 }
      )
    }

    // 4. Upsert matter_intake (with auto-derived program_category)
    const { data: intake, error: upsertErr } = await auth.supabase
      .from('matter_intake')
      .upsert(
        {
          matter_id: matterId,
          tenant_id: auth.tenantId,
          ...parsed.data,
          ...(derivedProgramCategory ? { program_category: derivedProgramCategory } : {}),
        },
        { onConflict: 'matter_id' }
      )
      .select()
      .single()

    if (upsertErr || !intake) {
      console.error('Failed to upsert intake:', upsertErr)
      return NextResponse.json(
        { success: false, error: 'Failed to save intake data' },
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
      entityType: 'matter_intake',
      entityId: intake.id,
      action: 'intake_saved',
      changes: parsed.data as Record<string, unknown>,
      metadata: { matter_id: matterId },
    })

    // 7. Invalidate caches — parallel
    await Promise.all([
      invalidateGating(auth.tenantId, matterId),
      invalidateMattersList(auth.tenantId),
    ])

    // 8. Return combined result
    return NextResponse.json({
      success: true,
      intake,
      ...revalidationData,
    })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.status }
      )
    }

    console.error('Save intake error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export const POST = withTiming(handlePost, 'POST /api/matters/[id]/save-intake')
