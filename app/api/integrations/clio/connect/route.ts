import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import { signClioState, buildClioAuthUrl } from '@/lib/services/clio/oauth'
import { withTiming } from '@/lib/middleware/request-timing'

async function handleGet() {
  try {
    const auth = await authenticateRequest()
    requirePermission(auth, 'settings', 'edit')

    const state = signClioState({
      userId: auth.userId,
      tenantId: auth.tenantId,
    })

    const authUrl = buildClioAuthUrl(state)
    return NextResponse.redirect(authUrl)
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }
    console.error('[clio/connect] Error:', error)
    const code = error instanceof Error && error.message.includes('not configured')
      ? 'clio_not_configured'
      : 'clio_connect_failed'
    const message = error instanceof Error && error.message.includes('not configured')
      ? 'Clio integration is not configured. Please set CLIO_CLIENT_ID and CLIO_CLIENT_SECRET environment variables.'
      : 'Failed to connect to Clio. Please try again.'
    return NextResponse.json({ error: code, message }, { status: 400 })
  }
}

export const GET = withTiming(handleGet, 'GET /api/integrations/clio/connect')
