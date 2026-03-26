/**
 * POST /api/collections/write-offs  -  Request a write-off
 */

import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import { requestWriteOff } from '@/lib/services/analytics/collections-service'

export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateRequest()
    requirePermission(auth, 'billing', 'edit')

    const body = await request.json()
    const { invoice_id, amount_cents, reason } = body

    if (!invoice_id || !amount_cents || !reason) {
      return NextResponse.json(
        { success: false, error: 'invoice_id, amount_cents, and reason are required' },
        { status: 400 },
      )
    }

    const data = await requestWriteOff(auth, invoice_id, amount_cents, reason)

    return NextResponse.json({ success: true, write_off: data }, { status: 201 })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status })
    }
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
