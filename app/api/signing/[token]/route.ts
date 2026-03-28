import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import { createRateLimiter } from '@/lib/middleware/rate-limit'
import { getSigningPageData } from '@/lib/services/esign-service'

const rateLimiter = createRateLimiter({ maxRequests: 20, windowMs: 60_000 })

function securityHeaders(extra?: Record<string, string>): Record<string, string> {
  return {
    'Cache-Control': 'no-store, no-cache, must-revalidate',
    'X-Robots-Tag': 'noindex, nofollow',
    'X-Content-Type-Options': 'nosniff',
    ...extra,
  }
}

const notFoundResponse = () =>
  new NextResponse(null, { status: 404, headers: securityHeaders() })

async function handleGet(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const headersList = await headers()
  const ip = headersList.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  const userAgent = headersList.get('user-agent') ?? undefined

  const rateLimitResult = await rateLimiter.check(ip)
  if (!rateLimitResult.allowed) {
    return notFoundResponse()
  }

  const { token } = await params

  const supabase = createAdminClient()
  const result = await getSigningPageData(supabase, token, ip, userAgent)

  if (!result.success) {
    return notFoundResponse()
  }

  return NextResponse.json(result.data, { headers: securityHeaders() })
}

export const GET = handleGet
