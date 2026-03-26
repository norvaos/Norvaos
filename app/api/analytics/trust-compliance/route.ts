/**
 * GET /api/analytics/trust-compliance  -  Trust compliance dashboard
 */

import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import { getTrustComplianceDashboard } from '@/lib/services/analytics/analytics-service'

export async function GET() {
  try {
    const auth = await authenticateRequest()
    requirePermission(auth, 'trust_accounting', 'view')

    const data = await getTrustComplianceDashboard(auth)

    return NextResponse.json({ success: true, data })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status })
    }
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
