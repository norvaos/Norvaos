/**
 * Sliding-window rate limiter with Redis support.
 *
 * When Upstash Redis is configured (UPSTASH_REDIS_REST_URL + TOKEN),
 * uses a Redis INCR counter with TTL per key. This works correctly
 * across multi-instance deployments.
 *
 * When Redis is not configured, falls back to an in-memory Map
 * (same behaviour as before). Redis failures also fall back to
 * in-memory (fail-open for availability).
 *
 * Usage in API routes:
 *   const limiter = createRateLimiter({ maxRequests: 5, windowMs: 60_000 })
 *
 *   export async function POST(request: Request) {
 *     const ip = request.headers.get('x-forwarded-for') ?? 'unknown'
 *     const { allowed, remaining, retryAfterMs } = await limiter.check(ip)
 *     if (!allowed) {
 *       return new Response('Too many requests', {
 *         status: 429,
 *         headers: { 'Retry-After': String(Math.ceil(retryAfterMs / 1000)) },
 *       })
 *     }
 *     // ... handle request
 *   }
 */

import { Redis } from '@upstash/redis'

// ─── Redis client (shared with cache.ts env vars, but not tenant-scoped) ────

const redis =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
      })
    : null

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

// ─── In-memory fallback ─────────────────────────────────────────────────────

function createInMemoryStore(config: RateLimitConfig) {
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

// ─── Public API ─────────────────────────────────────────────────────────────

export function createRateLimiter(config: RateLimitConfig) {
  const memoryStore = createInMemoryStore(config)
  const windowSeconds = Math.ceil(config.windowMs / 1000)

  return {
    /**
     * Check if the key (typically an IP) is within the rate limit.
     *
     * Uses Redis when available; falls back to in-memory on Redis
     * absence or failure.
     */
    async check(key: string): Promise<RateLimitResult> {
      if (!redis) {
        return memoryStore.check(key)
      }

      const redisKey = `nexus-rate:${key}`

      try {
        const count = await redis.incr(redisKey)

        // Set TTL on the first increment (start of a new window)
        if (count === 1) {
          await redis.expire(redisKey, windowSeconds)
        }

        if (count > config.maxRequests) {
          // Estimate retry-after from TTL
          const ttl = await redis.ttl(redisKey)
          const retryAfterMs = (ttl > 0 ? ttl : windowSeconds) * 1000
          return {
            allowed: false,
            remaining: 0,
            retryAfterMs,
          }
        }

        return {
          allowed: true,
          remaining: config.maxRequests - count,
          retryAfterMs: 0,
        }
      } catch {
        // Redis failure: fall back to in-memory (fail-open)
        return memoryStore.check(key)
      }
    },
  }
}
