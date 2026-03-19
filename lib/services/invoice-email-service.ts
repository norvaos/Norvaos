/**
 * Invoice Email Service
 * Handles sending invoice PDFs, payment receipts, and reminder emails to clients.
 * Non-blocking: all errors caught internally — never throws.
 */

import { Resend } from 'resend'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'
import { generateInvoicePdf, type InvoicePdfData } from '@/lib/utils/invoice-pdf'
import { generateReceiptPdf } from '@/lib/utils/receipt-pdf'
import { log } from '@/lib/utils/logger'
import { reportError } from '@/lib/monitoring/error-reporter'

// Re-use email service patterns
function getResend(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return null
  return new Resend(apiKey)
}

const FROM_DOMAIN = process.env.RESEND_FROM_DOMAIN || 'notifications.norvaos.com'

function getFromAddress(firmName: string): string {
  if (FROM_DOMAIN === 'resend.dev') return 'onboarding@resend.dev'
  return `${firmName} <billing@${FROM_DOMAIN}>`
}

// Types
export interface SendInvoiceResult {
  success: boolean
  sentTo?: string
  sentAt?: string
  error?: string
}

export interface SendReceiptResult {
  success: boolean
  sentTo?: string
  receiptSentAt?: string
  error?: string
}

/**
 * Send an invoice PDF to the billing contact via email.
 */
