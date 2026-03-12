import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createRateLimiter } from '@/lib/middleware/rate-limit'
import type { PortalInvoice, PortalBillingResponse, PortalPaymentConfig } from '@/lib/types/portal'

const rateLimiter = createRateLimiter({ windowMs: 60_000, maxRequests: 30 })

// ── Token Validation ─────────────────────────────────────────────────────────

async function validateToken(admin: ReturnType<typeof createAdminClient>, token: string) {
  const { data: link, error } = await admin
    .from('portal_links')
    .select('id, matter_id, tenant_id, contact_id, expires_at, is_active, metadata')
    .eq('token', token)
    .eq('is_active', true)
    .single()

  if (error || !link) {
    return { error: NextResponse.json({ error: 'Invalid token' }, { status: 404 }) }
  }
  if (new Date(link.expires_at) < new Date()) {
    return { error: NextResponse.json({ error: 'Link expired' }, { status: 410 }) }
  }
  return { link }
}

// ── GET /api/portal/[token]/billing ──────────────────────────────────────────

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
    const admin = createAdminClient()

    const result = await validateToken(admin, token)
    if (result.error) return result.error
    const { link } = result

    const now = new Date()

    // ── Fetch invoices (non-draft, non-cancelled) ─────────────────────────

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: invoices } = await (admin as any)
      .from('invoices')
      .select('id, invoice_number, issue_date, due_date, total_amount, amount_paid, status, required_before_work')
      .eq('matter_id', link.matter_id)
      .not('status', 'in', '("draft","cancelled","void")')
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

    const response: PortalBillingResponse = {
      invoices: portalInvoices,
      summary: { totalDue, totalPaid, totalOutstanding, overdueAmount },
      paymentConfig: mergedConfig,
      currency: 'CAD',
    }

    return NextResponse.json(response)
  } catch (err) {
    console.error('[portal/billing] Error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
