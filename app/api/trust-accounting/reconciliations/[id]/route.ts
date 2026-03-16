/**
 * GET   /api/trust-accounting/reconciliations/[id] — Get reconciliation with items
 * PATCH /api/trust-accounting/reconciliations/[id] — Update reconciliation (steps, complete, review)
 */

import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await authenticateRequest()
    requirePermission(auth, 'trust_accounting', 'view')
    const { id } = await params

    const { data: recon, error } = await (auth.supabase as any)
      .from('trust_reconciliations')
      .select('*, trust_bank_accounts!inner(id, account_name, bank_name)')
      .eq('id', id)
      .eq('tenant_id', auth.tenantId)
      .single()

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 404 })
    }

    // Get reconciliation items
    const { data: items } = await (auth.supabase as any)
      .from('trust_reconciliation_items')
      .select('*')
      .eq('reconciliation_id', id)
      .eq('tenant_id', auth.tenantId)
      .order('created_at', { ascending: true })

    return NextResponse.json({
      success: true,
      reconciliation: { ...recon, items: items ?? [] },
    })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status })
    }
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await authenticateRequest()
    requirePermission(auth, 'trust_accounting', 'edit')
    const { id } = await params
    const body = await request.json()
    const { action } = body

    const adminClient = createAdminClient()

    // Fetch current reconciliation
    const { data: recon, error: fetchError } = await (adminClient as any)
      .from('trust_reconciliations')
      .select('*')
      .eq('id', id)
      .eq('tenant_id', auth.tenantId)
      .single()

    if (fetchError || !recon) {
      return NextResponse.json({ success: false, error: 'Reconciliation not found' }, { status: 404 })
    }

    if (recon.status === 'reviewed') {
      return NextResponse.json(
        { success: false, error: 'Reviewed reconciliations cannot be modified' },
        { status: 422 }
      )
    }

    switch (action) {
      case 'set_statement_balance': {
        const { bankStatementBalanceCents } = body
        if (bankStatementBalanceCents === undefined) {
          return NextResponse.json({ success: false, error: 'bankStatementBalanceCents is required' }, { status: 400 })
        }
        await (adminClient as any)
          .from('trust_reconciliations')
          .update({ bank_statement_balance_cents: bankStatementBalanceCents })
          .eq('id', id)
        return NextResponse.json({ success: true })
      }

      case 'compute_book_balance': {
        // Sum all transactions for this account in the period
        const { data: txns } = await (adminClient as any)
          .from('trust_transactions')
          .select('amount_cents')
          .eq('tenant_id', auth.tenantId)
          .eq('trust_account_id', recon.trust_account_id)
          .lte('effective_date', recon.period_end)

        const bookBalance = (txns ?? []).reduce((sum: number, t: any) => sum + Number(t.amount_cents), 0)

        await (adminClient as any)
          .from('trust_reconciliations')
          .update({ book_balance_cents: bookBalance })
          .eq('id', id)

        return NextResponse.json({ success: true, book_balance_cents: bookBalance })
      }

      case 'identify_outstanding_items': {
        // Find uncleared cheques
        const { data: outstandingCheques } = await (adminClient as any)
          .from('cheques')
          .select('id, cheque_number, payee_name, amount_cents')
          .eq('tenant_id', auth.tenantId)
          .eq('trust_account_id', recon.trust_account_id)
          .eq('account_type', 'trust')
          .eq('status', 'issued')

        // Find deposits in transit (uncleared deposits)
        const { data: unclearedDeposits } = await (adminClient as any)
          .from('trust_transactions')
          .select('id, amount_cents, reference_number, description')
          .eq('tenant_id', auth.tenantId)
          .eq('trust_account_id', recon.trust_account_id)
          .eq('is_cleared', false)
          .eq('transaction_type', 'deposit')
          .lte('effective_date', recon.period_end)

        // Delete existing auto-generated items for this reconciliation
        await (adminClient as any)
          .from('trust_reconciliation_items')
          .delete()
          .eq('reconciliation_id', id)
          .eq('tenant_id', auth.tenantId)
          .in('item_type', ['outstanding_cheque', 'deposit_in_transit'])

        const items = []

        let outstandingChequesTotal = 0
        for (const cheque of outstandingCheques ?? []) {
          outstandingChequesTotal += Number(cheque.amount_cents)
          items.push({
            tenant_id: auth.tenantId,
            reconciliation_id: id,
            item_type: 'outstanding_cheque' as const,
            description: `Cheque #${cheque.cheque_number} — ${cheque.payee_name}`,
            amount_cents: cheque.amount_cents,
          })
        }

        let depositsInTransitTotal = 0
        for (const dep of unclearedDeposits ?? []) {
          depositsInTransitTotal += Number(dep.amount_cents)
          items.push({
            tenant_id: auth.tenantId,
            reconciliation_id: id,
            item_type: 'deposit_in_transit' as const,
            description: `Deposit: ${dep.description} (Ref: ${dep.reference_number ?? 'N/A'})`,
            amount_cents: dep.amount_cents,
            transaction_id: dep.id,
          })
        }

        if (items.length > 0) {
          await (adminClient as any).from('trust_reconciliation_items').insert(items)
        }

        await (adminClient as any)
          .from('trust_reconciliations')
          .update({
            outstanding_cheques_cents: outstandingChequesTotal,
            outstanding_deposits_cents: depositsInTransitTotal,
          })
          .eq('id', id)

        return NextResponse.json({
          success: true,
          outstanding_cheques_cents: outstandingChequesTotal,
          outstanding_deposits_cents: depositsInTransitTotal,
          items_created: items.length,
        })
      }

      case 'compute_adjusted_balance': {
        // Refresh from DB
        const { data: fresh } = await (adminClient as any)
          .from('trust_reconciliations')
          .select('bank_statement_balance_cents, outstanding_cheques_cents, outstanding_deposits_cents')
          .eq('id', id)
          .single()

        if (!fresh?.bank_statement_balance_cents) {
          return NextResponse.json(
            { success: false, error: 'Bank statement balance must be set first' },
            { status: 422 }
          )
        }

        const adjusted =
          Number(fresh.bank_statement_balance_cents) -
          Number(fresh.outstanding_cheques_cents ?? 0) +
          Number(fresh.outstanding_deposits_cents ?? 0)

        await (adminClient as any)
          .from('trust_reconciliations')
          .update({ adjusted_bank_balance_cents: adjusted })
          .eq('id', id)

        return NextResponse.json({ success: true, adjusted_bank_balance_cents: adjusted })
      }

      case 'compute_client_listing': {
        // Get latest running balance per matter for this trust account
        // Using a subquery approach: for each distinct matter, get the latest transaction
        const { data: latestPerMatter } = await (adminClient as any).rpc('', {}).catch(() => ({ data: null }))

        // Fallback: query all matters with transactions on this account
        const { data: matterTxns } = await (adminClient as any)
          .from('trust_transactions')
          .select('matter_id, running_balance_cents, created_at')
          .eq('tenant_id', auth.tenantId)
          .eq('trust_account_id', recon.trust_account_id)
          .lte('effective_date', recon.period_end)
          .order('created_at', { ascending: false })

        // Deduplicate to get latest per matter
        const latestByMatter = new Map<string, number>()
        for (const txn of matterTxns ?? []) {
          if (!latestByMatter.has(txn.matter_id)) {
            latestByMatter.set(txn.matter_id, Number(txn.running_balance_cents))
          }
        }

        const clientListingTotal = Array.from(latestByMatter.values()).reduce((sum, bal) => sum + bal, 0)

        await (adminClient as any)
          .from('trust_reconciliations')
          .update({ client_listing_total_cents: clientListingTotal })
          .eq('id', id)

        return NextResponse.json({ success: true, client_listing_total_cents: clientListingTotal })
      }

      case 'check_three_way_balance': {
        const { data: fresh } = await (adminClient as any)
          .from('trust_reconciliations')
          .select('adjusted_bank_balance_cents, book_balance_cents, client_listing_total_cents')
          .eq('id', id)
          .single()

        if (!fresh) {
          return NextResponse.json({ success: false, error: 'Reconciliation not found' }, { status: 404 })
        }

        const adj = Number(fresh.adjusted_bank_balance_cents ?? 0)
        const book = Number(fresh.book_balance_cents ?? 0)
        const client = Number(fresh.client_listing_total_cents ?? 0)
        const isBalanced = adj === book && book === client

        await (adminClient as any)
          .from('trust_reconciliations')
          .update({ is_balanced: isBalanced })
          .eq('id', id)

        return NextResponse.json({
          success: true,
          is_balanced: isBalanced,
          adjusted_bank_balance_cents: adj,
          book_balance_cents: book,
          client_listing_total_cents: client,
        })
      }

      case 'complete': {
        if (recon.status !== 'draft') {
          return NextResponse.json(
            { success: false, error: 'Only draft reconciliations can be completed' },
            { status: 422 }
          )
        }

        await (adminClient as any)
          .from('trust_reconciliations')
          .update({
            status: 'completed',
            completed_by: auth.userId,
            completed_at: new Date().toISOString(),
          })
          .eq('id', id)

        await (adminClient as any).from('trust_audit_log').insert({
          tenant_id: auth.tenantId,
          action: 'reconciliation_completed',
          entity_type: 'trust_reconciliation',
          entity_id: id,
          user_id: auth.userId,
          metadata: { is_balanced: recon.is_balanced },
        })

        return NextResponse.json({ success: true })
      }

      case 'review': {
        requirePermission(auth, 'trust_accounting', 'approve')

        if (recon.status !== 'completed') {
          return NextResponse.json(
            { success: false, error: 'Only completed reconciliations can be reviewed' },
            { status: 422 }
          )
        }

        // Segregation of duties: reviewer != completer
        if (recon.completed_by === auth.userId) {
          return NextResponse.json(
            { success: false, error: 'Segregation of duties: the completer cannot review their own reconciliation' },
            { status: 403 }
          )
        }

        await (adminClient as any)
          .from('trust_reconciliations')
          .update({
            status: 'reviewed',
            reviewed_by: auth.userId,
            reviewed_at: new Date().toISOString(),
          })
          .eq('id', id)

        await (adminClient as any).from('trust_audit_log').insert({
          tenant_id: auth.tenantId,
          action: 'reconciliation_reviewed',
          entity_type: 'trust_reconciliation',
          entity_id: id,
          user_id: auth.userId,
          metadata: { is_balanced: recon.is_balanced },
        })

        return NextResponse.json({ success: true })
      }

      case 'flag': {
        const { notes } = body
        await (adminClient as any)
          .from('trust_reconciliations')
          .update({ status: 'flagged', notes: notes ?? null })
          .eq('id', id)

        return NextResponse.json({ success: true })
      }

      default:
        return NextResponse.json(
          { success: false, error: 'Unknown action. Valid: set_statement_balance, compute_book_balance, identify_outstanding_items, compute_adjusted_balance, compute_client_listing, check_three_way_balance, complete, review, flag' },
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
