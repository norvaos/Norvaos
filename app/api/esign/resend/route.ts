import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import { resendRequest } from '@/lib/services/esign-service'
import { createAdminClient } from '@/lib/supabase/admin'

// ── POST /api/esign/resend ───────────────────────────────────────────────────

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

    const admin = createAdminClient()
    const result = await resendRequest(admin as never, {
      tenantId,
      signingRequestId,
      resendBy: userId,
    })

    if (!result.success || !result.data) {
      return NextResponse.json(
        { error: result.error || 'Failed to resend signing request' },
        { status: 500 },
      )
    }

    return NextResponse.json({
      newRequestId: result.data.newRequestId,
    })
  } catch (error) {
    console.error('E-sign resend error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    )
  }
}

export const POST = handlePost