export async function sendInvoiceEmail(
  supabase: SupabaseClient<Database>,
  invoiceId: string,
  tenantId: string,
  emailOverride?: string
): Promise<SendInvoiceResult> {
  try {
    const resend = getResend()
    if (!resend) {
      return { success: false, error: 'RESEND_API_KEY not configured' }
    }

    // Fetch invoice with tenant isolation
    const { data: invoice, error: invErr } = await supabase
      .from('invoices')
      .select('*')
      .eq('id', invoiceId)
      .eq('tenant_id', tenantId)
      .single()

    if (invErr || !invoice) {
      return { success: false, error: 'Invoice not found' }
    }

    // Only finalized invoices may be sent. Draft must be finalized first; statuses past 'sent' are already delivered.
    if (invoice.status !== 'finalized') {
      return { success: false, error: `Only finalized invoices can be sent. This invoice has status '${invoice.status}'.` }
    }

    // Fetch tenant, matter, contact, line items, payments in parallel
    const [tenantRes, matterRes, lineItemsRes, paymentsRes] = await Promise.all([
      supabase.from('tenants').select('id, name, currency, date_format, settings').eq('id', tenantId).single(),
      supabase.from('matters').select('id, title, matter_number').eq('id', invoice.matter_id ?? '').eq('tenant_id', tenantId).single(),
      supabase.from('invoice_line_items').select('*').eq('invoice_id', invoiceId).eq('tenant_id', tenantId).order('sort_order'),
      supabase.from('payments').select('*').eq('invoice_id', invoiceId).eq('tenant_id', tenantId).order('created_at', { ascending: false }),
    ])

    if (!tenantRes.data || !matterRes.data) {
      return { success: false, error: 'Failed to fetch invoice dependencies' }
    }

    const tenant = tenantRes.data
    const matter = matterRes.data
    const lineItems = lineItemsRes.data ?? []
    const payments = paymentsRes.data ?? []

    // Resolve billing contact email
    let recipientEmail = emailOverride
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
        if (!recipientEmail) recipientEmail = contact.email_primary ?? undefined
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

    if (!recipientEmail) {
      return { success: false, error: 'Billing contact has no email address. Add an email to the contact record or provide an email override.' }
    }

    // Generate PDF
    const settings = tenant.settings as Record<string, unknown> | null
    const firmAddress = (settings?.firm_address as string) ?? null
    const currency = tenant.currency || 'CAD'

    const pdfData: InvoicePdfData = {
      firmName: tenant.name,
      firmAddress,
      invoiceNumber: invoice.invoice_number ?? '',
      issueDate: invoice.issue_date ?? '',
      dueDate: invoice.due_date ?? '',
      status: 'sent', // PDF is generated pre-transition; client sees 'Sent' (the post-send status)
      billTo: { name: billToName, email: billToEmail, phone: billToPhone, address: billToAddress },
      matterTitle: matter.title,
      matterNumber: matter.matter_number,
      lineItems: lineItems.map((li) => ({
        description: li.description,
        quantity: Number(li.quantity),
        unit_price: li.unit_price,
        amount: li.amount ?? 0,
      })),
      subtotal: invoice.subtotal ?? 0,
      taxAmount: invoice.tax_amount ?? 0,
      totalAmount: invoice.total_amount ?? 0,
      amountPaid: invoice.amount_paid ?? 0,
      payments: payments.map((p) => ({
        payment_date: p.created_at ?? '',
        payment_method: p.payment_method ?? '',
        amount: p.amount,
        reference: p.notes ?? null,
      })),
      notes: invoice.notes,
      currency,
    }

    const pdfBytes = await generateInvoicePdf(pdfData)

    // Format currency for subject line
    const totalFormatted = new Intl.NumberFormat('en-CA', {
      style: 'currency',
      currency,
    }).format(invoice.total_amount / 100)

    // Send email with PDF attachment
    const { error: sendError } = await resend.emails.send({
      from: getFromAddress(tenant.name),
      to: [recipientEmail],
      subject: `Invoice ${invoice.invoice_number} — ${totalFormatted} from ${tenant.name}`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #1a1a1a;">Invoice ${invoice.invoice_number}</h2>
          <p>Dear ${billToName},</p>
          <p>Please find attached your invoice from <strong>${tenant.name}</strong>.</p>
          <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
            <tr><td style="padding: 8px 0; color: #666;">Invoice Number</td><td style="padding: 8px 0; text-align: right; font-weight: 600;">${invoice.invoice_number}</td></tr>
            <tr><td style="padding: 8px 0; color: #666;">Issue Date</td><td style="padding: 8px 0; text-align: right;">${invoice.issue_date}</td></tr>
            <tr><td style="padding: 8px 0; color: #666;">Due Date</td><td style="padding: 8px 0; text-align: right; font-weight: 600;">${invoice.due_date}</td></tr>
            <tr style="border-top: 2px solid #1a1a1a;"><td style="padding: 12px 0; font-weight: 700;">Amount Due</td><td style="padding: 12px 0; text-align: right; font-weight: 700; font-size: 18px;">${totalFormatted}</td></tr>
          </table>
          <p style="color: #666; font-size: 14px;">If you have any questions about this invoice, please do not hesitate to contact us.</p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;">
          <p style="color: #999; font-size: 12px;">${tenant.name}</p>
        </div>
      `,
      text: `Invoice ${invoice.invoice_number} from ${tenant.name}\n\nAmount Due: ${totalFormatted}\nDue Date: ${invoice.due_date}\n\nPlease find the invoice PDF attached.`,
      attachments: [
        {
          filename: `INV-${invoice.invoice_number}.pdf`,
          content: Buffer.from(pdfBytes).toString('base64'),
        },
      ],
    })

    if (sendError) {
      log.error('[invoice-email] Resend API error', { invoice_id: invoiceId, error: sendError.message })
      return { success: false, error: `Email delivery failed: ${sendError.message}` }
    }

    // Update invoice: status → sent, record sent_at and sent_to_email
    const now = new Date().toISOString()
    await supabase
      .from('invoices')
      .update({
        status: 'sent',
        sent_at: now,
        sent_to_email: recipientEmail,
      })
      .eq('id', invoiceId)
      .eq('tenant_id', tenantId)

    log.info('[invoice-email] Invoice sent', {
      tenant_id: tenantId,
      invoice_id: invoiceId,
      sent_to: recipientEmail,
    })

    return { success: true, sentTo: recipientEmail, sentAt: now }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    reportError(err instanceof Error ? err : new Error(msg), { route: 'invoice-email-service', metadata: { invoiceId } })
    log.error('[invoice-email] Failed to send invoice', { invoice_id: invoiceId, error: msg })
    return { success: false, error: msg }
  }
}

/**
 * Send a payment receipt email to the billing contact.
 */
export async function sendReceiptEmail(
  supabase: SupabaseClient<Database>,
  invoiceId: string,
  tenantId: string,
  emailOverride?: string
): Promise<SendReceiptResult> {
  try {
    const resend = getResend()
    if (!resend) {
      return { success: false, error: 'RESEND_API_KEY not configured' }
    }

    // Fetch invoice + payments
    const [invoiceRes, paymentsRes, tenantRes] = await Promise.all([
      supabase.from('invoices').select('*').eq('id', invoiceId).eq('tenant_id', tenantId).single(),
      supabase.from('payments').select('*').eq('invoice_id', invoiceId).eq('tenant_id', tenantId).order('created_at', { ascending: false }),
      supabase.from('tenants').select('id, name, currency, date_format, settings').eq('id', tenantId).single(),
    ])

    if (!invoiceRes.data) return { success: false, error: 'Invoice not found' }
    if (!tenantRes.data) return { success: false, error: 'Tenant not found' }

    const invoice = invoiceRes.data
    const payments = paymentsRes.data ?? []
    const tenant = tenantRes.data

    if (payments.length === 0) {
      return { success: false, error: 'No payments recorded on this invoice' }
    }

    // Resolve recipient email
    let recipientEmail = emailOverride
    let billToName = 'Client'

    if (!recipientEmail && invoice.contact_id) {
      const { data: contact } = await supabase
        .from('contacts')
        .select('first_name, last_name, email_primary')
        .eq('id', invoice.contact_id)
        .eq('tenant_id', tenantId)
        .single()

      if (contact) {
        recipientEmail = contact.email_primary ?? undefined
        billToName = [contact.first_name, contact.last_name].filter(Boolean).join(' ') || 'Client'
      }
    }

    if (!recipientEmail) {
      return { success: false, error: 'Billing contact has no email address' }
    }

    const currency = tenant.currency || 'CAD'
    const settings = tenant.settings as Record<string, unknown> | null
    const firmAddress = (settings?.firm_address as string) ?? null

    // Generate receipt PDF
    const pdfBytes = await generateReceiptPdf({
      firmName: tenant.name,
      firmAddress,
      invoiceNumber: invoice.invoice_number ?? '',
      billToName,
      payments: payments.map((p) => ({
        payment_date: p.created_at ?? '',
        payment_method: p.payment_method ?? '',
        amount: p.amount,
        reference: p.notes ?? null,
      })),
      totalPaid: invoice.amount_paid ?? 0,
      invoiceTotal: invoice.total_amount,
      currency,
      dateFormat: (tenant as { date_format?: string | null }).date_format ?? null,
    })

    const totalFormatted = new Intl.NumberFormat('en-CA', { style: 'currency', currency }).format((invoice.amount_paid ?? 0) / 100)

    const { error: sendError } = await resend.emails.send({
      from: getFromAddress(tenant.name),
      to: [recipientEmail],
      subject: `Payment Receipt — ${totalFormatted} for Invoice ${invoice.invoice_number}`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #1a1a1a;">Payment Receipt</h2>
          <p>Dear ${billToName},</p>
          <p>Thank you for your payment of <strong>${totalFormatted}</strong> towards Invoice ${invoice.invoice_number}.</p>
          <p>Please find the receipt attached for your records.</p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;">
          <p style="color: #999; font-size: 12px;">${tenant.name}</p>
        </div>
      `,
      text: `Payment Receipt from ${tenant.name}\n\nPayment of ${totalFormatted} received for Invoice ${invoice.invoice_number}.\n\nThank you.`,
      attachments: [
        {
          filename: `RECEIPT-${invoice.invoice_number}.pdf`,
          content: Buffer.from(pdfBytes).toString('base64'),
        },
      ],
    })

    if (sendError) {
      return { success: false, error: `Email delivery failed: ${sendError.message}` }
    }

    // Update receipt_sent_at
    const now = new Date().toISOString()
    await supabase
      .from('invoices')
      .update({ receipt_sent_at: now })
      .eq('id', invoiceId)
      .eq('tenant_id', tenantId)

    log.info('[invoice-email] Receipt sent', { tenant_id: tenantId, invoice_id: invoiceId, sent_to: recipientEmail })

    return { success: true, sentTo: recipientEmail, receiptSentAt: now }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    reportError(err instanceof Error ? err : new Error(msg), { route: 'receipt-email-service', metadata: { invoiceId } })
    return { success: false, error: msg }
  }
}

