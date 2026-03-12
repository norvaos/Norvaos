import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import {
  generateCodeVerifier,
  signState,
  buildAuthUrl,
} from '@/lib/services/microsoft-graph'
import { withTiming } from '@/lib/middleware/request-timing'

/**
 * GET /api/integrations/microsoft/connect
 *
 * Initiates the Microsoft OAuth 2.0 authorization code flow with PKCE.
 * Redirects the user to Microsoft's authorization endpoint.
 */
async function handleGet() {
  try {
    const auth = await authenticateRequest()
    requirePermission(auth, 'settings', 'edit')

    const codeVerifier = generateCodeVerifier()
    const state = signState({
      userId: auth.userId,
      tenantId: auth.tenantId,
      codeVerifier,
    })

    const authUrl = buildAuthUrl(state, codeVerifier)
    return NextResponse.redirect(authUrl)
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.redirect(
        new URL('/login', process.env.NEXT_PUBLIC_APP_URL!)
      )
    }
    console.error('[microsoft/connect] Error:', error)
    return NextResponse.redirect(
      new URL('/settings/integrations?error=connect_failed', process.env.NEXT_PUBLIC_APP_URL!)
    )
  }
}

export const GET = withTiming(handleGet, 'GET /api/integrations/microsoft/connect')
