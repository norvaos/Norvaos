import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import { activateWorkflowKit, activateImmigrationKit } from '@/lib/services/kit-activation'
import { invalidateMatter } from '@/lib/services/cache-invalidation'
import { withTiming } from '@/lib/middleware/request-timing'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * POST /api/matters/[id]/activate-kit
 *
 * Manually trigger kit activation for an existing matter.
 * Used after lead conversion when the matter already exists
 * but hasn't had its kit activated yet.
 *
 * Body: { matterTypeId?: string, caseTypeId?: string }
 */
async function handlePost(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: matterId } = await params
    const auth = await authenticateRequest()
    const admin = createAdminClient()
    requirePermission(auth, 'matters', 'edit')

    const body = await request.json()
    const { matterTypeId, caseTypeId } = body as {
      matterTypeId?: string | null
      caseTypeId?: string | null
    }

    // Verify matter belongs to tenant
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

    // Activate appropriate kit
    if (matterTypeId && !caseTypeId) {
      await activateWorkflowKit({
        supabase: admin,
        tenantId: auth.tenantId,
        matterId,
        matterTypeId,
        userId: auth.userId,
      })
    }

    if (caseTypeId) {
      await activateImmigrationKit({
        supabase: admin,
        tenantId: auth.tenantId,
        matterId,
        caseTypeId,
        userId: auth.userId,
      })
    }

    await invalidateMatter(auth.tenantId, matterId)

    return NextResponse.json({ success: true }, { status: 200 })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.status }
      )
    }

    console.error('Kit activation error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export const POST = withTiming(handlePost, 'POST /api/matters/[id]/activate-kit')
