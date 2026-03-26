/**
 * Go High Level API client.
 *
 * Base URL: https://services.leadconnectorhq.com
 * Rate limit: 100 requests/10 seconds burst, 200K/day
 * Requires Version header on all requests.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'
import { getValidGhlToken } from './oauth'
import { log } from '@/lib/utils/logger'

const GHL_BASE_URL = 'https://services.leadconnectorhq.com'
const GHL_API_VERSION = '2021-07-28'

// Maximum 429 retry attempts before giving up. Does not count the initial request.
const MAX_GHL_RATE_LIMIT_RETRIES = 5

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export class GhlApiError extends Error {
  status: number
  code: string | undefined

  constructor(message: string, status: number, code?: string) {
    super(message)
    this.name = 'GhlApiError'
    this.status = status
    this.code = code
  }
}

interface GhlFetchOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  body?: unknown
  params?: Record<string, string | number>
}

/**
 * Make an authenticated request to the GHL API.
 *
 * 429 handling: respects Retry-After, bounded to MAX_GHL_RATE_LIMIT_RETRIES attempts.
 * 401 handling: attempts one forced token refresh, then retries once. If refresh
 *   fails (revoked/expired), GhlConnectionError propagates to the caller.
 */
export async function ghlFetch<T = unknown>(
  connectionId: string,
  admin: SupabaseClient<Database>,
  path: string,
  options: GhlFetchOptions = {},
): Promise<T> {
  const { method = 'GET', body, params } = options

  let url = path.startsWith('http') ? path : `${GHL_BASE_URL}/${path}`
  if (params) {
    const searchParams = new URLSearchParams()
    for (const [key, val] of Object.entries(params)) {
      searchParams.set(key, String(val))
    }
    url += (url.includes('?') ? '&' : '?') + searchParams.toString()
  }

  // Obtain the initial access token (proactive refresh if near expiry)
  let accessToken = (await getValidGhlToken(connectionId, admin)).accessToken
  let rateLimit429Count = 0
  let tokenRefreshed = false

  while (true) {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      Version: GHL_API_VERSION,
    }

    const res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    })

    // Rate limiting  -  bounded retry respecting Retry-After
    if (res.status === 429) {
      if (rateLimit429Count >= MAX_GHL_RATE_LIMIT_RETRIES) {
        throw new GhlApiError(
          `GHL API rate limit exhausted after ${MAX_GHL_RATE_LIMIT_RETRIES} retries`,
          429,
        )
      }
      rateLimit429Count++
      const retryAfterSec = parseInt(res.headers.get('Retry-After') || '10', 10)
      log.warn('ghl.client.rate_limited', {
        connection_id: connectionId,
        retry_count: rateLimit429Count,
        retry_after_sec: retryAfterSec,
      })
      await sleep(retryAfterSec * 1000)
      continue
    }

    // Expired or revoked token  -  attempt one forced refresh, then retry
    // getValidGhlToken({ force: true }) throws GhlConnectionError on refresh failure,
    // which propagates to the caller without further retries.
    if (res.status === 401 && !tokenRefreshed) {
      tokenRefreshed = true
      const refreshed = await getValidGhlToken(connectionId, admin, { force: true })
      accessToken = refreshed.accessToken
      continue
    }

    if (res.status === 204) {
      return undefined as T
    }

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new GhlApiError(
        err.message || err.error || `GHL API error: ${res.status}`,
        res.status,
        err.code,
      )
    }

    return res.json()
  }
}

/**
 * Paginate through all results from a GHL list endpoint.
 * GHL uses offset-based pagination with `startAfter` or `page` + `limit`.
 */
export async function ghlPaginateAll<T>(
  connectionId: string,
  admin: SupabaseClient<Database>,
  path: string,
  dataKey: string,
  extraParams: Record<string, string | number> = {},
  pageSize = 100,
): Promise<T[]> {
  const allItems: T[] = []
  let page = 1
  let hasMore = true

  while (hasMore) {
    const data = await ghlFetch<Record<string, unknown>>(connectionId, admin, path, {
      params: { ...extraParams, limit: pageSize, page },
    })

    const items = (data[dataKey] as T[]) ?? []
    allItems.push(...items)

    // GHL returns meta.total or less items than page size means done
    const meta = data.meta as { total?: number; currentPage?: number; nextPage?: number } | undefined
    if (meta?.nextPage) {
      page = meta.nextPage
    } else if (items.length < pageSize) {
      hasMore = false
    } else {
      page++
    }

    // Safety: cap at 500 pages (50K items)
    if (page > 500) break
  }

  return allItems
}

export { GHL_BASE_URL, GHL_API_VERSION }
