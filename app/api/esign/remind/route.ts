import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import { sendReminder } from '@/lib/services/esign-service'

// ── POST /api/esign/remind ───────────────────────────────────────────────────

async function handlePost(request: Request) {
  let auth: Awaited<ReturnType<typeof authenticateRequest>>

  try {
    auth = await authenticateRequest()
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      )
    }
    return NextResponse.json({ error: 'Authentication failed' }, { status: 401 })
  }

  requirePermission(auth, 'documents', 'edit')

  const { supabase, tenantId, userId } = auth

  try {
    const body = await request.json()
    const { signingRequestId } = body as { signingRequestId: string }

    if (!signingRequestId) {
      return NextResponse.json(
        { error: 'signingRequestId is required' },
        { status: 400 },
      )
    }

    const result = await sendReminder(supabase as never, {
      tenantId,
      signingRequestId,
      sentBy: userId,
    })

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Failed to send reminder' },
        { status: 500 },
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('E-sign remind error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    )
  }
}

export const POST = handlePost
