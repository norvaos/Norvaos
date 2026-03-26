import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  verifyState,
  exchangeCodeForTokens,
  getMicrosoftProfile,
  encryptToken,
  MICROSOFT_SCOPES,
} from '@/lib/services/microsoft-graph'
import { ensureNorvaOSRootFolder } from '@/lib/services/microsoft-onedrive'
import { withTiming } from '@/lib/middleware/request-timing'

/**
 * GET /api/integrations/microsoft/callback
 *
 * Handles the OAuth callback from Microsoft.
 * Exchanges the authorization code for tokens, fetches the user profile,
 * encrypts tokens, upserts the microsoft_connections row, and creates the
 * email_accounts row to bridge into the email sync pipeline.
 */
async function handleGet(request: NextRequest) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL!
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const stateParam = searchParams.get('state')
  const error = searchParams.get('error')

  if (error) {
    const desc = searchParams.get('error_description') || error
    console.error('[microsoft/callback] OAuth error:', desc)
    return NextResponse.redirect(
      new URL(`/settings/integrations?error=${encodeURIComponent(desc)}`, appUrl)
    )
  }

  if (!code || !stateParam) {
    return NextResponse.redirect(
      new URL('/settings/integrations?error=missing_params', appUrl)
    )
  }

  try {
    // 1. Verify state and extract payload
    const state = verifyState(stateParam) as {
      userId: string
      tenantId: string
      codeVerifier: string
    }

    // 2. Exchange code for tokens
    const tokens = await exchangeCodeForTokens(code, state.codeVerifier)

    // 3. Fetch Microsoft profile
    const profile = await getMicrosoftProfile(tokens.access_token)

    // 4. Encrypt tokens
    const accessTokenEncrypted = encryptToken(tokens.access_token)
    const refreshTokenEncrypted = encryptToken(tokens.refresh_token)
    const tokenExpiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString()

    // 5. Upsert connection (admin client bypasses RLS)
    const admin = createAdminClient()
    const { error: upsertError } = await admin
      .from('microsoft_connections')
      .upsert(
        {
          user_id: state.userId,
          tenant_id: state.tenantId,
          microsoft_user_id: profile.id,
          microsoft_email: profile.mail || profile.userPrincipalName,
          microsoft_display_name: profile.displayName,
          access_token_encrypted: accessTokenEncrypted,
          refresh_token_encrypted: refreshTokenEncrypted,
          token_expires_at: tokenExpiresAt,
          scopes: MICROSOFT_SCOPES,
          is_active: true,
          error_count: 0,
          last_error: null,
          last_error_at: null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      )

    if (upsertError) {
      console.error('[microsoft/callback] Upsert error:', upsertError)
      throw new Error('Failed to save connection')
    }

    // 6. Update user's calendar provider
    await admin
      .from('users')
      .update({
        calendar_provider: 'microsoft',
        calendar_sync_enabled: true,
      })
      .eq('id', state.userId)

    // 6b. Create/update email_accounts row  -  bridges microsoft_connections to the
    //     email sync pipeline (email-sync.ts reads email_accounts for delta state,
    //     then resolves microsoft_connections for Graph API calls via graphFetch).
    const emailAddress = profile.mail || profile.userPrincipalName
    if (emailAddress) {
      const { error: emailAcctError } = await admin
        .from('email_accounts')
        .upsert(
          {
            tenant_id: state.tenantId,
            user_id: state.userId,
            account_type: 'personal',
            provider: 'microsoft',
            email_address: emailAddress,
            display_name: profile.displayName || null,
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
          { onConflict: 'tenant_id,email_address' }
        )

      if (emailAcctError) {
        // Log but don't fail  -  the microsoft_connections row is already saved
        console.error('[microsoft/callback] email_accounts upsert error:', emailAcctError)
      } else {
        console.log('[microsoft/callback] email_accounts row created/updated for:', emailAddress)
      }
    }

    // 7. Create the NorvaOS root folder in OneDrive (awaited  -  must complete before redirect)
    const { data: connRow } = await admin
      .from('microsoft_connections')
      .select('id')
      .eq('user_id', state.userId)
      .eq('is_active', true)
      .single()

    if (connRow) {
      try {
        console.log('[microsoft/callback] Creating NorvaOS root folder for connection:', connRow.id)
        const folderId = await ensureNorvaOSRootFolder(connRow.id, admin)
        console.log('[microsoft/callback] NorvaOS root folder created/found:', folderId)
      } catch (folderErr) {
        // Log but don't fail the connection  -  folder can be created on first upload
        console.error('[microsoft/callback] Failed to create NorvaOS folder:', folderErr)
      }
    } else {
      console.warn('[microsoft/callback] Could not find connection row after upsert')
    }

    return NextResponse.redirect(
      new URL('/settings/integrations?connected=microsoft', appUrl)
    )
  } catch (err) {
    console.error('[microsoft/callback] Error:', err)
    return NextResponse.redirect(
      new URL('/settings/integrations?error=callback_failed', appUrl)
    )
  }
}

export const GET = withTiming(handleGet, 'GET /api/integrations/microsoft/callback')
