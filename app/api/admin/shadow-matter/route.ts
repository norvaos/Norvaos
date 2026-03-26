import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { withTiming } from '@/lib/middleware/request-timing'
import { initializeShadowMatter } from '@/lib/services/shadow-matter'

/**
 * POST /api/admin/shadow-matter
 *
 * Initialise a shadow matter via Atomic Transfer (Directive 021/023).
 * Clones the client's hardened PII, address history, and personal history
 * from a previous matter into a new "shadow" renewal matter.
 *
 * Body: { contactId, matterTypeId, sourceMatterId?, triggerId? }
 */
async function handlePost(request: Request) {
  try {
    const auth = await authenticateRequest()

    const body = await request.json().catch(() => ({})) as {
      contactId?: string
      matterTypeId?: string
      sourceMatterId?: string
      triggerId?: string
    }

    if (!body.contactId || !body.matterTypeId) {
      return NextResponse.json(
        { error: 'contactId and matterTypeId are required' },
        { status: 400 },
      )
    }

    const result = await initializeShadowMatter({
      contactId: body.contactId,
      tenantId: auth.tenantId,
      userId: auth.userId,
      matterTypeId: body.matterTypeId,
      sourceMatterId: body.sourceMatterId,
      triggerId: body.triggerId,
    })

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      matter_id: result.matter_id,
      matter_number: result.matter_number,
      cloned_addresses: result.cloned_addresses,
      cloned_personal: result.cloned_personal,
      message: 'Shadow matter initialised — Atomic Transfer complete',
    })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error('[shadow-matter] POST error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export const POST = withTiming(handlePost, 'POST /api/admin/shadow-matter')
