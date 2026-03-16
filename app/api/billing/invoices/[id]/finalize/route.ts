import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { checkBillingPermission } from '@/lib/services/billing-permission'
import { withTiming } from '@/lib/middleware/request-timing'
import { finalizeInvoice } from '@/lib/services/billing/invoice-state.service'

// ── POST /api/billing/invoices/[id]/finalize ─────────────────────────────────

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
    'POST /api/billing/invoices/[id]/finalize',
  )
  if (!allowed) {
    return NextResponse.json(
      { error: 'Insufficient permissions: billing:view required' },
      { status: 403 },
    )
  }

  // Parse optional override flag from request body
  let overrideTaxCheck = false
  try {
    const body = await request.json().catch(() => ({}))
    if (body?.override_tax_check === true) {
      overrideTaxCheck = true
    }
  } catch {
    // Empty or non-JSON body — treat as no override
  }

  const result = await finalizeInvoice({ supabase, invoiceId, tenantId, userId, overrideTaxCheck })

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 422 })
  }

  return NextResponse.json({ success: true, invoiceNumber: result.data?.invoiceNumber })
}

export const POST = withTiming(handlePost, 'POST /api/billing/invoices/[id]/finalize')
