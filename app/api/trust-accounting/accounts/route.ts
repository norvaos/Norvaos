/**
 * GET  /api/trust-accounting/accounts — List trust bank accounts
 * POST /api/trust-accounting/accounts — Create a new trust bank account
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
    const includeInactive = searchParams.get('includeInactive') === 'true'

    let query = (admin as any)
      .from('trust_bank_accounts')
      .select('*')
      .eq('tenant_id', auth.tenantId)
      .order('created_at', { ascending: false })

    if (!includeInactive) {
      query = query.eq('is_active', true)
    }

    const { data, error } = await query

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, accounts: data })
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
    const { accountName, accountType, bankName, accountNumberEncrypted, transitNumber, institutionNumber, currency, jurisdictionCode, matterId, defaultHoldDaysCheque, defaultHoldDaysEft } = body

    if (!accountName || !bankName || !accountNumberEncrypted) {
      return NextResponse.json(
        { success: false, error: 'accountName, bankName, and accountNumberEncrypted are required' },
        { status: 400 }
      )
    }

    // Use admin client because the BEFORE INSERT trigger creates an admin matter
    // which needs to bypass RLS (no auth context in trigger)
    const adminClient = createAdminClient()

    const { data, error } = await (adminClient as any)
      .from('trust_bank_accounts')
      .insert({
        tenant_id: auth.tenantId,
        account_name: accountName,
        account_type: accountType ?? 'general',
        bank_name: bankName,
        account_number_encrypted: accountNumberEncrypted,
        transit_number: transitNumber ?? null,
        institution_number: institutionNumber ?? null,
        currency: currency ?? 'CAD',
        jurisdiction_code: jurisdictionCode ?? 'CA-ON',
        matter_id: matterId ?? null,
        default_hold_days_cheque: defaultHoldDaysCheque ?? 5,
        default_hold_days_eft: defaultHoldDaysEft ?? 0,
        created_by: auth.userId,
      })
      .select()
      .single()

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    // Audit log
    await (adminClient as any).from('trust_audit_log').insert({
      tenant_id: auth.tenantId,
      action: 'trust_account_created',
      entity_type: 'trust_bank_account',
      entity_id: data.id,
      user_id: auth.userId,
      metadata: { account_name: accountName, account_type: accountType ?? 'general' },
    })

    return NextResponse.json({ success: true, account: data }, { status: 201 })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status })
    }
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

const admin = createAdminClient()