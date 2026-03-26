/**
 * Invoice PDF endpoint – permission enforcement tests.
 *
 * Verifies that a user WITHOUT billing:view gets a 403 response
 * and that a denied-access audit event is written.
 *
 * Strategy: mock the two external boundaries (auth + Supabase queries)
 * and call the GET handler directly.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Constants ────────────────────────────────────────────────────────────────

const MOCK_TENANT_ID = '00000000-0000-0000-0000-000000000001'
const MOCK_USER_ID = '00000000-0000-0000-0000-000000000002'
const MOCK_INVOICE_ID = '00000000-0000-0000-0000-000000000099'

// ── Hoisted mocks (vi.hoisted runs before vi.mock factories) ─────────────────

const { mockLogAuditServer, mockGenerateInvoicePdf } = vi.hoisted(() => {
  return {
    mockLogAuditServer: vi.fn().mockResolvedValue(undefined),
    mockGenerateInvoicePdf: vi.fn().mockRejectedValue(
      new Error('generateInvoicePdf should not be called for denied requests')
    ),
  }
})

// ── Chainable Supabase mock ──────────────────────────────────────────────────

function makeMockSupabase() {
  function mockQueryBuilder(table: string) {
    const self: Record<string, (...args: unknown[]) => unknown> = {}
    const methods = ['select', 'eq', 'single', 'insert', 'order', 'limit', 'maybeSingle']
    for (const m of methods) {
      self[m] = (..._args: unknown[]) => {
        // Users query → return a user with a non-Admin role_id
        if (table === 'users' && m === 'single') {
          return { data: { role_id: 'role-lawyer-id' }, error: null }
        }
        // Roles query → return Lawyer role WITHOUT billing.view
        if (table === 'roles' && m === 'single') {
          return {
            data: {
              name: 'Lawyer',
              permissions: {
                contacts: { view: true, create: true, edit: true, delete: false },
                matters: { view: true, create: true, edit: true, delete: false },
                // billing is intentionally ABSENT → billing.view is falsy
              },
            },
            error: null,
          }
        }
        return self
      }
    }
    return self
  }

  return { from: (table: string) => mockQueryBuilder(table) }
}

// ── Infrastructure mocks (prevent region guard + transitive import failures) ──

vi.mock('@/lib/supabase/region-guard', () => ({
  enforceRegionCompliance: vi.fn(),
  CriticalComplianceError: class CriticalComplianceError extends Error {
    constructor(msg: string) { super(msg); this.name = 'CriticalComplianceError' }
  },
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn().mockReturnValue({
    from: () => ({
      select: () => ({ eq: () => ({ single: () => ({ data: null, error: null }) }) }),
      insert: () => ({ select: () => ({ single: () => ({ data: null, error: null }) }) }),
    }),
  }),
}))

vi.mock('@/lib/middleware/tenant-limiter', () => ({
  checkTenantLimit: vi.fn().mockResolvedValue({ allowed: true }),
  rateLimitResponse: vi.fn(),
}))

vi.mock('@/lib/middleware/request-timing', () => ({
  incrementDbCalls: vi.fn(),
  withTiming: vi.fn((handler: Function) => handler),
}))

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(),
  createClient: vi.fn(),
}))

vi.mock('@/lib/services/cache', () => ({
  getJson: vi.fn().mockResolvedValue(null),
  setJson: vi.fn().mockResolvedValue(undefined),
  cacheKey: vi.fn((...args: string[]) => args.join(':')),
}))

// ── Module mocks ─────────────────────────────────────────────────────────────

vi.mock('@/lib/services/auth', () => ({
  authenticateRequest: vi.fn().mockResolvedValue({
    supabase: makeMockSupabase(),
    tenantId: '00000000-0000-0000-0000-000000000001',
    userId: '00000000-0000-0000-0000-000000000002',
  }),
  AuthError: class AuthError extends Error {
    status: number
    constructor(message: string, status: number) {
      super(message)
      this.name = 'AuthError'
      this.status = status
    }
  },
}))

vi.mock('next/headers', () => ({
  headers: vi.fn().mockResolvedValue({
    get: (name: string) => {
      if (name === 'x-forwarded-for') return '127.0.0.1'
      if (name === 'user-agent') return 'test-agent'
      return null
    },
  }),
}))

vi.mock('@/lib/queries/audit-logs', () => ({
  logAuditServer: mockLogAuditServer,
}))

vi.mock('@/lib/utils/invoice-pdf', () => ({
  generateInvoicePdf: mockGenerateInvoicePdf,
}))

// ── Import the route handler AFTER mocks are registered ──────────────────────

import { GET } from '../../invoices/[id]/pdf/route'

// ── Tests ────────────────────────────────────────────────────────────────────

describe('GET /api/invoices/[id]/pdf – permission enforcement', () => {
  beforeEach(() => {
    mockLogAuditServer.mockClear()
    mockGenerateInvoicePdf.mockClear()
  })

  it('returns 403 for a user without billing:view permission', async () => {
    const request = new Request(`http://localhost/api/invoices/${MOCK_INVOICE_ID}/pdf`)
    const response = await GET(request, {
      params: Promise.resolve({ id: MOCK_INVOICE_ID }),
    })

    expect(response.status).toBe(403)

    const body = await response.json()
    expect(body.error).toContain('billing:view')
  })

  it('writes a denied audit event with correct action and metadata', async () => {
    const request = new Request(`http://localhost/api/invoices/${MOCK_INVOICE_ID}/pdf`)
    await GET(request, {
      params: Promise.resolve({ id: MOCK_INVOICE_ID }),
    })

    // logAuditServer must have been called exactly once (the denial)
    expect(mockLogAuditServer).toHaveBeenCalledTimes(1)

    const call = mockLogAuditServer.mock.calls[0][0]
    expect(call.action).toBe('invoice_pdf_download_denied')
    expect(call.entityType).toBe('invoice')
    expect(call.entityId).toBe(MOCK_INVOICE_ID)
    expect(call.tenantId).toBe(MOCK_TENANT_ID)
    expect(call.userId).toBe(MOCK_USER_ID)

    // Metadata must include role name, reason, IP, user-agent
    expect(call.metadata.role_name).toBe('Lawyer')
    expect(call.metadata.reason).toContain('billing:view')
    expect(call.metadata.ip).toBe('127.0.0.1')
    expect(call.metadata.user_agent).toBe('test-agent')
  })

  it('does NOT call generateInvoicePdf for denied requests', async () => {
    const request = new Request(`http://localhost/api/invoices/${MOCK_INVOICE_ID}/pdf`)
    await GET(request, {
      params: Promise.resolve({ id: MOCK_INVOICE_ID }),
    })

    expect(mockGenerateInvoicePdf).not.toHaveBeenCalled()
  })
})
