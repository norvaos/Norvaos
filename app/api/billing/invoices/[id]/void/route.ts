import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { checkBillingPermission } from '@/lib/services/billing-permission'
import { withTiming } from '@/lib/middleware/request-timing'
import { voidInvoice } from '@/lib/services/billing/invoice-state.service'
import { createAdminClient } from '@/lib/supabase/admin'

// ── POST /api/billing/invoices/[id]/void ─────────────────────────────────────

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

  const { tenantId, userId } = auth
  const admin = createAdminClient()

  const { allowed } = await checkBillingPermission(
    admin,
    userId,
    tenantId,
    'POST /api/billing/invoices/[id]/void',
  )
  if (!allowed) {
    return NextResponse.json(
      { error: 'Insufficient permissions: billing:view required' },
      { status: 403 },
    )
  }

  let body: { reason?: string } = {}
  try {
    body = await request.json()
  } catch {
    // empty body is fine
  }

  if (!body.reason?.trim()) {
    return NextResponse.json({ error: 'A reason is required to void an invoice' }, { status: 400 })
  }

  const result = await voidInvoice({
    supabase: admin,
    invoiceId,
    tenantId,
    userId,
    reason: body.reason.trim(),
  })

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 422 })
  }

  return NextResponse.json({ success: true })
}

export const POST = withTiming(handlePost, 'POST /api/billing/invoices/[id]/void')
