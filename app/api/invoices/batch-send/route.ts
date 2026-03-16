import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import { logAuditServer } from '@/lib/queries/audit-logs'
import { sendInvoiceEmail } from '@/lib/services/invoice-email-service'
import { withTiming } from '@/lib/middleware/request-timing'
import { log } from '@/lib/utils/logger'
import { reportError } from '@/lib/monitoring/error-reporter'

async function handlePost(request: Request) {
  try {
    const auth = await authenticateRequest()
    await requirePermission(auth, 'billing', 'edit')

    const { supabase, tenantId, userId } = auth
    const body = await request.json()
    const invoiceIds = body.invoice_ids as string[]

    if (!Array.isArray(invoiceIds) || invoiceIds.length === 0) {
      return NextResponse.json({ error: 'invoice_ids must be a non-empty array' }, { status: 400 })
    }

    if (invoiceIds.length > 50) {
      return NextResponse.json({ error: 'Maximum 50 invoices per batch' }, { status: 400 })
    }

    const sent: string[] = []
    const failed: { id: string; reason: string }[] = []

    for (const invoiceId of invoiceIds) {
      const result = await sendInvoiceEmail(supabase, invoiceId, tenantId)

      if (result.success) {
        sent.push(invoiceId)
        // Audit each successful send
        await logAuditServer({
          supabase,
          tenantId,
          userId,
          entityType: 'invoice',
          entityId: invoiceId,
          action: 'invoice_sent',
          metadata: { sent_to: result.sentTo, batch: true },
        }).catch(() => {}) // Non-blocking audit
      } else {
        failed.push({ id: invoiceId, reason: result.error || 'Unknown error' })
      }

      // Rate limit: 100ms between emails to respect Resend limits
      if (invoiceIds.indexOf(invoiceId) < invoiceIds.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 100))
      }
    }

    log.info('[invoices/batch-send] Batch complete', {
      tenant_id: tenantId,
      sent_count: sent.length,
      failed_count: failed.length,
    })

    return NextResponse.json({ sent, failed })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    reportError(error instanceof Error ? error : new Error('Unknown error'), {
      route: 'POST /api/invoices/batch-send',
    })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export const POST = withTiming(handlePost, 'POST /api/invoices/batch-send')
