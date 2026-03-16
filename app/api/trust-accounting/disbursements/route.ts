/**
 * GET  /api/trust-accounting/disbursements — List disbursement requests
 * POST /api/trust-accounting/disbursements — Create (prepare) a disbursement request
 */

import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest()
    requirePermission(auth, 'trust_accounting', 'view')

    const { searchParams } = new URL(request.url)
    const matterId = searchParams.get('matterId')
    const trustAccountId = searchParams.get('trustAccountId')
    const status = searchParams.get('status')
    const page = parseInt(searchParams.get('page') ?? '1', 10)
    const pageSize = parseInt(searchParams.get('pageSize') ?? '25', 10)
    const from = (page - 1) * pageSize
    const to = from + pageSize - 1

    let query = (auth.supabase as any)
      .from('trust_disbursement_requests')
      .select('*, matters!inner(id, title)', { count: 'exact' })
      .eq('tenant_id', auth.tenantId)
      .order('created_at', { ascending: false })
      .range(from, to)

    if (matterId) query = query.eq('matter_id', matterId)
    if (trustAccountId) query = query.eq('trust_account_id', trustAccountId)
    if (status) query = query.eq('status', status)

    const { data, error, count } = await query

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      requests: data,
      pagination: { page, pageSize, total: count ?? 0 },
    })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status })
    }
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateRequest()
    requirePermission(auth, 'trust_accounting', 'create')

    const body = await request.json()
    const {
      trustAccountId, matterId, amountCents, payeeName, description,
      clientDescription, paymentMethod, referenceNumber, invoiceId,
      requestType, authorizationType, authorizationRef,
    } = body

    if (!trustAccountId || !matterId || !amountCents || !payeeName || !description || !paymentMethod) {
      return NextResponse.json(
        { success: false, error: 'trustAccountId, matterId, amountCents, payeeName, description, and paymentMethod are required' },
        { status: 400 }
      )
    }

    if (amountCents <= 0) {
      return NextResponse.json(
        { success: false, error: 'Amount must be positive' },
        { status: 400 }
      )
    }

    // Check available balance before creating request
    // Get latest running balance for this matter
    const { data: latestTxn } = await (auth.supabase as any)
      .from('trust_transactions')
      .select('running_balance_cents')
      .eq('tenant_id', auth.tenantId)
      .eq('trust_account_id', trustAccountId)
      .eq('matter_id', matterId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    const ledgerBalance = latestTxn?.running_balance_cents ?? 0

    // Sum active holds
    const { data: holds } = await (auth.supabase as any)
      .from('trust_holds')
      .select('amount_cents')
      .eq('tenant_id', auth.tenantId)
      .eq('matter_id', matterId)
      .eq('status', 'held')

    const holdsTotal = (holds ?? []).reduce((sum: number, h: any) => sum + (h.amount_cents ?? 0), 0)
    const available = ledgerBalance - holdsTotal

    if (amountCents > available) {
      return NextResponse.json(
        {
          success: false,
          error: `Insufficient available balance. Available: ${available} cents, Requested: ${amountCents} cents.`,
        },
        { status: 422 }
      )
    }

    const adminClient = createAdminClient()

    const { data, error } = await (adminClient as any)
      .from('trust_disbursement_requests')
      .insert({
        tenant_id: auth.tenantId,
        trust_account_id: trustAccountId,
        matter_id: matterId,
        amount_cents: amountCents,
        payee_name: payeeName,
        description,
        client_description: clientDescription ?? null,
        payment_method: paymentMethod,
        reference_number: referenceNumber ?? null,
        invoice_id: invoiceId ?? null,
        request_type: requestType ?? 'disbursement',
        status: 'pending_approval',
        prepared_by: auth.userId,
        authorization_type: authorizationType ?? null,
        authorization_ref: authorizationRef ?? null,
      })
      .select()
      .single()

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    // Audit log
    await (adminClient as any).from('trust_audit_log').insert({
      tenant_id: auth.tenantId,
      action: 'disbursement_request_prepared',
      entity_type: 'trust_disbursement_request',
      entity_id: data.id,
      matter_id: matterId,
      user_id: auth.userId,
      metadata: { amount_cents: amountCents, payee_name: payeeName, payment_method: paymentMethod },
    })

    return NextResponse.json({ success: true, request: data }, { status: 201 })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status })
    }
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
