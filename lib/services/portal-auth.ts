/**
 * Portal token validation  -  shared helper for all portal routes.
 *
 * Tokens are stored as SHA-256 hashes in portal_links.token_hash.
 * This function hashes the incoming token and looks up by hash.
 * Returns the portal link row or throws with appropriate HTTP status.
 */

import { createHash } from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'

export interface PortalLink {
  id: string
  tenant_id: string
  matter_id: string
  contact_id: string | null
  is_active: boolean
  expires_at: string | null
  link_type: string
  permissions: Record<string, unknown> | null
  metadata: Record<string, unknown> | null
  access_count: number
  last_accessed_at: string | null
}

export class PortalAuthError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = 'PortalAuthError'
    this.status = status
  }
}

/**
 * Hash a portal token using SHA-256.
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

/**
 * Validate a portal token and return the portal link.
 * Handles: invalid tokens (404), expired tokens (410), revoked tokens (404).
 * Updates access tracking (fire-and-forget).
 */
export async function validatePortalToken(token: string): Promise<PortalLink> {
  const admin = createAdminClient()
  const tokenHash = hashToken(token)

  // Try hash-based lookup first (new links), then raw token fallback (legacy links without token_hash)
  let link: Record<string, unknown> | null = null

  const { data: hashMatch } = await (admin as any)
    .from('portal_links')
    .select('id, tenant_id, matter_id, contact_id, is_active, expires_at, link_type, permissions, metadata, access_count, last_accessed_at')
    .eq('token_hash', tokenHash)
    .maybeSingle()

  if (hashMatch) {
    link = hashMatch
  } else {
    // Fallback: legacy links where token_hash was never set
    const { data: rawMatch } = await (admin as any)
      .from('portal_links')
      .select('id, tenant_id, matter_id, contact_id, is_active, expires_at, link_type, permissions, metadata, access_count, last_accessed_at')
      .eq('token', token)
      .maybeSingle()
    if (rawMatch) {
      link = rawMatch
      // Backfill the hash so future lookups use hash-based path
      ;(admin as any)
        .from('portal_links')
        .update({ token_hash: tokenHash })
        .eq('id', rawMatch.id)
        .then(() => {})
        .catch(() => {})
    }
  }

  if (!link) {
    throw new PortalAuthError('Invalid or expired portal link', 404)
  }

  if (!link.is_active) {
    throw new PortalAuthError('Invalid or expired portal link', 404)
  }

  if (link.expires_at && typeof link.expires_at === 'string' && new Date(link.expires_at) < new Date()) {
    throw new PortalAuthError('This portal link has expired', 410)
  }

  // Fire-and-forget access tracking
  ;(admin as any)
    .from('portal_links')
    .update({
      access_count: (Number(link.access_count) || 0) + 1,
      last_accessed_at: new Date().toISOString(),
    })
    .eq('id', link.id)
    .then(() => {})
    .catch(() => {})

  return link as unknown as PortalLink
}
