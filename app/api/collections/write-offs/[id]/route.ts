/**
 * PATCH /api/collections/write-offs/[id]  -  Approve or reject a write-off
 */

import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import {
  approveWriteOff,
  rejectWriteOff,
} from '@/lib/services/analytics/collections-service'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await authenticateRequest()

    const { id } = await params
    const body = await request.json()
    const { action, reason } = body

    if (!action) {
      return NextResponse.json(
        { success: false, error: 'action is required' },
        { status: 400 },
      )
    }

    let data: unknown

    switch (action) {
      case 'approve':
        requirePermission(auth, 'billing', 'approve')
        data = await approveWriteOff(auth, id)
        break
      case 'reject':
        requirePermission(auth, 'billing', 'edit')
        data = await rejectWriteOff(auth, id, reason ?? 'Rejected')
        break
      default:
        return NextResponse.json(
          { success: false, error: `Unknown action: ${action}` },
          { status: 400 },
        )
    }

    return NextResponse.json({ success: true, write_off: data })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status })
    }
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
