import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import { executeOnboarding } from '@/lib/services/onboarding-factory'
import { withTiming } from '@/lib/middleware/request-timing'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * POST /api/matters/[id]/onboard
 *
 * Execute the "One-Click" onboarding factory for a newly retained matter.
 * This triggers the 3-step sequence:
 *   1. Fee Snapshot  -  Lock fees and tax rates
 *   2. Portal Birth  -  Create client portal + send welcome email
 *   3. Blueprint Injection  -  Load 12-slot document checklist
 *
 * Body: { leadId?: string }
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

    const body = await request.json().catch(() => ({}))
    const { leadId } = body as { leadId?: string }

    // Verify matter belongs to tenant
    const { data: matter, error: matterErr } = await admin
      .from('matters')
      .select('id, tenant_id, status')
      .eq('id', matterId)
      .eq('tenant_id', auth.tenantId)
      .single()

    if (matterErr || !matter) {
      return NextResponse.json(
        { success: false, error: 'Matter not found or access denied' },
        { status: 404 }
      )
    }

    const result = await executeOnboarding({
      supabase: admin,
      tenantId: auth.tenantId,
      matterId,
      leadId,
      userId: auth.userId,
    })

    return NextResponse.json(
      {
        success: result.success,
        onboardingRunId: result.onboardingRunId,
        steps: result.steps,
        errors: result.errors.length > 0 ? result.errors : undefined,
      },
      { status: result.success ? 200 : 207 } // 207 Multi-Status if partial failure
    )
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('[matters/onboard] POST error:', err)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export const POST = withTiming(handlePost, 'POST /api/matters/[id]/onboard')
