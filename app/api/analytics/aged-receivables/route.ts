/**
 * GET /api/analytics/aged-receivables — Aged receivables report
 */

import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import { getAgedReceivables } from '@/lib/services/analytics/analytics-service'

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest()
    requirePermission(auth, 'analytics', 'view')

    const { searchParams } = new URL(request.url)
    const filters = {
      practice_area_id: searchParams.get('practice_area_id') ?? undefined,
      responsible_lawyer_id: searchParams.get('responsible_lawyer_id') ?? undefined,
      matter_type_id: searchParams.get('matter_type_id') ?? undefined,
      contact_id: searchParams.get('contact_id') ?? undefined,
    }

    const data = await getAgedReceivables(auth, filters)

    return NextResponse.json({ success: true, data })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status })
    }
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
