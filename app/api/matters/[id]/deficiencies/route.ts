/**
 * GET  /api/matters/[id]/deficiencies  — list all deficiencies for the matter
 * POST /api/matters/[id]/deficiencies  — create a new deficiency
 *
 * Auth: any authenticated user in same tenant.
 * POST critical severity: also logs to activities table.
 *
 * Sprint 6, Week 1 — 2026-03-17
 */

import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { validateDeficiencyCreate } from '@/lib/services/deficiency-engine'
import type { MatterDeficiencyInsert } from '@/lib/types/database'

// ─── GET ──────────────────────────────────────────────────────────────────────

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: matterId } = await params
    const auth = await authenticateRequest()

    // Verify matter belongs to this tenant
    const { data: matter, error: matterErr } = await auth.supabase
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

    const { data, error } = await auth.supabase
      .from('matter_deficiencies')
      .select('*')
      .eq('matter_id', matterId)
      .eq('tenant_id', auth.tenantId)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('[deficiencies GET] DB error:', error.message)
      return NextResponse.json({ error: 'Failed to load deficiencies' }, { status: 500 })
    }

    return NextResponse.json(data ?? [])
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error('[deficiencies GET] Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ─── POST ─────────────────────────────────────────────────────────────────────

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: matterId } = await params
    const auth = await authenticateRequest()

    // Verify matter belongs to this tenant
    const { data: matter, error: matterErr } = await auth.supabase
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

    const body = await request.json() as Record<string, unknown>

    // Validate using the engine
    const validationInput = {
      matter_id: matterId,
      severity: body.severity as 'minor' | 'major' | 'critical',
      category: typeof body.category === 'string' ? body.category : '',
      description: typeof body.description === 'string' ? body.description : '',
      assigned_to_user_id: typeof body.assigned_to_user_id === 'string'
        ? body.assigned_to_user_id
        : undefined,
      stage_id: typeof body.stage_id === 'string' ? body.stage_id : undefined,
    }

    const validation = validateDeficiencyCreate(validationInput)
    if (!validation.valid) {
      return NextResponse.json(
        { error: 'Validation failed', errors: validation.errors },
        { status: 422 },
      )
    }

    const insert: MatterDeficiencyInsert = {
      tenant_id: auth.tenantId,
      matter_id: matterId,
      created_by: auth.userId,
      severity: validationInput.severity,
      category: validationInput.category,
      description: validationInput.description,
      status: 'open',
      reopen_count: 0,
      chronic_flag: false,
    }

    if (validationInput.assigned_to_user_id) {
      insert.assigned_to_user_id = validationInput.assigned_to_user_id
    }
    if (validationInput.stage_id) {
      insert.stage_id = validationInput.stage_id
    }

    const { data: created, error: insertErr } = await auth.supabase
      .from('matter_deficiencies')
      .insert(insert)
      .select()
      .single()

    if (insertErr || !created) {
      console.error('[deficiencies POST] Insert error:', insertErr?.message)
      return NextResponse.json({ error: 'Failed to create deficiency' }, { status: 500 })
    }

    // For critical severity: log to activities
    if (validationInput.severity === 'critical') {
      auth.supabase
        .from('activities')
        .insert({
          tenant_id: auth.tenantId,
          matter_id: matterId,
          user_id: auth.userId,
          activity_type: 'deficiency_created',
          title: 'Critical deficiency flagged',
          description: `Category: ${validationInput.category}. ${validationInput.description.slice(0, 120)}`,
          metadata: {
            deficiency_id: created.id,
            severity: validationInput.severity,
            category: validationInput.category,
          },
        })
        .then(({ error: actErr }) => {
          if (actErr) {
            console.error('[deficiencies POST] Activity log error:', actErr.message)
          }
        })
    }

    return NextResponse.json(created, { status: 201 })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error('[deficiencies POST] Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
