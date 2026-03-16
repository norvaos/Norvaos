/**
 * GET  /api/collections/actions — List collection actions for an invoice
 * POST /api/collections/actions — Log a new collection action
 */

import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import {
  getCollectionActions,
  logCollectionAction,
} from '@/lib/services/analytics/collections-service'

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest()
    requirePermission(auth, 'billing', 'view')

    const { searchParams } = new URL(request.url)
    const invoiceId = searchParams.get('invoice_id')

    if (!invoiceId) {
      return NextResponse.json(
        { success: false, error: 'invoice_id is required' },
        { status: 400 },
      )
    }

    const data = await getCollectionActions(auth, invoiceId)

    return NextResponse.json({ success: true, actions: data })
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
    requirePermission(auth, 'billing', 'edit')

    const body = await request.json()
    const { invoice_id, matter_id, action_type, notes, next_follow_up_date } = body

    if (!invoice_id || !action_type) {
      return NextResponse.json(
        { success: false, error: 'invoice_id and action_type are required' },
        { status: 400 },
      )
    }

    const data = await logCollectionAction(auth, {
      invoice_id,
      matter_id: matter_id ?? null,
      action_type,
      notes: notes ?? null,
      next_follow_up_date: next_follow_up_date ?? null,
    })

    return NextResponse.json({ success: true, action: data }, { status: 201 })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status })
    }
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
