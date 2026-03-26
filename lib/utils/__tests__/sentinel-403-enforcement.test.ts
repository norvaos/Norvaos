/**
 * SENTINEL 403 Enforcement Tests
 *
 * Team SENTINEL requirement: Cross-tenant access attempts must throw
 * a hard 403 error, NOT return an empty result set.
 *
 * These tests verify the tenant-guard middleware, API guard wrapper,
 * and the TenantViolationAlert detection utility.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { makeMockSupabase, type TableOverrides } from './helpers/supabase-mock'

// ── Mocks ──────────────────────────────────────────────────────────────────

// Mock the region guard to prevent CriticalComplianceError at module load
vi.mock('@/lib/supabase/region-guard', () => ({
  enforceRegionCompliance: vi.fn(),
  CriticalComplianceError: class CriticalComplianceError extends Error {
    constructor(msg: string) { super(msg); this.name = 'CriticalComplianceError' }
  },
}))

// Mock the Supabase server client (imported by auth.ts)
vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(),
  createClient: vi.fn(),
}))

// Mock next/headers (imported by auth.ts)
vi.mock('next/headers', () => ({
  cookies: vi.fn().mockResolvedValue({ get: vi.fn(), set: vi.fn(), getAll: vi.fn().mockReturnValue([]) }),
}))

// Mock cache service (imported by auth.ts)
vi.mock('@/lib/services/cache', () => ({
  getJson: vi.fn().mockResolvedValue(null),
  setJson: vi.fn().mockResolvedValue(undefined),
  cacheKey: vi.fn((...args: string[]) => args.join(':')),
}))

// Mock request-timing (imported by auth.ts)
vi.mock('@/lib/middleware/request-timing', () => ({
  incrementDbCalls: vi.fn(),
}))

// Mock error-reporter (imported by sentinel-api-guard.ts)
vi.mock('@/lib/monitoring/error-reporter', () => ({
  reportRLSViolation: vi.fn(),
  reportError: vi.fn(),
}))

// Mock the admin client  -  tenant-guard.ts calls createAdminClient() internally
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(),
}))

// Mock sentinel audit logger  -  sentinel-api-guard.ts calls logSentinelEvent
vi.mock('@/lib/services/sentinel-audit', () => ({
  logSentinelEvent: vi.fn().mockResolvedValue(undefined),
}))

// Mock NextResponse for withSentinelGuard tests
vi.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({
      body,
      status: init?.status ?? 200,
      async json() { return body },
    }),
  },
}))

// ── Imports (after mocks) ──────────────────────────────────────────────────

import { createAdminClient } from '@/lib/supabase/admin'
import { logSentinelEvent } from '@/lib/services/sentinel-audit'
import {
  TenantViolationError,
  assertTenantOwnership,
  fetchWithTenantGuard,
} from '@/lib/middleware/tenant-guard'
import {
  assertBodyTenantMatch,
  withSentinelGuard,
} from '@/lib/middleware/sentinel-api-guard'
import { AuthError } from '@/lib/services/auth'
import type { AuthContext } from '@/lib/services/auth'

// ── Test fixtures ──────────────────────────────────────────────────────────

const TENANT_A = 'tenant-aaa-111'
const TENANT_B = 'tenant-bbb-222'
const USER_ID = 'user-001'
const AUTH_USER_ID = 'auth-uid-001'
const RECORD_ID = 'record-xyz-789'

function makeAuth(tenantId: string = TENANT_A): AuthContext {
  return {
    userId: USER_ID,
    authUserId: AUTH_USER_ID,
    tenantId,
    role: { name: 'Admin', permissions: {} },
    is_system: false,
  } as AuthContext
}

/**
 * Wire up the admin mock to return a specific supabase mock.
 */
