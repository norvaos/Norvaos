import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createRateLimiter } from '@/lib/middleware/rate-limit'
import type { PortalInvoice, PortalBillingResponse, PortalPaymentConfig, PortalRetainerSummary } from '@/lib/types/portal'
import { validatePortalToken, PortalAuthError } from '@/lib/services/portal-auth'

const rateLimiter = createRateLimiter({ windowMs: 60_000, maxRequests: 30 })

// ── GET /api/portal/[token]/billing ──────────────────────────────────────────

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
    const { allowed, retryAfterMs } = await rateLimiter.check(ip)
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

    const now = new Date()

    // ── Fetch invoices (non-draft, non-cancelled) ─────────────────────────

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: invoices } = await (admin as any)
      .from('invoices')
      .select('id, invoice_number, issue_date, due_date, total_amount, amount_paid, status, required_before_work')
      .eq('matter_id', link.matter_id)
      .not('status', 'in', '("draft","finalized","cancelled","void")')
      .order('issue_date', { ascending: true })

    // Check for "mark as sent" pending payments per invoice (with timestamp)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const invoiceIds = (invoices ?? []).map((inv: any) => inv.id)
    let markedSentMap: Record<string, string> = {}

    if (invoiceIds.length > 0) {
      const { data: pendingPayments } = await admin
        .from('payments')
        .select('invoice_id, created_at')
        .in('invoice_id', invoiceIds)
        .eq('payment_method', 'e_transfer_pending')

      if (pendingPayments) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const p of pendingPayments as any[]) {
          markedSentMap[p.invoice_id] = p.created_at
        }
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const portalInvoices: PortalInvoice[] = (invoices ?? []).map((inv: any) => ({
      id: inv.id,
      invoiceNumber: inv.invoice_number ?? '',
      issueDate: inv.issue_date ?? '',
      dueDate: inv.due_date ?? '',
      totalAmount: inv.total_amount ?? 0,
      amountPaid: inv.amount_paid ?? 0,
      status: inv.status ?? 'sent',
      isOverdue:
        !!inv.due_date &&
        new Date(inv.due_date) < now &&
        (inv.amount_paid ?? 0) < (inv.total_amount ?? 0),
      requiredBeforeWork: inv.required_before_work ?? false,
      markedAsSent: !!markedSentMap[inv.id],
      markedAsSentAt: markedSentMap[inv.id] ?? null,
    }))

    const totalDue = portalInvoices.reduce((s, i) => s + i.totalAmount, 0)
    const totalPaid = portalInvoices.reduce((s, i) => s + i.amountPaid, 0)
    const totalOutstanding = totalDue - totalPaid
    const overdueAmount = portalInvoices
      .filter((i) => i.isOverdue)
      .reduce((s, i) => s + (i.totalAmount - i.amountPaid), 0)

    // ── Merge payment config (tenant defaults + per-matter overrides) ─────

    const { data: tenant } = await admin
      .from('tenants')
      .select('portal_branding')
      .eq('id', link.tenant_id)
      .single()

    const tenantBranding = (tenant?.portal_branding ?? {}) as Record<string, unknown>
    const tenantPaymentConfig = (tenantBranding.payment_config ?? {}) as Record<string, string | undefined>

    const metadata = (link.metadata ?? {}) as Record<string, unknown>
    const matterPaymentConfig = (metadata.payment_config ?? {}) as Record<string, string | undefined>

    // Per-matter overrides tenant field by field
    const mergedConfig: PortalPaymentConfig = {
      e_transfer_email: matterPaymentConfig.e_transfer_email ?? tenantPaymentConfig.e_transfer_email,
      e_transfer_instructions: matterPaymentConfig.e_transfer_instructions ?? tenantPaymentConfig.e_transfer_instructions,
      credit_card_url: matterPaymentConfig.credit_card_url ?? tenantPaymentConfig.credit_card_url,
      credit_card_label: matterPaymentConfig.credit_card_label ?? tenantPaymentConfig.credit_card_label,
      payment_instructions: matterPaymentConfig.payment_instructions ?? tenantPaymentConfig.payment_instructions,
    }

    // ── Fetch retainer package (fee agreement from signing) ───────────────
    let retainerSummary: PortalRetainerSummary | null = null

    try {
      const { data: matter } = await admin
        .from('matters')
        .select('originating_lead_id')
        .eq('id', link.matter_id)
        .single()

      if (matter?.originating_lead_id) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: pkg } = await (admin as any)
          .from('lead_retainer_packages')
          .select(
            'billing_type, line_items, government_fees, disbursements, hst_applicable, subtotal_cents, tax_amount_cents, total_amount_cents, payment_amount, payment_status, payment_terms, signed_at',
          )
          .eq('lead_id', matter.originating_lead_id)
          .eq('tenant_id', link.tenant_id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (pkg) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const p = pkg as any
          const totalPaidR = Number(p.payment_amount ?? 0)
          const totalOwedR = Number(p.total_amount_cents ?? 0)
          retainerSummary = {
            billingType: p.billing_type ?? 'flat_fee',
            lineItems: p.line_items ?? [],
            governmentFees: p.government_fees ?? [],
            disbursements: p.disbursements ?? [],
            hstApplicable: p.hst_applicable ?? false,
            subtotalCents: Number(p.subtotal_cents ?? 0),
            taxAmountCents: Number(p.tax_amount_cents ?? 0),
            totalAmountCents: totalOwedR,
            paymentAmount: totalPaidR,
            balanceCents: Math.max(totalOwedR - totalPaidR, 0),
            paymentStatus: p.payment_status ?? 'not_requested',
            paymentTerms: p.payment_terms ?? null,
            signedAt: p.signed_at ?? null,
          }
        }
      }
    } catch {
      // Non-fatal  -  portal still works without retainer summary
    }

    const response: PortalBillingResponse = {
      invoices: portalInvoices,
      summary: { totalDue, totalPaid, totalOutstanding, overdueAmount },
      paymentConfig: mergedConfig,
      currency: 'CAD',
      retainerSummary,
    }

    return NextResponse.json(response)
  } catch (err) {
    console.error('[portal/billing] Error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
