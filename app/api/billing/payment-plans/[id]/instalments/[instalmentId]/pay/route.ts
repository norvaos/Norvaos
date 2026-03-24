import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { checkBillingPermission } from '@/lib/services/billing-permission'
import { withTiming } from '@/lib/middleware/request-timing'
import { payInstalment } from '@/lib/services/billing/payment-plan.service'
import { createAdminClient } from '@/lib/supabase/admin'

// ── POST /api/billing/payment-plans/[id]/instalments/[instalmentId]/pay ──────

async function handlePost(
  request: Request,
  { params }: { params: Promise<{ id: string; instalmentId: string }> },
) {
  const { id: planId, instalmentId } = await params

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
    'POST /api/billing/payment-plans/[id]/instalments/[instalmentId]/pay',
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

  const { payment_method, notes } = body

  if (typeof payment_method !== 'string' || !payment_method.trim()) {
    return NextResponse.json({ error: 'payment_method is required' }, { status: 400 })
  }

  const result = await payInstalment({
    supabase: admin,
    tenantId,
    userId,
    planId,
    instalmentId,
    paymentMethod: payment_method,
    notes: typeof notes === 'string' ? notes : null,
  })

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 422 })
  }

  return NextResponse.json(result.data, { status: 201 })
}

export const POST = withTiming(
  handlePost,
  'POST /api/billing/payment-plans/[id]/instalments/[instalmentId]/pay',
)
