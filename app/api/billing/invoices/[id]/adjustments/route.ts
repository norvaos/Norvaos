import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { checkBillingPermission } from '@/lib/services/billing-permission'
import { withTiming } from '@/lib/middleware/request-timing'
import { applyAdjustment } from '@/lib/services/billing/discount.service'
import { z } from 'zod'

// ── POST /api/billing/invoices/[id]/adjustments ───────────────────────────────

const adjustmentSchema = z.object({
  adjustmentType: z.enum(['discount', 'write_down', 'write_off', 'credit_note']),
  scope: z.enum(['invoice_level', 'line_level', 'category_level']),
  amountCents: z.number().int().positive(),
  description: z.string().min(1).max(500),
  lineItemId: z.string().uuid().optional().nullable(),
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
    'POST /api/billing/invoices/[id]/adjustments',
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

  const parsed = adjustmentSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const result = await applyAdjustment({
    supabase,
    tenantId,
    invoiceId,
    requestedByUserId: userId,
    adjustmentType: parsed.data.adjustmentType,
    scope: parsed.data.scope,
    amountCents: parsed.data.amountCents,
    description: parsed.data.description,
    lineItemId: parsed.data.lineItemId ?? null,
  })

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 422 })
  }

  return NextResponse.json(
    {
      success: true,
      adjustmentId: result.data?.adjustmentId,
      requiresApproval: result.data?.requiresApproval,
    },
    { status: 201 },
  )
}

export const POST = withTiming(handlePost, 'POST /api/billing/invoices/[id]/adjustments')
