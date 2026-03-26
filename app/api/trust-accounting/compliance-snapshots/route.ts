/**
 * GET  /api/trust-accounting/compliance-snapshots  -  List compliance snapshots
 * POST /api/trust-accounting/compliance-snapshots  -  Generate a new snapshot
 */

import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import {
  generateComplianceSnapshot,
  listComplianceSnapshots,
} from '@/lib/services/trust-accounting/compliance-examination-service'

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest()
    requirePermission(auth, 'trust_accounting', 'view')

    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') ?? '1', 10)
    const pageSize = parseInt(searchParams.get('pageSize') ?? '25', 10)

    const result = await listComplianceSnapshots({
      supabase: auth.supabase,
      tenantId: auth.tenantId,
      page,
      pageSize,
    })

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      snapshots: result.data!.snapshots,
      pagination: { page, pageSize, total: result.data!.total },
    })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status })
    }
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateRequest()
    requirePermission(auth, 'trust_accounting', 'create')

    const body = await request.json()
    const { snapshotType, periodStart, periodEnd } = body

    if (!snapshotType || !periodStart || !periodEnd) {
      return NextResponse.json(
        { success: false, error: 'snapshotType, periodStart, and periodEnd are required' },
        { status: 400 },
      )
    }

    const validTypes = ['law_society_exam', 'internal_audit', 'annual_review']
    if (!validTypes.includes(snapshotType)) {
      return NextResponse.json(
        { success: false, error: `snapshotType must be one of: ${validTypes.join(', ')}` },
        { status: 400 },
      )
    }

    const result = await generateComplianceSnapshot({
      supabase: auth.supabase,
      tenantId: auth.tenantId,
      userId: auth.userId,
      snapshotType,
      periodStart,
      periodEnd,
    })

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 500 })
    }

    return NextResponse.json({ success: true, snapshot: result.data }, { status: 201 })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status })
    }
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
