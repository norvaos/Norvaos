/**
 * GET /api/trust-accounting/reports — Trust accounting reports
 *
 * Query params:
 *   report: 'client_listing' | 'account_summary' | 'cheque_register' | 'holds' | 'audit_trail'
 *   trustAccountId: UUID (required for most reports)
 *   Additional filters vary by report type
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
    const report = searchParams.get('report')
    const trustAccountId = searchParams.get('trustAccountId')

    switch (report) {
      case 'client_listing': {
        if (!trustAccountId) {
          return NextResponse.json({ success: false, error: 'trustAccountId is required' }, { status: 400 })
        }

        // Get latest running balance per matter for this trust account
        const { data: txns } = await (admin as any)
          .from('trust_transactions')
          .select('matter_id, running_balance_cents, created_at, matters!inner(id, title)')
          .eq('tenant_id', auth.tenantId)
          .eq('trust_account_id', trustAccountId)
          .order('created_at', { ascending: false })

        // Deduplicate to latest per matter
        const latestByMatter = new Map<string, { matter_id: string; matter_title: string; balance_cents: number }>()
        for (const txn of txns ?? []) {
          if (!latestByMatter.has(txn.matter_id)) {
            const matters = txn.matters as unknown as { id: string; title: string }
            latestByMatter.set(txn.matter_id, {
              matter_id: txn.matter_id,
              matter_title: matters?.title ?? 'Unknown',
              balance_cents: Number(txn.running_balance_cents),
            })
          }
        }

        const listing = Array.from(latestByMatter.values()).filter(m => m.balance_cents !== 0)
        const total = listing.reduce((sum, m) => sum + m.balance_cents, 0)

        return NextResponse.json({
          success: true,
          report: 'client_listing',
          data: { listing, total_cents: total, as_of: new Date().toISOString() },
        })
      }

      case 'account_summary': {
        if (!trustAccountId) {
          return NextResponse.json({ success: false, error: 'trustAccountId is required' }, { status: 400 })
        }

        const { data: account } = await (admin as any)
          .from('trust_bank_accounts')
          .select('*')
          .eq('id', trustAccountId)
          .eq('tenant_id', auth.tenantId)
          .single()

        if (!account) {
          return NextResponse.json({ success: false, error: 'Account not found' }, { status: 404 })
        }

        // Total balance (sum latest per matter)
        const { data: txns } = await (admin as any)
          .from('trust_transactions')
          .select('matter_id, running_balance_cents, created_at')
          .eq('tenant_id', auth.tenantId)
          .eq('trust_account_id', trustAccountId)
          .order('created_at', { ascending: false })

        const latestByMatter = new Map<string, number>()
        for (const txn of txns ?? []) {
          if (!latestByMatter.has(txn.matter_id)) {
            latestByMatter.set(txn.matter_id, Number(txn.running_balance_cents))
          }
        }

        const totalBalance = Array.from(latestByMatter.values()).reduce((sum, b) => sum + b, 0)
        const activeMatters = Array.from(latestByMatter.values()).filter(b => b !== 0).length

        // Active holds
        const { data: holds } = await (admin as any)
          .from('trust_holds')
          .select('amount_cents')
          .eq('tenant_id', auth.tenantId)
          .eq('status', 'held')

        // Filter holds by trust account via the transaction
        const holdsTotal = (holds ?? []).reduce((sum: number, h: any) => sum + Number(h.amount_cents), 0)

        // Last reconciliation
        const { data: lastRecon } = await (admin as any)
          .from('trust_reconciliations')
          .select('id, period_end, status, is_balanced')
          .eq('trust_account_id', trustAccountId)
          .eq('tenant_id', auth.tenantId)
          .order('period_start', { ascending: false })
          .limit(1)
          .single()

        return NextResponse.json({
          success: true,
          report: 'account_summary',
          data: {
            account,
            total_balance_cents: totalBalance,
            active_matters: activeMatters,
            holds_total_cents: holdsTotal,
            last_reconciliation: lastRecon ?? null,
          },
        })
      }

      case 'cheque_register': {
        const accountType = searchParams.get('accountType') ?? 'trust'
        const status = searchParams.get('status')
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

        const { data, error, count } = await query

        if (error) {
          return NextResponse.json({ success: false, error: error.message }, { status: 500 })
        }

        return NextResponse.json({
          success: true,
          report: 'cheque_register',
          data: { cheques: data, pagination: { page, pageSize, total: count ?? 0 } },
        })
      }

      case 'holds': {
        const { data: holds } = await (admin as any)
          .from('trust_holds')
          .select('*, matters!inner(id, title), trust_transactions!inner(trust_account_id, description)')
          .eq('tenant_id', auth.tenantId)
          .eq('status', 'held')
          .order('hold_release_date', { ascending: true })

        return NextResponse.json({
          success: true,
          report: 'holds',
          data: { holds: holds ?? [] },
        })
      }

      case 'audit_trail': {
        const entityType = searchParams.get('entityType')
        const entityId = searchParams.get('entityId')
        const matterId = searchParams.get('matterId')
        const page = parseInt(searchParams.get('page') ?? '1', 10)
        const pageSize = parseInt(searchParams.get('pageSize') ?? '50', 10)
        const from = (page - 1) * pageSize
        const to = from + pageSize - 1

        let query = (admin as any)
          .from('trust_audit_log')
          .select('*, users!inner(id, first_name, last_name, email)', { count: 'exact' })
          .eq('tenant_id', auth.tenantId)
          .order('created_at', { ascending: false })
          .range(from, to)

        if (entityType) query = query.eq('entity_type', entityType)
        if (entityId) query = query.eq('entity_id', entityId)
        if (matterId) query = query.eq('matter_id', matterId)

        const { data, error, count } = await query

        if (error) {
          return NextResponse.json({ success: false, error: error.message }, { status: 500 })
        }

        return NextResponse.json({
          success: true,
          report: 'audit_trail',
          data: { entries: data, pagination: { page, pageSize, total: count ?? 0 } },
        })
      }

      default:
        return NextResponse.json(
          { success: false, error: 'Unknown report type. Valid: client_listing, account_summary, cheque_register, holds, audit_trail' },
          { status: 400 }
        )
    }
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status })
    }
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
