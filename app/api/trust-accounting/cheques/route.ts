/**
 * GET  /api/trust-accounting/cheques — List cheques
 * POST /api/trust-accounting/cheques — Create a cheque
 */

import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest()
    const admin = createAdminClient()
    requirePermission(auth, 'trust_accounting', 'view')

    const { searchParams } = new URL(request.url)
    const accountType = searchParams.get('accountType') ?? 'trust'
    const trustAccountId = searchParams.get('trustAccountId')
    const status = searchParams.get('status')
    const matterId = searchParams.get('matterId')
    const page = parseInt(searchParams.get('page') ?? '1', 10)
    const pageSize = parseInt(searchParams.get('pageSize') ?? '50', 10)
    const from = (page - 1) * pageSize
    const to = from + pageSize - 1

    let query = (admin as any)
      .from('cheques')
      .select('*, matters(id, title)', { count: 'exact' })
      .eq('tenant_id', auth.tenantId)
      .eq('account_type', accountType)
      .order('cheque_number', { ascending: false })
      .range(from, to)

    if (trustAccountId) query = query.eq('trust_account_id', trustAccountId)
    if (status) query = query.eq('status', status)
    if (matterId) query = query.eq('matter_id', matterId)

    const { data, error, count } = await query

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      cheques: data,
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
    const admin = createAdminClient()
    requirePermission(auth, 'trust_accounting', 'create')

    const body = await request.json()
    const {
      accountType, trustAccountId, operatingAccountId, matterId,
      payeeName, amountCents, memo, trustDisbursementRequestId,
    } = body

    if (!accountType || !payeeName || !amountCents) {
      return NextResponse.json(
        { success: false, error: 'accountType, payeeName, and amountCents are required' },
        { status: 400 }
      )
    }

    const adminClient = createAdminClient()

    // Auto-assign next cheque number
    let nextNumber = 1
    if (accountType === 'trust' && trustAccountId) {
      const { data: account } = await (adminClient as any)
        .from('trust_bank_accounts')
        .select('next_cheque_number')
        .eq('id', trustAccountId)
        .single()
      nextNumber = account?.next_cheque_number ?? 1

      // Increment for next time
      await (adminClient as any)
        .from('trust_bank_accounts')
        .update({ next_cheque_number: nextNumber + 1 })
        .eq('id', trustAccountId)
    } else if (accountType === 'operating' && operatingAccountId) {
      const { data: account } = await (adminClient as any)
        .from('operating_bank_accounts')
        .select('next_cheque_number')
        .eq('id', operatingAccountId)
        .single()
      nextNumber = account?.next_cheque_number ?? 1

      await (adminClient as any)
        .from('operating_bank_accounts')
        .update({ next_cheque_number: nextNumber + 1 })
        .eq('id', operatingAccountId)
    }

    const { data, error } = await (adminClient as any)
      .from('cheques')
      .insert({
        tenant_id: auth.tenantId,
        account_type: accountType,
        trust_account_id: trustAccountId ?? null,
        operating_account_id: operatingAccountId ?? null,
        cheque_number: nextNumber,
        matter_id: matterId ?? null,
        payee_name: payeeName,
        amount_cents: amountCents,
        memo: memo ?? null,
        status: 'draft',
        trust_disbursement_request_id: trustDisbursementRequestId ?? null,
        prepared_by: auth.userId,
      })
      .select()
      .single()

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    // Audit log
    await (adminClient as any).from('trust_audit_log').insert({
      tenant_id: auth.tenantId,
      action: 'cheque_created',
      entity_type: 'cheque',
      entity_id: data.id,
      matter_id: matterId ?? null,
      user_id: auth.userId,
      metadata: { cheque_number: nextNumber, account_type: accountType, amount_cents: amountCents },
    })

    return NextResponse.json({ success: true, cheque: data }, { status: 201 })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status })
    }
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

const admin = createAdminClient()