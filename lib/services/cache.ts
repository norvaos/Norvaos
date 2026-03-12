/**
 * Tenant-safe Redis cache layer.
 *
 * INVARIANT: Every cache key MUST start with `t:{tenantId}:`.
 * This is enforced at runtime — invalid keys throw immediately.
 *
 * When UPSTASH_REDIS_REST_URL is not set, all operations become
 * no-ops (get returns null, set/del are void). This is the rollback
 * mechanism: unset the env var = no Redis.
 */

import { Redis } from '@upstash/redis'

// ─── Client (lazy, nullable) ────────────────────────────────────────────────

const redis =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
      })
    : null

// ─── Tenant Key Enforcement ─────────────────────────────────────────────────

const TENANT_KEY_RE = /^t:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:/

/**
 * Assert that a cache key starts with `t:{uuid}:`.
 * Throws if the key does not match the required format.
 */
export function assertTenantKey(key: string): void {
  if (!TENANT_KEY_RE.test(key)) {
    throw new Error(
      `Cache key must start with t:{tenantId}: (UUID format) — got: "${key.slice(0, 60)}"`
    )
  }
}

/**
 * Build a tenant-prefixed cache key.
 * Usage: `cacheKey(tenantId, 'gating', matterId)` → `t:{tenantId}:gating:{matterId}`
 */
export function cacheKey(tenantId: string, ...parts: string[]): string {
  return `t:${tenantId}:${parts.join(':')}`
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Get a JSON value from cache. Returns null on miss or if Redis is disabled.
 */
export async function getJson<T>(key: string): Promise<T | null> {
  assertTenantKey(key)
  if (!redis) return null
  try {
    const value = await redis.get<T>(key)
    return value ?? null
  } catch {
    // Cache failures must never break the request path
    return null
  }
}

/**
 * Set a JSON value in cache with a TTL in seconds.
 */
export async function setJson(
  key: string,
  value: unknown,
  ttlSeconds: number
): Promise<void> {
  assertTenantKey(key)
  if (!redis) return
  try {
    await redis.set(key, JSON.stringify(value), { ex: ttlSeconds })
  } catch {
    // Cache failures must never break the request path
  }
}

/**
 * Delete a single cache key.
 */
export async function del(key: string): Promise<void> {
  assertTenantKey(key)
  if (!redis) return
  try {
    await redis.del(key)
  } catch {
    // Cache failures must never break the request path
  }
}

/**
 * Delete all keys matching a tenant-scoped prefix pattern.
 *
 * Pattern MUST be `t:{tenantId}:some:prefix:*` — the function verifies
 * the pattern starts with a valid tenant prefix and ends with `*`.
 *
 * Uses SCAN to avoid blocking Redis.
 */
export async function prefixDel(pattern: string): Promise<void> {
  // Validate pattern is tenant-scoped
  if (!TENANT_KEY_RE.test(pattern)) {
    throw new Error(
      `prefixDel pattern must start with t:{tenantId}: — got: "${pattern.slice(0, 60)}"`
    )
  }
  if (!pattern.endsWith('*')) {
    throw new Error(`prefixDel pattern must end with * — got: "${pattern.slice(0, 60)}"`)
  }

  // Extract tenant prefix and verify pattern cannot cross tenants
  const tenantPrefix = pattern.match(/^(t:[0-9a-f-]+:)/)?.[1]
  if (!tenantPrefix) {
    throw new Error('Could not extract tenant prefix from pattern')
  }

  if (!redis) return
  try {
    let cursor = 0
    do {
      const [nextCursor, keys] = await redis.scan(cursor, {
        match: pattern,
        count: 100,
      })
      cursor = typeof nextCursor === 'string' ? parseInt(nextCursor, 10) : nextCursor
      if (keys.length > 0) {
        // Double-check every key belongs to the same tenant
        for (const key of keys) {
          if (!key.startsWith(tenantPrefix)) {
            throw new Error(
              `Cross-tenant key detected in prefixDel! Pattern "${pattern}" matched key "${key}"`
            )
          }
        }
        await redis.del(...keys)
      }
    } while (cursor !== 0)
  } catch (err) {
    // Re-throw cross-tenant errors — those are security violations
    if (err instanceof Error && err.message.includes('Cross-tenant')) {
      throw err
    }
    // Swallow other cache failures
  }
}

/**
 * Increment a counter key. Returns the new value.
 * Used for rate limiting / concurrency control.
 */
export async function incr(key: string): Promise<number> {
  assertTenantKey(key)
  if (!redis) return 0
  try {
    return await redis.incr(key)
  } catch {
    return 0
  }
}

/**
 * Set TTL on an existing key (seconds).
 */
export async function expire(key: string, ttlSeconds: number): Promise<void> {
  assertTenantKey(key)
  if (!redis) return
  try {
    await redis.expire(key, ttlSeconds)
  } catch {
    // Cache failures must never break the request path
  }
}

/**
 * Check if Redis is available (for diagnostics / health checks).
 */
export function isRedisEnabled(): boolean {
  return redis !== null
}
