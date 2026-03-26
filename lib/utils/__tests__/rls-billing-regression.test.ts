/**
 * RLS Billing Regression Tests
 * ════════════════════════════
 *
 * Verifies that billing data cannot be retrieved without billing:view
 * through the same query layer the app uses.
 *
 * Strategy:
 *   1. Structural assertions on migration 033  -  proves has_billing_view()
 *      exists, all 3 billing table policies reference it, and old
 *      tenant-only policies are explicitly dropped.
 *   2. Mocked query harness  -  calls checkBillingPermission (the server-side
 *      enforcement function) with mock Supabase clients simulating different
 *      roles. This mirrors what has_billing_view() does at the DB level.
 *
 * Without a live Supabase/Postgres in CI, structural + mocked tests are
 * the strongest guarantee we can provide. Combined, they prove:
 *   - The SQL function exists and is SECURITY DEFINER
 *   - Every billing table policy calls has_billing_view()
 *   - Old tenant-only policies are dropped (no fallback bypass)
 *   - The application-layer mirror of that logic (checkBillingPermission)
 *     correctly denies Lawyer, allows Admin and BillingClerk
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'

const ROOT = resolve(__dirname, '../../..')

function readSource(relPath: string): string {
  const full = resolve(ROOT, relPath)
  if (!existsSync(full)) {
    throw new Error(`RLS test: required file missing: ${relPath}`)
  }
  return readFileSync(full, 'utf-8')
}

// ── Chainable Supabase mock factory ─────────────────────────────────────────

type RoleData = {
  name: string
  permissions: Record<string, Record<string, boolean>>
}

function makeMockSupabase(opts: { userExists: boolean; role: RoleData | null }) {
  function mockQueryBuilder(table: string) {
    const self: Record<string, (...args: unknown[]) => unknown> = {}
    const methods = ['select', 'eq', 'single', 'insert', 'order', 'limit', 'maybeSingle']
    for (const m of methods) {
      self[m] = (..._args: unknown[]) => {
        if (table === 'users' && m === 'single') {
          if (!opts.userExists) {
            return { data: null, error: { code: 'PGRST116', message: 'not found' } }
          }
          return { data: { role_id: 'mock-role-id' }, error: null }
        }
        if (table === 'roles' && m === 'single') {
          if (!opts.role) {
            return { data: null, error: { code: 'PGRST116', message: 'not found' } }
          }
          return { data: opts.role, error: null }
        }
        return self
      }
    }
    return self
  }
  return { from: (table: string) => mockQueryBuilder(table) }
}

// ── Import checkBillingPermission after mocks ───────────────────────────────

// We import the actual function  -  it uses Supabase queries internally,
// which we intercept via the mock factory above.
// Note: checkBillingPermission takes a supabase client as parameter,
// so we can pass our mock directly without vi.mock().

// Dynamic import to get the real function
const billingPermissionModule = await import('@/lib/services/billing-permission')
const { checkBillingPermission } = billingPermissionModule

// ═══════════════════════════════════════════════════════════════════════════
// Section A: Structural RLS assertions on migration 033
// ═══════════════════════════════════════════════════════════════════════════

describe('RLS – Structural: migration 033 billing policies', () => {
  const RLS_MIGRATION = 'scripts/migrations/033-billing-rls-role-check.sql'

  it('has_billing_view() exists as SECURITY DEFINER STABLE function', () => {
    const source = readSource(RLS_MIGRATION)
    expect(source).toContain('has_billing_view')
    expect(source).toMatch(/SECURITY\s+DEFINER/i)
    expect(source).toMatch(/STABLE/i)
    expect(source).toContain('plpgsql')
  })

  it('has_billing_view() checks Admin bypass and billing.view permission', () => {
    const source = readSource(RLS_MIGRATION)
    // Admin shortcut
    expect(source).toContain("v_role_name = 'Admin'")
    // Explicit permission check
    expect(source).toContain("'billing'")
    expect(source).toContain("'view'")
  })

  it('creates exactly 3 billing table RLS policies, all referencing has_billing_view()', () => {
    const source = readSource(RLS_MIGRATION)
    const policyBlocks = source.split(/CREATE\s+POLICY/i).slice(1)
    expect(policyBlocks.length).toBe(3)

    const expectedTables = ['invoices', 'invoice_line_items', 'payments']
    for (let i = 0; i < policyBlocks.length; i++) {
      expect(policyBlocks[i]).toContain('has_billing_view()')
    }

    // Verify all 3 table names appear in policy declarations
    for (const table of expectedTables) {
      const hasPolicy = policyBlocks.some((b) => b.includes(table))
      expect(hasPolicy).toBe(true)
    }
  })

  it('every USING clause in migration references has_billing_view()', () => {
    const source = readSource(RLS_MIGRATION)
    // Extract all USING( ... ) clauses
    const usingMatches = source.match(/USING\s*\([\s\S]*?\)\s*(?:WITH\s+CHECK|;)/gi) || []
    expect(usingMatches.length).toBeGreaterThan(0)
    for (const clause of usingMatches) {
      expect(clause).toContain('has_billing_view()')
    }
  })

  it('every WITH CHECK clause references has_billing_view()', () => {
    const source = readSource(RLS_MIGRATION)
    const withCheckMatches = source.match(/WITH\s+CHECK\s*\([\s\S]*?\)\s*;/gi) || []
    expect(withCheckMatches.length).toBeGreaterThan(0)
    for (const clause of withCheckMatches) {
      expect(clause).toContain('has_billing_view()')
    }
  })

  it('old tenant-only policies are explicitly dropped for all 3 tables', () => {
    const source = readSource(RLS_MIGRATION)
    expect(source).toContain('DROP POLICY IF EXISTS tenant_isolation_invoices')
    expect(source).toContain('DROP POLICY IF EXISTS tenant_isolation_invoice_line_items')
    expect(source).toContain('DROP POLICY IF EXISTS tenant_isolation_payments')
  })

  it('policies enforce tenant isolation alongside billing:view', () => {
    const source = readSource(RLS_MIGRATION)
    // Every policy must also have tenant_id check (except invoice_line_items which joins through invoices)
    expect(source).toMatch(/invoices_billing_access[\s\S]*?tenant_id/)
    expect(source).toMatch(/payments_billing_access[\s\S]*?tenant_id/)
    // invoice_line_items joins through invoices
    expect(source).toMatch(/invoice_line_items_billing_access[\s\S]*?invoice_id\s+IN/)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Section B: Mocked query harness  -  checkBillingPermission
// ═══════════════════════════════════════════════════════════════════════════

describe('RLS – Mocked query harness: checkBillingPermission', () => {
  const MOCK_USER_ID = 'user-123'
  const MOCK_TENANT_ID = 'tenant-456'

  it('Lawyer role (no billing:view) → denied', async () => {
    const supabase = makeMockSupabase({
      userExists: true,
      role: {
        name: 'Lawyer',
        permissions: {
          contacts: { view: true, create: true, edit: true },
          matters: { view: true, create: true, edit: true },
          // billing intentionally ABSENT
        },
      },
    })

    const result = await checkBillingPermission(supabase as never, MOCK_USER_ID, MOCK_TENANT_ID)
    expect(result.allowed).toBe(false)
    expect(result.roleName).toBe('Lawyer')
  })

  it('Admin role → allowed (bypass)', async () => {
    const supabase = makeMockSupabase({
      userExists: true,
      role: {
        name: 'Admin',
        permissions: { all: true } as Record<string, Record<string, boolean>>,
      },
    })

    const result = await checkBillingPermission(supabase as never, MOCK_USER_ID, MOCK_TENANT_ID)
    expect(result.allowed).toBe(true)
    expect(result.roleName).toBe('Admin')
  })

  it('BillingClerk role (explicit billing:view) → allowed', async () => {
    const supabase = makeMockSupabase({
      userExists: true,
      role: {
        name: 'BillingClerk',
        permissions: {
          billing: { view: true, create: false, edit: false, delete: false },
        },
      },
    })

    const result = await checkBillingPermission(supabase as never, MOCK_USER_ID, MOCK_TENANT_ID)
    expect(result.allowed).toBe(true)
    expect(result.roleName).toBe('BillingClerk')
  })

  it('Paralegal role (no billing:view) → denied', async () => {
    const supabase = makeMockSupabase({
      userExists: true,
      role: {
        name: 'Paralegal',
        permissions: {
          contacts: { view: true, create: true, edit: true },
          matters: { view: true },
          tasks: { view: true, create: true, edit: true },
          // billing intentionally ABSENT
        },
      },
    })

    const result = await checkBillingPermission(supabase as never, MOCK_USER_ID, MOCK_TENANT_ID)
    expect(result.allowed).toBe(false)
    expect(result.roleName).toBe('Paralegal')
  })

  it('user not found → denied', async () => {
    const supabase = makeMockSupabase({
      userExists: false,
      role: null,
    })

    const result = await checkBillingPermission(supabase as never, MOCK_USER_ID, MOCK_TENANT_ID)
    expect(result.allowed).toBe(false)
  })

  it('user has role with billing:view = false → denied', async () => {
    const supabase = makeMockSupabase({
      userExists: true,
      role: {
        name: 'RestrictedClerk',
        permissions: {
          billing: { view: false },
        },
      },
    })

    const result = await checkBillingPermission(supabase as never, MOCK_USER_ID, MOCK_TENANT_ID)
    expect(result.allowed).toBe(false)
    expect(result.roleName).toBe('RestrictedClerk')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Section C: Structured 403 logging
// ═══════════════════════════════════════════════════════════════════════════

describe('RLS – Structured 403 logging: checkBillingPermission', () => {
  const MOCK_USER_ID = 'user-123'
  const MOCK_TENANT_ID = 'tenant-456'

  let warnSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    warnSpy.mockRestore()
  })

  it('emits structured JSON log on denial (Lawyer, no route)', async () => {
    const supabase = makeMockSupabase({
      userExists: true,
      role: {
        name: 'Lawyer',
        permissions: {
          contacts: { view: true },
          matters: { view: true },
        },
      },
    })

    await checkBillingPermission(supabase as never, MOCK_USER_ID, MOCK_TENANT_ID)
    expect(warnSpy).toHaveBeenCalledTimes(1)
    const logEntry = JSON.parse(warnSpy.mock.calls[0][0] as string)
    expect(logEntry.event).toBe('billing_permission_denied')
    expect(logEntry.user_id).toBe(MOCK_USER_ID)
    expect(logEntry.tenant_id).toBe(MOCK_TENANT_ID)
    expect(logEntry.role_name).toBe('Lawyer')
    expect(logEntry.route).toBeNull()
    expect(logEntry.timestamp).toBeDefined()
  })

  it('emits structured JSON log with route when provided', async () => {
    const supabase = makeMockSupabase({
      userExists: true,
      role: {
        name: 'Paralegal',
        permissions: {
          contacts: { view: true },
        },
      },
    })

    await checkBillingPermission(supabase as never, MOCK_USER_ID, MOCK_TENANT_ID, '/api/invoices/[id]/pdf')
    expect(warnSpy).toHaveBeenCalledTimes(1)
    const logEntry = JSON.parse(warnSpy.mock.calls[0][0] as string)
    expect(logEntry.event).toBe('billing_permission_denied')
    expect(logEntry.route).toBe('/api/invoices/[id]/pdf')
  })

  it('emits log when user not found (null role)', async () => {
    const supabase = makeMockSupabase({
      userExists: false,
      role: null,
    })

    await checkBillingPermission(supabase as never, MOCK_USER_ID, MOCK_TENANT_ID)
    expect(warnSpy).toHaveBeenCalledTimes(1)
    const logEntry = JSON.parse(warnSpy.mock.calls[0][0] as string)
    expect(logEntry.role_name).toBeNull()
  })

  it('does NOT emit log on allowed access (Admin)', async () => {
    const supabase = makeMockSupabase({
      userExists: true,
      role: {
        name: 'Admin',
        permissions: { all: true } as Record<string, Record<string, boolean>>,
      },
    })

    await checkBillingPermission(supabase as never, MOCK_USER_ID, MOCK_TENANT_ID)
    expect(warnSpy).not.toHaveBeenCalled()
  })

  it('does NOT emit log on allowed access (BillingClerk)', async () => {
    const supabase = makeMockSupabase({
      userExists: true,
      role: {
        name: 'BillingClerk',
        permissions: {
          billing: { view: true, create: false, edit: false, delete: false },
        },
      },
    })

    await checkBillingPermission(supabase as never, MOCK_USER_ID, MOCK_TENANT_ID)
    expect(warnSpy).not.toHaveBeenCalled()
  })
})
