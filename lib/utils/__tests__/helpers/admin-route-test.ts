/**
 * Shared helpers for testing platform-admin API routes in NorvaOS.
 *
 * Usage:
 *   import { makeAuthenticatedAdminRequest, TEST_IDS } from './helpers/admin-route-test'
 *
 *   const req = makeAuthenticatedAdminRequest(
 *     `http://localhost/api/admin/tenants/${TEST_IDS.TENANT_ID}/status`,
 *     { method: 'PATCH', body: { status: 'suspended', reason: 'Testing' } }
 *   )
 *   const res = await statusPATCH(req, { params: Promise.resolve({ id: TEST_IDS.TENANT_ID }) })
 */

/** Standard test UUIDs  -  deterministic for assertion matching */
export const TEST_IDS = {
  TENANT_ID: '00000000-0000-0000-0000-000000000001',
  USER_ID: '00000000-0000-0000-0000-000000000002',
  ADMIN_ID: '00000000-0000-0000-0000-000000000003',
  ROLE_ID: '00000000-0000-0000-0000-000000000004',
  INVITE_ID: '00000000-0000-0000-0000-000000000005',
} as const

/** Standard PLATFORM_ADMIN_SECRET for tests  -  must match vi.stubEnv */
export const TEST_ADMIN_SECRET = 'test-platform-admin-secret-for-tests'

export interface AdminRequestOptions {
  method?: string
  body?: Record<string, unknown>
  bearerToken?: string
  ip?: string
  userAgent?: string
}

/**
 * Create a mock Request object for admin route testing.
 *
 * @param url - Full URL (e.g. `http://localhost/api/admin/tenants/...`)
 * @param options - HTTP method, body, auth header, IP, user-agent
 */
export function makeAdminRequest(
  url: string,
  options?: AdminRequestOptions,
): Request {
  const { method = 'GET', body, bearerToken, ip, userAgent } = options ?? {}
  const headers: Record<string, string> = {
    'content-type': 'application/json',
  }

  if (bearerToken) {
    headers['authorization'] = `Bearer ${bearerToken}`
  }
  if (ip) {
    headers['x-forwarded-for'] = ip
  }
  if (userAgent) {
    headers['user-agent'] = userAgent
  }

  return new Request(url, {
    method,
    headers,
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
}

/**
 * Create an authenticated admin request (pre-fills Bearer token with TEST_ADMIN_SECRET).
 *
 * Shorthand for `makeAdminRequest(url, { ...options, bearerToken: TEST_ADMIN_SECRET })`
 */
export function makeAuthenticatedAdminRequest(
  url: string,
  options?: Omit<AdminRequestOptions, 'bearerToken'>,
): Request {
  return makeAdminRequest(url, {
    ...options,
    bearerToken: TEST_ADMIN_SECRET,
  })
}
