import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import {
  generateCodeVerifier,
  signGoogleState,
  buildGoogleAuthUrl,
} from '@/lib/services/google-gmail'
import { withTiming } from '@/lib/middleware/request-timing'

/**
 * GET /api/integrations/google/connect
 *
 * Initiates the Google OAuth 2.0 authorization code flow with PKCE.
 * Redirects the user to Google's authorization endpoint.
 */
async function handleGet() {
  try {
    const auth = await authenticateRequest()
    requirePermission(auth, 'settings', 'edit')

    const codeVerifier = generateCodeVerifier()
    const state = signGoogleState({
      userId: auth.userId,
      tenantId: auth.tenantId,
      codeVerifier,
    })

    const authUrl = buildGoogleAuthUrl(state, codeVerifier)
    return NextResponse.redirect(authUrl)
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.redirect(
        new URL('/login', process.env.NEXT_PUBLIC_APP_URL!),
      )
    }
    console.error('[google/connect] Error:', error)
    return NextResponse.redirect(
      new URL('/settings/integrations?error=google_connect_failed', process.env.NEXT_PUBLIC_APP_URL!),
    )
  }
}

export const GET = withTiming(handleGet, 'GET /api/integrations/google/connect')
