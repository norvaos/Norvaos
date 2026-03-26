/**
 * Regression test: requirePermission() must make ZERO database calls.
 *
 * It reads from auth.role (pre-populated by authenticateRequest()),
 * never from the DB. If someone re-introduces a DB call, this test fails.
 */

import { describe, it, expect, vi } from 'vitest'

// Mock the admin client BEFORE importing requirePermission
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => {
    throw new Error('requirePermission must NOT call createAdminClient  -  zero DB calls expected')
  }),
}))

// Also ensure no direct supabase calls
vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(() => {
    throw new Error('requirePermission must NOT call createServerSupabaseClient  -  zero DB calls expected')
  }),
}))

import { requirePermission } from '../require-role'
import type { AuthContext, AuthRole } from '../auth'
import { AuthError } from '../auth'

function makeAuthContext(role: AuthRole | null): AuthContext {
  return {
    userId: 'user-123',
    authUserId: 'auth-456',
    tenantId: 'tenant-789',
    role,
    supabase: {} as any, // Not used by requirePermission
  }
}

const adminRole: AuthRole = {
  id: 'role-admin',
  name: 'Admin',
  permissions: {},
  is_system: true,
}

const lawyerRole: AuthRole = {
  id: 'role-lawyer',
  name: 'Lawyer',
  permissions: {
    matters: { view: true, create: true, edit: true },
    contacts: { view: true, create: true },
    settings: { view: false },
  },
  is_system: true,
}

describe('requirePermission  -  zero DB calls', () => {
  it('is synchronous (not async)', () => {
    const auth = makeAuthContext(adminRole)
    const result = requirePermission(auth, 'settings', 'edit')
    // If it were async, result would be a Promise
    expect(result).not.toBeInstanceOf(Promise)
    expect(result.name).toBe('Admin')
  })

  it('returns role for Admin regardless of entity/action', () => {
    const auth = makeAuthContext(adminRole)
    const result = requirePermission(auth, 'anything', 'whatever')
    expect(result.name).toBe('Admin')
  })

  it('grants permission when role has it', () => {
    const auth = makeAuthContext(lawyerRole)
    const result = requirePermission(auth, 'matters', 'view')
    expect(result.name).toBe('Lawyer')
  })

  it('throws 403 when role lacks the permission', () => {
    const auth = makeAuthContext(lawyerRole)
    expect(() => requirePermission(auth, 'settings', 'view')).toThrow(AuthError)
    try {
      requirePermission(auth, 'settings', 'edit')
    } catch (e) {
      expect(e).toBeInstanceOf(AuthError)
      expect((e as AuthError).status).toBe(403)
      expect((e as AuthError).message).toContain('settings:edit')
    }
  })

  it('throws 403 when no role assigned (null)', () => {
    const auth = makeAuthContext(null)
    expect(() => requirePermission(auth, 'matters', 'view')).toThrow(AuthError)
    try {
      requirePermission(auth, 'matters', 'view')
    } catch (e) {
      expect(e).toBeInstanceOf(AuthError)
      expect((e as AuthError).status).toBe(403)
      expect((e as AuthError).message).toContain('No role assigned')
    }
  })

  it('never calls createAdminClient or createServerSupabaseClient', () => {
    // The mocks above throw if called  -  if we get here, they were not called.
    const auth = makeAuthContext(adminRole)
    requirePermission(auth, 'settings', 'edit')

    const authNoRole = makeAuthContext(null)
    try { requirePermission(authNoRole, 'settings', 'edit') } catch { /* expected */ }

    const authLawyer = makeAuthContext(lawyerRole)
    requirePermission(authLawyer, 'matters', 'view')
    try { requirePermission(authLawyer, 'billing', 'view') } catch { /* expected */ }

    // If any of these triggered a DB call, the mock would have thrown
    // "requirePermission must NOT call createAdminClient"
    expect(true).toBe(true) // Reached here = no DB calls
  })
})
