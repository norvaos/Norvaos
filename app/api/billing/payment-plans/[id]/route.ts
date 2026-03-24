import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { checkBillingPermission } from '@/lib/services/billing-permission'
import { withTiming } from '@/lib/middleware/request-timing'
import { approvePaymentPlan, cancelPaymentPlan } from '@/lib/services/billing/payment-plan.service'
import { createAdminClient } from '@/lib/supabase/admin'

// ── GET /api/billing/payment-plans/[id] ──────────────────────────────────────

async function handleGet(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: planId } = await params

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
  const admin = createAdminClient()

  const { allowed } = await checkBillingPermission(
    admin,
    userId,
    tenantId,
    'GET /api/billing/payment-plans/[id]',
  )
  if (!allowed) {
    return NextResponse.json(
      { error: 'Insufficient permissions: billing:view required' },
      { status: 403 },
    )
  }

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const { data: plan, error: planErr } = await (supabase as any)
    .from('payment_plans')
    .select('*')
    .eq('id', planId)
    .eq('tenant_id', tenantId)
    .single()
  /* eslint-enable @typescript-eslint/no-explicit-any */

  if (planErr || !plan) {
    return NextResponse.json({ error: 'Payment plan not found' }, { status: 404 })
  }

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const { data: instalments, error: instErr } = await (supabase as any)
    .from('payment_plan_instalments')
    .select('*')
    .eq('payment_plan_id', planId)
    .eq('tenant_id', tenantId)
    .order('instalment_number', { ascending: true })
  /* eslint-enable @typescript-eslint/no-explicit-any */

  if (instErr) {
    return NextResponse.json({ error: 'Failed to load instalments' }, { status: 500 })
  }

  // Annotate overdue state at query time: pending AND due_date < today
  const today = new Date().toISOString().split('T')[0]
  const annotatedInstalments = (instalments ?? []).map((inst: any) => ({
    ...inst,
    is_overdue: inst.status === 'pending' && inst.due_date < today,
  }))

  return NextResponse.json({ ...plan, instalments: annotatedInstalments })
}

// ── PATCH /api/billing/payment-plans/[id] ────────────────────────────────────
// Body: { action: 'approve' | 'cancel', reason?: string }

async function handlePatch(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: planId } = await params

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
    'PATCH /api/billing/payment-plans/[id]',
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

  const { action, reason } = body

  if (action === 'approve') {
    const result = await approvePaymentPlan({ supabase: admin, tenantId, userId, planId })
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 422 })
    }
    return NextResponse.json({ success: true })
  }

  if (action === 'cancel') {
    const result = await cancelPaymentPlan({
      supabase: admin,
      tenantId,
      userId,
      planId,
      reason: typeof reason === 'string' ? reason : null,
    })
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 422 })
    }
    return NextResponse.json({ success: true })
  }

  return NextResponse.json(
    { error: 'action must be "approve" or "cancel"' },
    { status: 400 },
  )
}

export const GET = withTiming(handleGet, 'GET /api/billing/payment-plans/[id]')
export const PATCH = withTiming(handlePatch, 'PATCH /api/billing/payment-plans/[id]')
