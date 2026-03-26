import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import { withTiming } from '@/lib/middleware/request-timing'
import { executeEmergencyOverride, type OverrideType } from '@/lib/services/emergency-override'

async function handlePost(request: Request) {
  try {
    const auth = await authenticateRequest()
    requirePermission(auth, 'settings', 'edit')

    const body = await request.json()
    const { partnerPin, overrideType, matterId, reason } = body as {
      partnerPin: string
      overrideType: OverrideType
      matterId: string
      reason: string
    }

    if (!partnerPin || !overrideType || !matterId || !reason) {
      return NextResponse.json(
        { error: 'Missing required fields: partnerPin, overrideType, matterId, reason' },
        { status: 400 }
      )
    }

    const validTypes: OverrideType[] = ['TRUST_OVERDRAFT', 'GENESIS_BYPASS', 'DEADLINE_OVERRIDE', 'CLOSING_OVERRIDE']
    if (!validTypes.includes(overrideType)) {
      return NextResponse.json(
        { error: `Invalid override type. Must be one of: ${validTypes.join(', ')}` },
        { status: 400 }
      )
    }

    const result = await executeEmergencyOverride({
      tenantId: auth.tenantId,
      userId: auth.userId,
      partnerPin,
      overrideType,
      matterId,
      reason,
    })

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 403 })
    }

    return NextResponse.json({
      success: true,
      overrideHash: result.overrideHash,
      message: `Emergency override executed. Hash: ${result.overrideHash.slice(0, 16)}...`,
    })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error('[emergency-override] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export const POST = withTiming(handlePost, 'POST /api/admin/emergency-override')
