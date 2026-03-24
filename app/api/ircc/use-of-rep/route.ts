import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import { buildUseOfRepData } from '@/lib/ircc/use-of-rep-generator'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * GET /api/ircc/use-of-rep?matterId=xxx
 *
 * Returns the pre-filled Use of Representative data for a matter.
 * The client uses this to display the data before sending for e-sign.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const matterId = searchParams.get('matterId')

    if (!matterId) {
      return NextResponse.json({ error: 'matterId required' }, { status: 400 })
    }

    const auth = await authenticateRequest()
    const admin = createAdminClient()
    requirePermission(auth, 'matters', 'view')

    const repData = await buildUseOfRepData(admin, auth.tenantId, matterId)
    return NextResponse.json({ repData })
  } catch (err) {
    console.error('[use-of-rep] GET error:', err)
    return NextResponse.json({ error: 'Failed to fetch Use of Rep data' }, { status: 500 })
  }
}

/**
 * POST /api/ircc/use-of-rep
 *
 * Generates the Use of Representative form data.
 * In a full implementation this would trigger the Python XFA filler.
 * For now, returns the structured data for the client to use.
 *
 * Body: { matterId: string }
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateRequest()
    const admin = createAdminClient()
    requirePermission(auth, 'matters', 'view')

    const body = await request.json() as { matterId: string }
    const { matterId } = body

    if (!matterId) {
      return NextResponse.json({ error: 'matterId required' }, { status: 400 })
    }

    const repData = await buildUseOfRepData(admin, auth.tenantId, matterId)

    // TODO: When Python script integration is ready, call xfa-filler here
    // For now, return the structured data so the client can review it
    return NextResponse.json({
      repData,
      status: 'data_ready',
      message: 'Use of Representative data compiled. PDF generation requires server-side Python integration.',
    })
  } catch (err) {
    console.error('[use-of-rep] POST error:', err)
    return NextResponse.json({ error: 'Failed to generate Use of Rep form' }, { status: 500 })
  }
}
