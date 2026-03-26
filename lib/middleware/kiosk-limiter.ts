/**
 * Kiosk-specific rate limiter  -  keyed by tenant token + IP.
 *
 * Applies sliding-window rate limiting to all kiosk API endpoints.
 * Reuses the in-memory createRateLimiter() from rate-limit.ts.
 *
 * Keys include the kiosk token so that one abusive visitor on shared
 * WiFi cannot exhaust the limit for other tenants on the same IP.
 *
 * Limits:
 *   - General kiosk: 30 requests/minute per token+IP
 *   - DOB verify:    10 requests/minute per token+IP (stricter)
 *   - ID scan:       5 requests/minute per token+IP (file uploads)
 */

import { NextResponse } from 'next/server'
import { createRateLimiter } from './rate-limit'

// Shared limiter instances (module-level singletons)
const generalLimiter = createRateLimiter({ maxRequests: 30, windowMs: 60_000 })
const verifyLimiter = createRateLimiter({ maxRequests: 10, windowMs: 60_000 })
const uploadLimiter = createRateLimiter({ maxRequests: 5, windowMs: 60_000 })

function getClientIp(request: Request): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    'unknown'
  )
}

function buildRateLimitResponse(retryAfterMs: number): NextResponse {
  return NextResponse.json(
    { error: 'Too many requests. Please wait and try again.' },
    {
      status: 429,
      headers: {
        'Retry-After': String(Math.ceil(retryAfterMs / 1000)),
      },
    },
  )
}

/**
 * Check general kiosk rate limit (30 req/min per token+IP).
 * Returns a 429 NextResponse if blocked, or null if allowed.
 */
export function checkKioskRateLimit(request: Request, token: string): NextResponse | null {
  const ip = getClientIp(request)
  const result = generalLimiter.check(`kiosk:${token}:${ip}`)
  if (!result.allowed) {
    return buildRateLimitResponse(result.retryAfterMs)
  }
  return null
}

/**
 * Check DOB verification rate limit (10 req/min per token+IP).
 * Stricter limit because this endpoint is an identity verification gate.
 */
export function checkVerifyRateLimit(request: Request, token: string): NextResponse | null {
  const ip = getClientIp(request)
  const result = verifyLimiter.check(`verify:${token}:${ip}`)
  if (!result.allowed) {
    return buildRateLimitResponse(result.retryAfterMs)
  }
  return null
}

/**
 * Check ID scan upload rate limit (5 req/min per token+IP).
 * Strictest limit because file uploads are expensive.
 */
export function checkUploadRateLimit(request: Request, token: string): NextResponse | null {
  const ip = getClientIp(request)
  const result = uploadLimiter.check(`upload:${token}:${ip}`)
  if (!result.allowed) {
    return buildRateLimitResponse(result.retryAfterMs)
  }
  return null
}
