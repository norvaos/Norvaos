/**
 * GET  /api/trust-accounting/transactions — List trust transactions (filterable)
 * POST /api/trust-accounting/transactions — Record a deposit or opening balance
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
    const matterId = searchParams.get('matterId')
    const trustAccountId = searchParams.get('trustAccountId')
    const transactionType = searchParams.get('transactionType')
    const dateFrom = searchParams.get('dateFrom')
    const dateTo = searchParams.get('dateTo')
    const page = parseInt(searchParams.get('page') ?? '1', 10)
    const pageSize = parseInt(searchParams.get('pageSize') ?? '50', 10)
    const from = (page - 1) * pageSize
    const to = from + pageSize - 1

    let query = (admin as any)
      .from('trust_transactions')
      .select('*, matters!inner(id, title)', { count: 'exact' })
      .eq('tenant_id', auth.tenantId)
      .order('created_at', { ascending: false })
      .range(from, to)

    if (matterId) query = query.eq('matter_id', matterId)
    if (trustAccountId) query = query.eq('trust_account_id', trustAccountId)
    if (transactionType) query = query.eq('transaction_type', transactionType)
    if (dateFrom) query = query.gte('effective_date', dateFrom)
    if (dateTo) query = query.lte('effective_date', dateTo)

    const { data, error, count } = await query

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      transactions: data,
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
      trustAccountId, matterId, contactId, transactionType, amountCents,
      description, clientDescription, referenceNumber, paymentMethod,
      invoiceId, effectiveDate, notes,
    } = body

    // Only allow deposit and opening_balance via direct creation
    // Disbursements go through the disbursement request workflow (C4)
    const allowedDirectTypes = ['deposit', 'opening_balance']
    if (!allowedDirectTypes.includes(transactionType)) {
      return NextResponse.json(
        { success: false, error: `Direct creation only allowed for: ${allowedDirectTypes.join(', ')}. Disbursements require an approved request.` },
        { status: 400 }
      )
    }

    if (!trustAccountId || !matterId || !transactionType || !amountCents || !description) {
      return NextResponse.json(
        { success: false, error: 'trustAccountId, matterId, transactionType, amountCents, and description are required' },
        { status: 400 }
      )
    }

    if (amountCents <= 0) {
      return NextResponse.json(
        { success: false, error: 'Deposit amount must be positive' },
        { status: 400 }
      )
    }

    // Determine if cheque hold is needed
    let isCleared = true
    let holdReleaseDate: string | null = null
    let holdDays = 0

    if (paymentMethod === 'cheque') {
      // Get default hold days from the trust account
      const { data: account } = await (admin as any)
        .from('trust_bank_accounts')
        .select('default_hold_days_cheque')
        .eq('id', trustAccountId)
        .single()

      holdDays = account?.default_hold_days_cheque ?? 5
      if (holdDays > 0) {
        isCleared = false
        const releaseDate = new Date()
        releaseDate.setDate(releaseDate.getDate() + holdDays)
        holdReleaseDate = releaseDate.toISOString().split('T')[0]
      }
    }

    const adminClient = createAdminClient()

    const { data: txn, error: txnError } = await (adminClient as any)
      .from('trust_transactions')
      .insert({
        tenant_id: auth.tenantId,
        trust_account_id: trustAccountId,
        matter_id: matterId,
        contact_id: contactId ?? null,
        transaction_type: transactionType,
        amount_cents: amountCents,
        description,
        client_description: clientDescription ?? null,
        reference_number: referenceNumber ?? null,
        payment_method: paymentMethod ?? null,
        invoice_id: invoiceId ?? null,
        is_cleared: isCleared,
        hold_release_date: holdReleaseDate,
        authorized_by: auth.userId,
        recorded_by: auth.userId,
        effective_date: effectiveDate ?? new Date().toISOString().split('T')[0],
        notes: notes ?? null,
      })
      .select()
      .single()

    if (txnError) {
      // Check if this is an overdraft error from the DB trigger
      if (txnError.message?.includes('cannot go negative')) {
        return NextResponse.json(
          { success: false, error: 'Insufficient trust balance for this transaction' },
          { status: 422 }
        )
      }
      return NextResponse.json({ success: false, error: txnError.message }, { status: 500 })
    }

    // Create hold record if cheque with hold period
    if (!isCleared && holdReleaseDate && txn) {
      await (adminClient as any).from('trust_holds').insert({
        tenant_id: auth.tenantId,
        transaction_id: txn.id,
        matter_id: matterId,
        amount_cents: amountCents,
        hold_release_date: holdReleaseDate,
      })
    }

    // Audit log
    await (adminClient as any).from('trust_audit_log').insert({
      tenant_id: auth.tenantId,
      action: 'trust_deposit_recorded',
      entity_type: 'trust_transaction',
      entity_id: txn.id,
      matter_id: matterId,
      user_id: auth.userId,
      metadata: {
        transaction_type: transactionType,
        amount_cents: amountCents,
        payment_method: paymentMethod,
        is_cleared: isCleared,
      },
    })

    return NextResponse.json({ success: true, transaction: txn }, { status: 201 })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status })
    }
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

const admin = createAdminClient()