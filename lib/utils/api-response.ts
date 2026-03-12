import { NextResponse } from 'next/server'

/**
 * Standardized API response helpers.
 *
 * Provides consistent JSON envelope for all API routes:
 *   Success: { data, status? }
 *   Error:   { error, code?, status }
 *
 * Usage:
 *   return apiSuccess({ user })           // 200
 *   return apiSuccess({ id }, 201)        // 201
 *   return apiError('Not found', 404)     // 404
 *   return apiError('Rate limited', 429, 'RATE_LIMITED')
 */

export function apiSuccess<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(data, { status })
}

export function apiError(
  message: string,
  status = 400,
  code?: string
): NextResponse {
  return NextResponse.json(
    {
      error: message,
      ...(code && { code }),
    },
    { status }
  )
}

/**
 * Wrap an async handler with standard error catching.
 *
 * Usage:
 *   export const POST = withErrorHandling(async (request) => {
 *     // ... your logic
 *     return apiSuccess({ result })
 *   })
 */
export function withErrorHandling(
  handler: (request: Request) => Promise<NextResponse>
) {
  return async (request: Request): Promise<NextResponse> => {
    try {
      return await handler(request)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Internal server error'
      console.error('API error:', error)
      return apiError(message, 500, 'INTERNAL_ERROR')
    }
  }
}
