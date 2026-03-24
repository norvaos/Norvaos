/**
 * PUT /api/matters/[id]/deficiencies/[defId]/resolve
 *
 * Resolve an open deficiency.
 * Auth: Lawyer or Admin role only.
 * Body: { resolution_notes: string (min 20 chars), resolution_evidence_path?: string }
 *
 * Sprint 6, Week 1 — 2026-03-17
 */

import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { computeResolveTransition } from '@/lib/services/deficiency-engine'
import type { MatterDeficiencyRow } from '@/lib/types/database'
import { createAdminClient } from '@/lib/supabase/admin'

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string; defId: string }> },
) {
  try {
    const { id: matterId, defId } = await params
    const auth = await authenticateRequest()
    const admin = createAdminClient()

    // Role check: Lawyer or Admin only.
    // auth.role is pre-fetched by authenticateRequest() — zero extra DB calls.
    const roleName = auth.role?.name ?? null

    if (roleName !== 'Lawyer' && roleName !== 'Admin') {
      return NextResponse.json(
        { error: 'Only Lawyers and Admins can resolve deficiencies' },
        { status: 403 },
      )
    }

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

    const body = await request.json() as Record<string, unknown>
    const resolutionNotes = typeof body.resolution_notes === 'string' ? body.resolution_notes : ''
    const resolutionEvidencePath =
      typeof body.resolution_evidence_path === 'string'
        ? body.resolution_evidence_path
        : undefined

    if (resolutionNotes.trim().length < 20) {
      return NextResponse.json(
        { error: 'resolution_notes must be at least 20 characters' },
        { status: 422 },
      )
    }

    const transition = computeResolveTransition(deficiency as MatterDeficiencyRow, {
      resolution_notes: resolutionNotes,
      resolution_evidence_path: resolutionEvidencePath,
    })

    const { data: updated, error: updateErr } = await admin
      .from('matter_deficiencies')
      .update({
        status: transition.newStatus,
        resolved_at: transition.resolvedAt,
        resolved_by: auth.userId,
        resolution_notes: resolutionNotes,
        resolution_evidence_path: resolutionEvidencePath ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', defId)
      .select()
      .single()

    if (updateErr || !updated) {
      console.error('[deficiencies resolve] Update error:', updateErr?.message)
      return NextResponse.json({ error: 'Failed to resolve deficiency' }, { status: 500 })
    }

    // Log to activities
    admin
      .from('activities')
      .insert({
        tenant_id: auth.tenantId,
        matter_id: matterId,
        user_id: auth.userId,
        activity_type: 'deficiency_resolved',
        title: 'Deficiency resolved',
        description: resolutionNotes.slice(0, 120),
        metadata: {
          deficiency_id: defId,
          severity: (deficiency as MatterDeficiencyRow).severity,
          category: (deficiency as MatterDeficiencyRow).category,
        },
      })
      .then(({ error: actErr }) => {
        if (actErr) {
          console.error('[deficiencies resolve] Activity log error:', actErr.message)
        }
      })

    return NextResponse.json(updated)
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error('[deficiencies resolve] Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
