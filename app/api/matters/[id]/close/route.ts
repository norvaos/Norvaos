import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { withTiming } from '@/lib/middleware/request-timing'

/**
 * POST /api/matters/[id]/close
 *
 * Server-side closure guard. Checks all blockers in one pass and returns
 * all failures in a single 422 response — no partial information hiding.
 *
 * Auth: Lawyer or Admin only.
 *
 * Body: {
 *   closed_reason: string  (min 30 chars, required)
 *   status?: 'closed_won' | 'closed_lost' | 'closed_withdrawn'
 * }
 *
 * Guards checked:
 *  1. closed_reason present and >= 30 chars
 *  2. No open deficiencies (matter_deficiencies WHERE status IN open/in_progress/reopened)
 *  3. Trust reconciled: no unbalanced trust_transactions for this matter
 *  4. No open critical/high risk flags (matter_risk_flags)
 *
 * On failure: 422 with { error, blockers[] }
 * On success: 200 with { success, closed_at, status }
 */
async function handlePost(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: matterId } = await params

    // 1. Authenticate + role check
    const auth = await authenticateRequest()
    const role = auth.role?.name
    if (!role || !['Lawyer', 'Admin'].includes(role)) {
      return NextResponse.json(
        { success: false, error: 'Forbidden: Lawyer or Admin role required' },
        { status: 403 }
      )
    }

    // 2. Parse body
    const body = await request.json()
    const {
      closed_reason,
      status: closureStatus,
    } = body as {
      closed_reason?: string
      status?: 'closed_won' | 'closed_lost' | 'closed_withdrawn'
    }

    // 3. Verify matter belongs to tenant
    const { data: matter, error: matterErr } = await auth.supabase
      .from('matters')
      .select('id, tenant_id, status, title')
      .eq('id', matterId)
      .eq('tenant_id', auth.tenantId)
      .single()

    if (matterErr || !matter) {
      return NextResponse.json(
        { success: false, error: 'Matter not found or access denied' },
        { status: 404 }
      )
    }

    // 4. Run all guards in parallel
    const [deficienciesResult, trustResult, riskFlagsResult] = await Promise.all([
      // Guard 2: Open deficiencies
      auth.supabase
        .from('matter_deficiencies')
        .select('id', { count: 'exact', head: true })
        .eq('matter_id', matterId)
        .in('status', ['open', 'in_progress', 'reopened']),

      // Guard 3: Trust balance (debits vs credits)
      auth.supabase
        .from('trust_transactions')
        .select('transaction_type, amount_cents')
        .eq('matter_id', matterId),

      // Guard 4: Critical/high open risk flags
      auth.supabase
        .from('matter_risk_flags')
        .select('id', { count: 'exact', head: true })
        .eq('matter_id', matterId)
        .eq('status', 'open')
        .in('severity', ['critical', 'high']),
    ])

    // 5. Evaluate blockers
    interface Blocker {
      type: string
      count?: number
      message: string
    }

    const blockers: Blocker[] = []

    // Guard 1: closed_reason
    if (!closed_reason || closed_reason.trim().length < 30) {
      blockers.push({
        type: 'missing_closure_reason',
        message: 'Closure reason is required (min 30 characters)',
      })
    }

    // Guard 2: Open deficiencies
    const openDefCount = deficienciesResult.count ?? 0
    if (openDefCount > 0) {
      blockers.push({
        type: 'open_deficiencies',
        count: openDefCount,
        message: `${openDefCount} open deficiencie${openDefCount > 1 ? 's' : ''} must be resolved`,
      })
    }

    // Guard 3: Trust reconciliation
    // Simple balance check: debits !== credits indicates unreconciled state
    if (trustResult.data && trustResult.data.length > 0) {
      let balance = 0
      for (const txn of trustResult.data) {
        const amt = (txn as any).amount_cents ?? 0
        const type = (txn as any).transaction_type ?? ''
        // Receipts add to trust; disbursements deduct
        if (['receipt', 'transfer_in', 'interest'].includes(type)) {
          balance += amt
        } else if (['disbursement', 'transfer_out', 'fee', 'reversal'].includes(type)) {
          balance -= amt
        }
      }
      if (balance !== 0) {
        blockers.push({
          type: 'unreconciled_trust',
          message: 'Trust transactions are not reconciled — outstanding balance must be cleared before closing',
        })
      }
    }

    // Guard 4: Open critical/high risk flags
    const openRiskCount = riskFlagsResult.count ?? 0
    if (openRiskCount > 0) {
      blockers.push({
        type: 'open_risk_flags',
        count: openRiskCount,
        message: `${openRiskCount} critical/high risk flag${openRiskCount > 1 ? 's' : ''} must be resolved`,
      })
    }

    // 6. Return 422 if any blockers
    if (blockers.length > 0) {
      return NextResponse.json(
        {
          error: 'Matter cannot be closed',
          blockers,
        },
        { status: 422 }
      )
    }

    // 7. Close the matter
    const resolvedStatus = closureStatus ?? 'closed_won'
    const closedAt = new Date().toISOString()

    const { error: closeErr } = await auth.supabase
      .from('matters')
      .update({
        status: resolvedStatus,
        closed_reason: closed_reason!.trim(),
        closed_by: auth.userId,
        closed_at: closedAt,
        date_closed: closedAt.substring(0, 10),
      } as any)
      .eq('id', matterId)
      .eq('tenant_id', auth.tenantId)

    if (closeErr) {
      console.error('[close] Failed to update matter:', closeErr.message)
      return NextResponse.json(
        { success: false, error: 'Failed to close matter' },
        { status: 500 }
      )
    }

    // 8. Log activity
    await auth.supabase.from('activities').insert({
      tenant_id: auth.tenantId,
      matter_id: matterId,
      activity_type: 'matter_closed',
      title: 'Matter closed',
      description: closed_reason!.trim(),
      entity_type: 'matter',
      entity_id: matterId,
      user_id: auth.userId,
      metadata: { status: resolvedStatus, closed_at: closedAt } as any,
    })

    return NextResponse.json(
      { success: true, closed_at: closedAt, status: resolvedStatus },
      { status: 200 }
    )
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.status }
      )
    }
    console.error('[close] Unexpected error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export const POST = withTiming(handlePost, 'POST /api/matters/[id]/close')
