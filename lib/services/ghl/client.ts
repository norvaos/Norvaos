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
 * Handles rate limiting with automatic retry.
 */
export async function ghlFetch<T = unknown>(
  connectionId: string,
  admin: SupabaseClient<Database>,
  path: string,
  options: GhlFetchOptions = {},
): Promise<T> {
  const { method = 'GET', body, params } = options
  const { accessToken } = await getValidGhlToken(connectionId, admin)

  let url = path.startsWith('http') ? path : `${GHL_BASE_URL}/${path}`
  if (params) {
    const searchParams = new URLSearchParams()
    for (const [key, val] of Object.entries(params)) {
      searchParams.set(key, String(val))
    }
    url += (url.includes('?') ? '&' : '?') + searchParams.toString()
  }

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

  // Rate limiting — retry after delay
  if (res.status === 429) {
    const retryAfter = parseInt(res.headers.get('Retry-After') || '10', 10)
    log.warn('[ghl-client] Rate limited, retrying', { retry_after: retryAfter })
    await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000))
    return ghlFetch<T>(connectionId, admin, path, options)
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
