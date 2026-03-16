/**
 * GET  /api/collections/payment-plans — List payment plans
 * POST /api/collections/payment-plans — Create a new payment plan
 */

import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import {
  getPaymentPlans,
  createPaymentPlan,
} from '@/lib/services/analytics/collections-service'

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest()
    requirePermission(auth, 'billing', 'view')

    const { searchParams } = new URL(request.url)
    const filters: Record<string, string> = {}
    for (const [key, value] of searchParams.entries()) {
      filters[key] = value
    }

    const data = await getPaymentPlans(auth, filters)

    return NextResponse.json({ success: true, plans: data })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status })
    }
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateRequest()
    requirePermission(auth, 'billing', 'create')

    const body = await request.json()
    const data = await createPaymentPlan(auth, body)

    return NextResponse.json({ success: true, plan: data }, { status: 201 })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status })
    }
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
