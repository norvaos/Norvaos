/**
 * GET /api/portal/[token]/trust — Client portal trust account view
 *
 * Returns client-visible trust information per the portal visibility policy:
 * - Current trust balance for the matter
 * - Trust transactions with client_description (not internal description)
 * - Only cleared transactions (uncleared deposits hidden)
 * - No internal notes, no admin matter details
 */

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createRateLimiter } from '@/lib/middleware/rate-limit'
import { validatePortalToken, PortalAuthError } from '@/lib/services/portal-auth'

const rateLimiter = createRateLimiter({ windowMs: 60_000, maxRequests: 30 })

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
    const { allowed, retryAfterMs } = rateLimiter.check(ip)
    if (!allowed) {
      return NextResponse.json(
        { error: 'Too many requests' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil(retryAfterMs / 1000)) } },
      )
    }

    const { token } = await params

    let link: Awaited<ReturnType<typeof validatePortalToken>>
    try {
      link = await validatePortalToken(token)
    } catch (error) {
      if (error instanceof PortalAuthError) {
        return NextResponse.json({ error: error.message }, { status: error.status })
      }
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }

    const admin = createAdminClient()

    // Check portal metadata for trust visibility
    const metadata = (link.metadata ?? {}) as Record<string, unknown>
    const trustVisible = metadata.trust_visible !== false // Default: visible

    if (!trustVisible) {
      return NextResponse.json({
        success: true,
        trust_enabled: false,
        message: 'Trust account information is not available for this portal.',
      })
    }

    const matterId = link.matter_id
    const tenantId = link.tenant_id

    // Get matter trust balance
    const { data: matter } = await admin
      .from('matters')
      .select('trust_balance, is_trust_admin')
      .eq('id', matterId)
      .single()

    // Admin matters are never shown in portal
    if (matter?.is_trust_admin) {
      return NextResponse.json({
        success: true,
        trust_enabled: false,
        message: 'Trust account information is not available for this matter.',
      })
    }

    // Get cleared trust transactions for this matter (client-facing view)
    const { data: transactions } = await (admin as any)
      .from('trust_transactions')
      .select('id, transaction_type, amount_cents, running_balance_cents, client_description, effective_date, payment_method, is_cleared, created_at')
      .eq('tenant_id', tenantId)
      .eq('matter_id', matterId)
      .eq('is_cleared', true)
      .order('created_at', { ascending: false })
      .limit(100)

    // Map to client-safe fields
    const clientTransactions = (transactions ?? []).map((t: any) => ({
      id: t.id,
      date: t.effective_date,
      type: t.transaction_type,
      description: t.client_description ?? formatTransactionType(t.transaction_type),
      amount_cents: t.amount_cents,
      balance_cents: t.running_balance_cents,
      payment_method: t.payment_method,
    }))

    // Get active holds (show as "pending" to client)
    const { data: holds } = await (admin as any)
      .from('trust_holds')
      .select('amount_cents, hold_release_date')
      .eq('tenant_id', tenantId)
      .eq('matter_id', matterId)
      .eq('status', 'held')

    const pendingDeposits = (holds ?? []).map((h: any) => ({
      amount_cents: h.amount_cents,
      expected_available_date: h.hold_release_date,
    }))

    return NextResponse.json({
      success: true,
      trust_enabled: true,
      trust_balance_cents: Math.round((matter?.trust_balance ?? 0) * 100),
      transactions: clientTransactions,
      pending_deposits: pendingDeposits,
      as_of: new Date().toISOString(),
    })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

function formatTransactionType(type: string): string {
  const labels: Record<string, string> = {
    deposit: 'Deposit',
    disbursement: 'Disbursement',
    transfer_in: 'Transfer In',
    transfer_out: 'Transfer Out',
    refund: 'Refund',
    reversal: 'Adjustment',
    interest: 'Interest',
    bank_fee: 'Bank Fee',
    adjustment: 'Adjustment',
    opening_balance: 'Opening Balance',
  }
  return labels[type] ?? 'Transaction'
}
