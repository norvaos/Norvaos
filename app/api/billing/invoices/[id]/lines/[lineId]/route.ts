import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { checkBillingPermission } from '@/lib/services/billing-permission'
import { withTiming } from '@/lib/middleware/request-timing'
import { recalculateInvoice } from '@/lib/services/billing/invoice-calculation.service'

// ── DELETE /api/billing/invoices/[id]/lines/[lineId] ─────────────────────────
// Soft-delete a line item from a draft invoice (sets deleted_at).

async function handleDelete(
  _request: Request,
  { params }: { params: Promise<{ id: string; lineId: string }> },
) {
  const { id: invoiceId, lineId } = await params

  let auth: Awaited<ReturnType<typeof authenticateRequest>>
  try {
    auth = await authenticateRequest()
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    return NextResponse.json({ error: 'Authentication failed' }, { status: 401 })
  }

  const { supabase, tenantId } = auth

  const { allowed } = await checkBillingPermission(
    supabase,
    auth.userId,
    tenantId,
    'DELETE /api/billing/invoices/[id]/lines/[lineId]',
  )
  if (!allowed) {
    return NextResponse.json({ error: 'Insufficient permissions: billing:view required' }, { status: 403 })
  }

  const now = new Date().toISOString()

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const { error } = await (supabase as any)
    .from('invoice_line_items')
    .update({ deleted_at: now })
    .eq('id', lineId)
    .eq('invoice_id', invoiceId)
    .eq('tenant_id', tenantId)
    .is('deleted_at', null)
  /* eslint-enable @typescript-eslint/no-explicit-any */

  if (error) {
    // DB trigger raises exception for non-draft invoices
    return NextResponse.json({ error: error.message }, { status: 422 })
  }

  // Recalculate invoice totals
  await recalculateInvoice(supabase, invoiceId)

  return NextResponse.json({ success: true })
}

export const DELETE = withTiming(handleDelete, 'DELETE /api/billing/invoices/[id]/lines/[lineId]')
