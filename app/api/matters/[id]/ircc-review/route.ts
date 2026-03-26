import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import { createAdminClient } from '@/lib/supabase/admin'

type RouteContext = { params: Promise<{ id: string }> }

/**
 * GET /api/matters/[id]/ircc-review
 *
 * Returns the latest IRCC client review for this matter.
 */
async function handleGet(
  _request: NextRequest,
  { params }: RouteContext,
) {
  try {
    const { id: matterId } = await params
    const auth = await authenticateRequest()
    const admin = createAdminClient()
    requirePermission(auth, 'matters', 'view')

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (admin as any)
      .from('ircc_client_reviews')
      .select('*')
      .eq('matter_id', matterId)
      .eq('tenant_id', auth.tenantId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) throw error
    return NextResponse.json({ review: data ?? null })
  } catch (err) {
    console.error('[ircc-review] GET error:', err)
    return NextResponse.json({ error: 'Failed to fetch client review' }, { status: 500 })
  }
}

/**
 * POST /api/matters/[id]/ircc-review
 *
 * Actions:
 *   action: 'create'        -  Initiates a new client review record
 *   action: 'mark_sent'     -  Marks review as sent (with optional signingRequestId)
 *   action: 'mark_signed'   -  Marks review as signed (unlocks final form pack)
 *   action: 'mark_declined' -  Marks review as declined
 */
async function handlePost(
  request: NextRequest,
  { params }: RouteContext,
) {
  try {
    const { id: matterId } = await params
    const auth = await authenticateRequest()
    const admin = createAdminClient()
    requirePermission(auth, 'matters', 'view')

    const body = await request.json() as {
      action: 'create' | 'mark_sent' | 'mark_signed' | 'mark_declined'
      reviewId?: string
      signingRequestId?: string
    }

    const { action } = body

    if (action === 'create') {
      // Create a new review record
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (admin as any)
        .from('ircc_client_reviews')
        .insert({
          matter_id: matterId,
          tenant_id: auth.tenantId,
          status: 'pending',
        })
        .select()
        .single()

      if (error) throw error
      return NextResponse.json({ review: data })
    }

    if (!body.reviewId) {
      return NextResponse.json({ error: 'reviewId required for this action' }, { status: 400 })
    }

    if (action === 'mark_sent') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (admin as any)
        .from('ircc_client_reviews')
        .update({
          status: 'sent',
          sent_at: new Date().toISOString(),
          sent_by: auth.userId,
          signing_request_id: body.signingRequestId ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', body.reviewId)
        .eq('tenant_id', auth.tenantId)
        .select()
        .single()

      if (error) throw error
      return NextResponse.json({ review: data })
    }

    if (action === 'mark_signed') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (admin as any)
        .from('ircc_client_reviews')
        .update({
          status: 'signed',
          signed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', body.reviewId)
        .eq('tenant_id', auth.tenantId)
        .select()
        .single()

      if (error) throw error
      return NextResponse.json({ review: data })
    }

    if (action === 'mark_declined') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (admin as any)
        .from('ircc_client_reviews')
        .update({
          status: 'declined',
          declined_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', body.reviewId)
        .eq('tenant_id', auth.tenantId)
        .select()
        .single()

      if (error) throw error
      return NextResponse.json({ review: data })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (err) {
    console.error('[ircc-review] POST error:', err)
    return NextResponse.json({ error: 'Failed to update client review' }, { status: 500 })
  }
}

export const GET = handleGet
export const POST = handlePost

const admin = createAdminClient()