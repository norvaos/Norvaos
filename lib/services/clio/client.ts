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
 */
export async function clioFetch<T = unknown>(
  connectionId: string,
  admin: SupabaseClient<Database>,
  path: string,
  options: ClioFetchOptions = {},
): Promise<T> {
  const { method = 'GET', body, params, fields } = options
  const accessToken = await getValidClioToken(connectionId, admin)

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

  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  }

  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })

  // Rate limiting
  if (res.status === 429) {
    const retryAfter = parseInt(res.headers.get('Retry-After') || '5', 10)
    log.warn('[clio-client] Rate limited, retrying', { retry_after: retryAfter })
    await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000))
    return clioFetch<T>(connectionId, admin, path, options)
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

/**
 * Paginate through all results from a Clio list endpoint.
 * Clio uses cursor-based pagination via `page_token` in the paging object.
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

  while (true) {
    let data: { data: T[]; meta?: { paging?: { next?: string } } }

    if (nextUrl) {
      // Follow the next URL directly (it includes page_token)
      const accessToken = await getValidClioToken(connectionId, admin)
      const res = await fetch(nextUrl, {
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      })

      if (res.status === 429) {
        const retryAfter = parseInt(res.headers.get('Retry-After') || '5', 10)
        await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000))
        continue
      }

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
