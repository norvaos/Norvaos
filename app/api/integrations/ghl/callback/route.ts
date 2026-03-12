import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyGhlState, exchangeGhlCode, encryptToken } from '@/lib/services/ghl/oauth'
import { withTiming } from '@/lib/middleware/request-timing'

async function handleGet(request: NextRequest) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL!
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const stateParam = searchParams.get('state')
  const error = searchParams.get('error')

  if (error) {
    const desc = searchParams.get('error_description') || error
    console.error('[ghl/callback] OAuth error:', desc)
    return NextResponse.redirect(
      new URL(`/settings/data-import?error=${encodeURIComponent(desc)}`, appUrl),
    )
  }

  if (!code || !stateParam) {
    return NextResponse.redirect(
      new URL('/settings/data-import?error=missing_params', appUrl),
    )
  }

  try {
    const state = verifyGhlState(stateParam) as {
      userId: string
      tenantId: string
    }

    const tokens = await exchangeGhlCode(code)

    const accessTokenEncrypted = encryptToken(tokens.access_token)
    const refreshTokenEncrypted = encryptToken(tokens.refresh_token)
    const tokenExpiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString()

    const admin = createAdminClient()
    const { error: upsertError } = await admin
      .from('platform_connections')
      .upsert(
        {
          tenant_id: state.tenantId,
          platform: 'ghl',
          access_token_encrypted: accessTokenEncrypted,
          refresh_token_encrypted: refreshTokenEncrypted,
          token_expires_at: tokenExpiresAt,
          location_id: tokens.locationId ?? null,
          platform_user_id: tokens.userId ?? null,
          is_active: true,
          error_count: 0,
          last_error: null,
          last_error_at: null,
          connected_by: state.userId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'tenant_id,platform' },
      )

    if (upsertError) {
      console.error('[ghl/callback] Upsert error:', upsertError)
      throw new Error('Failed to save GHL connection')
    }

    return NextResponse.redirect(
      new URL('/settings/data-import?connected=ghl', appUrl),
    )
  } catch (err) {
    console.error('[ghl/callback] Error:', err)
    return NextResponse.redirect(
      new URL('/settings/data-import?error=ghl_callback_failed', appUrl),
    )
  }
}

export const GET = withTiming(handleGet, 'GET /api/integrations/ghl/callback')
