/**
 * Clio API v4 client.
 *
 * Base URL: https://app.clio.com/api/v4
 * Rate limit: 600 requests/minute
 * Pagination: page_token based
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'
import { getValidClioToken } from './oauth'
import { log } from '@/lib/utils/logger'

const CLIO_BASE_URL = 'https://app.clio.com/api/v4'

// Maximum 429 retry attempts before giving up. Does not count the initial request.
const MAX_CLIO_RATE_LIMIT_RETRIES = 5

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export class ClioApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ClioApiError'
    this.status = status
  }
}

interface ClioFetchOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  body?: unknown
  params?: Record<string, string | number>
  fields?: string[]
}

/**
 * Make an authenticated request to the Clio API.
 *
 * 429 handling: respects Retry-After, bounded to MAX_CLIO_RATE_LIMIT_RETRIES attempts.
 * 401 handling: attempts one forced token refresh, then retries once. If refresh
 *   fails (revoked/expired), ClioConnectionError propagates to the caller.
 */
export async function clioFetch<T = unknown>(
  connectionId: string,
  admin: SupabaseClient<Database>,
  path: string,
  options: ClioFetchOptions = {},
): Promise<T> {
  const { method = 'GET', body, params, fields } = options

  let url = path.startsWith('http') ? path : `${CLIO_BASE_URL}/${path}`

  const searchParams = new URLSearchParams()
  if (params) {
    for (const [key, val] of Object.entries(params)) {
      searchParams.set(key, String(val))
    }
  }
  if (fields && fields.length > 0) {
    searchParams.set('fields', fields.join(','))
  }
  const qs = searchParams.toString()
  if (qs) {
    url += (url.includes('?') ? '&' : '?') + qs
  }

  // Obtain the initial access token (proactive refresh if near expiry)
  let accessToken = await getValidClioToken(connectionId, admin)
  let rateLimit429Count = 0
  let tokenRefreshed = false

  while (true) {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    }

    const res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    })

    // Rate limiting  -  bounded retry respecting Retry-After
    if (res.status === 429) {
      if (rateLimit429Count >= MAX_CLIO_RATE_LIMIT_RETRIES) {
        throw new ClioApiError(
          `Clio API rate limit exhausted after ${MAX_CLIO_RATE_LIMIT_RETRIES} retries`,
          429,
        )
      }
      rateLimit429Count++
      const retryAfterSec = parseInt(res.headers.get('Retry-After') || '5', 10)
      log.warn('clio.client.rate_limited', {
        connection_id: connectionId,
        retry_count: rateLimit429Count,
        retry_after_sec: retryAfterSec,
      })
      await sleep(retryAfterSec * 1000)
      continue
    }

    // Expired or revoked token  -  attempt one forced refresh, then retry
    // getValidClioToken({ force: true }) throws ClioConnectionError on refresh failure,
    // which propagates to the caller without further retries.
    if (res.status === 401 && !tokenRefreshed) {
      tokenRefreshed = true
      accessToken = await getValidClioToken(connectionId, admin, { force: true })
      continue
    }

    if (res.status === 204) {
      return undefined as T
    }

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new ClioApiError(
        err.error?.message || `Clio API error: ${res.status}`,
        res.status,
      )
    }

    return res.json()
  }
}

/**
 * Paginate through all results from a Clio list endpoint.
 * Clio uses cursor-based pagination via `page_token` in the paging object.
 *
 * 429 on the nextUrl direct-fetch path is bounded to MAX_CLIO_RATE_LIMIT_RETRIES.
 * 429 on the first-page clioFetch path is handled internally by clioFetch.
 */
export async function clioPaginateAll<T>(
  connectionId: string,
  admin: SupabaseClient<Database>,
  path: string,
  fields: string[] = [],
  extraParams: Record<string, string | number> = {},
  pageSize = 200,
): Promise<T[]> {
  const allItems: T[] = []
  let nextUrl: string | null = null
  let page = 0
  let nextUrlRateLimit429Count = 0

  while (true) {
    let data: { data: T[]; meta?: { paging?: { next?: string } } }

    if (nextUrl) {
      // Follow the next URL directly (it includes page_token)
      const accessToken = await getValidClioToken(connectionId, admin)
      const res = await fetch(nextUrl, {
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      })

      if (res.status === 429) {
        if (nextUrlRateLimit429Count >= MAX_CLIO_RATE_LIMIT_RETRIES) {
          // Abort pagination rather than loop forever  -  return partial results
          log.warn('clio.client.pagination_rate_limit_exhausted', {
            connection_id: connectionId,
            pages_fetched: page,
            items_fetched: allItems.length,
          })
          break
        }
        nextUrlRateLimit429Count++
        const retryAfterSec = parseInt(res.headers.get('Retry-After') || '5', 10)
        await sleep(retryAfterSec * 1000)
        continue
      }

      // Reset counter on a successful page
      nextUrlRateLimit429Count = 0

      if (!res.ok) break
      data = await res.json()
    } else {
      data = await clioFetch<{ data: T[]; meta?: { paging?: { next?: string } } }>(
        connectionId,
        admin,
        path,
        { params: { ...extraParams, limit: pageSize }, fields },
      )
    }

    const items = data.data ?? []
    allItems.push(...items)

    nextUrl = data.meta?.paging?.next ?? null
    if (!nextUrl || items.length === 0) break

    page++
    if (page > 500) break
  }

  return allItems
}

export { CLIO_BASE_URL }
