import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { advanceGenericStage, advanceImmigrationStage } from '@/lib/services/stage-engine'

/**
 * POST /api/matters/[id]/advance-stage
 *
 * Server-side stage advancement with gating enforcement.
 * Handles both immigration and generic (Real Estate, etc.) stage systems.
 *
 * Body: { targetStageId: string, system: 'immigration' | 'generic' }
 * Returns: { success: true, stageName } | { success: false, error, failedRules? }
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: matterId } = await params

    // 1. Authenticate and get tenant context
    const auth = await authenticateRequest()

    // 2. Parse request body
    const body = await request.json()
    const { targetStageId, system } = body as {
      targetStageId?: string
      system?: 'immigration' | 'generic'
    }

    if (!targetStageId) {
      return NextResponse.json(
        { success: false, error: 'targetStageId is required' },
        { status: 400 }
      )
    }

    if (!system || !['immigration', 'generic'].includes(system)) {
      return NextResponse.json(
        { success: false, error: 'system must be "immigration" or "generic"' },
        { status: 400 }
      )
    }

    // 3. Verify the matter belongs to the authenticated user's tenant
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

    // 4. Dispatch to appropriate stage engine
    const engineParams = {
      supabase: auth.supabase,
      matterId,
      tenantId: auth.tenantId,
      targetStageId,
      userId: auth.userId,
    }

    const result = system === 'immigration'
      ? await advanceImmigrationStage(engineParams)
      : await advanceGenericStage(engineParams)

    // 5. Return result
    if (result.success) {
      return NextResponse.json(result, { status: 200 })
    } else {
      return NextResponse.json(result, { status: 400 })
    }
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.status }
      )
    }

    console.error('Stage advancement error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
