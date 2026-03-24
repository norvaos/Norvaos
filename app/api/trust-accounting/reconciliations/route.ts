/**
 * GET  /api/trust-accounting/reconciliations — List reconciliations
 * POST /api/trust-accounting/reconciliations — Create a new draft reconciliation
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
    const trustAccountId = searchParams.get('trustAccountId')
    const status = searchParams.get('status')
    const page = parseInt(searchParams.get('page') ?? '1', 10)
    const pageSize = parseInt(searchParams.get('pageSize') ?? '25', 10)
    const from = (page - 1) * pageSize
    const to = from + pageSize - 1

    let query = (admin as any)
      .from('trust_reconciliations')
      .select('*, trust_bank_accounts!inner(id, account_name)', { count: 'exact' })
      .eq('tenant_id', auth.tenantId)
      .order('period_start', { ascending: false })
      .range(from, to)

    if (trustAccountId) query = query.eq('trust_account_id', trustAccountId)
    if (status) query = query.eq('status', status)

    const { data, error, count } = await query

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      reconciliations: data,
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
    const { trustAccountId, periodStart, periodEnd } = body

    if (!trustAccountId || !periodStart || !periodEnd) {
      return NextResponse.json(
        { success: false, error: 'trustAccountId, periodStart, and periodEnd are required' },
        { status: 400 }
      )
    }

    const adminClient = createAdminClient()

    const { data, error } = await (adminClient as any)
      .from('trust_reconciliations')
      .insert({
        tenant_id: auth.tenantId,
        trust_account_id: trustAccountId,
        period_start: periodStart,
        period_end: periodEnd,
        status: 'draft',
      })
      .select()
      .single()

    if (error) {
      // Unique constraint violation = already exists
      if (error.code === '23505') {
        return NextResponse.json(
          { success: false, error: 'A reconciliation already exists for this account and period' },
          { status: 409 }
        )
      }
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    await (adminClient as any).from('trust_audit_log').insert({
      tenant_id: auth.tenantId,
      action: 'reconciliation_created',
      entity_type: 'trust_reconciliation',
      entity_id: data.id,
      user_id: auth.userId,
      metadata: { trust_account_id: trustAccountId, period_start: periodStart, period_end: periodEnd },
    })

    return NextResponse.json({ success: true, reconciliation: data }, { status: 201 })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status })
    }
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

const admin = createAdminClient()