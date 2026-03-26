import { createHmac } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'

// ─── Smart-Threader: Cryptographic Token System ─────────────────────────────
//
// Every outgoing email from NorvaOS embeds a unique, HMAC-signed token in the
// footer. When a reply arrives, the token is extracted and matched against the
// originating matter  -  giving a 100% confidence association without relying on
// subject lines, contact emails, or any other heuristic.
//
// Token format: NRV-<base64url(HMAC-SHA256(matterId + tenantId, secret))[:16]>
// Example:     NRV-k9Xm2Lp4Qr8vT1Yn
//
// The token is short enough to survive forwards/replies and human-readable
// enough to not look like spam. The prefix "NRV-" makes extraction trivial.
// ─────────────────────────────────────────────────────────────────────────────

const TOKEN_PREFIX = 'NRV-'
const TOKEN_LENGTH = 16 // chars of HMAC digest to use (96 bits of entropy)

/**
 * Returns the HMAC secret from environment. Falls back to a dev-only default
 * so local development doesn't require an extra env var.
 */
function getSecret(): string {
  return process.env.NORVA_THREAD_TOKEN_SECRET ?? 'norva-dev-secret-do-not-use-in-prod'
}

// ─── Generate ────────────────────────────────────────────────────────────────

/**
 * Generate a deterministic thread token for a given matter + tenant pair.
 * Deterministic so the same matter always produces the same token  -  no
 * need to store tokens in the database.
 */
export function generateThreadToken(matterId: string, tenantId: string): string {
  const hmac = createHmac('sha256', getSecret())
  hmac.update(`${tenantId}:${matterId}`)
  const digest = hmac.digest('base64url').slice(0, TOKEN_LENGTH)
  return `${TOKEN_PREFIX}${digest}`
}

/**
 * Build the plain-text footer line that gets appended to outgoing emails.
 * Invisible enough to not distract, present enough to survive forwarding.
 */
export function buildTokenFooter(matterId: string, tenantId: string): string {
  const token = generateThreadToken(matterId, tenantId)
  return `\n\n---\nRef: ${token}\n`
}

/**
 * Build an HTML footer snippet for HTML-formatted emails.
 */
export function buildTokenFooterHtml(matterId: string, tenantId: string): string {
  const token = generateThreadToken(matterId, tenantId)
  return `<br/><hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0 8px"/><span style="font-size:10px;color:#9ca3af">Ref: ${token}</span>`
}

// ─── Extract ─────────────────────────────────────────────────────────────────

/** Regex to find NRV- tokens in email body/subject */
const TOKEN_REGEX = /\bNRV-[A-Za-z0-9_-]{12,24}\b/g

/**
 * Extract all NRV- tokens from a string (email body, subject, etc.).
 */
export function extractTokens(text: string): string[] {
  if (!text) return []
  const matches = text.match(TOKEN_REGEX)
  return matches ? [...new Set(matches)] : []
}

// ─── Resolve ─────────────────────────────────────────────────────────────────

/**
 * Given a token string, find the matter it belongs to by brute-forcing
 * against all active matters for the tenant.
 *
 * Because the token is deterministic (HMAC of matterId + tenantId), we
 * regenerate the token for each candidate matter and compare. This avoids
 * needing a lookup table.
 *
 * For tenants with very large matter counts (>5000), consider adding a
 * `thread_token` column to the matters table for O(1) lookup.
 */
export async function resolveTokenToMatter(
  supabase: SupabaseClient<Database>,
  token: string,
  tenantId: string
): Promise<string | null> {
  // Fetch all non-archived matter IDs for the tenant
  const { data: matters } = await supabase
    .from('matters')
    .select('id')
    .eq('tenant_id', tenantId)
    .not('status', 'eq', 'archived')

  if (!matters || matters.length === 0) return null

  for (const matter of matters) {
    const candidate = generateThreadToken(matter.id, tenantId)
    if (candidate === token) {
      return matter.id
    }
  }

  return null
}
