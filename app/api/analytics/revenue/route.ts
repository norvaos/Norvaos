/**
 * GET /api/analytics/revenue  -  Revenue analytics report
 */

import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import { getRevenueAnalytics } from '@/lib/services/analytics/analytics-service'

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest()
    requirePermission(auth, 'analytics', 'view')

    const { searchParams } = new URL(request.url)
    const periodTypeRaw = searchParams.get('period_type') ?? undefined
    const periodType = (['monthly', 'quarterly', 'annual'] as const).includes(periodTypeRaw as any)
      ? (periodTypeRaw as 'monthly' | 'quarterly' | 'annual')
      : undefined

    const filters = {
      practice_area_id: searchParams.get('practice_area_id') ?? undefined,
      responsible_lawyer_id: searchParams.get('responsible_lawyer_id') ?? undefined,
      period_type: periodType,
      start_date: searchParams.get('start_date') ?? undefined,
      end_date: searchParams.get('end_date') ?? undefined,
    }

    const data = await getRevenueAnalytics(auth, filters)

    return NextResponse.json({ success: true, data })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status })
    }
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
