import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { cancelRequest } from '@/lib/services/esign-service'

// ── POST /api/esign/cancel ───────────────────────────────────────────────────

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

  const { supabase, tenantId, userId } = auth

  try {
    const body = await request.json()
    const { signingRequestId, reason } = body as {
      signingRequestId: string
      reason?: string
    }

    if (!signingRequestId) {
      return NextResponse.json(
        { error: 'signingRequestId is required' },
        { status: 400 },
      )
    }

    const result = await cancelRequest(supabase as never, {
      tenantId,
      signingRequestId,
      reason,
      cancelledBy: userId,
    })

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Failed to cancel signing request' },
        { status: 500 },
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('E-sign cancel error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    )
  }
}

export const POST = handlePost
