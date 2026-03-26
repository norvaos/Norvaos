/**
 * Nexus Portal Guard  -  optional IP restriction for the super-admin portal.
 *
 * Security model: platform-admin auth (Bearer token or session) is the
 * primary gate. IP restriction is an optional hardening layer.
 *
 * Behaviour:
 *   - NEXUS_ALLOWED_IPS set → enforce IP allowlist (extra security)
 *   - NEXUS_ALLOWED_IPS not set → skip IP check, rely on platform-admin auth
 *   - Development → always skip IP check
 */

import { NextResponse } from 'next/server'
import { log } from '@/lib/utils/logger'

function getAllowedIPs(): string[] {
  const raw = process.env.NEXUS_ALLOWED_IPS
  if (!raw) return []
  return raw
    .split(',')
    .map((ip) => ip.trim())
    .filter(Boolean)
}

function getClientIP(request: Request): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    'unknown'
  )
}

/**
 * Check if the request is from an allowed IP for Nexus Portal access.
 * Returns null if allowed, or a 403 Response if blocked.
 *
 * When NEXUS_ALLOWED_IPS is not set, this is a no-op  -  access control
 * is handled entirely by platform-admin auth in withNexusAdmin.
 */
export function checkNexusIP(request: Request): Response | null {
  // In development, always allow
  if (process.env.NODE_ENV === 'development') return null

  const allowedIPs = getAllowedIPs()

  // No IPs configured → skip IP check, rely on platform-admin auth
  if (allowedIPs.length === 0) return null

  // IPs configured → enforce allowlist
  const clientIP = getClientIP(request)
  if (allowedIPs.includes(clientIP)) return null

  log.warn('[nexus-guard] IP not in allowlist', {
    ip: clientIP,
    path: new URL(request.url).pathname,
    allowed_count: allowedIPs.length,
  })

  return NextResponse.json(
    { error: 'Access denied. Your IP is not authorised for Nexus Portal.' },
    { status: 403 },
  )
}

export { checkNexusIP as nexusIPGuard }
