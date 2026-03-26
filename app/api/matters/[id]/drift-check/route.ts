/**
 * GET /api/matters/[id]/drift-check
 *
 * Drift-Blocker — Check if there are unacknowledged case law alerts
 * that should block AI draft approval for this matter.
 *
 * POST /api/matters/[id]/drift-check
 *
 * Acknowledge a drift alert so it no longer blocks draft approval.
 */

import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { checkDriftBlock, acknowledgeDriftAlert } from '@/lib/services/drift-sentry/drift-blocker'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { tenantId, supabase } = await authenticateRequest()
    const { id: matterId } = await params

    // Fetch matter to get case type for targeted matching
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: matter } = await (supabase as any)
      .from('matters')
      .select('case_type_id')
      .eq('id', matterId)
      .single()

    let caseTypeSlug: string | null = null
    if (matter?.case_type_id) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: caseType } = await (supabase as any)
        .from('case_types')
        .select('slug')
        .eq('id', matter.case_type_id)
        .single()
      caseTypeSlug = (caseType as { slug?: string } | null)?.slug ?? null
    }

    const status = await checkDriftBlock(supabase, tenantId, caseTypeSlug)

    return NextResponse.json(status)
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: 401 })
    }
    console.error('[Drift-Blocker] Check error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { tenantId, userId, supabase } = await authenticateRequest()
    await params // consume params

    const body = await request.json()
    const { alertId } = body as { alertId: string }

    if (!alertId) {
      return NextResponse.json({ error: 'alertId is required' }, { status: 400 })
    }

    await acknowledgeDriftAlert(supabase, tenantId, alertId, userId)

    return NextResponse.json({ success: true, acknowledgedAt: new Date().toISOString() })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: 401 })
    }
    console.error('[Drift-Blocker] Acknowledge error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to acknowledge alert' },
      { status: 500 },
    )
  }
}
