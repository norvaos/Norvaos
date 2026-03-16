import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { checkBillingPermission } from '@/lib/services/billing-permission'
import { withTiming } from '@/lib/middleware/request-timing'
import { requestTrustApplication } from '@/lib/services/billing/trust-application.service'
import { z } from 'zod'

// ── POST /api/billing/invoices/[id]/trust ─────────────────────────────────────

const trustSchema = z.object({
  trustAccountId: z.string().uuid(),
  amountCents: z.number().int().positive(),
  notes: z.string().max(500).optional().nullable(),
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
    'POST /api/billing/invoices/[id]/trust',
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

  const parsed = trustSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  // Fetch matter_id from the invoice (needed by trust service)
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const { data: invoice, error: fetchErr } = await (supabase as any)
    .from('invoices')
    .select('matter_id')
    .eq('id', invoiceId)
    .eq('tenant_id', tenantId)
    .single()
  /* eslint-enable @typescript-eslint/no-explicit-any */

  if (fetchErr || !invoice) {
    return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
  }

  const result = await requestTrustApplication({
    supabase,
    tenantId,
    invoiceId,
    matterId: invoice.matter_id,
    trustAccountId: parsed.data.trustAccountId,
    amountCents: parsed.data.amountCents,
    requestedByUserId: userId,
    notes: parsed.data.notes ?? null,
  })

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 422 })
  }

  return NextResponse.json(
    { success: true, allocationId: result.data?.allocationId },
    { status: 201 },
  )
}

export const POST = withTiming(handlePost, 'POST /api/billing/invoices/[id]/trust')
