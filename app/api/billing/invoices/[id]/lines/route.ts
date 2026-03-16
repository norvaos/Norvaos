import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { checkBillingPermission } from '@/lib/services/billing-permission'
import { withTiming } from '@/lib/middleware/request-timing'
import { recalculateInvoice } from '@/lib/services/billing/invoice-calculation.service'
import { z } from 'zod'

// ── POST /api/billing/invoices/[id]/lines ─────────────────────────────────────
// Add a line item to a draft invoice.
// The DB trigger trg_line_items_draft_only blocks writes on non-draft invoices
// at the database layer — this is the app-layer guard.

const lineItemSchema = z.object({
  description: z.string().min(1),
  quantity: z.number().positive(),
  unit_price: z.number().int().nonnegative(),
  line_category: z.enum(['professional_fees', 'disbursements', 'soft_costs', 'hard_costs']).optional(),
  line_type: z.enum(['time', 'flat_fee', 'disbursement', 'soft_cost', 'hard_cost', 'adjustment']).optional(),
  date_of_service: z.string().optional().nullable(),
  tax_code_id: z.string().uuid().optional().nullable(),
  is_taxable: z.boolean().optional(),
  sort_order: z.number().int().optional(),
  notes: z.string().optional().nullable(),
})

async function handlePost(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: invoiceId } = await params

  let auth: Awaited<ReturnType<typeof authenticateRequest>>
  try {
    auth = await authenticateRequest()
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    return NextResponse.json({ error: 'Authentication failed' }, { status: 401 })
  }

  const { supabase, tenantId, userId } = auth

  const { allowed } = await checkBillingPermission(
    supabase,
    userId,
    tenantId,
    'POST /api/billing/invoices/[id]/lines',
  )
  if (!allowed) {
    return NextResponse.json({ error: 'Insufficient permissions: billing:view required' }, { status: 403 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const parsed = lineItemSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const li = parsed.data
  const amount = Math.round(li.quantity * li.unit_price)

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const { data: newLine, error: insertErr } = await (supabase as any)
    .from('invoice_line_items')
    .insert({
      tenant_id: tenantId,
      invoice_id: invoiceId,
      description: li.description,
      quantity: li.quantity,
      unit_price: li.unit_price,
      amount,
      net_amount: amount,
      line_category: li.line_category ?? 'professional_fees',
      line_type: li.line_type ?? 'flat_fee',
      date_of_service: li.date_of_service ?? null,
      tax_code_id: li.tax_code_id ?? null,
      is_taxable: li.is_taxable ?? false,
      sort_order: li.sort_order ?? 0,
      created_by: userId,
    })
    .select('id')
    .single()
  /* eslint-enable @typescript-eslint/no-explicit-any */

  if (insertErr) {
    // DB trigger raises 'Invoice must be in draft status' for non-draft invoices
    return NextResponse.json({ error: insertErr.message }, { status: 422 })
  }

  // Recalculate invoice totals via the authorised DB function
  await recalculateInvoice(supabase, invoiceId)

  return NextResponse.json({ success: true, lineItemId: newLine.id }, { status: 201 })
}

export const POST = withTiming(handlePost, 'POST /api/billing/invoices/[id]/lines')
