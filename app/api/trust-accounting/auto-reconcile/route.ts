/**
 * POST /api/trust-accounting/auto-reconcile  -  Run auto-reconciliation for a trust account
 */

import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import { runAutoReconciliation } from '@/lib/services/trust-accounting/auto-reconciliation-service'

export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateRequest()
    requirePermission(auth, 'trust_accounting', 'create')

    const body = await request.json()
    const { trustAccountId, periodStart, periodEnd } = body

    if (!trustAccountId || !periodStart || !periodEnd) {
      return NextResponse.json(
        { success: false, error: 'trustAccountId, periodStart, and periodEnd are required' },
        { status: 400 },
      )
    }

    const result = await runAutoReconciliation({
      supabase: auth.supabase,
      tenantId: auth.tenantId,
      userId: auth.userId,
      trustAccountId,
      periodStart,
      periodEnd,
    })

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 500 })
    }

    return NextResponse.json({ success: true, reconciliation: result.data }, { status: 201 })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status })
    }
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