/**
 * Send a payment reminder email for an overdue/unpaid invoice.
 */
export async function sendReminderEmail(
  supabase: SupabaseClient<Database>,
  invoiceId: string,
  tenantId: string
): Promise<SendInvoiceResult> {
  try {
    const resend = getResend()
    if (!resend) return { success: false, error: 'RESEND_API_KEY not configured' }

    const [invoiceRes, tenantRes] = await Promise.all([
      supabase.from('invoices').select('*').eq('id', invoiceId).eq('tenant_id', tenantId).single(),
      supabase.from('tenants').select('id, name, currency, date_format, settings').eq('id', tenantId).single(),
    ])

    if (!invoiceRes.data || !tenantRes.data) return { success: false, error: 'Invoice or tenant not found' }

    const invoice = invoiceRes.data
    const tenant = tenantRes.data
    const currency = tenant.currency || 'CAD'

    if (!['sent', 'viewed', 'overdue', 'partially_paid'].includes(invoice.status ?? '')) {
      return { success: false, error: `Cannot send reminder for invoice with status '${invoice.status}'` }
    }

    // Idempotency: check minimum 24h between reminders
    if (invoice.last_reminder_at) {
      const lastReminder = new Date(invoice.last_reminder_at)
      const hoursSince = (Date.now() - lastReminder.getTime()) / (1000 * 60 * 60)
      if (hoursSince < 24) {
        return { success: false, error: `Reminder already sent ${Math.round(hoursSince)} hours ago. Minimum interval is 24 hours.` }
      }
    }

    // Get recipient email
    let recipientEmail: string | null = null
    let billToName = 'Client'

    if (invoice.sent_to_email) {
      recipientEmail = invoice.sent_to_email
    }

    if (invoice.contact_id) {
      const { data: contact } = await supabase
        .from('contacts')
        .select('first_name, last_name, email_primary')
        .eq('id', invoice.contact_id)
        .eq('tenant_id', tenantId)
        .single()

      if (contact) {
        if (!recipientEmail) recipientEmail = contact.email_primary
        billToName = [contact.first_name, contact.last_name].filter(Boolean).join(' ') || 'Client'
      }
    }

    if (!recipientEmail) {
      return { success: false, error: 'No recipient email available' }
    }

    const amountDue = (invoice.total_amount ?? 0) - (invoice.amount_paid ?? 0)
    const amountFormatted = new Intl.NumberFormat('en-CA', { style: 'currency', currency }).format(amountDue / 100)
    const reminderNum = (invoice.reminder_count ?? 0) + 1

    const { error: sendError } = await resend.emails.send({
      from: getFromAddress(tenant.name),
      to: [recipientEmail],
      subject: `Payment Reminder — Invoice ${invoice.invoice_number} (${amountFormatted} outstanding)`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #1a1a1a;">Payment Reminder</h2>
          <p>Dear ${billToName},</p>
          <p>This is a friendly reminder that Invoice <strong>${invoice.invoice_number}</strong> has an outstanding balance of <strong>${amountFormatted}</strong>.</p>
          <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
            <tr><td style="padding: 8px 0; color: #666;">Invoice Number</td><td style="padding: 8px 0; text-align: right;">${invoice.invoice_number}</td></tr>
            <tr><td style="padding: 8px 0; color: #666;">Due Date</td><td style="padding: 8px 0; text-align: right; color: #dc2626; font-weight: 600;">${invoice.due_date}</td></tr>
            <tr style="border-top: 2px solid #1a1a1a;"><td style="padding: 12px 0; font-weight: 700;">Amount Due</td><td style="padding: 12px 0; text-align: right; font-weight: 700; font-size: 18px;">${amountFormatted}</td></tr>
          </table>
          <p>Please arrange payment at your earliest convenience. If you have already made this payment, please disregard this notice.</p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;">
          <p style="color: #999; font-size: 12px;">${tenant.name} — Reminder ${reminderNum}</p>
        </div>
      `,
      text: `Payment Reminder from ${tenant.name}\n\nInvoice ${invoice.invoice_number}\nAmount Due: ${amountFormatted}\nDue Date: ${invoice.due_date}\n\nPlease arrange payment at your earliest convenience.`,
    })

    if (sendError) {
      return { success: false, error: `Email delivery failed: ${sendError.message}` }
    }

    // Update reminder tracking
    const now = new Date().toISOString()
    await supabase
      .from('invoices')
      .update({
        last_reminder_at: now,
        reminder_count: reminderNum,
      })
      .eq('id', invoiceId)
      .eq('tenant_id', tenantId)

    log.info('[invoice-email] Reminder sent', {
      tenant_id: tenantId,
      invoice_id: invoiceId,
      reminder_number: reminderNum,
      sent_to: recipientEmail,
    })

    return { success: true, sentTo: recipientEmail, sentAt: now }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    reportError(err instanceof Error ? err : new Error(msg), { route: 'reminder-email-service', metadata: { invoiceId } })
    return { success: false, error: msg }
  }
}
