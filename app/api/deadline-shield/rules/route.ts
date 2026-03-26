import { NextResponse } from 'next/server'
import { authenticateRequest } from '@/lib/services/auth'
import { getIRCCRules } from '@/lib/services/deadline-shield'

/**
 * GET /api/deadline-shield/rules
 *
 * List all IRCC deadline rules.
 * Query params: practiceArea (optional), isActive (optional: 'true' | 'false')
 */
export async function GET(request: Request) {
  try {
    const auth = await authenticateRequest()

    const { searchParams } = new URL(request.url)
    const practiceArea = searchParams.get('practiceArea') ?? undefined
    const isActiveParam = searchParams.get('isActive')
    const isActive =
      isActiveParam === 'true'
        ? true
        : isActiveParam === 'false'
          ? false
          : undefined

    const result = await getIRCCRules(auth.supabase, {
      practiceArea,
      isActive,
    })

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      rules: result.data,
    })
  } catch (err) {
    if (err && typeof err === 'object' && 'status' in err) {
      const authErr = err as { status: number; message: string }
      return NextResponse.json(
        { error: authErr.message },
        { status: authErr.status },
      )
    }
    console.error('[deadline-shield/rules] Unexpected error:', err)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    )
  }
}
