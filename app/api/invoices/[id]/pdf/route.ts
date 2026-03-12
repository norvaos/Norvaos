import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { checkBillingPermission } from '@/lib/services/billing-permission'
import { logAuditServer } from '@/lib/queries/audit-logs'
import { generateInvoicePdf, type InvoicePdfData } from '@/lib/utils/invoice-pdf'
import { checkTenantLimit, rateLimitResponse } from '@/lib/middleware/tenant-limiter'
import { withTiming } from '@/lib/middleware/request-timing'

// ── GET /api/invoices/[id]/pdf ───────────────────────────────────────────────

async function handleGet(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: invoiceId } = await params
  const headersList = await headers()
  const ip = headersList.get('x-forwarded-for') ?? headersList.get('x-real-ip') ?? 'unknown'
  const userAgent = headersList.get('user-agent') ?? 'unknown'

  let auth: Awaited<ReturnType<typeof authenticateRequest>>

  try {
    auth = await authenticateRequest()
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      )
    }
    return NextResponse.json({ error: 'Authentication failed' }, { status: 401 })
  }

  const { supabase, tenantId, userId } = auth

  const limit = await checkTenantLimit(tenantId, 'invoices/pdf')
  if (!limit.allowed) return rateLimitResponse(limit)

  // ── 1. Permission enforcement ────────────────────────────────

  const { allowed, roleName } = await checkBillingPermission(supabase, userId, tenantId)

  if (!allowed) {
    // Audit the denied attempt (without financial data to prevent leakage)
    await logAuditServer({
      supabase,
      tenantId,
      userId,
      entityType: 'invoice',
      entityId: invoiceId,
      action: 'invoice_pdf_download_denied',
      metadata: {
        invoice_id: invoiceId,
        user_id: userId,
        role_name: roleName,
        reason: 'missing billing:view permission',
        ip,
        user_agent: userAgent,
      },
    })

    return NextResponse.json(
      { error: 'Insufficient permissions: billing:view required' },
      { status: 403 },
    )
  }

  // ── 2. Fetch invoice with tenant isolation ───────────────────

  const { data: invoice, error: invErr } = await supabase
    .from('invoices')
    .select('*')
    .eq('id', invoiceId)
    .eq('tenant_id', tenantId)
    .single()

  if (invErr || !invoice) {
    return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
  }

  // ── 3. Fetch all dependent records (parallel, tenant-scoped) ─

  const [lineItemsRes, paymentsRes, matterRes, tenantRes] = await Promise.all([
    supabase
      .from('invoice_line_items')
      .select('*')
      .eq('invoice_id', invoiceId)
      .eq('tenant_id', tenantId)
      .order('sort_order'),
    supabase
      .from('payments')
      .select('*')
      .eq('invoice_id', invoiceId)
      .eq('tenant_id', tenantId)
      .order('payment_date', { ascending: false }),
    supabase
      .from('matters')
      .select('id, title, matter_number, tenant_id')
      .eq('id', invoice.matter_id)
      .eq('tenant_id', tenantId)
      .single(),
    supabase
      .from('tenants')
      .select('id, name, currency, settings')
      .eq('id', tenantId)
      .single(),
  ])

  // Hard-fail on missing or cross-tenant records
  if (matterRes.error || !matterRes.data) {
    return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
  }
  if (tenantRes.error || !tenantRes.data) {
    return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
  }

  const matter = matterRes.data
  const tenant = tenantRes.data
  const lineItems = lineItemsRes.data ?? []
  const payments = paymentsRes.data ?? []

  // ── 4. Fetch bill-to contact (optional) ──────────────────────

  let billToName = matter.title
  let billToEmail: string | null = null
  let billToPhone: string | null = null
  let billToAddress: string | null = null

  if (invoice.contact_id) {
    const { data: contact } = await supabase
      .from('contacts')
      .select('first_name, last_name, organization_name, email_primary, phone_primary, address_line1, address_line2, city, province_state, postal_code, country')
      .eq('id', invoice.contact_id)
      .eq('tenant_id', tenantId)
      .single()

    if (contact) {
      const fullName = [contact.first_name, contact.last_name].filter(Boolean).join(' ')
      billToName = fullName || contact.organization_name || matter.title
      billToEmail = contact.email_primary
      billToPhone = contact.phone_primary
      const addressParts = [
        contact.address_line1,
        contact.address_line2,
        [contact.city, contact.province_state].filter(Boolean).join(', '),
        contact.postal_code,
        contact.country !== 'Canada' ? contact.country : null,
      ].filter(Boolean)
      billToAddress = addressParts.length > 0 ? addressParts.join('\n') : null
    }
  } else {
    // Fallback: look for a primary contact on the matter
    const { data: primaryContact } = await supabase
      .from('matter_contacts')
      .select('contact_id')
      .eq('matter_id', invoice.matter_id)
      .eq('tenant_id', tenantId)
      .eq('is_primary', true)
      .limit(1)
      .maybeSingle()

    if (primaryContact?.contact_id) {
      const { data: contact } = await supabase
        .from('contacts')
        .select('first_name, last_name, organization_name, email_primary, phone_primary, address_line1, address_line2, city, province_state, postal_code, country')
        .eq('id', primaryContact.contact_id)
        .eq('tenant_id', tenantId)
        .single()

      if (contact) {
        const fullName = [contact.first_name, contact.last_name].filter(Boolean).join(' ')
        billToName = fullName || contact.organization_name || matter.title
        billToEmail = contact.email_primary
        billToPhone = contact.phone_primary
        const addressParts = [
          contact.address_line1,
          contact.address_line2,
          [contact.city, contact.province_state].filter(Boolean).join(', '),
          contact.postal_code,
          contact.country !== 'Canada' ? contact.country : null,
        ].filter(Boolean)
        billToAddress = addressParts.length > 0 ? addressParts.join('\n') : null
      }
    }
  }

  // ── 5. Extract firm address from tenant settings ─────────────

  const settings = tenant.settings as Record<string, unknown> | null
  const firmAddress = (settings?.firm_address as string) ?? null

  // ── 6. Build PDF data & generate ─────────────────────────────

  const currency = tenant.currency || 'CAD'

  const pdfData: InvoicePdfData = {
    firmName: tenant.name,
    firmAddress,
    invoiceNumber: invoice.invoice_number,
    issueDate: invoice.issue_date,
    dueDate: invoice.due_date,
    status: invoice.status,
    billTo: {
      name: billToName,
      email: billToEmail,
      phone: billToPhone,
      address: billToAddress,
    },
    matterTitle: matter.title,
    matterNumber: matter.matter_number,
    lineItems: lineItems.map((li) => ({
      description: li.description,
      quantity: Number(li.quantity),
      unit_price: li.unit_price,
      amount: li.amount,
    })),
    subtotal: invoice.subtotal,
    taxAmount: invoice.tax_amount,
    totalAmount: invoice.total_amount,
    amountPaid: invoice.amount_paid,
    payments: payments.map((p) => ({
      payment_date: p.payment_date,
      payment_method: p.payment_method,
      amount: p.amount,
      reference: p.reference,
    })),
    notes: invoice.notes,
    currency,
  }

  const pdfBytes = await generateInvoicePdf(pdfData)

  // ── 7. Audit event ───────────────────────────────────────────

  await logAuditServer({
    supabase,
    tenantId,
    userId,
    entityType: 'invoice',
    entityId: invoiceId,
    action: 'invoice_pdf_downloaded',
    metadata: {
      invoice_id: invoiceId,
      matter_id: invoice.matter_id,
      contact_id: invoice.contact_id,
      total_cents: invoice.total_amount,
      currency,
      user_id: userId,
      ip,
      user_agent: userAgent,
    },
  })

  // ── 8. Stream response ───────────────────────────────────────

  const filename = `INV-${invoice.invoice_number}.pdf`

  return new NextResponse(Buffer.from(pdfBytes), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': String(pdfBytes.byteLength),
      'Cache-Control': 'no-store',
    },
  })
}

export const GET = withTiming(handleGet, 'GET /api/invoices/[id]/pdf')
