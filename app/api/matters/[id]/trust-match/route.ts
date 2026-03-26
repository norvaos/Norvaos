import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import { withTiming } from '@/lib/middleware/request-timing'
import { createServerSupabaseClient } from '@/lib/supabase/server'

/**
 * GET /api/matters/[id]/trust-match
 *
 * Smart-Match Engine  -  calls fn_suggest_transaction_matches RPC
 * to find unallocated deposits that match open invoices.
 *
 * Auth: Sentinel 403  -  authenticateRequest() + requirePermission('billing', 'view')
 * Tenant isolation enforced both here AND inside the RPC.
 */
async function handleGet(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: matterId } = await params
    const auth = await authenticateRequest()
    requirePermission(auth, 'billing', 'view')

    const supabase = await createServerSupabaseClient()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).rpc('fn_suggest_transaction_matches', {
      p_matter_id: matterId,
    })

    if (error) {
      if (error.message?.includes('P0403') || error.message?.includes('cross-tenant')) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 })
      }
      throw error
    }

    return NextResponse.json({ success: true, suggestions: data ?? [] })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error('[trust-match] GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/matters/[id]/trust-match
 *
 * Apply a suggested match  -  calls fn_apply_trust_allocation RPC.
 * Body: { invoiceId, transactionId, amountCents, notes? }
 *
 * Auth: Sentinel 403  -  authenticateRequest() + requirePermission('billing', 'manage')
 */
async function handlePost(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: matterId } = await params
    const auth = await authenticateRequest()
    requirePermission(auth, 'billing', 'manage')

    const body = await request.json()
    const { invoiceId, transactionId, amountCents, notes } = body

    if (!invoiceId || !transactionId || !amountCents) {
      return NextResponse.json(
        { error: 'invoiceId, transactionId, and amountCents are required' },
        { status: 400 },
      )
    }

    const supabase = await createServerSupabaseClient()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).rpc('fn_apply_trust_allocation', {
      p_matter_id: matterId,
      p_invoice_id: invoiceId,
      p_transaction_id: transactionId,
      p_amount_cents: amountCents,
      p_notes: notes ?? null,
    })

    if (error) {
      if (error.message?.includes('P0403') || error.message?.includes('cross-tenant')) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 })
      }
      if (error.message?.includes('P0409')) {
        return NextResponse.json({ error: error.message }, { status: 409 })
      }
      if (error.message?.includes('P0422')) {
        return NextResponse.json({ error: error.message }, { status: 422 })
      }
      throw error
    }

    return NextResponse.json(data)
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error('[trust-match] POST error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * DELETE /api/matters/[id]/trust-match
 *
 * Reverse an allocation  -  calls fn_reverse_trust_allocation RPC.
 * Creates an offsetting entry; never deletes the original.
 * Body: { allocationId, reason }
 *
 * Auth: Sentinel 403  -  authenticateRequest() + requirePermission('billing', 'manage')
 */
async function handleDelete(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await params // validate route param exists
    const auth = await authenticateRequest()
    requirePermission(auth, 'billing', 'manage')

    const body = await request.json()
    const { allocationId, reason } = body

    if (!allocationId || !reason) {
      return NextResponse.json(
        { error: 'allocationId and reason are required' },
        { status: 400 },
      )
    }

    const supabase = await createServerSupabaseClient()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).rpc('fn_reverse_trust_allocation', {
      p_allocation_id: allocationId,
      p_reason: reason,
    })

    if (error) {
      if (error.message?.includes('P0403') || error.message?.includes('cross-tenant')) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 })
      }
      if (error.message?.includes('P0409')) {
        return NextResponse.json({ error: error.message }, { status: 409 })
      }
      if (error.message?.includes('P0422')) {
        return NextResponse.json({ error: error.message }, { status: 422 })
      }
      throw error
    }

    return NextResponse.json(data)
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error('[trust-match] DELETE error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export const GET = withTiming(handleGet, 'GET /api/matters/[id]/trust-match')
export const POST = withTiming(handlePost, 'POST /api/matters/[id]/trust-match')
export const DELETE = withTiming(handleDelete, 'DELETE /api/matters/[id]/trust-match')
