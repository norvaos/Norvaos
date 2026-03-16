import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'

// ─── Configuration ───────────────────────────────────────────────────────────

const MICROSOFT_AUTH_URL = 'https://login.microsoftonline.com'
const MICROSOFT_GRAPH_URL = 'https://graph.microsoft.com/v1.0'

function getConfig() {
  const clientId = process.env.MICROSOFT_CLIENT_ID
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET
  const tenantId = process.env.MICROSOFT_TENANT_ID || 'common'
  const encryptionKey = process.env.MICROSOFT_TOKEN_ENCRYPTION_KEY
  const appUrl = process.env.NEXT_PUBLIC_APP_URL

  if (!clientId || !clientSecret || !encryptionKey || !appUrl) {
    throw new Error('Microsoft 365 integration is not configured. Set MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET, MICROSOFT_TOKEN_ENCRYPTION_KEY, and NEXT_PUBLIC_APP_URL.')
  }

  return {
    clientId,
    clientSecret,
    tenantId,
    encryptionKey,
    redirectUri: `${appUrl}/api/integrations/microsoft/callback`,
  }
}

// ─── Scopes ──────────────────────────────────────────────────────────────────

export const MICROSOFT_SCOPES = [
  'openid',
  'profile',
  'email',
  'offline_access',
  'User.Read',
  'Mail.ReadWrite',
  'Mail.Send',
  'Calendars.ReadWrite',
  'Tasks.ReadWrite',
  'Files.ReadWrite.All',
]

// ─── Token Encryption (AES-256-GCM) ─────────────────────────────────────────

export function encryptToken(plaintext: string): string {
  const { encryptionKey } = getConfig()
  const key = Buffer.from(encryptionKey, 'base64')
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`
}

export function decryptToken(encrypted: string): string {
  const { encryptionKey } = getConfig()
  const key = Buffer.from(encryptionKey, 'base64')
  const [ivHex, authTagHex, ciphertextHex] = encrypted.split(':')
  const iv = Buffer.from(ivHex, 'hex')
  const authTag = Buffer.from(authTagHex, 'hex')
  const ciphertext = Buffer.from(ciphertextHex, 'hex')
  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(authTag)
  return decipher.update(ciphertext) + decipher.final('utf8')
}

// ─── PKCE Helpers ────────────────────────────────────────────────────────────

export function generateCodeVerifier(): string {
  return randomBytes(64).toString('base64url')
}

export function generateCodeChallenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url')
}

// ─── State JWT (simple HMAC-signed JSON) ─────────────────────────────────────

export function signState(payload: Record<string, unknown>): string {
  const { clientSecret } = getConfig()
  const data = JSON.stringify({ ...payload, exp: Date.now() + 10 * 60 * 1000 })
  const encoded = Buffer.from(data).toString('base64url')
  const sig = createHash('sha256')
    .update(encoded + clientSecret)
    .digest('base64url')
  return `${encoded}.${sig}`
}

export function verifyState(state: string): Record<string, unknown> {
  const { clientSecret } = getConfig()
  const [encoded, sig] = state.split('.')
  const expectedSig = createHash('sha256')
    .update(encoded + clientSecret)
    .digest('base64url')
  if (sig !== expectedSig) {
    throw new Error('Invalid state signature')
  }
  const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString())
  if (payload.exp < Date.now()) {
    throw new Error('State has expired')
  }
  return payload
}

// ─── OAuth URL ───────────────────────────────────────────────────────────────

export function buildAuthUrl(state: string, codeVerifier: string): string {
  const { clientId, tenantId, redirectUri } = getConfig()
  const codeChallenge = generateCodeChallenge(codeVerifier)

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    scope: MICROSOFT_SCOPES.join(' '),
    response_mode: 'query',
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    prompt: 'consent',
  })

  return `${MICROSOFT_AUTH_URL}/${tenantId}/oauth2/v2.0/authorize?${params.toString()}`
}

// ─── Token Exchange ──────────────────────────────────────────────────────────

export interface TokenResponse {
  access_token: string
  refresh_token: string
  expires_in: number
  scope: string
}

export async function exchangeCodeForTokens(
  code: string,
  codeVerifier: string
): Promise<TokenResponse> {
  const { clientId, clientSecret, tenantId, redirectUri } = getConfig()

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
    code_verifier: codeVerifier,
  })

  const res = await fetch(`${MICROSOFT_AUTH_URL}/${tenantId}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(`Token exchange failed: ${err.error_description || res.statusText}`)
  }

  return res.json()
}

