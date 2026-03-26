/**
 * Directive 066: Conflict Certification API
 *
 * POST /api/matters/[id]/conflict
 * Records the conflict search certification in the audit log.
 * Updates the matter's conflict_status column.
 *
 * Body:
 *   status: 'cleared' | 'conflict_found' | 'waiver_pending'
 *   notes?: string
 *   waiverDocumentId?: string  (if a waiver was uploaded)
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { logAuditEvent } from '@/lib/services/sovereign-audit-engine'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: matterId } = await params
  const body = await request.json()
  const { status, notes, waiverDocumentId } = body as {
    status: 'cleared' | 'conflict_found' | 'waiver_pending' | 'waiver_approved'
    notes?: string
    waiverDocumentId?: string
  }

  if (!['cleared', 'conflict_found', 'waiver_pending', 'waiver_approved'].includes(status)) {
    return NextResponse.json({ error: 'Invalid conflict status' }, { status: 400 })
  }

  const supabase = await createServerSupabaseClient()

  // Get current user
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Get app user for tenant context
  const { data: appUser } = await supabase
    .from('users')
    .select('id, tenant_id, first_name, last_name, email')
    .eq('auth_user_id', user.id)
    .single()

  if (!appUser) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  // Verify matter belongs to tenant
  const { data: matter } = await (supabase as any)
    .from('matters')
    .select('id, title, tenant_id, contact_id')
    .eq('id', matterId)
    .eq('tenant_id', appUser.tenant_id)
    .single()

  if (!matter) {
    return NextResponse.json({ error: 'Matter not found' }, { status: 404 })
  }

  // Build the update payload
  const now = new Date().toISOString()
  const updatePayload: Record<string, unknown> = {
    conflict_status: status,
    conflict_notes: notes || null,
  }

  if (status === 'cleared') {
    updatePayload.conflict_certified_by = appUser.id
    updatePayload.conflict_certified_at = now
  }

  if (waiverDocumentId) {
    updatePayload.conflict_waiver_document_id = waiverDocumentId
  }

  if (status === 'waiver_approved') {
    updatePayload.conflict_waiver_approved_by = appUser.id
    updatePayload.conflict_waiver_approved_at = now
  }

  // Update the matter
  const { error: updateError } = await (supabase as any)
    .from('matters')
    .update(updatePayload)
    .eq('id', matterId)

  if (updateError) {
    return NextResponse.json({ error: 'Failed to update conflict status' }, { status: 500 })
  }

  // Audit log - this is the Law Society insurance
  const eventType = status === 'cleared' ? 'CONFLICT_CLEARED' : 'CONFLICT_DETECTED'
  const severity = status === 'cleared' ? 'info' : 'warning'

  await logAuditEvent({
    tenantId: appUser.tenant_id,
    userId: appUser.id,
    eventType: eventType as any,
    severity: severity as any,
    tableName: 'matters',
    recordId: matterId,
    metadata: {
      after: {
        conflict_status: status,
        matter_title: matter.title,
        certified_by: `${appUser.first_name} ${appUser.last_name}`,
        certified_at: now,
        notes: notes || null,
        waiver_document_id: waiverDocumentId || null,
      },
    },
  })

  return NextResponse.json({
    success: true,
    conflictStatus: status,
    certifiedAt: now,
    certifiedBy: appUser.id,
  })
}

/**
 * GET /api/matters/[id]/conflict
 * Returns the current conflict status for a matter.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: matterId } = await params
  const supabase = await createServerSupabaseClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: appUser } = await supabase
    .from('users')
    .select('id, tenant_id')
    .eq('auth_user_id', user.id)
    .single()

  if (!appUser) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  const { data: matter } = await (supabase as any)
    .from('matters')
    .select('id, conflict_status, conflict_certified_by, conflict_certified_at, conflict_waiver_document_id, conflict_waiver_approved_by, conflict_waiver_approved_at, conflict_notes')
    .eq('id', matterId)
    .eq('tenant_id', appUser.tenant_id)
    .single()

  if (!matter) {
    return NextResponse.json({ error: 'Matter not found' }, { status: 404 })
  }

  return NextResponse.json(matter)
}