function setAdminMock(tables: TableOverrides) {
  const mock = makeMockSupabase(tables)
  ;(createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue(mock)
  return mock
}

// ═══════════════════════════════════════════════════════════════════════════
// Section A: assertTenantOwnership
// ═══════════════════════════════════════════════════════════════════════════

describe('SENTINEL – assertTenantOwnership', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Provide a default admin mock with rpc stub so the sentinel_log_event
    // fire-and-forget call inside assertTenantOwnership does not blow up
    const baseMock = makeMockSupabase({})
    const adminMock = {
      ...baseMock,
      rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
    }
    ;(createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue(adminMock)
  })

  it('passes silently when tenant IDs match', async () => {
    const auth = makeAuth(TENANT_A)
    await expect(
      assertTenantOwnership(auth, TENANT_A, 'matters', RECORD_ID),
    ).resolves.toBeUndefined()
  })

  it('throws TenantViolationError (403) when tenant IDs do not match', async () => {
    const auth = makeAuth(TENANT_A)
    try {
      await assertTenantOwnership(auth, TENANT_B, 'matters', RECORD_ID)
      expect.fail('Expected TenantViolationError to be thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(TenantViolationError)
      const violation = err as TenantViolationError
      expect(violation.status).toBe(403)
      expect(violation.violationType).toBe('CROSS_TENANT_ACCESS')
      expect(violation.userTenantId).toBe(TENANT_A)
      expect(violation.attemptedTenantId).toBe(TENANT_B)
      expect(violation.tableName).toBe('matters')
      expect(violation.recordId).toBe(RECORD_ID)
      expect(violation.message).toContain('SENTINEL-403')
    }
  })

  it('TenantViolationError extends AuthError', () => {
    const err = new TenantViolationError(TENANT_A, TENANT_B, 'contacts')
    expect(err).toBeInstanceOf(AuthError)
    expect(err).toBeInstanceOf(Error)
  })

  it('logs the violation via sentinel_log_event RPC on mismatch', async () => {
    const rpcMock = vi.fn().mockResolvedValue({ data: null, error: null })
    const adminMock = {
      rpc: rpcMock,
      from: () => makeMockSupabase({}).from('_'),
    }
    ;(createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue(adminMock)

    const auth = makeAuth(TENANT_A)
    await assertTenantOwnership(auth, TENANT_B, 'invoices', RECORD_ID).catch(() => {})

    expect(rpcMock).toHaveBeenCalledWith('sentinel_log_event', expect.objectContaining({
      p_event_type: 'TENANT_VIOLATION',
      p_severity: 'critical',
      p_tenant_id: TENANT_A,
      p_user_id: USER_ID,
      p_table_name: 'invoices',
      p_record_id: RECORD_ID,
    }))
  })

  it('does NOT call sentinel_log_event when tenants match', async () => {
    const rpcMock = vi.fn()
    const adminMock = {
      rpc: rpcMock,
      from: () => makeMockSupabase({}).from('_'),
    }
    ;(createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue(adminMock)

    const auth = makeAuth(TENANT_A)
    await assertTenantOwnership(auth, TENANT_A, 'matters')

    expect(rpcMock).not.toHaveBeenCalled()
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Section B: fetchWithTenantGuard
// ═══════════════════════════════════════════════════════════════════════════

describe('SENTINEL – fetchWithTenantGuard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('throws 404 AuthError when record does not exist', async () => {
    setAdminMock({
      matters: {
        single: { data: null, error: { code: 'PGRST116', message: 'not found' } },
      },
    })

    const auth = makeAuth(TENANT_A)
    try {
      await fetchWithTenantGuard(auth, 'matters', RECORD_ID)
      expect.fail('Expected 404 AuthError to be thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(AuthError)
      expect((err as AuthError).status).toBe(404)
      expect((err as AuthError).message).toContain('matters record not found')
    }
  })

  it('throws 403 TenantViolationError when record belongs to different tenant', async () => {
    // Record exists but belongs to TENANT_B  -  need rpc stub for audit log
    const baseMock = makeMockSupabase({
      matters: {
        single: {
          data: { id: RECORD_ID, tenant_id: TENANT_B, name: 'Foreign Matter' },
          error: null,
        },
      },
    })
    const adminMock = {
      ...baseMock,
      rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
    }
    ;(createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue(adminMock)

    const auth = makeAuth(TENANT_A)
    try {
      await fetchWithTenantGuard(auth, 'matters', RECORD_ID)
      expect.fail('Expected TenantViolationError to be thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(TenantViolationError)
      const violation = err as TenantViolationError
      expect(violation.status).toBe(403)
      expect(violation.userTenantId).toBe(TENANT_A)
      expect(violation.attemptedTenantId).toBe(TENANT_B)
    }
  })

  it('returns the record when tenant matches', async () => {
    const mockRecord = { id: RECORD_ID, tenant_id: TENANT_A, name: 'My Matter' }
    setAdminMock({
      matters: {
        single: { data: mockRecord, error: null },
      },
    })

    const auth = makeAuth(TENANT_A)
    const result = await fetchWithTenantGuard<typeof mockRecord>(auth, 'matters', RECORD_ID)
    expect(result).toEqual(mockRecord)
    expect(result.tenant_id).toBe(TENANT_A)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Section C: assertBodyTenantMatch
// ═══════════════════════════════════════════════════════════════════════════

describe('SENTINEL – assertBodyTenantMatch', () => {
  it('throws 403 AuthError when body tenant_id does not match auth tenant', () => {
    expect(() => {
      assertBodyTenantMatch(TENANT_B, TENANT_A, 'POST /api/matters')
    }).toThrow(AuthError)

    try {
      assertBodyTenantMatch(TENANT_B, TENANT_A, 'POST /api/matters')
    } catch (err) {
      expect(err).toBeInstanceOf(AuthError)
      expect((err as AuthError).status).toBe(403)
      expect((err as AuthError).message).toContain('SENTINEL-403')
      expect((err as AuthError).message).toContain('POST /api/matters')
      expect((err as AuthError).message).toContain(TENANT_A)
      expect((err as AuthError).message).toContain(TENANT_B)
    }
  })

  it('passes silently when body tenant_id matches auth tenant', () => {
    expect(() => {
      assertBodyTenantMatch(TENANT_A, TENANT_A, 'POST /api/matters')
    }).not.toThrow()
  })

  it('passes silently when body tenant_id is null (no assertion needed)', () => {
    expect(() => {
      assertBodyTenantMatch(null, TENANT_A, 'POST /api/matters')
    }).not.toThrow()
  })

  it('passes silently when body tenant_id is undefined (no assertion needed)', () => {
    expect(() => {
      assertBodyTenantMatch(undefined, TENANT_A, 'POST /api/matters')
    }).not.toThrow()
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Section D: isTenantViolationError (tested via withSentinelGuard)
// ═══════════════════════════════════════════════════════════════════════════

describe('SENTINEL – isTenantViolationError detection via withSentinelGuard', () => {
  const mockRequest = new Request('http://localhost:3000/api/matters/123', {
    method: 'GET',
  })

  let errorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.clearAllMocks()
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    errorSpy.mockRestore()
  })

  it('catches PostgreSQL 42501 error and returns structured 403 JSON', async () => {
    const handler = vi.fn().mockRejectedValue({
      code: '42501',
      message: 'new row violates row-level security policy for table "matters"',
    })

    const guarded = withSentinelGuard(handler, 'GET /api/matters/[id]')
    const response = await guarded(mockRequest, {})

    expect(response.status).toBe(403)
    const body = await response.json()
    expect(body.code).toBe('SENTINEL_TENANT_VIOLATION')
    expect(body.message).toContain('cross-tenant access')
    expect(body.details).toContain('row-level security')
  })

  it('catches nested Supabase error with code 42501', async () => {
    const handler = vi.fn().mockRejectedValue({
      error: {
        code: '42501',
        message: 'insufficient_privilege',
      },
    })

    const guarded = withSentinelGuard(handler, 'PATCH /api/contacts/[id]')
    const response = await guarded(mockRequest, {})

    expect(response.status).toBe(403)
    const body = await response.json()
    expect(body.code).toBe('SENTINEL_TENANT_VIOLATION')
  })

  it('catches errors with SENTINEL-403 message prefix', async () => {
    const handler = vi.fn().mockRejectedValue({
      message: 'SENTINEL-403: Cross-tenant access denied',
    })

    const guarded = withSentinelGuard(handler, 'DELETE /api/tasks/[id]')
    const response = await guarded(mockRequest, {})

    expect(response.status).toBe(403)
    const body = await response.json()
    expect(body.code).toBe('SENTINEL_TENANT_VIOLATION')
  })

  it('fires logSentinelEvent on 42501 violation', async () => {
    const handler = vi.fn().mockRejectedValue({
      code: '42501',
      message: 'RLS violation',
    })

    const guarded = withSentinelGuard(handler, 'GET /api/invoices')
    await guarded(mockRequest, {})

    expect(logSentinelEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'TENANT_VIOLATION',
        severity: 'critical',
        details: expect.objectContaining({
          route: 'GET /api/invoices',
          request_method: 'GET',
        }),
      }),
    )
  })

  it('passes through AuthError with its original status', async () => {
    const handler = vi.fn().mockRejectedValue(
      new AuthError('Not authenticated', 401),
    )

    const guarded = withSentinelGuard(handler, 'GET /api/matters')
    const response = await guarded(mockRequest, {})

    expect(response.status).toBe(401)
    const body = await response.json()
    expect(body.error).toBe('Not authenticated')
  })

  it('returns 500 for unknown errors without leaking details', async () => {
    const handler = vi.fn().mockRejectedValue(new TypeError('Cannot read properties'))

    const guarded = withSentinelGuard(handler, 'GET /api/matters')
    const response = await guarded(mockRequest, {})

    expect(response.status).toBe(500)
    const body = await response.json()
    expect(body.error).toBe('Internal server error')
    // Must not leak the actual error message
    expect(JSON.stringify(body)).not.toContain('Cannot read properties')
  })

  it('returns the handler response on success (no interception)', async () => {
    const { NextResponse } = await import('next/server')
    const handler = vi.fn().mockResolvedValue(
      NextResponse.json({ id: RECORD_ID, name: 'Test Matter' }, { status: 200 }),
    )

    const guarded = withSentinelGuard(handler, 'GET /api/matters/[id]')
    const response = await guarded(mockRequest, {})

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.id).toBe(RECORD_ID)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Section E: TenantViolationError shape
// ═══════════════════════════════════════════════════════════════════════════

describe('SENTINEL – TenantViolationError structure', () => {
  it('carries all required metadata for audit logging', () => {
    const err = new TenantViolationError(TENANT_A, TENANT_B, 'documents', RECORD_ID)
    expect(err.violationType).toBe('CROSS_TENANT_ACCESS')
    expect(err.userTenantId).toBe(TENANT_A)
    expect(err.attemptedTenantId).toBe(TENANT_B)
    expect(err.tableName).toBe('documents')
    expect(err.recordId).toBe(RECORD_ID)
    expect(err.status).toBe(403)
  })

  it('defaults recordId to null when not provided', () => {
    const err = new TenantViolationError(TENANT_A, TENANT_B, 'contacts')
    expect(err.recordId).toBeNull()
  })

  it('message includes both tenant IDs for debugging', () => {
    const err = new TenantViolationError(TENANT_A, TENANT_B, 'matters')
    expect(err.message).toContain(TENANT_A)
    expect(err.message).toContain(TENANT_B)
    expect(err.message).toContain('SENTINEL-403')
  })
})
