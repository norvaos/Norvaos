import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import { signGhlState, buildGhlAuthUrl } from '@/lib/services/ghl/oauth'
import { withTiming } from '@/lib/middleware/request-timing'

async function handleGet() {
  try {
    const auth = await authenticateRequest()
    requirePermission(auth, 'settings', 'edit')

    const state = signGhlState({
      userId: auth.userId,
      tenantId: auth.tenantId,
    })

    const authUrl = buildGhlAuthUrl(state)
    return NextResponse.redirect(authUrl)
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }
    console.error('[ghl/connect] Error:', error)
    const code = error instanceof Error && error.message.includes('not configured')
      ? 'ghl_not_configured'
      : 'ghl_connect_failed'
    const message = error instanceof Error && error.message.includes('not configured')
      ? 'Go High Level integration is not configured. Please set GHL_CLIENT_ID and GHL_CLIENT_SECRET environment variables.'
      : 'Failed to connect to Go High Level. Please try again.'
    return NextResponse.json({ error: code, message }, { status: 400 })
  }
}

export const GET = withTiming(handleGet, 'GET /api/integrations/ghl/connect')
