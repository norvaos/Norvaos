import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { withTiming } from '@/lib/middleware/request-timing'

/**
 * GET /api/auth/extension-token
 *
 * Returns the current user's Supabase access token for use by the
 * Norva-Bridge Chrome Extension. The extension uses this token in
 * Authorization headers when calling automation-payload and other APIs.
 *
 * Auth: relies on the Supabase session cookie (same-origin or CORS with
 * credentials). No Bearer token required  -  this is the bootstrap endpoint.
 *
 * CORS: Allows requests from the Chrome extension origin.
 */
async function handleGet(request: Request) {
  // CORS preflight is handled by the OPTIONS export below and next.config.ts headers.
  // For the actual request, we add CORS headers to the response.
  const origin = request.headers.get('origin') || ''
  const corsHeaders: Record<string, string> = {}

  // Allow chrome-extension:// origins (the Norva-Bridge extension)
  if (origin.startsWith('chrome-extension://')) {
    corsHeaders['Access-Control-Allow-Origin'] = origin
    corsHeaders['Access-Control-Allow-Credentials'] = 'true'
  }

  try {
    const supabase = await createServerSupabaseClient()
    const { data: { session }, error } = await supabase.auth.getSession()

    if (error || !session) {
      return NextResponse.json(
        { success: false, error: 'Not authenticated' },
        { status: 401, headers: corsHeaders }
      )
    }

    return NextResponse.json(
      {
        success: true,
        accessToken: session.access_token,
        expiresAt: session.expires_at,
        refreshToken: session.refresh_token,
      },
      { headers: corsHeaders }
    )
  } catch (error) {
    console.error('Extension token error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500, headers: corsHeaders }
    )
  }
}

/**
 * OPTIONS  -  CORS preflight for Chrome extension requests.
 */
async function handleOptions(request: Request) {
  const origin = request.headers.get('origin') || ''
  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  }

  if (origin.startsWith('chrome-extension://')) {
    headers['Access-Control-Allow-Origin'] = origin
    headers['Access-Control-Allow-Credentials'] = 'true'
  }

  return new Response(null, { status: 204, headers })
}

export const GET = withTiming(handleGet, 'GET /api/auth/extension-token')
export const OPTIONS = handleOptions
