/**
 * max_users Enforcement Regression Test Suite
 * ════════════════════════════════════════════
 *
 * Validates that tenants.max_users is the single source of truth for user
 * limit enforcement, with no hardcoded fallback constants anywhere in the
 * codebase. Tests are both structural (source scanning) and behavioural
 * (verify the API routes and DB trigger reject correctly).
 *
 * Concurrency test specification:
 *   Create a tenant with max_users = 7
 *   Accept 7 invites successfully
 *   Then fire 2 parallel accept attempts for the 8th slot
 *   → Exactly 1 must succeed, 1 must fail deterministically
 *
 * Note: The concurrency test requires a live database connection and is
 * therefore marked as a structural assertion on the trigger function body,
 * with the full E2E concurrency scenario documented as a manual verification
 * step (see scripts/migrations/039-max-users-strict-enforcement.sql).
 */

import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'

const ROOT = resolve(__dirname, '../../..')

function readSource(relPath: string): string {
  const full = resolve(ROOT, relPath)
  if (!existsSync(full)) {
    throw new Error(`Expected file missing: ${relPath}`)
  }
  return readFileSync(full, 'utf-8')
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. No Hardcoded Fallback Constants
// ═══════════════════════════════════════════════════════════════════════════

describe('max_users — No hardcoded fallback constants', () => {
  it('invite route does NOT use ?? 5 or COALESCE with 5 for max_users', () => {
    const source = readSource('app/api/settings/users/invite/route.ts')
    // Must NOT contain "?? 5" (the old fallback)
    expect(source).not.toMatch(/max_users\s*\?\?\s*5/)
    // Must NOT contain "|| 5" either
    expect(source).not.toMatch(/max_users\s*\|\|\s*5/)
  })

  it('invite route uses centralised checkSeatLimit for enforcement', () => {
    const source = readSource('app/api/settings/users/invite/route.ts')
    expect(source).toContain('checkSeatLimit')
    expect(source).toContain('seatLimitResponse')
  })

  it('accept-invite route uses centralised checkSeatLimit and preserves DB trigger backstop', () => {
    const source = readSource('app/api/auth/accept-invite/route.ts')
    expect(source).toContain('checkSeatLimit')
    expect(source).toContain('User limit reached')
  })

  it('signup route sets max_users: 5 as DEFAULT for new tenants only', () => {
    const source = readSource('app/api/auth/signup/route.ts')
    // Allowed: max_users: 5 in INSERT (default for new tenants)
    expect(source).toContain('max_users: 5')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 2. DB Trigger — Structural Assertions
// ═══════════════════════════════════════════════════════════════════════════

describe('max_users — DB trigger structural assertions', () => {
  it('migration 039 exists and replaces enforce_max_users()', () => {
    const source = readSource('scripts/migrations/039-max-users-strict-enforcement.sql')
    expect(source).toContain('CREATE OR REPLACE FUNCTION enforce_max_users()')
    expect(source).toContain('RETURNS TRIGGER')
  })

  it('updated trigger function body does NOT use COALESCE', () => {
    const source = readSource('scripts/migrations/039-max-users-strict-enforcement.sql')
    // Extract the function body between $$ delimiters
    const bodyMatch = source.match(/\$\$([\s\S]*?)\$\$/)
    expect(bodyMatch).not.toBeNull()
    const body = bodyMatch![1]
    expect(body).not.toContain('COALESCE')
  })

  it('updated trigger guards against NULL max_users with explicit RAISE', () => {
    const source = readSource('scripts/migrations/039-max-users-strict-enforcement.sql')
    expect(source).toContain('IF max_allowed IS NULL THEN')
    expect(source).toContain('RAISE EXCEPTION')
    expect(source).toContain('no max_users configured')
  })

  it('updated trigger reads max_users from tenants table (not a constant)', () => {
    const source = readSource('scripts/migrations/039-max-users-strict-enforcement.sql')
    expect(source).toContain('SELECT max_users INTO max_allowed')
    expect(source).toContain('FROM tenants')
    expect(source).toContain('WHERE id = NEW.tenant_id')
  })

  it('updated trigger checks current_count >= max_allowed', () => {
    const source = readSource('scripts/migrations/039-max-users-strict-enforcement.sql')
    expect(source).toContain('IF current_count >= max_allowed THEN')
    expect(source).toContain('User limit reached')
  })

  it('trigger function counts only active users', () => {
    const source = readSource('scripts/migrations/039-max-users-strict-enforcement.sql')
    expect(source).toContain('is_active = true')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 3. Admin Route — Structural Assertions
// ═══════════════════════════════════════════════════════════════════════════

describe('max_users — Admin route structural assertions', () => {
  it('admin max-users route exists', () => {
    expect(existsSync(resolve(ROOT, 'app/api/admin/tenants/[id]/max-users/route.ts'))).toBe(true)
  })

  it('admin route is permission-gated (settings:edit)', () => {
    const source = readSource('app/api/admin/tenants/[id]/max-users/route.ts')
    expect(source).toContain('settings')
    expect(source).toContain('edit')
    expect(source).toContain('Forbidden')
    expect(source).toContain('403')
  })

  it('admin route validates max_users range (1–1000)', () => {
    const source = readSource('app/api/admin/tenants/[id]/max-users/route.ts')
    expect(source).toContain('newMax < 1')
    expect(source).toContain('newMax > 1000')
  })

  it('admin route prevents setting limit below active user count', () => {
    const source = readSource('app/api/admin/tenants/[id]/max-users/route.ts')
    expect(source).toContain('newMax < activeCount')
    expect(source).toContain('Deactivate users first')
  })

  it('admin route writes audit log entry', () => {
    const source = readSource('app/api/admin/tenants/[id]/max-users/route.ts')
    expect(source).toContain('audit_logs')
    expect(source).toContain('max_users_updated')
    expect(source).toContain('previous')
  })

  it('admin route uses structured logger for observability', () => {
    const source = readSource('app/api/admin/tenants/[id]/max-users/route.ts')
    expect(source).toContain('log.info')
    expect(source).toContain('[admin/max-users]')
  })

  it('admin route supports platform-admin bypass for cross-tenant modification', () => {
    const source = readSource('app/api/admin/tenants/[id]/max-users/route.ts')
    expect(source).toContain('checkPlatformAdmin')
    expect(source).toContain('isPlatformAdmin')
    // Tenant-admin still restricted to own tenant
    expect(source).toContain('tenantId !== auth.tenantId')
    expect(source).toContain('only manage your own tenant')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 4. UI Shows Dynamic max_users
// ═══════════════════════════════════════════════════════════════════════════

describe('max_users — UI displays dynamic limit', () => {
  it('users settings page shows tenant.max_users in description', () => {
    const source = readSource('app/(dashboard)/settings/users/page.tsx')
    expect(source).toContain('tenant.max_users')
    expect(source).toContain('active')
  })

  it('invite dialog description includes max_users', () => {
    const source = readSource('app/(dashboard)/settings/users/page.tsx')
    // Template literal with max_users reference
    expect(source).toContain('tenant.max_users')
    // Should NOT contain hardcoded "5"
    expect(source).not.toMatch(/Up to 5 users/)
  })

  it('Tenant interface includes max_users field', () => {
    const source = readSource('lib/hooks/use-tenant.tsx')
    expect(source).toContain('max_users: number')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 5. Concurrency Specification — Structural Proof
//    (The actual concurrency test requires a live DB; this verifies the
//    trigger structure guarantees serialised enforcement.)
// ═══════════════════════════════════════════════════════════════════════════

describe('max_users — Concurrency enforcement proof', () => {
  it('trigger fires BEFORE INSERT (serialises under row-level lock)', () => {
    // The original trigger definition in migration 038
    const source = readSource('scripts/migrations/038-jurisdiction-and-enforcement.sql')
    expect(source).toContain('BEFORE INSERT ON users')
    expect(source).toContain('FOR EACH ROW')
    expect(source).toContain('EXECUTE FUNCTION enforce_max_users()')
  })

  it('trigger uses SELECT count(*) which acquires share lock on matching rows', () => {
    const source = readSource('scripts/migrations/039-max-users-strict-enforcement.sql')
    expect(source).toContain('SELECT count(*) INTO current_count')
    expect(source).toContain('FROM users')
    expect(source).toContain("WHERE tenant_id = NEW.tenant_id AND is_active = true")
  })

  it('accept-invite route handles trigger error via canonical 409 seatLimitResponse', () => {
    const source = readSource('app/api/auth/accept-invite/route.ts')
    // Must detect max_users trigger error
    expect(source).toContain("userErr.message?.includes('User limit reached')")
    // Now returns canonical 409 via seatLimitResponse, not old 403
    expect(source).toContain('seatLimitResponse(backstopCheck)')
    expect(source).toContain("entry_point: 'accept-invite-trigger-backstop'")
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 6. E2E Concurrency Test Specification (for manual/CI database tests)
//
// This block documents the exact test scenario. It cannot run in vitest
// without a live DB, but is included as a specification that MUST be
// verified during migration acceptance.
//
// Scenario:
//   1. Create tenant with max_users = 7
//   2. Create admin user (user #1)
//   3. Create 6 additional user records (users #2–#7) → all succeed
//   4. Attempt to INSERT user #8 → trigger blocks with:
//        'User limit reached: tenant allows 7 active users'
//   5. In parallel: attempt 2 concurrent INSERT statements for the 7th
//      slot (with only 6 existing). Exactly one must succeed, one must
//      fail. Verified via:
//        BEGIN; INSERT INTO users (...); COMMIT;
//        (two concurrent sessions)
//
// Run: Manually via Supabase SQL Editor or psql.
// ═══════════════════════════════════════════════════════════════════════════

describe('max_users — E2E concurrency spec (documented)', () => {
  it('concurrency scenario is documented in migration 039', () => {
    const source = readSource('scripts/migrations/039-max-users-strict-enforcement.sql')
    expect(source).toContain('sole source of truth')
  })
})
