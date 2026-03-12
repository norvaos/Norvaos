import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyClioState, exchangeClioCode, getClioProfile, encryptToken } from '@/lib/services/clio/oauth'
import { withTiming } from '@/lib/middleware/request-timing'

async function handleGet(request: NextRequest) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL!
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const stateParam = searchParams.get('state')
  const error = searchParams.get('error')

  if (error) {
    const desc = searchParams.get('error_description') || error
    console.error('[clio/callback] OAuth error:', desc)
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
    const state = verifyClioState(stateParam) as {
      userId: string
      tenantId: string
    }

    const tokens = await exchangeClioCode(code)
    const profile = await getClioProfile(tokens.access_token)

    const accessTokenEncrypted = encryptToken(tokens.access_token)
    const refreshTokenEncrypted = encryptToken(tokens.refresh_token)
    const tokenExpiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString()

    const admin = createAdminClient()
    const { error: upsertError } = await admin
      .from('platform_connections')
      .upsert(
        {
          tenant_id: state.tenantId,
          platform: 'clio',
          access_token_encrypted: accessTokenEncrypted,
          refresh_token_encrypted: refreshTokenEncrypted,
          token_expires_at: tokenExpiresAt,
          platform_user_id: String(profile.id),
          platform_user_name: profile.name,
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
      console.error('[clio/callback] Upsert error:', upsertError)
      throw new Error('Failed to save Clio connection')
    }

    return NextResponse.redirect(
      new URL('/settings/data-import?connected=clio', appUrl),
    )
  } catch (err) {
    console.error('[clio/callback] Error:', err)
    return NextResponse.redirect(
      new URL('/settings/data-import?error=clio_callback_failed', appUrl),
    )
  }
}

export const GET = withTiming(handleGet, 'GET /api/integrations/clio/callback')
