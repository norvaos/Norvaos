import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  verifyGoogleState,
  exchangeGoogleCodeForTokens,
  getGoogleProfile,
  encryptGoogleToken,
  GOOGLE_SCOPES,
} from '@/lib/services/google-gmail'
import { withTiming } from '@/lib/middleware/request-timing'

/**
 * GET /api/integrations/google/callback
 *
 * Handles the OAuth callback from Google.
 * Exchanges the authorization code for tokens, fetches the user profile,
 * encrypts tokens, and creates the email_accounts row for the Gmail sync pipeline.
 */
async function handleGet(request: NextRequest) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL!
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const stateParam = searchParams.get('state')
  const error = searchParams.get('error')

  if (error) {
    const desc = searchParams.get('error_description') || error
    console.error('[google/callback] OAuth error:', desc)
    return NextResponse.redirect(
      new URL(`/settings/integrations?error=${encodeURIComponent(desc)}`, appUrl),
    )
  }

  if (!code || !stateParam) {
    return NextResponse.redirect(
      new URL('/settings/integrations?error=missing_params', appUrl),
    )
  }

  try {
    // 1. Verify state and extract payload
    const state = verifyGoogleState(stateParam) as {
      userId: string
      tenantId: string
      codeVerifier: string
    }

    // 2. Exchange code for tokens
    const tokens = await exchangeGoogleCodeForTokens(code, state.codeVerifier)

    // 3. Fetch Google profile
    const profile = await getGoogleProfile(tokens.access_token)

    // 4. Encrypt tokens
    const accessTokenEncrypted = encryptGoogleToken(tokens.access_token)
    const refreshTokenEncrypted = encryptGoogleToken(tokens.refresh_token)
    const tokenExpiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString()

    // 5. Create/update email_accounts row (admin client bypasses RLS)
    const admin = createAdminClient()
    const { error: upsertError } = await admin
      .from('email_accounts')
      .upsert(
        {
          tenant_id: state.tenantId,
          user_id: state.userId,
          account_type: 'personal',
          provider: 'google',
          email_address: profile.email,
          display_name: profile.name || null,
          encrypted_access_token: accessTokenEncrypted,
          encrypted_refresh_token: refreshTokenEncrypted,
          token_expires_at: tokenExpiresAt,
          authorized_user_ids: [state.userId],
          sync_enabled: true,
          is_active: true,
          error_count: 0,
          last_error: null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'tenant_id,email_address' },
      )

    if (upsertError) {
      console.error('[google/callback] email_accounts upsert error:', upsertError)
      throw new Error('Failed to save Google connection')
    }

    console.log('[google/callback] Gmail account connected:', profile.email)

    return NextResponse.redirect(
      new URL('/settings/integrations?connected=google', appUrl),
    )
  } catch (err) {
    console.error('[google/callback] Error:', err)
    return NextResponse.redirect(
      new URL('/settings/integrations?error=google_callback_failed', appUrl),
    )
  }
}

export const GET = withTiming(handleGet, 'GET /api/integrations/google/callback')
