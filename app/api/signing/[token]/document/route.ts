import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import { createRateLimiter } from '@/lib/middleware/rate-limit'
import { getSourceDocument } from '@/lib/services/esign-service'

const rateLimiter = createRateLimiter({ maxRequests: 10, windowMs: 60_000 })

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

  const rateLimitResult = rateLimiter.check(ip)
  if (!rateLimitResult.allowed) {
    return notFoundResponse()
  }

  const { token } = await params

  const supabase = createAdminClient()
  const result = await getSourceDocument(supabase, token)

  if (!result.success) {
    return notFoundResponse()
  }

  return new NextResponse(new Uint8Array(result.data!.pdfBuffer), {
    status: 200,
    headers: securityHeaders({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${result.data!.filename}"`,
    }),
  })
}

export const GET = handleGet
