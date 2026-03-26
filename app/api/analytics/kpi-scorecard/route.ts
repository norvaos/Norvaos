/**
 * GET /api/analytics/kpi-scorecard  -  Firm KPI scorecard
 */

import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import { getKpiScorecard } from '@/lib/services/analytics/analytics-service'

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest()
    requirePermission(auth, 'analytics', 'view')

    const { searchParams } = new URL(request.url)
    const now = new Date()
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
    const todayStr = now.toISOString().split('T')[0]
    const priorMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const priorMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0)

    const filters = {
      start_date: searchParams.get('start_date') ?? monthStart,
      end_date: searchParams.get('end_date') ?? todayStr,
      prior_start_date: searchParams.get('prior_start_date') ?? priorMonthStart.toISOString().split('T')[0],
      prior_end_date: searchParams.get('prior_end_date') ?? priorMonthEnd.toISOString().split('T')[0],
    }

    const data = await getKpiScorecard(auth, filters)

    return NextResponse.json({ success: true, data })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status })
    }
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
