import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { checkBillingPermission } from '@/lib/services/billing-permission'
import { withTiming } from '@/lib/middleware/request-timing'
import { createPaymentPlan } from '@/lib/services/billing/payment-plan.service'
import { createAdminClient } from '@/lib/supabase/admin'

// ── POST /api/billing/payment-plans ──────────────────────────────────────────

async function handlePost(request: Request) {
  let auth: Awaited<ReturnType<typeof authenticateRequest>>
  try {
    auth = await authenticateRequest()
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    return NextResponse.json({ error: 'Authentication failed' }, { status: 401 })
  }

  const { tenantId, userId } = auth
  const admin = createAdminClient()

  const { allowed } = await checkBillingPermission(
    admin,
    userId,
    tenantId,
    'POST /api/billing/payment-plans',
  )
  if (!allowed) {
    return NextResponse.json(
      { error: 'Insufficient permissions: billing:view required' },
      { status: 403 },
    )
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const {
    invoice_id,
    client_contact_id,
    total_amount_cents,
    instalment_amount_cents,
    instalment_count,
    frequency,
    start_date,
    notes,
  } = body

  if (
    typeof invoice_id !== 'string' ||
    typeof client_contact_id !== 'string' ||
    typeof total_amount_cents !== 'number' ||
    typeof instalment_amount_cents !== 'number' ||
    typeof instalment_count !== 'number' ||
    typeof frequency !== 'string' ||
    typeof start_date !== 'string'
  ) {
    return NextResponse.json(
      { error: 'Missing required fields: invoice_id, client_contact_id, total_amount_cents, instalment_amount_cents, instalment_count, frequency, start_date' },
      { status: 400 },
    )
  }

  if (!['weekly', 'biweekly', 'monthly'].includes(frequency)) {
    return NextResponse.json(
      { error: 'frequency must be one of: weekly, biweekly, monthly' },
      { status: 400 },
    )
  }

  const result = await createPaymentPlan({
    supabase: admin,
    tenantId,
    userId,
    invoiceId: invoice_id,
    clientContactId: client_contact_id,
    totalAmountCents: total_amount_cents,
    instalmentAmountCents: instalment_amount_cents,
    instalmentCount: instalment_count,
    frequency: frequency as 'weekly' | 'biweekly' | 'monthly',
    startDate: start_date,
    notes: typeof notes === 'string' ? notes : null,
  })

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 422 })
  }

  return NextResponse.json(result.data, { status: 201 })
}

export const POST = withTiming(handlePost, 'POST /api/billing/payment-plans')
