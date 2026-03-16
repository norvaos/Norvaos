import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import { logAuditServer } from '@/lib/queries/audit-logs'
import { sendInvoiceEmail } from '@/lib/services/invoice-email-service'
import { withTiming } from '@/lib/middleware/request-timing'
import { log } from '@/lib/utils/logger'
import { reportError } from '@/lib/monitoring/error-reporter'

async function handlePost(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: invoiceId } = await params

  try {
    const auth = await authenticateRequest()
    await requirePermission(auth, 'billing', 'edit')

    const { supabase, tenantId, userId } = auth
    const body = await request.json().catch(() => ({}))
    const emailOverride = body.email_override as string | undefined

    const result = await sendInvoiceEmail(supabase, invoiceId, tenantId, emailOverride)

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }

    // Audit log
    await logAuditServer({
      supabase,
      tenantId,
      userId,
      entityType: 'invoice',
      entityId: invoiceId,
      action: 'invoice_sent',
      metadata: {
        sent_to: result.sentTo,
        sent_at: result.sentAt,
        email_override: !!emailOverride,
      },
    })

    log.info('[invoices/send] Invoice sent successfully', {
      tenant_id: tenantId,
      invoice_id: invoiceId,
      sent_to: result.sentTo,
    })

    return NextResponse.json({
      success: true,
      sent_to: result.sentTo,
      sent_at: result.sentAt,
    })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    reportError(error instanceof Error ? error : new Error('Unknown error'), {
      route: 'POST /api/invoices/[id]/send',
      metadata: { invoiceId },
    })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export const POST = withTiming(handlePost, 'POST /api/invoices/[id]/send')
