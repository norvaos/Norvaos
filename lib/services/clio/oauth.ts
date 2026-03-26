/**
 * Clio OAuth 2.0 integration.
 *
 * Docs: https://docs.developers.clio.com/api-reference/#section/Authorization
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'
import type { TokenResponse } from '@/lib/services/oauth/types'
import { encryptToken, decryptToken, signState, verifyState } from '@/lib/services/oauth/encryption'
import { log } from '@/lib/utils/logger'

const CLIO_AUTH_URL = 'https://app.clio.com/oauth/authorize'
const CLIO_TOKEN_URL = 'https://app.clio.com/oauth/token'

function getConfig() {
  const clientId = process.env.CLIO_CLIENT_ID
  const clientSecret = process.env.CLIO_CLIENT_SECRET
  const appUrl = process.env.NEXT_PUBLIC_APP_URL

  if (!clientId || !clientSecret || !appUrl) {
    throw new Error(
      'Clio integration not configured. Set CLIO_CLIENT_ID, CLIO_CLIENT_SECRET, and NEXT_PUBLIC_APP_URL.',
    )
  }

  return {
    clientId,
    clientSecret,
    redirectUri: `${appUrl}/api/integrations/clio/callback`,
  }
}

export function buildClioAuthUrl(state: string): string {
  const { clientId, redirectUri } = getConfig()

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    state,
  })

  return `${CLIO_AUTH_URL}?${params.toString()}`
}

export async function exchangeClioCode(code: string): Promise<TokenResponse> {
  const { clientId, clientSecret, redirectUri } = getConfig()

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
  })

  const res = await fetch(CLIO_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(`Clio token exchange failed: ${err.error_description || err.error || res.statusText}`)
  }

  return res.json()
}

export async function refreshClioToken(encryptedRefreshToken: string): Promise<TokenResponse> {
  const { clientId, clientSecret } = getConfig()
  const refreshToken = decryptToken(encryptedRefreshToken)

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  })

  const res = await fetch(CLIO_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(`Clio token refresh failed: ${err.error_description || err.error || res.statusText}`)
  }

  return res.json()
}

/**
 * Thrown when a Clio connection cannot be used because the token is invalid
 * and refresh has either failed or been exhausted.
 * The connection is marked disconnected in platform_connections before this is thrown.
 */
export class ClioConnectionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ClioConnectionError'
  }
}

/**
 * Returns a valid Clio access token for the given connection, refreshing
 * proactively (5-minute buffer) or on demand when force=true.
 *
 * If the refresh token is revoked or expired, marks the connection as
 * disconnected (status='disconnected', is_active=false) and throws
 * ClioConnectionError. Callers must not retry after this error.
 */
export async function getValidClioToken(
  connectionId: string,
  admin: SupabaseClient<Database>,
  { force = false }: { force?: boolean } = {},
): Promise<string> {
  const { data: conn } = await admin
    .from('platform_connections')
    .select('access_token_encrypted, refresh_token_encrypted, token_expires_at')
    .eq('id', connectionId)
    .eq('platform', 'clio')
    .eq('is_active', true)
    .single()

  if (!conn) {
    throw new ClioConnectionError('Clio connection not found or inactive')
  }

  const expiresAt = new Date(conn.token_expires_at).getTime()
  const bufferMs = 5 * 60 * 1000

  if (!force && Date.now() < expiresAt - bufferMs) {
    return decryptToken(conn.access_token_encrypted)
  }

  // Refresh the token  -  wrap in try/catch to catch revoked/expired refresh tokens
  try {
    const tokens = await refreshClioToken(conn.refresh_token_encrypted)
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

    return tokens.access_token
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)

    // Mark the connection inactive so subsequent calls fail fast without looping
    await admin
      .from('platform_connections')
      .update({
        status: 'disconnected',
        is_active: false,
        updated_at: new Date().toISOString(),
      })
      .eq('id', connectionId)

    log.error('clio.oauth.refresh_failed', {
      connection_id: connectionId,
      error_message: message,
    })

    throw new ClioConnectionError(
      `Clio connection disconnected: token refresh failed  -  ${message}`,
    )
  }
}

/**
 * Fetch Clio user profile for display name and email.
 */
export async function getClioProfile(accessToken: string): Promise<{ id: number; name: string; email: string }> {
  const res = await fetch('https://app.clio.com/api/v4/users/who_am_i.json?fields=id,name,email', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (!res.ok) {
    throw new Error('Failed to fetch Clio profile')
  }

  const data = await res.json()
  return data.data
}

export function signClioState(payload: Record<string, unknown>): string {
  const { clientSecret } = getConfig()
  return signState(payload, clientSecret)
}

export function verifyClioState(state: string): Record<string, unknown> {
  const { clientSecret } = getConfig()
  return verifyState(state, clientSecret)
}

export { encryptToken }
