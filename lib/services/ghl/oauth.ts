/**
 * Go High Level OAuth 2.0 integration.
 *
 * Uses the GHL Marketplace OAuth flow.
 * Docs: https://marketplace.gohighlevel.com/docs/Authorization
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'
import type { TokenResponse } from '@/lib/services/oauth/types'
import { encryptToken, decryptToken, signState, verifyState } from '@/lib/services/oauth/encryption'

const GHL_AUTH_URL = 'https://marketplace.gohighlevel.com/oauth/chooselocation'
const GHL_TOKEN_URL = 'https://services.leadconnectorhq.com/oauth/token'

export const GHL_SCOPES = [
  'contacts.readonly',
  'contacts.write',
  'opportunities.readonly',
  'conversations.readonly',
  'conversations/message.readonly',
  'calendars.readonly',
  'calendars/events.readonly',
  'locations.readonly',
  'locations/tags.readonly',
  'locations/customFields.readonly',
  'invoices.readonly',
  'businesses.readonly',
  'medias.readonly',
  'forms.readonly',
  'surveys.readonly',
  'users.readonly',
  'payments.readonly',
]

function getConfig() {
  const clientId = process.env.GHL_CLIENT_ID
  const clientSecret = process.env.GHL_CLIENT_SECRET
  const appUrl = process.env.NEXT_PUBLIC_APP_URL

  if (!clientId || !clientSecret || !appUrl) {
    throw new Error(
      'GHL integration not configured. Set GHL_CLIENT_ID, GHL_CLIENT_SECRET, and NEXT_PUBLIC_APP_URL.',
    )
  }

  return {
    clientId,
    clientSecret,
    redirectUri: `${appUrl}/api/integrations/ghl/callback`,
  }
}

export function buildGhlAuthUrl(state: string): string {
  const { clientId, redirectUri } = getConfig()

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: GHL_SCOPES.join(' '),
    state,
  })

  return `${GHL_AUTH_URL}?${params.toString()}`
}

export async function exchangeGhlCode(code: string): Promise<TokenResponse & { locationId?: string; userId?: string }> {
  const { clientId, clientSecret } = getConfig()

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'authorization_code',
    code,
  })

  const res = await fetch(GHL_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(`GHL token exchange failed: ${err.error_description || err.error || res.statusText}`)
  }

  const data = await res.json()
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_in: data.expires_in ?? 86400,
    scope: data.scope,
    locationId: data.locationId,
    userId: data.userId,
  }
}

export async function refreshGhlToken(encryptedRefreshToken: string): Promise<TokenResponse> {
  const { clientId, clientSecret } = getConfig()
  const refreshToken = decryptToken(encryptedRefreshToken)

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  })

  const res = await fetch(GHL_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(`GHL token refresh failed: ${err.error_description || err.error || res.statusText}`)
  }

  return res.json()
}

export async function getValidGhlToken(
  connectionId: string,
  admin: SupabaseClient<Database>,
): Promise<{ accessToken: string; locationId: string }> {
  const { data: conn } = await admin
    .from('platform_connections')
    .select('access_token_encrypted, refresh_token_encrypted, token_expires_at, location_id')
    .eq('id', connectionId)
    .eq('platform', 'ghl')
    .eq('is_active', true)
    .single()

  if (!conn) {
    throw new Error('GHL connection not found or inactive')
  }

  const expiresAt = new Date(conn.token_expires_at).getTime()
  const bufferMs = 5 * 60 * 1000

  if (Date.now() < expiresAt - bufferMs) {
    return {
      accessToken: decryptToken(conn.access_token_encrypted),
      locationId: conn.location_id ?? '',
    }
  }

  // Refresh the token
  const tokens = await refreshGhlToken(conn.refresh_token_encrypted)
  const newExpiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString()

  await admin
    .from('platform_connections')
    .update({
      access_token_encrypted: encryptToken(tokens.access_token),
      refresh_token_encrypted: encryptToken(tokens.refresh_token),
      token_expires_at: newExpiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq('id', connectionId)

  return {
    accessToken: tokens.access_token,
    locationId: conn.location_id ?? '',
  }
}

export function signGhlState(payload: Record<string, unknown>): string {
  const { clientSecret } = getConfig()
  return signState(payload, clientSecret)
}

export function verifyGhlState(state: string): Record<string, unknown> {
  const { clientSecret } = getConfig()
  return verifyState(state, clientSecret)
}

export { encryptToken }
