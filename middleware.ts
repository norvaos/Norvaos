/**
 * Next.js Edge Middleware — session management + PIPEDA data sovereignty enforcement.
 *
 * IMPORTANT: This runs in Edge Runtime. No Node.js crypto or Supabase admin client.
 * Sovereignty logging is done via fire-and-forget fetch() to an internal API endpoint.
 */

import { updateSession } from '@/lib/supabase/middleware'
import { NextResponse, type NextRequest } from 'next/server'

// ---------------------------------------------------------------------------
// PII route detection (Edge-compatible, no Node.js imports)
// ---------------------------------------------------------------------------

const PII_ROUTE_PREFIXES = [
  '/api/contacts',
  '/api/leads',
  '/api/trust-accounting',
]

const PII_ROUTE_KEYWORDS = ['contact', 'lead', 'pii', 'decrypt']

function isPIIRoute(pathname: string): boolean {
  const lower = pathname.toLowerCase()

  for (const prefix of PII_ROUTE_PREFIXES) {
    if (lower.startsWith(prefix)) return true
  }

  if (lower.startsWith('/api/')) {
    for (const keyword of PII_ROUTE_KEYWORDS) {
      if (lower.includes(keyword)) return true
    }
  }

  return false
}

// ---------------------------------------------------------------------------
// Geo header extraction (Edge-compatible)
// ---------------------------------------------------------------------------

function extractCountry(headers: Headers): string | null {
  return (
    headers.get('cf-ipcountry') ??
    headers.get('x-country') ??
    headers.get('x-vercel-ip-country') ??
    null
  )
}

function extractRegion(headers: Headers): string | null {
  return (
    headers.get('cf-region') ??
    headers.get('x-vercel-ip-country-region') ??
    headers.get('x-region') ??
    null
  )
}

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
// Fire-and-forget sovereignty log via internal API
// ---------------------------------------------------------------------------

function fireSovereigntyLog(params: {
  sourceIp: string | null
  sourceCountry: string | null
  sourceRegion: string | null
  requestPath: string
  requestMethod: string
  allowed: boolean
  blockReason: string | null
}, request: NextRequest): void {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) return

  // Build absolute URL for internal endpoint
  const origin = request.nextUrl.origin

  // Fire-and-forget — intentionally not awaited
  fetch(`${origin}/api/internal/sovereignty-log`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Internal-Secret': cronSecret,
    },
    body: JSON.stringify(params),
  }).catch((err) => {
    console.error('[Middleware] Failed to fire sovereignty log:', err)
  })
}

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

export async function middleware(request: NextRequest) {
  // 1. Session management (existing behaviour)
  const sessionResponse = await updateSession(request)

  // 2. PIPEDA sovereignty check for PII routes
  const pathname = request.nextUrl.pathname

  if (isPIIRoute(pathname)) {
    const country = extractCountry(request.headers)
    const countryUpper = country?.toUpperCase() ?? null

    // Allow if country is unknown/empty (localhost/dev) or Canadian
    const isCanadian =
      countryUpper === null ||
      countryUpper === '' ||
      countryUpper === 'CA'

    if (!isCanadian) {
      const blockReason = `PIPEDA violation: Non-Canadian request (${countryUpper}) attempted to access PII route ${pathname}`

      // Fire-and-forget log
      fireSovereigntyLog(
        {
          sourceIp: extractIp(request.headers),
          sourceCountry: countryUpper,
          sourceRegion: extractRegion(request.headers),
          requestPath: pathname,
          requestMethod: request.method,
          allowed: false,
          blockReason,
        },
        request,
      )

      // Block with 403
      return NextResponse.json(
        { error: 'PIPEDA: Data sovereignty violation' },
        { status: 403 },
      )
    }

    // Log allowed PII access (fire-and-forget)
    fireSovereigntyLog(
      {
        sourceIp: extractIp(request.headers),
        sourceCountry: countryUpper,
        sourceRegion: extractRegion(request.headers),
        requestPath: pathname,
        requestMethod: request.method,
        allowed: true,
        blockReason: null,
      },
      request,
    )
  }

  // 3. Return session response
  return sessionResponse
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico (favicon file)
     * - public files (images, etc.)
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
