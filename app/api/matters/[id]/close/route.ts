import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { createAdminClient } from '@/lib/supabase/admin'
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
      override_trust_check,
      trust_override_reason,
    } = body as {
      closed_reason?: string
      status?: 'closed_won' | 'closed_lost' | 'closed_withdrawn'
      override_trust_check?: boolean
      trust_override_reason?: string
    }

    // Use admin client to bypass RLS — auth already verified above
    const admin = createAdminClient()

    // 3. Verify matter belongs to tenant
    const { data: matter, error: matterErr } = await admin
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
      admin
        .from('matter_deficiencies')
        .select('id', { count: 'exact', head: true })
        .eq('matter_id', matterId)
        .in('status', ['open', 'in_progress', 'reopened']),

      // Guard 3: Trust balance (debits vs credits)
      admin
        .from('trust_transactions')
        .select('transaction_type, amount_cents')
        .eq('matter_id', matterId),

      // Guard 4: Critical/high open risk flags
      admin
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
    // Balance check using correct transaction types from DB CHECK constraint (migration 100)
    const CREDIT_TYPES = ['deposit', 'transfer_in', 'interest', 'opening_balance']
    const DEBIT_TYPES = ['disbursement', 'transfer_out', 'refund', 'bank_fee', 'reversal']

    let trustBalance = 0
    if (trustResult.data && trustResult.data.length > 0) {
      for (const txn of trustResult.data) {
        const amt = (txn as any).amount_cents ?? 0
        const type = (txn as any).transaction_type ?? ''
        if (CREDIT_TYPES.includes(type)) {
          trustBalance += amt
        } else if (DEBIT_TYPES.includes(type)) {
          trustBalance -= amt
        } else if (type === 'adjustment') {
          // Adjustments use signed amount: positive = credit, negative = debit
          trustBalance += amt
        }
      }
    }

    if (trustBalance !== 0) {
      const isAdmin = role === 'Admin'
      const hasOverride = override_trust_check === true
      const hasReason = (trust_override_reason?.trim().length ?? 0) >= 30

      if (isAdmin && hasOverride && hasReason) {
        // Admin override — allowed with audit trail (logged in activity below)
      } else if (isAdmin && hasOverride && !hasReason) {
        blockers.push({
          type: 'trust_override_missing_reason',
          message: 'Trust check override requires a documented reason (minimum 30 characters)',
        })
      } else {
        blockers.push({
          type: 'unreconciled_trust',
          message: `Trust transactions are not reconciled — outstanding balance of ${trustBalance} cents must be cleared before closing`,
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

    const { error: closeErr } = await admin
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
    await admin.from('activities').insert({
      tenant_id: auth.tenantId,
      matter_id: matterId,
      activity_type: 'matter_closed',
      title: 'Matter closed',
      description: closed_reason!.trim(),
      entity_type: 'matter',
      entity_id: matterId,
      user_id: auth.userId,
      metadata: {
        status: resolvedStatus,
        closed_at: closedAt,
        ...(override_trust_check && {
          trust_override: true,
          trust_override_reason: trust_override_reason?.trim(),
          trust_balance_at_close_cents: trustBalance,
        }),
      } as any,
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