export async function refreshAccessToken(
  encryptedRefreshToken: string
): Promise<TokenResponse> {
  const { clientId, clientSecret, tenantId } = getConfig()
  const refreshToken = decryptToken(encryptedRefreshToken)

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
    scope: MICROSOFT_SCOPES.join(' '),
  })

  const res = await fetch(`${MICROSOFT_AUTH_URL}/${tenantId}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(`Token refresh failed: ${err.error_description || res.statusText}`)
  }

  return res.json()
}

// ─── Valid Access Token (auto-refresh) ───────────────────────────────────────

export async function getValidAccessToken(
  connectionId: string,
  adminClient: SupabaseClient<Database>
): Promise<string> {
  const { data: conn } = await adminClient
    .from('microsoft_connections')
    .select('access_token_encrypted, refresh_token_encrypted, token_expires_at')
    .eq('id', connectionId)
    .eq('is_active', true)
    .single()

  if (!conn) {
    throw new Error('Microsoft connection not found or inactive')
  }

  // Check if token is expired (with 5-minute buffer)
  const expiresAt = new Date(conn.token_expires_at).getTime()
  const bufferMs = 5 * 60 * 1000

  if (Date.now() < expiresAt - bufferMs) {
    return decryptToken(conn.access_token_encrypted)
  }

  // Refresh the token
  const tokens = await refreshAccessToken(conn.refresh_token_encrypted)
  const newExpiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString()

  await adminClient
    .from('microsoft_connections')
    .update({
      access_token_encrypted: encryptToken(tokens.access_token),
      refresh_token_encrypted: encryptToken(tokens.refresh_token),
      token_expires_at: newExpiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq('id', connectionId)

  return tokens.access_token
}

// ─── Graph API Client ────────────────────────────────────────────────────────

// Maximum 429 retry attempts before giving up. Does not count the initial request.
const MAX_GRAPH_RATE_LIMIT_RETRIES = 5

export interface GraphFetchOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  body?: unknown
  params?: Record<string, string>
}

/**
 * Make an authenticated request to the Microsoft Graph API.
 *
 * 429 handling: respects Retry-After, bounded to MAX_GRAPH_RATE_LIMIT_RETRIES
 * attempts. Replaces the previous unbounded recursive retry that could exhaust
 * the call stack under sustained Graph API throttling.
 *
 * Non-429 4xx responses are thrown immediately as GraphError (non-retryable).
 * The proactive token refresh in getValidAccessToken is not changed.
 */
export async function graphFetch<T = unknown>(
  connectionId: string,
  adminClient: SupabaseClient<Database>,
  path: string,
  options: GraphFetchOptions = {}
): Promise<T> {
  const { method = 'GET', body, params } = options
  const accessToken = await getValidAccessToken(connectionId, adminClient)

  let url = path.startsWith('http') ? path : `${MICROSOFT_GRAPH_URL}/${path}`
  if (params) {
    const searchParams = new URLSearchParams(params)
    url += (url.includes('?') ? '&' : '?') + searchParams.toString()
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  }

  let rateLimit429Count = 0

  while (true) {
    const res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    })

    // Rate limiting — bounded retry respecting Retry-After header
    if (res.status === 429) {
      if (rateLimit429Count >= MAX_GRAPH_RATE_LIMIT_RETRIES) {
        throw new GraphError(
          `Graph API rate limit exhausted after ${MAX_GRAPH_RATE_LIMIT_RETRIES} retries`,
          429,
        )
      }
      rateLimit429Count++
      const retryAfterSec = parseInt(res.headers.get('Retry-After') || '5', 10)
      await new Promise<void>((resolve) => setTimeout(resolve, retryAfterSec * 1000))
      continue
    }

    // Handle 204 No Content (common for DELETE)
    if (res.status === 204) {
      return undefined as T
    }

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new GraphError(
        err.error?.message || `Graph API error: ${res.status}`,
        res.status,
        err.error?.code
      )
    }

    return res.json()
  }
}

// ─── Microsoft Profile ───────────────────────────────────────────────────────

export interface MicrosoftProfile {
  id: string
  displayName: string
  mail: string | null
  userPrincipalName: string
}

export async function getMicrosoftProfile(accessToken: string): Promise<MicrosoftProfile> {
  const res = await fetch(`${MICROSOFT_GRAPH_URL}/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (!res.ok) {
    const errorBody = await res.text()
    console.error('[microsoft/profile] Graph /me failed:', res.status, errorBody)
    throw new Error(`Failed to fetch Microsoft profile: ${res.status} ${errorBody}`)
  }

  return res.json()
}

// ─── Error Class ─────────────────────────────────────────────────────────────

export class GraphError extends Error {
  status: number
  code: string | undefined

  constructor(message: string, status: number, code?: string) {
    super(message)
    this.name = 'GraphError'
    this.status = status
    this.code = code
  }
}
