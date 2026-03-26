import { NextResponse } from 'next/server'
import { authenticateRequest } from '@/lib/services/auth'
import { scanMatterDeadlines } from '@/lib/services/deadline-shield'

/**
 * POST /api/deadline-shield/scan
 *
 * Scan a matter for IRCC deadline rules and auto-generate shielded deadlines.
 * Body: { matterId: string }
 */
export async function POST(request: Request) {
  try {
    const auth = await authenticateRequest()

    const body = await request.json()
    const matterId = body?.matterId

    if (!matterId || typeof matterId !== 'string') {
      return NextResponse.json(
        { error: 'matterId is required and must be a string' },
        { status: 400 },
      )
    }

    const result = await scanMatterDeadlines(
      auth.supabase,
      matterId,
      auth.tenantId,
      auth.userId,
    )

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      data: result.data,
    })
  } catch (err) {
    // authenticateRequest throws AuthError for unauthenticated requests
    if (err && typeof err === 'object' && 'status' in err) {
      const authErr = err as { status: number; message: string }
      return NextResponse.json(
        { error: authErr.message },
        { status: authErr.status },
      )
    }
    console.error('[deadline-shield/scan] Unexpected error:', err)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    )
  }
}
