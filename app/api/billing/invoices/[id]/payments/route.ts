import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { checkBillingPermission } from '@/lib/services/billing-permission'
import { withTiming } from '@/lib/middleware/request-timing'
import { recordPayment } from '@/lib/services/billing/payment-allocation.service'
import { z } from 'zod'

// ── POST /api/billing/invoices/[id]/payments ──────────────────────────────────

const paymentSchema = z.object({
  amountCents: z.number().int().positive(),
  paymentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  paymentMethod: z.string().min(1),
  paymentSource: z.enum(['direct', 'trust_applied', 'credit_note']),
  reference: z.string().max(200).optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
  trustTransactionId: z.string().uuid().optional().nullable(),
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
    'POST /api/billing/invoices/[id]/payments',
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

  const parsed = paymentSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const result = await recordPayment({
    supabase,
    tenantId,
    invoiceId,
    recordedByUserId: userId,
    amountCents: parsed.data.amountCents,
    paymentDate: parsed.data.paymentDate,
    paymentMethod: parsed.data.paymentMethod,
    paymentSource: parsed.data.paymentSource,
    reference: parsed.data.reference ?? null,
    notes: parsed.data.notes ?? null,
    trustTransactionId: parsed.data.trustTransactionId ?? null,
  })

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 422 })
  }

  return NextResponse.json({ success: true, paymentId: result.data?.paymentId }, { status: 201 })
}

export const POST = withTiming(handlePost, 'POST /api/billing/invoices/[id]/payments')
