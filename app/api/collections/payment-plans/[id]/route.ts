/**
 * GET   /api/collections/payment-plans/[id] — Get a single payment plan
 * PATCH /api/collections/payment-plans/[id] — Perform an action on a payment plan
 *   Actions: approve, record_payment, cancel, default
 */

import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  getPaymentPlans,
  approvePaymentPlan,
  recordInstalmentPayment,
} from '@/lib/services/analytics/collections-service'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await authenticateRequest()
    requirePermission(auth, 'billing', 'view')

    const { id } = await params
    const result = await getPaymentPlans(auth, {})
    const plan = result.data?.find((p) => p.id === id) ?? null

    return NextResponse.json({ success: true, plan })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status })
    }
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await authenticateRequest()
    requirePermission(auth, 'billing', 'edit')

    const { id } = await params
    const body = await request.json()
    const { action, ...payload } = body

    if (!action) {
      return NextResponse.json(
        { success: false, error: 'action is required' },
        { status: 400 },
      )
    }

    let data: unknown

    switch (action) {
      case 'approve':
        data = await approvePaymentPlan(auth, id)
        break
      case 'record_payment':
        data = await recordInstalmentPayment(auth, id)
        break
      case 'cancel':
      case 'default': {
        const newStatus = action === 'cancel' ? 'cancelled' : 'defaulted'
        const admin = createAdminClient()
        const { error: updateError } = await (admin as any)
          .from('payment_plans')
          .update({ status: newStatus })
          .eq('id', id)
          .eq('tenant_id', auth.tenantId)
        if (updateError) {
          return NextResponse.json(
            { success: false, error: `Failed to update plan: ${updateError.message}` },
            { status: 500 },
          )
        }
        data = { status: newStatus }
        break
      }
      default:
        return NextResponse.json(
          { success: false, error: `Unknown action: ${action}` },
          { status: 400 },
        )
    }

    return NextResponse.json({ success: true, plan: data })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status })
    }
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
