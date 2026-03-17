import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createRateLimiter } from '@/lib/middleware/rate-limit'
import { validatePortalToken, PortalAuthError } from '@/lib/services/portal-auth'

const rateLimiter = createRateLimiter({ windowMs: 60_000, maxRequests: 10 })

// ── POST /api/portal/[token]/billing/mark-sent ───────────────────────────────

export async function POST(
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

    const body = await request.json().catch(() => ({}))
    const invoiceId = body.invoice_id as string | undefined

    if (!invoiceId) {
      return NextResponse.json({ error: 'invoice_id is required' }, { status: 400 })
    }

    // Verify invoice belongs to this matter
    const { data: invoice, error: invError } = await admin
      .from('invoices')
      .select('id, invoice_number, total_amount, amount_paid, matter_id, contact_id')
      .eq('id', invoiceId)
      .eq('matter_id', link.matter_id)
      .single()

    if (invError || !invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
    }

    // ── Dedup check ────────────────────────────────────────────────────────
    // Check if a pending e-transfer payment already exists for this invoice

    const { data: existingPending } = await admin
      .from('payments')
      .select('id')
      .eq('invoice_id', invoiceId)
      .eq('payment_method', 'e_transfer_pending')
      .limit(1)

    if (existingPending && existingPending.length > 0) {
      // Already marked — return success without creating duplicate
      return NextResponse.json({ success: true, alreadyMarked: true })
    }

    // ── Create pending payment record ─────────────────────────────────────

    const remainingBalance = (invoice.total_amount ?? 0) - (invoice.amount_paid ?? 0)
    const nowIso = new Date().toISOString()

    const { error: paymentError } = await admin
      .from('payments')
      .insert({
        tenant_id: link.tenant_id,
        invoice_id: invoiceId,
        amount: remainingBalance,
        created_at: new Date().toISOString(),
        payment_method: 'e_transfer_pending',
        external_payment_id: 'Client marked as sent via portal',
        contact_id: invoice.contact_id ?? '',
        notes: `Portal submission at ${nowIso} for Invoice #${invoice.invoice_number ?? invoiceId.slice(0, 8)}`,
      })

    if (paymentError) {
      console.error('[portal/billing/mark-sent] Payment insert error:', paymentError)
      return NextResponse.json({ error: 'Failed to record payment notice' }, { status: 500 })
    }

    // ── Activity log ──────────────────────────────────────────────────────

    await admin
      .from('activities')
      .insert({
        tenant_id: link.tenant_id,
        matter_id: link.matter_id,
        contact_id: link.contact_id,
        activity_type: 'portal_payment_marked_sent',
        title: `Client marked e-transfer as sent for Invoice #${invoice.invoice_number ?? invoiceId.slice(0, 8)}`,
        description: `Client indicated via portal that e-transfer payment of $${(remainingBalance / 100).toFixed(2)} has been sent. Awaiting firm confirmation.`,
        created_by: link.contact_id, // portal user = contact
      })
      .then(() => {}) // fire and forget

    return NextResponse.json({ success: true, alreadyMarked: false })
  } catch (err) {
    console.error('[portal/billing/mark-sent] Error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
