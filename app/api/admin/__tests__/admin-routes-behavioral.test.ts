/**
 * Behavioral tests for critical platform-admin mutation routes.
 * ═══════════════════════════════════════════════════════════
 *
 * These tests actually call the route handlers with mocked Supabase
 * and auth, verifying real business logic paths  -  not just source strings.
 *
 * Pattern: vi.hoisted → vi.mock → import handlers → test
 *
 * Tested routes:
 *   A. PATCH /status    -  closed→active guard, idempotency, audit
 *   B. PATCH /features  -  optimistic locking, merge semantics
 *   C. POST /deactivate  -  last-admin guard, idempotency
 *   D. POST /reactivate  -  seat-limit pre-check, idempotency
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextResponse } from 'next/server'

// ═══════════════════════════════════════════════════════════════════════════
// Hoisted mocks  -  must be before vi.mock calls
// ═══════════════════════════════════════════════════════════════════════════

const mocks = vi.hoisted(() => {
  class PlatformAdminError extends Error {
    status: number
    constructor(message: string, status: number) {
      super(message)
      this.name = 'PlatformAdminError'
      this.status = status
    }
  }

  return {
    PlatformAdminError,
    requirePlatformAdmin: vi.fn(),
    checkAdminRateLimit: vi.fn(() => null),
    extractRequestMeta: vi.fn(() => ({ ip: '127.0.0.1', userAgent: 'test-agent' })),
    createAdminClient: vi.fn(),
    logPlatformAdminAudit: vi.fn(),
    checkSeatLimit: vi.fn(),
    seatLimitResponse: vi.fn(),
    log: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
    withRequestId: vi.fn((fn: () => unknown) => fn()),
    getRequestId: vi.fn(() => 'test-request-id'),
  }
})

// ═══════════════════════════════════════════════════════════════════════════
// Module mocks
// ═══════════════════════════════════════════════════════════════════════════

vi.mock('@/lib/services/platform-admin', () => ({
  requirePlatformAdmin: mocks.requirePlatformAdmin,
  checkAdminRateLimit: mocks.checkAdminRateLimit,
  extractRequestMeta: mocks.extractRequestMeta,
  PlatformAdminError: mocks.PlatformAdminError,
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: mocks.createAdminClient,
}))

vi.mock('@/lib/services/platform-admin-audit', () => ({
  logPlatformAdminAudit: mocks.logPlatformAdminAudit,
}))

vi.mock('@/lib/services/seat-limit', () => ({
  checkSeatLimit: mocks.checkSeatLimit,
  seatLimitResponse: mocks.seatLimitResponse,
}))

vi.mock('@/lib/utils/logger', () => ({
  log: mocks.log,
}))

vi.mock('@/lib/utils/request-id', () => ({
  withRequestId: mocks.withRequestId,
  getRequestId: mocks.getRequestId,
}))

// ═══════════════════════════════════════════════════════════════════════════
// Import route handlers (after mocks are wired)
// ═══════════════════════════════════════════════════════════════════════════

import { PATCH as statusPATCH } from '@/app/api/admin/tenants/[id]/status/route'
import { PATCH as featuresPATCH } from '@/app/api/admin/tenants/[id]/features/route'
import { POST as deactivatePOST } from '@/app/api/admin/tenants/[id]/users/[userId]/deactivate/route'
import { POST as reactivatePOST } from '@/app/api/admin/tenants/[id]/users/[userId]/reactivate/route'

// ═══════════════════════════════════════════════════════════════════════════
// Shared helpers
// ═══════════════════════════════════════════════════════════════════════════

import { makeMockSupabase } from '@/lib/utils/__tests__/helpers/supabase-mock'
import { TEST_IDS } from '@/lib/utils/__tests__/helpers/admin-route-test'

const { TENANT_ID, USER_ID, ADMIN_ID, ROLE_ID } = TEST_IDS

/** Create a Request with JSON body */
function makeReq(method: string, url: string, body?: Record<string, unknown>) {
  return new Request(url, {
    method,
    headers: { 'content-type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
}

/** Wrap route params in the Next.js App Router context shape */
function routeCtx(params: Record<string, string>) {
  return { params: Promise.resolve(params) }
}

// ═══════════════════════════════════════════════════════════════════════════
// Setup  -  reset mocks and configure default auth
// ═══════════════════════════════════════════════════════════════════════════

beforeEach(() => {
  vi.clearAllMocks()

  // Default: authenticated platform admin via Bearer token
  mocks.requirePlatformAdmin.mockResolvedValue({
    adminId: ADMIN_ID,
    authMethod: 'bearer-token',
  })
  mocks.checkAdminRateLimit.mockReturnValue(null)
  mocks.withRequestId.mockImplementation((fn: () => unknown) => fn())
  mocks.getRequestId.mockReturnValue('test-request-id')
  mocks.extractRequestMeta.mockReturnValue({ ip: '127.0.0.1', userAgent: 'test-agent' })
})

// ═══════════════════════════════════════════════════════════════════════════
// A. PATCH /api/admin/tenants/[id]/status  -  tenant lifecycle
// ═══════════════════════════════════════════════════════════════════════════

describe('PATCH /api/admin/tenants/[id]/status', () => {
  const url = `http://localhost/api/admin/tenants/${TENANT_ID}/status`

  it('returns 409 when transitioning closed → active (permanent guard)', async () => {
    mocks.createAdminClient.mockReturnValue(
      makeMockSupabase({
        tenants: { single: { data: { status: 'closed' }, error: null } },
      }),
    )

    const res = await statusPATCH(
      makeReq('PATCH', url, { status: 'active', reason: 'Want to reactivate' }),
      routeCtx({ id: TENANT_ID }),
    )

    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toContain('permanent')
  })

  it('returns idempotent no-op when status already matches', async () => {
    mocks.createAdminClient.mockReturnValue(
      makeMockSupabase({
        tenants: { single: { data: { status: 'active' }, error: null } },
      }),
    )

    const res = await statusPATCH(
      makeReq('PATCH', url, { status: 'active', reason: 'No-op test reason' }),
      routeCtx({ id: TENANT_ID }),
    )

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.changed).toBe(false)
    expect(body.data.status).toBe('active')
  })

  it('successfully transitions active → suspended and logs audit', async () => {
    mocks.createAdminClient.mockReturnValue(
      makeMockSupabase({
        tenants: { single: { data: { status: 'active' }, error: null } },
      }),
    )

    const res = await statusPATCH(
      makeReq('PATCH', url, { status: 'suspended', reason: 'Billing overdue notice' }),
      routeCtx({ id: TENANT_ID }),
    )

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.changed).toBe(true)
    expect(body.data.status).toBe('suspended')
    expect(body.data.previous_status).toBe('active')

    // Verify audit was fired with correct payload
    expect(mocks.logPlatformAdminAudit).toHaveBeenCalledOnce()
    expect(mocks.logPlatformAdminAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'tenant_status_changed',
        admin_id: ADMIN_ID,
        tenant_id: TENANT_ID,
        changes: { previous: 'active', new: 'suspended' },
      }),
    )
  })

  it('returns 400 for invalid status value', async () => {
    const res = await statusPATCH(
      makeReq('PATCH', url, { status: 'invalid', reason: 'Test reason here' }),
      routeCtx({ id: TENANT_ID }),
    )

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('status must be one of')
  })

  it('returns 400 when reason is too short', async () => {
    const res = await statusPATCH(
      makeReq('PATCH', url, { status: 'suspended', reason: 'hi' }),
      routeCtx({ id: TENANT_ID }),
    )

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('at least 5 characters')
  })

  it('returns 403 without valid auth', async () => {
    mocks.requirePlatformAdmin.mockRejectedValue(
      new mocks.PlatformAdminError('Not authorized as platform admin.', 403),
    )

    const res = await statusPATCH(
      makeReq('PATCH', url, { status: 'suspended', reason: 'Test reason here' }),
      routeCtx({ id: TENANT_ID }),
    )

    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.error).toContain('Not authorized')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// B. PATCH /api/admin/tenants/[id]/features  -  optimistic locking
// ═══════════════════════════════════════════════════════════════════════════

describe('PATCH /api/admin/tenants/[id]/features', () => {
  const url = `http://localhost/api/admin/tenants/${TENANT_ID}/features`
  const freshTimestamp = '2024-06-01T00:00:00.000Z'

  it('returns 409 OPTIMISTIC_LOCK_CONFLICT on stale expected_updated_at', async () => {
    mocks.createAdminClient.mockReturnValue(
      makeMockSupabase({
        tenants: {
          single: {
            data: { feature_flags: { chat: true }, updated_at: '2024-06-02T00:00:00.000Z' },
            error: null,
          },
        },
      }),
    )

    const res = await featuresPATCH(
      makeReq('PATCH', url, {
        feature_flags: { billing: true },
        reason: 'Enable billing for tenant',
        expected_updated_at: '2024-06-01T00:00:00.000Z', // stale
      }),
      routeCtx({ id: TENANT_ID }),
    )

    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.code).toBe('OPTIMISTIC_LOCK_CONFLICT')
    expect(body.current).toBeDefined()
    expect(body.current.raw).toEqual({ chat: true })
    expect(body.current.updated_at).toBe('2024-06-02T00:00:00.000Z')
  })

  it('merges flags (not replaces) on success  -  existing keys preserved', async () => {
    mocks.createAdminClient.mockReturnValue(
      makeMockSupabase({
        tenants: {
          single: {
            data: { feature_flags: { chat: true, portal: false }, updated_at: freshTimestamp },
            error: null,
          },
        },
      }),
    )

    const res = await featuresPATCH(
      makeReq('PATCH', url, {
        feature_flags: { billing: true },
        reason: 'Enable billing for testing',
        expected_updated_at: freshTimestamp,
      }),
      routeCtx({ id: TENANT_ID }),
    )

    expect(res.status).toBe(200)
    const body = await res.json()
    // Merged: chat + portal preserved, billing added
    expect(body.data.raw).toEqual({ chat: true, portal: false, billing: true })
  })

  it('returns 400 for non-boolean flag values', async () => {
    const res = await featuresPATCH(
      makeReq('PATCH', url, {
        feature_flags: { billing: 'yes' },
        reason: 'Enable billing for tenant',
        expected_updated_at: freshTimestamp,
      }),
      routeCtx({ id: TENANT_ID }),
    )

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('billing')
    expect(body.error).toContain('boolean')
  })

  it('409 response includes current state for client refresh', async () => {
    mocks.createAdminClient.mockReturnValue(
      makeMockSupabase({
        tenants: {
          single: {
            data: {
              feature_flags: { chat: true, notifications_push: true },
              updated_at: '2024-07-01T00:00:00.000Z',
            },
            error: null,
          },
        },
      }),
    )

    const res = await featuresPATCH(
      makeReq('PATCH', url, {
        feature_flags: { billing: true },
        reason: 'Test conflict resolution',
        expected_updated_at: '2024-06-01T00:00:00.000Z', // stale
      }),
      routeCtx({ id: TENANT_ID }),
    )

    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.current.raw).toEqual({ chat: true, notifications_push: true })
    expect(body.current.effective).toBeDefined()
    expect(body.current.updated_at).toBe('2024-07-01T00:00:00.000Z')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// C. POST /api/admin/tenants/[id]/users/[userId]/deactivate  -  last-admin guard
// ═══════════════════════════════════════════════════════════════════════════

describe('POST /api/admin/tenants/[id]/users/[userId]/deactivate', () => {
  const url = `http://localhost/api/admin/tenants/${TENANT_ID}/users/${USER_ID}/deactivate`

  it('returns 409 when deactivating last active admin', async () => {
    mocks.createAdminClient.mockReturnValue(
      makeMockSupabase({
        users: {
          single: {
            data: { id: USER_ID, email: 'admin@test.com', is_active: true, role_id: ROLE_ID },
            error: null,
          },
          count: 1, // only 1 active admin  -  the one being deactivated
        },
        roles: {
          single: { data: { name: 'Admin' }, error: null },
        },
      }),
    )

    const res = await deactivatePOST(
      makeReq('POST', url, { reason: 'Remove this admin user' }),
      routeCtx({ id: TENANT_ID, userId: USER_ID }),
    )

    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toContain('last active admin')
  })

  it('returns idempotent no-op for already-inactive user (changed: false)', async () => {
    mocks.createAdminClient.mockReturnValue(
      makeMockSupabase({
        users: {
          single: {
            data: { id: USER_ID, email: 'user@test.com', is_active: false, role_id: null },
            error: null,
          },
        },
      }),
    )

    const res = await deactivatePOST(
      makeReq('POST', url, { reason: 'Deactivate inactive user' }),
      routeCtx({ id: TENANT_ID, userId: USER_ID }),
    )

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.changed).toBe(false)
    expect(body.data.is_active).toBe(false)
  })

  it('successfully deactivates and logs audit with email + reason', async () => {
    mocks.createAdminClient.mockReturnValue(
      makeMockSupabase({
        users: {
          single: {
            data: { id: USER_ID, email: 'user@test.com', is_active: true, role_id: ROLE_ID },
            error: null,
          },
          count: 5, // multiple admins  -  safe to deactivate one
        },
        roles: {
          single: { data: { name: 'Admin' }, error: null },
        },
      }),
    )

    const res = await deactivatePOST(
      makeReq('POST', url, { reason: 'Offboarding team member' }),
      routeCtx({ id: TENANT_ID, userId: USER_ID }),
    )

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.changed).toBe(true)
    expect(body.data.is_active).toBe(false)

    // Verify audit logged with correct payload
    expect(mocks.logPlatformAdminAudit).toHaveBeenCalledOnce()
    expect(mocks.logPlatformAdminAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'user_deactivated',
        changes: expect.objectContaining({ email: 'user@test.com' }),
        reason: 'Offboarding team member',
      }),
    )
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// D. POST /api/admin/tenants/[id]/users/[userId]/reactivate  -  seat-limit
// ═══════════════════════════════════════════════════════════════════════════

describe('POST /api/admin/tenants/[id]/users/[userId]/reactivate', () => {
  const url = `http://localhost/api/admin/tenants/${TENANT_ID}/users/${USER_ID}/reactivate`

  it('returns 409 when seat limit reached (delegates to seatLimitResponse)', async () => {
    mocks.createAdminClient.mockReturnValue(
      makeMockSupabase({
        users: {
          single: {
            data: { id: USER_ID, email: 'user@test.com', is_active: false },
            error: null,
          },
        },
      }),
    )
    mocks.checkSeatLimit.mockResolvedValue({ allowed: false, reason: 'Seat limit reached' })
    mocks.seatLimitResponse.mockReturnValue(
      NextResponse.json(
        { error: 'Seat limit reached.', code: 'SEAT_LIMIT_REACHED' },
        { status: 409 },
      ),
    )

    const res = await reactivatePOST(
      makeReq('POST', url, { reason: 'Reactivate user account' }),
      routeCtx({ id: TENANT_ID, userId: USER_ID }),
    )

    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.code).toBe('SEAT_LIMIT_REACHED')
    expect(mocks.checkSeatLimit).toHaveBeenCalledWith(TENANT_ID)
  })

  it('returns idempotent no-op for already-active user (changed: false)', async () => {
    mocks.createAdminClient.mockReturnValue(
      makeMockSupabase({
        users: {
          single: {
            data: { id: USER_ID, email: 'user@test.com', is_active: true },
            error: null,
          },
        },
      }),
    )

    const res = await reactivatePOST(
      makeReq('POST', url, { reason: 'Reactivate active user' }),
      routeCtx({ id: TENANT_ID, userId: USER_ID }),
    )

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.changed).toBe(false)
    expect(body.data.is_active).toBe(true)
  })

  it('successfully reactivates when seats available, logs audit', async () => {
    mocks.createAdminClient.mockReturnValue(
      makeMockSupabase({
        users: {
          single: {
            data: { id: USER_ID, email: 'user@test.com', is_active: false },
            error: null,
          },
        },
      }),
    )
    mocks.checkSeatLimit.mockResolvedValue({ allowed: true })

    const res = await reactivatePOST(
      makeReq('POST', url, { reason: 'Bringing user back onboard' }),
      routeCtx({ id: TENANT_ID, userId: USER_ID }),
    )

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.changed).toBe(true)
    expect(body.data.is_active).toBe(true)

    // Verify audit logged with correct payload
    expect(mocks.logPlatformAdminAudit).toHaveBeenCalledOnce()
    expect(mocks.logPlatformAdminAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'user_reactivated',
        changes: expect.objectContaining({
          email: 'user@test.com',
          is_active: { before: false, after: true },
        }),
      }),
    )
  })
})
