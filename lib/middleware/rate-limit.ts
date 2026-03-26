/**
 * In-memory sliding-window rate limiter.
 *
 * Usage in API routes:
 *   const limiter = createRateLimiter({ maxRequests: 5, windowMs: 60_000 })
 *
 *   export async function POST(request: Request) {
 *     const ip = request.headers.get('x-forwarded-for') ?? 'unknown'
 *     const { allowed, remaining, retryAfterMs } = limiter.check(ip)
 *     if (!allowed) {
 *       return new Response('Too many requests', {
 *         status: 429,
 *         headers: { 'Retry-After': String(Math.ceil(retryAfterMs / 1000)) },
 *       })
 *     }
 *     // ... handle request
 *   }
 *
 * Note: In-memory  -  resets on deploy. For multi-instance deployments,
 * swap with Redis-backed implementation.
 */

interface RateLimitEntry {
  timestamps: number[]
}

interface RateLimitConfig {
  /** Maximum requests allowed in the window. */
  maxRequests: number
  /** Window size in milliseconds. */
  windowMs: number
}

interface RateLimitResult {
  allowed: boolean
  remaining: number
  retryAfterMs: number
}

export function createRateLimiter(config: RateLimitConfig) {
  const store = new Map<string, RateLimitEntry>()

  // Periodic cleanup to prevent memory leaks (every 5 minutes)
  const cleanupInterval = setInterval(() => {
    const now = Date.now()
    for (const [key, entry] of store) {
      entry.timestamps = entry.timestamps.filter((t) => now - t < config.windowMs)
      if (entry.timestamps.length === 0) {
        store.delete(key)
      }
    }
  }, 5 * 60 * 1000)

  // Allow garbage collection of the interval in serverless environments
  if (typeof cleanupInterval === 'object' && 'unref' in cleanupInterval) {
    cleanupInterval.unref()
  }

  return {
    check(key: string): RateLimitResult {
      const now = Date.now()
      let entry = store.get(key)

      if (!entry) {
        entry = { timestamps: [] }
        store.set(key, entry)
      }

      // Remove timestamps outside the window
      entry.timestamps = entry.timestamps.filter((t) => now - t < config.windowMs)

      if (entry.timestamps.length >= config.maxRequests) {
        const oldestInWindow = entry.timestamps[0]
        const retryAfterMs = config.windowMs - (now - oldestInWindow)
        return {
          allowed: false,
          remaining: 0,
          retryAfterMs: Math.max(0, retryAfterMs),
        }
      }

      entry.timestamps.push(now)
      return {
        allowed: true,
        remaining: config.maxRequests - entry.timestamps.length,
        retryAfterMs: 0,
      }
    },
  }
}
