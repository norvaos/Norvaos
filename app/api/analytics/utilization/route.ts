/**
 * GET /api/analytics/utilization — Lawyer utilisation report
 */

import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import { getLawyerUtilization } from '@/lib/services/analytics/analytics-service'

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest()
    requirePermission(auth, 'analytics', 'view')

    const { searchParams } = new URL(request.url)
    const filters = {
      user_id: searchParams.get('user_id') ?? undefined,
      practice_area_id: searchParams.get('practice_area_id') ?? undefined,
      start_date: searchParams.get('start_date') ?? undefined,
      end_date: searchParams.get('end_date') ?? undefined,
    }

    const data = await getLawyerUtilization(auth, filters)

    return NextResponse.json({ success: true, data })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status })
    }
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
