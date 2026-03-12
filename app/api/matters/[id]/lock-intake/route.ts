import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import { logAuditServer } from '@/lib/queries/audit-logs'
import { invalidateGating } from '@/lib/services/cache-invalidation'
import { withTiming } from '@/lib/middleware/request-timing'

async function handlePost(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await authenticateRequest()
    requirePermission(auth, 'matters', 'edit')
    const { id: matterId } = await params

    // Verify matter belongs to tenant
    const { data: matter, error: matterError } = await auth.supabase
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

    // Parse body
    const body = await request.json()
    const { action, reason } = body as {
      action: string
      reason?: string
    }

    if (action !== 'lock' && action !== 'unlock') {
      return NextResponse.json(
        { error: 'Action must be "lock" or "unlock"' },
        { status: 400 }
      )
    }

    // Fetch intake record
    const { data: intake, error: intakeError } = await auth.supabase
      .from('matter_intake')
      .select('id, intake_status')
      .eq('matter_id', matterId)
      .single()

    if (intakeError || !intake) {
      return NextResponse.json(
        { error: 'No intake record found' },
        { status: 400 }
      )
    }

    if (action === 'lock') {
      if (intake.intake_status === 'locked') {
        return NextResponse.json(
          { error: 'Intake is already locked' },
          { status: 400 }
        )
      }

      const { error: updateError } = await auth.supabase
        .from('matter_intake')
        .update({
          intake_status: 'locked',
          locked_at: new Date().toISOString(),
          locked_by: auth.userId,
          lock_reason: reason || 'Locked by user',
        })
        .eq('id', intake.id)

      if (updateError) {
        return NextResponse.json(
          { error: 'Failed to lock intake', details: updateError.message },
          { status: 500 }
        )
      }
    } else {
      // unlock
      if (intake.intake_status !== 'locked') {
        return NextResponse.json(
          { error: 'Intake is not locked' },
          { status: 400 }
        )
      }

      const { error: updateError } = await auth.supabase
        .from('matter_intake')
        .update({
          intake_status: 'validated',
          locked_at: null,
          locked_by: null,
          lock_reason: null,
        })
        .eq('id', intake.id)

      if (updateError) {
        return NextResponse.json(
          { error: 'Failed to unlock intake', details: updateError.message },
          { status: 500 }
        )
      }
    }

    // Audit log
    await logAuditServer({
      supabase: auth.supabase,
      tenantId: auth.tenantId,
      userId: auth.userId,
      entityType: 'matter_intake',
      entityId: intake.id,
      action: action === 'lock' ? 'intake_locked' : 'intake_unlocked',
      changes: { action, reason: reason || null },
      metadata: { matter_id: matterId },
    })

    await invalidateGating(auth.tenantId, matterId)

    return NextResponse.json({ success: true, action })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      )
    }
    console.error('Lock intake error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export const POST = withTiming(handlePost, 'POST /api/matters/[id]/lock-intake')
