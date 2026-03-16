import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { checkBillingPermission } from '@/lib/services/billing-permission'
import { withTiming } from '@/lib/middleware/request-timing'
import { approveAdjustment } from '@/lib/services/billing/discount.service'

// ── POST /api/billing/invoices/[id]/adjustments/[adjId]/approve ───────────────

async function handlePost(
  _request: Request,
  { params }: { params: Promise<{ id: string; adjId: string }> },
) {
  const { id: invoiceId, adjId: adjustmentId } = await params

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
    'POST /api/billing/invoices/[id]/adjustments/[adjId]/approve',
  )
  if (!allowed) {
    return NextResponse.json({ error: 'Insufficient permissions: billing:view required' }, { status: 403 })
  }

  const result = await approveAdjustment(supabase, tenantId, invoiceId, adjustmentId, userId)

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 422 })
  }

  return NextResponse.json({ success: true })
}

export const POST = withTiming(
  handlePost,
  'POST /api/billing/invoices/[id]/adjustments/[adjId]/approve',
)
