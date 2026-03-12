/**
 * PATCH /api/document-engine/signature/signers/[signerId] — Update signer status
 */

import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import { createAdminClient } from '@/lib/supabase/admin'
import { updateSignerStatus, sendSignerReminder } from '@/lib/services/document-engine'

type RouteParams = { params: Promise<{ signerId: string }> }

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const auth = await authenticateRequest()
    requirePermission(auth, 'document_generation', 'edit')
    const { signerId } = await params
    const body = await request.json()

    const adminClient = createAdminClient()

    if (body.action === 'send_reminder') {
      const result = await sendSignerReminder(adminClient, {
        tenantId: auth.tenantId,
        signerId,
        requestId: body.requestId,
        note: body.note,
        performedBy: auth.userId,
      })
      if (!result.success) {
        return NextResponse.json({ success: false, error: result.error }, { status: 400 })
      }
      return NextResponse.json({ success: true })
    }

    if (!body.status) {
      return NextResponse.json({ success: false, error: 'status is required' }, { status: 400 })
    }

    const result = await updateSignerStatus(adminClient, {
      tenantId: auth.tenantId,
      signerId,
      newStatus: body.status,
      note: body.note,
      declineReason: body.declineReason,
      performedBy: auth.userId,
    })

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status })
    }
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
