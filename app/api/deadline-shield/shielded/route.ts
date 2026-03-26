import { NextResponse } from 'next/server'
import { authenticateRequest } from '@/lib/services/auth'
import { getShieldedDeadlines } from '@/lib/services/deadline-shield'

/**
 * GET /api/deadline-shield/shielded
 *
 * List all shielded deadlines for the authenticated tenant.
 * Query params: matterId (optional — scope to a single matter)
 */
export async function GET(request: Request) {
  try {
    const auth = await authenticateRequest()

    const { searchParams } = new URL(request.url)
    const matterId = searchParams.get('matterId') ?? undefined

    const result = await getShieldedDeadlines(
      auth.supabase,
      auth.tenantId,
      matterId,
    )

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      deadlines: result.data,
    })
  } catch (err) {
    if (err && typeof err === 'object' && 'status' in err) {
      const authErr = err as { status: number; message: string }
      return NextResponse.json(
        { error: authErr.message },
        { status: authErr.status },
      )
    }
    console.error('[deadline-shield/shielded] Unexpected error:', err)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    )
  }
}
