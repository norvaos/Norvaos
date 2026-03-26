/**
 * Government Fee Disbursement Engine  -  Norva Ledger
 *
 * GET     -  Check disbursement status for a matter
 * POST    -  Authorize government fee disbursement (reserve funds)
 * PATCH   -  Confirm disbursement (after IRCC payment)
 * DELETE  -  Cancel a pending disbursement reservation
 */

import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import { createServerSupabaseClient } from '@/lib/supabase/server'

type RouteContext = { params: Promise<{ id: string }> }

// ── GET: Check disbursement status ────────────────────────────────────────────

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const auth = await authenticateRequest()
    requirePermission(auth, 'billing', 'view')

    const { id: matterId } = await context.params
    const supabase = await createServerSupabaseClient()

    // Get matter with readiness + fee_snapshot
    const { data: matter, error: matterErr } = await (supabase as any)
      .from('matters')
      .select('id, readiness_score, fee_snapshot, trust_balance, title, file_number')
      .eq('id', matterId)
      .eq('tenant_id', auth.tenantId)
      .single()

    if (matterErr || !matter) {
      return NextResponse.json(
        { success: false, error: 'Matter not found' },
        { status: 404 },
      )
    }

    // Get any existing government disbursement request
    const { data: disbursement } = await (supabase as any)
      .from('trust_disbursement_requests')
      .select('id, amount_cents, reference_number, status, prepared_at, approved_at, trust_transaction_id')
      .eq('matter_id', matterId)
      .eq('tenant_id', auth.tenantId)
      .like('description', '%Government Fee%')
      .in('status', ['pending_approval', 'approved'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    // Extract government fees from fee_snapshot
    const feeSnapshot = matter.fee_snapshot as Record<string, unknown> | null
    const govtFees = (feeSnapshot?.government_fees ?? []) as Array<{ description: string; amount_cents: number }>
    const govtTotalCents = govtFees.reduce((sum: number, f) => sum + (f.amount_cents || 0), 0)

    return NextResponse.json({
      success: true,
      readiness_score: matter.readiness_score ?? 0,
      readiness_gate_met: (matter.readiness_score ?? 0) >= 95,
      government_fee_cents: govtTotalCents,
      government_fee_dollars: (govtTotalCents / 100).toFixed(2),
      trust_balance_cents: matter.trust_balance ?? 0,
      funds_sufficient: (matter.trust_balance ?? 0) >= govtTotalCents,
      fee_breakdown: govtFees,
      disbursement: disbursement
        ? {
            id: disbursement.id,
            status: disbursement.status,
            amount_cents: disbursement.amount_cents,
            payment_reference: disbursement.reference_number,
            prepared_at: disbursement.prepared_at,
            approved_at: disbursement.approved_at,
            transaction_id: disbursement.trust_transaction_id,
          }
        : null,
    })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status })
    }
    console.error('[government-disbursement] GET error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

// ── POST: Authorize government fee disbursement ───────────────────────────────

export async function POST(_request: NextRequest, context: RouteContext) {
  try {
    const auth = await authenticateRequest()
    requirePermission(auth, 'billing', 'manage')

    const { id: matterId } = await context.params
    const supabase = await createServerSupabaseClient()

    const { data, error } = await supabase.rpc(
      'fn_authorize_government_disbursement' as any,
      { p_matter_id: matterId } as any,
    )

    if (error) {
      const status =
        error.code === 'P0403' ? 403 :
        error.code === 'P0404' ? 404 :
        error.code === 'P0409' ? 409 :
        error.code === 'P0422' ? 422 : 500
      return NextResponse.json({ success: false, error: error.message }, { status })
    }

    return NextResponse.json({ success: true, ...(data as Record<string, unknown>) })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status })
    }
    console.error('[government-disbursement] POST error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

// ── PATCH: Confirm disbursement (after IRCC payment) ──────────────────────────

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const auth = await authenticateRequest()
    requirePermission(auth, 'billing', 'manage')

    const { id: matterId } = await context.params
    const body = await request.json()
    const { receiptRef } = body

    const supabase = await createServerSupabaseClient()

    const { data, error } = await supabase.rpc(
      'fn_confirm_government_disbursement' as any,
      { p_matter_id: matterId, p_receipt_ref: receiptRef ?? null } as any,
    )

    if (error) {
      const status =
        error.code === 'P0403' ? 403 :
        error.code === 'P0404' ? 404 : 500
      return NextResponse.json({ success: false, error: error.message }, { status })
    }

    return NextResponse.json({ success: true, ...(data as Record<string, unknown>) })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status })
    }
    console.error('[government-disbursement] PATCH error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

// ── DELETE: Cancel pending disbursement ────────────────────────────────────────

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const auth = await authenticateRequest()
    requirePermission(auth, 'billing', 'manage')

    const { id: matterId } = await context.params
    const body = await request.json().catch(() => ({}))
    const { reason } = body as { reason?: string }

    const supabase = await createServerSupabaseClient()

    const { data, error } = await supabase.rpc(
      'fn_cancel_government_disbursement' as any,
      { p_matter_id: matterId, p_reason: reason ?? 'Filing cancelled' } as any,
    )

    if (error) {
      const status =
        error.code === 'P0403' ? 403 :
        error.code === 'P0404' ? 404 : 500
      return NextResponse.json({ success: false, error: error.message }, { status })
    }

    return NextResponse.json({ success: true, ...(data as Record<string, unknown>) })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status })
    }
    console.error('[government-disbursement] DELETE error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
