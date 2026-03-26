import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import { sendDocumentRequest } from '@/lib/services/document-request-service'
import { withTiming } from '@/lib/middleware/request-timing'
import { syncImmigrationIntakeStatus } from '@/lib/services/immigration-status-engine'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * POST /api/matters/[id]/document-request
 * Send a document request to the primary client contact.
 *
 * Body: { slot_ids: string[], message?: string }
 */
async function handlePost(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: matterId } = await params
    const auth = await authenticateRequest()
    const admin = createAdminClient()
    requirePermission(auth, 'matters', 'edit')

    // Parse body
    const body = await request.json()
    const { slot_ids, message, language } = body as { slot_ids?: string[]; message?: string; language?: string }

    if (!slot_ids || !Array.isArray(slot_ids) || slot_ids.length === 0) {
      return NextResponse.json(
        { error: 'slot_ids array is required and must not be empty' },
        { status: 400 }
      )
    }

    // Verify matter belongs to tenant
    const { data: matter } = await admin
      .from('matters')
      .select('id')
      .eq('id', matterId)
      .eq('tenant_id', auth.tenantId)
      .single()

    if (!matter) {
      return NextResponse.json({ error: 'Matter not found' }, { status: 404 })
    }

    // Validate all slot_ids belong to this matter, are active, required, not accepted
    const { data: validSlots } = await admin
      .from('document_slots')
      .select('id, status')
      .in('id', slot_ids)
      .eq('matter_id', matterId)
      .eq('is_active', true)
      .eq('is_required', true)

    const outstandingSlotIds = (validSlots ?? [])
      .filter((s) => s.status !== 'accepted')
      .map((s) => s.id)

    if (outstandingSlotIds.length === 0) {
      return NextResponse.json(
        { error: 'No outstanding required slots to request' },
        { status: 400 }
      )
    }

    const result = await sendDocumentRequest({
      supabase: admin,
      tenantId: auth.tenantId,
      matterId,
      slotIds: outstandingSlotIds,
      requestedBy: auth.userId,
      message,
      language,
    })

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }

    // Sync immigration intake status  -  portal link/request now exists, so
    // the matter can advance from not_issued → issued automatically.
    try {
      await syncImmigrationIntakeStatus(admin, matterId, auth.userId)
    } catch (err) {
      console.error('[document-request] Status sync failed (non-fatal):', err)
    }

    return NextResponse.json({
      success: true,
      request_id: result.requestId,
      slots_requested: outstandingSlotIds.length,
    })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error('[document-request] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * GET /api/matters/[id]/document-request
 * List past document requests for this matter.
 */
async function handleGet(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: matterId } = await params
    const auth = await authenticateRequest()
    const admin = createAdminClient()
    requirePermission(auth, 'matters', 'edit')

    const { data: requests, error } = await admin
      .from('document_requests')
      .select('*')
      .eq('matter_id', matterId)
      .order('created_at', { ascending: false })
      .limit(50)

    if (error) {
      return NextResponse.json({ error: 'Failed to fetch requests' }, { status: 500 })
    }

    return NextResponse.json({ requests: requests ?? [] })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error('[document-request] GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export const POST = withTiming(handlePost, 'POST /api/matters/[id]/document-request')
export const GET = withTiming(handleGet, 'GET /api/matters/[id]/document-request')
