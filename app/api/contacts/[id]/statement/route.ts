import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import { checkMatterAccess } from '@/lib/services/matter-access'
import { withTiming } from '@/lib/middleware/request-timing'
import { reportError } from '@/lib/monitoring/error-reporter'

// Statuses that are not client-visible — exclude from statement data
const NON_CLIENT_VISIBLE_STATUSES = ['draft', 'finalized']

// Terminal/cancelled statuses — exclude from outstanding balance calculation
const EXCLUDED_FROM_OUTSTANDING = ['void', 'written_off', 'cancelled']

async function handleGet(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: contactId } = await params

  try {
    const auth = await authenticateRequest()
    await requirePermission(auth, 'billing', 'view')

    const { supabase, tenantId } = auth

    // Parse optional date range
    const url = new URL(request.url)
    const fromDate = url.searchParams.get('from')
    const toDate = url.searchParams.get('to')

    // Fetch contact
    const { data: contact, error: contactErr } = await supabase
      .from('contacts')
      .select('id, first_name, last_name, organization_name, email_primary')
      .eq('id', contactId)
      .eq('tenant_id', tenantId)
      .single()

    if (contactErr || !contact) {
      return NextResponse.json({ error: 'Contact not found' }, { status: 404 })
    }

    const contactName = [contact.first_name, contact.last_name].filter(Boolean).join(' ') || contact.organization_name || 'Unknown'

    // Fetch all invoices for this contact
    let invoiceQuery = supabase
      .from('invoices')
      .select('*')
      .eq('contact_id', contactId)
      .eq('tenant_id', tenantId)
      .order('issue_date', { ascending: false })

    if (fromDate) invoiceQuery = invoiceQuery.gte('issue_date', fromDate)
    if (toDate) invoiceQuery = invoiceQuery.lte('issue_date', toDate)

    const { data: invoices } = await invoiceQuery

    // --- Matter-scoped access control ---
    // Extract all matter IDs from invoices, then check access for each.
    // Only matters the requesting user is authorized to access are included.
    const allMatterIds = [...new Set((invoices ?? []).map((inv) => inv.matter_id).filter((id): id is string => id !== null))]

    let authorizedMatterIds: string[] = []
    if (allMatterIds.length > 0) {
      const accessChecks = await Promise.all(
        allMatterIds.map(async (matterId) => ({
          matterId,
          hasAccess: await checkMatterAccess(supabase, auth.userId, matterId),
        }))
      )
      authorizedMatterIds = accessChecks
        .filter((check) => check.hasAccess)
        .map((check) => check.matterId)
    }

    // Filter invoices to authorized matters only, then exclude non-client-visible statuses
    const authorizedInvoices = (invoices ?? []).filter(
      (inv) =>
        authorizedMatterIds.includes(inv.matter_id ?? '') &&
        !NON_CLIENT_VISIBLE_STATUSES.includes(inv.status ?? '')
    )

    // Fetch all payments for authorized invoices only
    const invoiceIds = authorizedInvoices.map((inv) => inv.id)
    let payments: Array<Record<string, unknown>> = []

    if (invoiceIds.length > 0) {
      const { data: paymentData } = await supabase
        .from('payments')
        .select('*')
        .in('invoice_id', invoiceIds)
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })

      payments = paymentData ?? []
    }

    // Fetch authorized matters for context
    let matters: Array<Record<string, unknown>> = []

    if (authorizedMatterIds.length > 0) {
      const { data: matterData } = await supabase
        .from('matters')
        .select('id, title, matter_number')
        .in('id', authorizedMatterIds)
        .eq('tenant_id', tenantId)

      matters = matterData ?? []
    }

    // Fetch trust balance — scoped to authorized matters only
    let trustBalance = 0
    const { data: trustAccounts } = await supabase
      .from('trust_bank_accounts')
      .select('id')
      .eq('tenant_id', tenantId)

    if (trustAccounts && trustAccounts.length > 0 && authorizedMatterIds.length > 0) {
      const { data: trustTxs } = await supabase
        .from('trust_transactions')
        .select('amount_cents, transaction_type')
        .eq('tenant_id', tenantId)
        .in('matter_id', authorizedMatterIds)

      if (trustTxs) {
        trustBalance = trustTxs.reduce((sum: number, tx: { transaction_type: string; amount_cents: number }) => {
          return sum + (tx.transaction_type === 'deposit' ? tx.amount_cents : -tx.amount_cents)
        }, 0)
      }
    }

    // Compute totals — exclude void/written_off/cancelled from outstanding calculation
    const outstandingEligible = authorizedInvoices.filter(
      (inv) => !EXCLUDED_FROM_OUTSTANDING.includes(inv.status ?? '')
    )
    const totalInvoiced = outstandingEligible.reduce((sum, inv) => sum + (inv.total_amount ?? 0), 0)
    const totalPaid = outstandingEligible.reduce((sum, inv) => sum + (inv.amount_paid ?? 0), 0)
    const totalOutstanding = totalInvoiced - totalPaid

    // Group invoices by authorized matter
    const matterMap = new Map(matters.map((m) => [m.id as string, m]))
    const paymentMap = new Map<string, typeof payments>()
    for (const pmt of payments) {
      const invId = pmt.invoice_id as string
      if (!paymentMap.has(invId)) paymentMap.set(invId, [])
      paymentMap.get(invId)!.push(pmt)
    }

    const statementMatters = authorizedMatterIds.map((matterId) => {
      const matter = matterMap.get(matterId)
      const matterInvoices = authorizedInvoices
        .filter((inv) => inv.matter_id === matterId)
        .map((inv) => ({
          ...inv,
          payments: paymentMap.get(inv.id) ?? [],
        }))

      return {
        matter_id: matterId,
        title: (matter?.title as string) ?? 'Unknown Matter',
        matter_number: (matter?.matter_number as string) ?? null,
        invoices: matterInvoices,
      }
    }).filter((m) => m.invoices.length > 0)

    // Fetch tenant for branding
    const { data: tenant } = await supabase
      .from('tenants')
      .select('name, currency')
      .eq('id', tenantId)
      .single()

    return NextResponse.json({
      contact: {
        id: contact.id,
        name: contactName,
        email: contact.email_primary,
      },
      firm_name: tenant?.name ?? 'Law Firm',
      currency: tenant?.currency ?? 'CAD',
      date_range: { from: fromDate, to: toDate },
      matters: statementMatters,
      summary: {
        total_invoiced: totalInvoiced,
        total_paid: totalPaid,
        total_outstanding: totalOutstanding,
        trust_balance: trustBalance,
        invoice_count: authorizedInvoices.length,
        matter_count: statementMatters.length,
      },
      generated_at: new Date().toISOString(),
    })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    reportError(error instanceof Error ? error : new Error('Unknown error'), {
      route: 'GET /api/contacts/[id]/statement',
      metadata: { contactId },
    })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export const GET = withTiming(handleGet, 'GET /api/contacts/[id]/statement')
