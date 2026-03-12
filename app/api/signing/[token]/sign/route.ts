import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import { createRateLimiter } from '@/lib/middleware/rate-limit'
import { executeSignature } from '@/lib/services/esign-service'

const rateLimiter = createRateLimiter({ maxRequests: 5, windowMs: 60_000 })

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

async function handlePost(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const headersList = await headers()
  const ip = headersList.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  const userAgent = headersList.get('user-agent') ?? undefined

  const rateLimitResult = rateLimiter.check(ip)
  if (!rateLimitResult.allowed) {
    return notFoundResponse()
  }

  const { token } = await params

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return notFoundResponse()
  }

  const { signatureDataUrl, signatureMode, typedName, consentText } = body as {
    signatureDataUrl?: string
    signatureMode?: string
    typedName?: string
    consentText?: string
  }

  if (!signatureDataUrl || !signatureMode || !consentText) {
    return notFoundResponse()
  }

  const supabase = createAdminClient()
  const result = await executeSignature(supabase, token, {
    signatureDataUrl,
    signatureMode: signatureMode as 'drawn' | 'typed',
    typedName,
    consentText,
    ip,
    userAgent: userAgent ?? '',
  })

  if (!result.success) {
    if (result.error === 'invalid') {
      return notFoundResponse()
    }
    return NextResponse.json(
      { error: result.error },
      { status: 400, headers: securityHeaders() },
    )
  }

  return NextResponse.json({ success: true }, { headers: securityHeaders() })
}

export const POST = handlePost
