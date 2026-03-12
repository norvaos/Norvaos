import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import { revalidateIntake } from '@/lib/services/intake-revalidate'
import { withTiming } from '@/lib/middleware/request-timing'

/**
 * POST /api/matters/[id]/validate-intake
 *
 * Server-side intake validation and risk scoring.
 * Delegates to the shared revalidateIntake() service which:
 * 1. Fetches matter_intake + matter_people
 * 2. Runs validation engine (hard-stops + red-flags)
 * 3. Runs risk engine (score + level)
 * 4. Computes completion percentage
 * 5. Updates matter_intake with results
 *
 * Returns: { success, validation, risk, completionPct, intakeStatus }
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

    // 3. Delegate to shared revalidation service
    const result = await revalidateIntake(auth.supabase, matterId)

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: 'No intake record found. Save core data first.' },
        { status: 400 }
      )
    }

    // 4. Return results
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.status }
      )
    }

    console.error('Validate intake error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export const POST = withTiming(handlePost, 'POST /api/matters/[id]/validate-intake')
