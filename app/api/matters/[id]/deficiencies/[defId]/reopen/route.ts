/**
 * PUT /api/matters/[id]/deficiencies/[defId]/reopen
 *
 * Reopen a resolved or closed deficiency.
 * Auth: any authenticated user in same tenant.
 * Increments reopen_count; sets chronic_flag when count reaches 3.
 *
 * Sprint 6, Week 1 — 2026-03-17
 */

import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { computeReopenTransition } from '@/lib/services/deficiency-engine'
import type { MatterDeficiencyRow } from '@/lib/types/database'
import { createAdminClient } from '@/lib/supabase/admin'

export async function PUT(
  _request: Request,
  { params }: { params: Promise<{ id: string; defId: string }> },
) {
  try {
    const { id: matterId, defId } = await params
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

    // Fetch the deficiency
    const { data: deficiency, error: defErr } = await admin
      .from('matter_deficiencies')
      .select('*')
      .eq('id', defId)
      .eq('matter_id', matterId)
      .eq('tenant_id', auth.tenantId)
      .single()

    if (defErr || !deficiency) {
      return NextResponse.json(
        { error: 'Deficiency not found or access denied' },
        { status: 404 },
      )
    }

    const current = deficiency as MatterDeficiencyRow

    // Validate current status allows reopening
    if (current.status !== 'resolved' && current.status !== 'closed') {
      return NextResponse.json(
        { error: `Cannot reopen a deficiency with status "${current.status}". Only resolved or closed deficiencies can be reopened.` },
        { status: 422 },
      )
    }

    const transition = computeReopenTransition(current, auth.userId)

    const updatePayload: {
      status: 'reopened'
      reopen_count: number
      chronic_flag: boolean
      reopened_at: string
      reopened_by: string
      updated_at: string
      chronic_escalated_at?: string
    } = {
      status: transition.newStatus,
      reopen_count: transition.newReopenCount,
      chronic_flag: transition.chronicFlag,
      reopened_at: transition.reopenedAt,
      reopened_by: auth.userId,
      updated_at: new Date().toISOString(),
    }

    // Set chronic_escalated_at on first chronic event
    if (transition.chronicFlag && !current.chronic_flag) {
      updatePayload.chronic_escalated_at = new Date().toISOString()
    }

    const { data: updated, error: updateErr } = await admin
      .from('matter_deficiencies')
      .update(updatePayload)
      .eq('id', defId)
      .select()
      .single()

    if (updateErr || !updated) {
      console.error('[deficiencies reopen] Update error:', updateErr?.message)
      return NextResponse.json({ error: 'Failed to reopen deficiency' }, { status: 500 })
    }

    // Log to activities
    const isChronic = transition.chronicFlag && !current.chronic_flag
    admin
      .from('activities')
      .insert({
        tenant_id: auth.tenantId,
        matter_id: matterId,
        user_id: auth.userId,
        activity_type: 'deficiency_reopened',
        title: isChronic ? 'Deficiency reopened — marked chronic' : 'Deficiency reopened',
        description: `Reopen #${transition.newReopenCount}${isChronic ? '. This deficiency has been escalated as chronic.' : ''}`,
        metadata: {
          deficiency_id: defId,
          reopen_count: transition.newReopenCount,
          chronic_flag: transition.chronicFlag,
          severity: current.severity,
          category: current.category,
        },
      })
      .then(({ error: actErr }) => {
        if (actErr) {
          console.error('[deficiencies reopen] Activity log error:', actErr.message)
        }
      })

    return NextResponse.json(updated)
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error('[deficiencies reopen] Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
