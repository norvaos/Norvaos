/**
 * PIPEDA Data Sovereignty Enforcer  -  Directive 004, Pillar 3
 *
 * Validates geolocation of requests and enforces Canadian data residency.
 * Canadian region enforcement is also handled at infrastructure level (Netlify),
 * but this service provides application-layer defence-in-depth.
 */

import { createAdminClient } from '@/lib/supabase/admin'

// ---------------------------------------------------------------------------
// Canadian region whitelist
// ---------------------------------------------------------------------------

const CANADIAN_REGIONS = [
  'ca-central-1',
  'CA',
  'CA-ON',
  'CA-BC',
  'CA-AB',
  'CA-QC',
  'CA-NS',
  'CA-NB',
  'CA-MB',
  'CA-SK',
  'CA-PE',
  'CA-NL',
  'CA-NT',
  'CA-YT',
  'CA-NU',
] as const

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SovereigntyCheckResult {
  allowed: boolean
  sourceIp: string | null
  sourceCountry: string | null
  sourceRegion: string | null
  isCanadian: boolean
  blockReason: string | null
}

export interface SovereigntyLogParams {
  sourceIp: string | null
  sourceCountry: string | null
  sourceRegion: string | null
  requestPath: string
  requestMethod: string
  allowed: boolean
  blockReason: string | null
  userId?: string | null
  tenantId?: string | null
}

// ---------------------------------------------------------------------------
// PII route detection
// ---------------------------------------------------------------------------

/** API path prefixes that access PII data. */
const PII_ROUTE_PREFIXES = [
  '/api/contacts',
  '/api/leads',
  '/api/trust-accounting',
]

/** Substrings in route paths that indicate PII access. */
const PII_ROUTE_KEYWORDS = ['contact', 'lead', 'pii', 'decrypt']

/**
 * Returns the list of PII route prefix patterns.
 */
export function getPIIRoutes(): string[] {
  return [...PII_ROUTE_PREFIXES]
}

/**
 * Checks whether a pathname accesses PII data.
 */
export function isPIIRoute(pathname: string): boolean {
  const lower = pathname.toLowerCase()

  // Check prefix matches
  for (const prefix of PII_ROUTE_PREFIXES) {
    if (lower.startsWith(prefix)) return true
  }

  // Check keyword matches (only for /api/ routes)
  if (lower.startsWith('/api/')) {
    for (const keyword of PII_ROUTE_KEYWORDS) {
      if (lower.includes(keyword)) return true
    }
  }

  return false
}

// ---------------------------------------------------------------------------
// Geo header extraction
// ---------------------------------------------------------------------------

/**
 * Extracts the source country from standard CDN/edge geolocation headers.
 * Checks Cloudflare, Netlify, and Vercel header conventions.
 */
function extractCountry(headers: Headers): string | null {
  // Priority: Cloudflare > generic > Vercel
  return (
    headers.get('cf-ipcountry') ??
    headers.get('x-country') ??
    headers.get('x-vercel-ip-country') ??
    null
  )
}

/**
 * Extracts the source region (province/state) from headers.
 */
function extractRegion(headers: Headers): string | null {
  return (
    headers.get('cf-region') ??
    headers.get('x-vercel-ip-country-region') ??
    headers.get('x-region') ??
    null
  )
}

/**
 * Extracts the client IP from common headers.
 */
function extractIp(headers: Headers): string | null {
  return (
    headers.get('x-nf-client-connection-ip') ??
    headers.get('cf-connecting-ip') ??
    headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    headers.get('x-real-ip') ??
    null
  )
}

// ---------------------------------------------------------------------------
// Core sovereignty check
// ---------------------------------------------------------------------------

/**
 * Evaluates whether a request satisfies PIPEDA Canadian data sovereignty
 * requirements. Non-Canadian requests to PII routes are blocked.
 *
 * Requests with unknown/missing country headers (e.g. localhost in dev)
 * are permitted  -  infrastructure-level enforcement handles production.
 */
export function checkDataSovereignty(request: Request): SovereigntyCheckResult {
  const headers = new Headers(request.headers)
  const url = new URL(request.url)

  const sourceCountry = extractCountry(headers)
  const sourceRegion = extractRegion(headers)
  const sourceIp = extractIp(headers)

  // Determine if the country is Canadian
  const countryUpper = sourceCountry?.toUpperCase() ?? null

  // Allow if country is unknown (localhost/dev) or Canadian
  const isCanadian =
    countryUpper === null ||
    countryUpper === '' ||
    countryUpper === 'CA' ||
    CANADIAN_REGIONS.includes(countryUpper as (typeof CANADIAN_REGIONS)[number])

  // Only block non-Canadian requests that target PII routes
  const targetsPII = isPIIRoute(url.pathname)
  const shouldBlock = !isCanadian && targetsPII

  return {
    allowed: !shouldBlock,
    sourceIp,
    sourceCountry: countryUpper,
    sourceRegion,
    isCanadian: countryUpper === 'CA' || countryUpper === null || countryUpper === '',
    blockReason: shouldBlock
      ? `PIPEDA violation: Non-Canadian request (${countryUpper}) attempted to access PII route ${url.pathname}`
      : null,
  }
}

// ---------------------------------------------------------------------------
// Sovereignty event logging (server-side, uses admin client)
// ---------------------------------------------------------------------------

/**
 * Logs a sovereignty check event to the `data_sovereignty_log` table.
 * Fire-and-forget  -  errors are caught and logged to console.
 */
export async function logSovereigntyEvent(
  params: SovereigntyLogParams,
): Promise<void> {
  try {
    const admin = createAdminClient()

    // Table exists via migration 202 but may not yet be in generated Database types.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (admin.from as any)('data_sovereignty_log').insert({
      source_ip: params.sourceIp,
      source_country: params.sourceCountry,
      source_region: params.sourceRegion,
      request_path: params.requestPath,
      request_method: params.requestMethod,
      allowed: params.allowed,
      block_reason: params.blockReason,
      user_id: params.userId ?? null,
      tenant_id: params.tenantId ?? null,
      created_at: new Date().toISOString(),
    })
  } catch (err) {
    console.error('[DataSovereignty] Failed to log sovereignty event:', err)
  }
}
