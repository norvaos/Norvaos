/**
 * GET /api/trust-accounting/disbursement-lock — Check disbursement lock status
 */

import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import { checkDisbursementLock } from '@/lib/services/trust-accounting/auto-reconciliation-service'

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest()
    requirePermission(auth, 'trust_accounting', 'view')

    const { searchParams } = new URL(request.url)
    const trustAccountId = searchParams.get('trustAccountId')

    if (!trustAccountId) {
      return NextResponse.json(
        { success: false, error: 'trustAccountId query parameter is required' },
        { status: 400 },
      )
    }

    const result = await checkDisbursementLock(
      auth.supabase,
      auth.tenantId,
      trustAccountId,
    )

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      locked: result.data!.locked,
      reason: result.data!.reason,
      lockedAt: result.data!.locked_at,
    })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status })
    }
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
