import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import { invalidateGating } from '@/lib/services/cache-invalidation'
import { withTiming } from '@/lib/middleware/request-timing'
import { createAdminClient } from '@/lib/supabase/admin'

const overrideSchema = z.object({
  overrideLevel: z.enum(['low', 'medium', 'high', 'critical']),
  overrideReason: z.string().min(1).max(500),
  previousLevel: z.string().optional().nullable(),
})

async function handlePost(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await authenticateRequest()
    const admin = createAdminClient()
    requirePermission(auth, 'matters', 'edit')
    const { id: matterId } = await params

    // Verify matter belongs to tenant
    const { data: matter, error: matterError } = await admin
      .from('matters')
      .select('id, tenant_id')
      .eq('id', matterId)
      .eq('tenant_id', auth.tenantId)
      .single()

    if (matterError || !matter) {
      return NextResponse.json(
        { error: 'Matter not found' },
        { status: 404 }
      )
    }

    // Fetch intake record
    const { data: intake, error: intakeError } = await admin
      .from('matter_intake')
      .select('id, risk_level, intake_status')
      .eq('matter_id', matterId)
      .single()

    if (intakeError || !intake) {
      return NextResponse.json(
        { error: 'No intake record found. Save core data first.' },
        { status: 400 }
      )
    }

    // Parse and validate body
    const body = await request.json()
    let overrideLevel: string
    let overrideReason: string
    let previousLevel: string | null | undefined
    try {
      const parsed = overrideSchema.parse(body)
      overrideLevel = parsed.overrideLevel
      overrideReason = parsed.overrideReason
      previousLevel = parsed.previousLevel
    } catch (validationError) {
      if (validationError instanceof z.ZodError) {
        return NextResponse.json(
          { error: 'Validation failed', details: validationError.errors },
          { status: 400 }
        )
      }
      throw validationError
    }

    // Call transactional RPC  -  single atomic operation that:
    // 1. Updates matter_intake override fields
    // 2. Inserts into risk_override_history (mandatory)
    // 3. Inserts audit log (mandatory)
    // If any step fails, the entire transaction rolls back.
    const { data: result, error: rpcError } = await admin
      .rpc('apply_risk_override', {
        p_intake_id: intake.id,
        p_tenant_id: auth.tenantId,
        p_matter_id: matterId,
        p_user_id: auth.userId,
        p_override_level: overrideLevel,
        p_override_reason: overrideReason,
        p_previous_level: previousLevel ?? undefined,
      })

    if (rpcError) {
      console.error('Risk override RPC error:', rpcError)
      return NextResponse.json(
        { error: 'Failed to apply risk override', details: rpcError.message },
        { status: 500 }
      )
    }

    await invalidateGating(auth.tenantId, matterId)

    return NextResponse.json({ success: true, intake: result })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      )
    }
    console.error('Override risk error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export const POST = withTiming(handlePost, 'POST /api/matters/[id]/override-risk')
