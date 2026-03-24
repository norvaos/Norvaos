import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { computeReadiness } from '@/lib/services/readiness-engine'
import { withTiming } from '@/lib/middleware/request-timing'
import type { Json } from '@/lib/types/database'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * POST /api/matters/[id]/readiness
 *
 * Recomputes the composite readiness score for the matter, persists the result
 * to matters.readiness_score / readiness_breakdown / readiness_focus_area,
 * and returns the full breakdown to the caller.
 *
 * Returns: { score, domains, focus_area, level }
 */
async function handlePost(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: matterId } = await params

    const auth = await authenticateRequest()
    const admin = createAdminClient()

    // Verify matter belongs to this tenant
    const { data: matter, error: matterErr } = await admin
      .from('matters')
      .select('id, tenant_id')
      .eq('id', matterId)
      .eq('tenant_id', auth.tenantId)
      .single()

    if (matterErr || !matter) {
      return NextResponse.json(
        { error: 'Matter not found or access denied' },
        { status: 404 },
      )
    }

    // Compute readiness
    const result = await computeReadiness(matterId, admin)

    // Persist to matters table — fire-and-forget is intentional; the
    // computed result is the source of truth returned to the caller.
    admin
      .from('matters')
      .update({
        readiness_score: result.total,
        readiness_breakdown: result.domains as unknown as Json,
        readiness_focus_area: result.focus_area,
      })
      .eq('id', matterId)
      .then(({ error: updateErr }) => {
        if (updateErr) {
          console.error('[readiness] Failed to persist readiness_score:', updateErr.message)
        }
      })

    return NextResponse.json({
      score: result.total,
      domains: result.domains,
      focus_area: result.focus_area,
      level: result.level,
      total: result.total,
    })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      )
    }

    console.error('[readiness] Unexpected error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    )
  }
}

export const POST = withTiming(handlePost, 'POST /api/matters/[id]/readiness')
