/**
 * Comprehensive tests for billing-permission.ts
 *
 * Covers: checkBillingPermission, logBillingDenied (internal),
 * BillingDeniedLog interface, BILLING_VIEW_ALLOWED set.
 *
 * Targets 100% branch, statement, and function coverage.
 */

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { checkBillingPermission } from '../billing-permission'

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Build a mock SupabaseClient whose `.from().select().eq().eq().single()`
 *  chain can be controlled per-table. */
function mockSupabase(
  userResult: { data: any; error?: any },
  roleResult?: { data: any; error?: any },
): SupabaseClient {
  const fromFn = vi.fn((table: string) => {
    const result = table === 'users' ? userResult : (roleResult ?? { data: null })
    return {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue(result),
          }),
          single: vi.fn().mockResolvedValue(result),
        }),
      }),
    }
  })
  return { from: fromFn } as unknown as SupabaseClient
}

const USER_ID = 'user-abc-123'
const TENANT_ID = 'tenant-xyz-789'

// ── Tests ────────────────────────────────────────────────────────────────────

describe('checkBillingPermission', () => {
  let warnSpy: Mock

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-25T12:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  // ── No user / no role_id ────────────────────────────────────────────────

  describe('when user has no role', () => {
    it('returns { allowed: false, roleName: null } when user row is null', async () => {
      const sb = mockSupabase({ data: null })
      const result = await checkBillingPermission(sb, USER_ID, TENANT_ID)

      expect(result).toEqual({ allowed: false, roleName: null })
    })

    it('returns { allowed: false, roleName: null } when user has no role_id', async () => {
      const sb = mockSupabase({ data: { role_id: null } })
      const result = await checkBillingPermission(sb, USER_ID, TENANT_ID)

      expect(result).toEqual({ allowed: false, roleName: null })
    })

    it('returns { allowed: false, roleName: null } when user.role_id is undefined', async () => {
      const sb = mockSupabase({ data: {} })
      const result = await checkBillingPermission(sb, USER_ID, TENANT_ID)

      expect(result).toEqual({ allowed: false, roleName: null })
    })

    it('emits structured denial log with role_name: null and route: null', async () => {
      const sb = mockSupabase({ data: null })
      await checkBillingPermission(sb, USER_ID, TENANT_ID)

      expect(warnSpy).toHaveBeenCalledOnce()
      const logged = JSON.parse(warnSpy.mock.calls[0][0])
      expect(logged).toEqual({
        event: 'billing_permission_denied',
        user_id: USER_ID,
        tenant_id: TENANT_ID,
        role_name: null,
        route: null,
        timestamp: '2026-03-25T12:00:00.000Z',
      })
    })

    it('includes route in denial log when route is provided', async () => {
      const sb = mockSupabase({ data: null })
      await checkBillingPermission(sb, USER_ID, TENANT_ID, '/api/invoices/[id]/pdf')

      const logged = JSON.parse(warnSpy.mock.calls[0][0])
      expect(logged.route).toBe('/api/invoices/[id]/pdf')
    })
  })

  // ── Role row missing ───────────────────────────────────────────────────

  describe('when role row is not found', () => {
    it('returns { allowed: false, roleName: null } when role query returns null', async () => {
      const sb = mockSupabase(
        { data: { role_id: 'role-999' } },
        { data: null },
      )
      const result = await checkBillingPermission(sb, USER_ID, TENANT_ID)

      expect(result).toEqual({ allowed: false, roleName: null })
    })

    it('emits denial log with role_name: null', async () => {
      const sb = mockSupabase(
        { data: { role_id: 'role-999' } },
        { data: null },
      )
      await checkBillingPermission(sb, USER_ID, TENANT_ID)

      expect(warnSpy).toHaveBeenCalledOnce()
      const logged = JSON.parse(warnSpy.mock.calls[0][0])
      expect(logged.role_name).toBeNull()
      expect(logged.route).toBeNull()
    })

    it('includes route when provided and role is missing', async () => {
      const sb = mockSupabase(
        { data: { role_id: 'role-999' } },
        { data: null },
      )
      await checkBillingPermission(sb, USER_ID, TENANT_ID, '/billing')

      const logged = JSON.parse(warnSpy.mock.calls[0][0])
      expect(logged.route).toBe('/billing')
    })
  })

  // ── Admin bypass ───────────────────────────────────────────────────────

  describe('Admin bypass (BILLING_VIEW_ALLOWED set)', () => {
    it('allows Admin role regardless of permissions JSON', async () => {
      const sb = mockSupabase(
        { data: { role_id: 'role-admin' } },
        { data: { name: 'Admin', permissions: null } },
      )
      const result = await checkBillingPermission(sb, USER_ID, TENANT_ID)

      expect(result).toEqual({ allowed: true, roleName: 'Admin' })
    })

    it('does not emit denial log for Admin', async () => {
      const sb = mockSupabase(
        { data: { role_id: 'role-admin' } },
        { data: { name: 'Admin', permissions: {} } },
      )
      await checkBillingPermission(sb, USER_ID, TENANT_ID)

      expect(warnSpy).not.toHaveBeenCalled()
    })

    it('Admin bypass works even with billing.view: false in permissions', async () => {
      const sb = mockSupabase(
        { data: { role_id: 'role-admin' } },
        { data: { name: 'Admin', permissions: { billing: { view: false } } } },
      )
      const result = await checkBillingPermission(sb, USER_ID, TENANT_ID)

      expect(result).toEqual({ allowed: true, roleName: 'Admin' })
    })
  })

  // ── Explicit billing.view permission ───────────────────────────────────

  describe('explicit billing.view permission in role JSON', () => {
    it('allows when billing.view is true', async () => {
      const sb = mockSupabase(
        { data: { role_id: 'role-lawyer' } },
        { data: { name: 'Lawyer', permissions: { billing: { view: true } } } },
      )
      const result = await checkBillingPermission(sb, USER_ID, TENANT_ID)

      expect(result).toEqual({ allowed: true, roleName: 'Lawyer' })
    })

    it('does not emit denial log when billing.view is true', async () => {
      const sb = mockSupabase(
        { data: { role_id: 'role-lawyer' } },
        { data: { name: 'Lawyer', permissions: { billing: { view: true } } } },
      )
      await checkBillingPermission(sb, USER_ID, TENANT_ID)

      expect(warnSpy).not.toHaveBeenCalled()
    })

    it('denies when billing.view is false', async () => {
      const sb = mockSupabase(
        { data: { role_id: 'role-lawyer' } },
        { data: { name: 'Lawyer', permissions: { billing: { view: false } } } },
      )
      const result = await checkBillingPermission(sb, USER_ID, TENANT_ID)

      expect(result).toEqual({ allowed: false, roleName: 'Lawyer' })
    })

    it('denies when billing key exists but view is missing', async () => {
      const sb = mockSupabase(
        { data: { role_id: 'role-lawyer' } },
        { data: { name: 'Lawyer', permissions: { billing: { create: true } } } },
      )
      const result = await checkBillingPermission(sb, USER_ID, TENANT_ID)

      expect(result).toEqual({ allowed: false, roleName: 'Lawyer' })
    })

    it('denies when permissions is null', async () => {
      const sb = mockSupabase(
        { data: { role_id: 'role-paralegal' } },
        { data: { name: 'Paralegal', permissions: null } },
      )
      const result = await checkBillingPermission(sb, USER_ID, TENANT_ID)

      expect(result).toEqual({ allowed: false, roleName: 'Paralegal' })
    })

    it('denies when permissions is empty object', async () => {
      const sb = mockSupabase(
        { data: { role_id: 'role-paralegal' } },
        { data: { name: 'Paralegal', permissions: {} } },
      )
      const result = await checkBillingPermission(sb, USER_ID, TENANT_ID)

      expect(result).toEqual({ allowed: false, roleName: 'Paralegal' })
    })

    it('denies when permissions has other keys but no billing', async () => {
      const sb = mockSupabase(
        { data: { role_id: 'role-paralegal' } },
        { data: { name: 'Paralegal', permissions: { matters: { view: true }, contacts: { view: true } } } },
      )
      const result = await checkBillingPermission(sb, USER_ID, TENANT_ID)

      expect(result).toEqual({ allowed: false, roleName: 'Paralegal' })
    })

    it('emits denial log with role name when permission check fails', async () => {
      const sb = mockSupabase(
        { data: { role_id: 'role-paralegal' } },
        { data: { name: 'Paralegal', permissions: {} } },
      )
      await checkBillingPermission(sb, USER_ID, TENANT_ID, '/api/invoices')

      expect(warnSpy).toHaveBeenCalledOnce()
      const logged = JSON.parse(warnSpy.mock.calls[0][0])
      expect(logged).toEqual({
        event: 'billing_permission_denied',
        user_id: USER_ID,
        tenant_id: TENANT_ID,
        role_name: 'Paralegal',
        route: '/api/invoices',
        timestamp: '2026-03-25T12:00:00.000Z',
      })
    })
  })

  // ── Tenant isolation ───────────────────────────────────────────────────

  describe('tenant isolation', () => {
    it('queries the users table scoped to tenant_id', async () => {
      const fromFn = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: null }),
            }),
          }),
        }),
      })
      const sb = { from: fromFn } as unknown as SupabaseClient

      await checkBillingPermission(sb, USER_ID, TENANT_ID)

      // First call should be to 'users' table
      expect(fromFn).toHaveBeenCalledWith('users')
      // Verify the chained eq calls receive correct values
      const selectReturn = fromFn.mock.results[0].value.select()
      expect(selectReturn.eq).toHaveBeenCalledWith('id', USER_ID)
      const firstEqReturn = selectReturn.eq.mock.results[0].value
      expect(firstEqReturn.eq).toHaveBeenCalledWith('tenant_id', TENANT_ID)
    })

    it('different tenants get independent results', async () => {
      const tenantA = 'tenant-aaa'
      const tenantB = 'tenant-bbb'

      // User exists in tenant A with Admin role
      const sbA = mockSupabase(
        { data: { role_id: 'role-admin' } },
        { data: { name: 'Admin', permissions: {} } },
      )
      const resultA = await checkBillingPermission(sbA, USER_ID, tenantA)
      expect(resultA.allowed).toBe(true)

      // Same user ID but no record in tenant B
      const sbB = mockSupabase({ data: null })
      const resultB = await checkBillingPermission(sbB, USER_ID, tenantB)
      expect(resultB.allowed).toBe(false)
    })
  })

  // ── logBillingDenied internal resilience ───────────────────────────────

  describe('logBillingDenied resilience', () => {
    it('does not throw if console.warn throws', async () => {
      warnSpy.mockImplementation(() => {
        throw new Error('logging infrastructure failure')
      })

      const sb = mockSupabase({ data: null })

      // Should NOT throw  -  logBillingDenied swallows errors
      await expect(
        checkBillingPermission(sb, USER_ID, TENANT_ID),
      ).resolves.toEqual({ allowed: false, roleName: null })
    })

    it('does not throw if console.warn throws for role-not-found path', async () => {
      warnSpy.mockImplementation(() => {
        throw new Error('logging infrastructure failure')
      })

      const sb = mockSupabase(
        { data: { role_id: 'role-999' } },
        { data: null },
      )

      await expect(
        checkBillingPermission(sb, USER_ID, TENANT_ID),
      ).resolves.toEqual({ allowed: false, roleName: null })
    })

    it('does not throw if console.warn throws for denied-with-role path', async () => {
      warnSpy.mockImplementation(() => {
        throw new Error('logging infrastructure failure')
      })

      const sb = mockSupabase(
        { data: { role_id: 'role-paralegal' } },
        { data: { name: 'Paralegal', permissions: {} } },
      )

      await expect(
        checkBillingPermission(sb, USER_ID, TENANT_ID),
      ).resolves.toEqual({ allowed: false, roleName: 'Paralegal' })
    })
  })

  // ── Route parameter edge cases ─────────────────────────────────────────

  describe('route parameter handling', () => {
    it('route defaults to null in log when not provided', async () => {
      const sb = mockSupabase({ data: null })
      await checkBillingPermission(sb, USER_ID, TENANT_ID)

      const logged = JSON.parse(warnSpy.mock.calls[0][0])
      expect(logged.route).toBeNull()
    })

    it('route defaults to null in log when undefined is passed explicitly', async () => {
      const sb = mockSupabase({ data: null })
      await checkBillingPermission(sb, USER_ID, TENANT_ID, undefined)

      const logged = JSON.parse(warnSpy.mock.calls[0][0])
      expect(logged.route).toBeNull()
    })

    it('includes route string when provided', async () => {
      const sb = mockSupabase({ data: null })
      await checkBillingPermission(sb, USER_ID, TENANT_ID, '/settings/billing')

      const logged = JSON.parse(warnSpy.mock.calls[0][0])
      expect(logged.route).toBe('/settings/billing')
    })
  })

  // ── Non-Admin roles in BILLING_VIEW_ALLOWED set ────────────────────────

  describe('BILLING_VIEW_ALLOWED set membership', () => {
    it('does not bypass for "admin" (lowercase)', async () => {
      const sb = mockSupabase(
        { data: { role_id: 'role-admin-lower' } },
        { data: { name: 'admin', permissions: null } },
      )
      const result = await checkBillingPermission(sb, USER_ID, TENANT_ID)

      expect(result).toEqual({ allowed: false, roleName: 'admin' })
    })

    it('does not bypass for "ADMIN" (uppercase)', async () => {
      const sb = mockSupabase(
        { data: { role_id: 'role-admin-upper' } },
        { data: { name: 'ADMIN', permissions: null } },
      )
      const result = await checkBillingPermission(sb, USER_ID, TENANT_ID)

      expect(result).toEqual({ allowed: false, roleName: 'ADMIN' })
    })

    it('does not bypass for "Lawyer" role', async () => {
      const sb = mockSupabase(
        { data: { role_id: 'role-lawyer' } },
        { data: { name: 'Lawyer', permissions: null } },
      )
      const result = await checkBillingPermission(sb, USER_ID, TENANT_ID)

      expect(result).toEqual({ allowed: false, roleName: 'Lawyer' })
    })

    it('does not bypass for "Front Desk" role', async () => {
      const sb = mockSupabase(
        { data: { role_id: 'role-fd' } },
        { data: { name: 'Front Desk', permissions: null } },
      )
      const result = await checkBillingPermission(sb, USER_ID, TENANT_ID)

      expect(result).toEqual({ allowed: false, roleName: 'Front Desk' })
    })
  })

  // ── Return shape contract ──────────────────────────────────────────────

  describe('return shape contract', () => {
    it('always returns an object with allowed (boolean) and roleName (string|null)', async () => {
      // Denied path
      const sb1 = mockSupabase({ data: null })
      const r1 = await checkBillingPermission(sb1, USER_ID, TENANT_ID)
      expect(typeof r1.allowed).toBe('boolean')
      expect(r1.roleName === null || typeof r1.roleName === 'string').toBe(true)

      // Allowed path
      const sb2 = mockSupabase(
        { data: { role_id: 'r' } },
        { data: { name: 'Admin', permissions: {} } },
      )
      const r2 = await checkBillingPermission(sb2, USER_ID, TENANT_ID)
      expect(typeof r2.allowed).toBe('boolean')
      expect(typeof r2.roleName).toBe('string')
    })
  })

  // ── Admin bypass condition: role.name === 'Admin' OR set.has ──────────

  describe('dual Admin check (role.name === "Admin" || BILLING_VIEW_ALLOWED.has)', () => {
    it('passes via the direct name equality check', async () => {
      const sb = mockSupabase(
        { data: { role_id: 'role-a' } },
        { data: { name: 'Admin', permissions: null } },
      )
      const result = await checkBillingPermission(sb, USER_ID, TENANT_ID)
      expect(result.allowed).toBe(true)
    })

    // The BILLING_VIEW_ALLOWED set only contains 'Admin', so both paths
    // collapse to the same value. This test documents that explicitly.
    it('BILLING_VIEW_ALLOWED set contains exactly "Admin"', async () => {
      // We verify indirectly: 'Admin' allowed, everything else denied
      const names = ['Admin', 'Lawyer', 'Paralegal', 'Front Desk', 'Super Admin', '']
      for (const name of names) {
        const sb = mockSupabase(
          { data: { role_id: 'r' } },
          { data: { name, permissions: null } },
        )
        const result = await checkBillingPermission(sb, USER_ID, TENANT_ID)
        if (name === 'Admin') {
          expect(result.allowed).toBe(true)
        } else {
          expect(result.allowed).toBe(false)
        }
      }
    })
  })
})
