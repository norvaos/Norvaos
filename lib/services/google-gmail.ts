import { createHash, randomBytes } from 'crypto'
import { encryptToken, decryptToken } from '@/lib/services/microsoft-graph'

// ─── Configuration ───────────────────────────────────────────────────────────

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GOOGLE_API_URL = 'https://www.googleapis.com'

function getGoogleConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  const appUrl = process.env.NEXT_PUBLIC_APP_URL

  if (!clientId || !clientSecret || !appUrl) {
    throw new Error('Google integration is not configured. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and NEXT_PUBLIC_APP_URL.')
  }

  return {
    clientId,
    clientSecret,
    redirectUri: `${appUrl}/api/integrations/google/callback`,
  }
}

// ─── Scopes ──────────────────────────────────────────────────────────────────

export const GOOGLE_SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/gmail.labels',
]

// ─── Token Encryption (reuses Microsoft's AES-256-GCM via shared key) ────────
// We reuse encryptToken/decryptToken from microsoft-graph.ts which uses
// MICROSOFT_TOKEN_ENCRYPTION_KEY. Both providers share the same encryption infra.

export { encryptToken as encryptGoogleToken, decryptToken as decryptGoogleToken }

// ─── PKCE Helpers ────────────────────────────────────────────────────────────

export function generateCodeVerifier(): string {
  return randomBytes(64).toString('base64url')
}

export function generateCodeChallenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url')
}

// ─── State (simple HMAC-signed JSON) ─────────────────────────────────────────

export function signGoogleState(payload: Record<string, unknown>): string {
  const { clientSecret } = getGoogleConfig()
  const data = JSON.stringify({ ...payload, exp: Date.now() + 10 * 60 * 1000 })
  const encoded = Buffer.from(data).toString('base64url')
  const sig = createHash('sha256')
    .update(encoded + clientSecret)
    .digest('base64url')
  return `${encoded}.${sig}`
}

export function verifyGoogleState(state: string): Record<string, unknown> {
  const { clientSecret } = getGoogleConfig()
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

export function buildGoogleAuthUrl(state: string, codeVerifier: string): string {
  const { clientId, redirectUri } = getGoogleConfig()
  const codeChallenge = generateCodeChallenge(codeVerifier)

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    scope: GOOGLE_SCOPES.join(' '),
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
  })

  return `${GOOGLE_AUTH_URL}?${params.toString()}`
}

// ─── Token Exchange ──────────────────────────────────────────────────────────

export interface GoogleTokenResponse {
  access_token: string
  refresh_token: string
  expires_in: number
  scope: string
  token_type: string
  id_token?: string
}

export async function exchangeGoogleCodeForTokens(
  code: string,
  codeVerifier: string,
): Promise<GoogleTokenResponse> {
  const { clientId, clientSecret, redirectUri } = getGoogleConfig()

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
    code_verifier: codeVerifier,
  })

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(`Google token exchange failed: ${err.error_description || res.statusText}`)
  }

  return res.json()
}

// ─── Token Refresh ───────────────────────────────────────────────────────────

export async function refreshGoogleAccessToken(
  encryptedRefreshToken: string,
): Promise<GoogleTokenResponse> {
  const { clientId, clientSecret } = getGoogleConfig()
  const refreshToken = decryptToken(encryptedRefreshToken)

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  })

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(`Google token refresh failed: ${err.error_description || res.statusText}`)
  }

  const data = await res.json()
  // Google doesn't return refresh_token on refresh - reuse existing
  return {
    ...data,
    refresh_token: data.refresh_token || decryptToken(encryptedRefreshToken),
  }
}

// ─── Google Profile ──────────────────────────────────────────────────────────

export interface GoogleProfile {
  id: string
  email: string
  name: string
  picture?: string
}

export async function getGoogleProfile(accessToken: string): Promise<GoogleProfile> {
  const res = await fetch(`${GOOGLE_API_URL}/oauth2/v2/userinfo`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (!res.ok) {
    throw new Error(`Failed to fetch Google profile: ${res.statusText}`)
  }

  return res.json()
}

// ─── Gmail API Helpers ───────────────────────────────────────────────────────

export interface GmailMessage {
  id: string
  threadId: string
  labelIds: string[]
  snippet: string
  internalDate: string
  payload: {
    headers: Array<{ name: string; value: string }>
    mimeType: string
    body?: { data?: string; size: number }
    parts?: Array<{
      mimeType: string
      filename?: string
      body?: { data?: string; size: number; attachmentId?: string }
    }>
  }
}

export interface GmailListResponse {
  messages?: Array<{ id: string; threadId: string }>
  nextPageToken?: string
  resultSizeEstimate: number
}

/**
 * List messages from Gmail inbox (incremental via historyId or pageToken).
 */
export async function listGmailMessages(
  accessToken: string,
  opts: { maxResults?: number; pageToken?: string; query?: string } = {},
): Promise<GmailListResponse> {
  const params = new URLSearchParams({
    maxResults: String(opts.maxResults ?? 20),
  })
  if (opts.pageToken) params.set('pageToken', opts.pageToken)
  if (opts.query) params.set('q', opts.query)

  const res = await fetch(
    `${GOOGLE_API_URL}/gmail/v1/users/me/messages?${params.toString()}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  )

  if (!res.ok) {
    throw new Error(`Gmail list failed: ${res.statusText}`)
  }

  return res.json()
}

/**
 * Get a single Gmail message by ID with full payload.
 */
export async function getGmailMessage(
  accessToken: string,
  messageId: string,
): Promise<GmailMessage> {
  const res = await fetch(
    `${GOOGLE_API_URL}/gmail/v1/users/me/messages/${messageId}?format=full`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  )

  if (!res.ok) {
    throw new Error(`Gmail get message failed: ${res.statusText}`)
  }

  return res.json()
}

/**
 * Send an email via Gmail API.
 */
export async function sendGmailMessage(
  accessToken: string,
  raw: string,
): Promise<{ id: string; threadId: string; labelIds: string[] }> {
  const res = await fetch(
    `${GOOGLE_API_URL}/gmail/v1/users/me/messages/send`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ raw }),
    },
  )

  if (!res.ok) {
    throw new Error(`Gmail send failed: ${res.statusText}`)
  }

  return res.json()
}

/**
 * Parse Gmail message headers into a flat object.
 */
export function parseGmailHeaders(
  headers: Array<{ name: string; value: string }>,
): Record<string, string> {
  const result: Record<string, string> = {}
  for (const h of headers) {
    result[h.name.toLowerCase()] = h.value
  }
  return result
}

/**
 * Extract plain text body from a Gmail message payload.
 */
export function extractPlainBody(message: GmailMessage): string {
  // Check direct body
  if (message.payload.body?.data) {
    return Buffer.from(message.payload.body.data, 'base64url').toString('utf8')
  }

  // Check parts
  if (message.payload.parts) {
    for (const part of message.payload.parts) {
      if (part.mimeType === 'text/plain' && part.body?.data) {
        return Buffer.from(part.body.data, 'base64url').toString('utf8')
      }
    }
    // Fallback to HTML part
    for (const part of message.payload.parts) {
      if (part.mimeType === 'text/html' && part.body?.data) {
        return Buffer.from(part.body.data, 'base64url').toString('utf8')
      }
    }
  }

  return message.snippet || ''
}

/**
 * Check if a Gmail message has attachments.
 */
export function hasGmailAttachments(message: GmailMessage): boolean {
  if (!message.payload.parts) return false
  return message.payload.parts.some(
    (p) => p.filename && p.filename.length > 0 && p.body?.attachmentId,
  )
}
