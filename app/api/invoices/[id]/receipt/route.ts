import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import { logAuditServer } from '@/lib/queries/audit-logs'
import { sendReceiptEmail } from '@/lib/services/invoice-email-service'
import { withTiming } from '@/lib/middleware/request-timing'
import { createAdminClient } from '@/lib/supabase/admin'
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
    const admin = createAdminClient()
    const body = await request.json().catch(() => ({}))
    const emailOverride = body.email_override as string | undefined

    const result = await sendReceiptEmail(admin, invoiceId, tenantId, emailOverride)

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }

    await logAuditServer({
      supabase: admin,
      tenantId,
      userId,
      entityType: 'invoice',
      entityId: invoiceId,
      action: 'receipt_sent',
      metadata: {
        sent_to: result.sentTo,
        receipt_sent_at: result.receiptSentAt,
      },
    })

    return NextResponse.json({
      success: true,
      sent_to: result.sentTo,
      receipt_sent_at: result.receiptSentAt,
    })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    reportError(error instanceof Error ? error : new Error('Unknown error'), {
      route: 'POST /api/invoices/[id]/receipt',
      metadata: { invoiceId },
    })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export const POST = withTiming(handlePost, 'POST /api/invoices/[id]/receipt')
