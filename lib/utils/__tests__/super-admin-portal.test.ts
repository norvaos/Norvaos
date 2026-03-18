/**
 * Super Admin Portal — Structural Regression Test Suite
 * ═════════════════════════════════════════════════════
 *
 * Validates that the Super Admin Portal is correctly wired:
 *   - DB migration creates the right tables/columns
 *   - requirePlatformAdmin() supports dual auth (Bearer + session)
 *   - All API routes are gated by requirePlatformAdmin()
 *   - Audit logging goes to platform_admin_audit_logs (immutable)
 *   - Safety rules enforced: mandatory reason, optimistic locking, soft ops
 *   - UI detail page has all expected tabs
 */

import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync, readdirSync, statSync } from 'fs'
import { resolve, relative } from 'path'

const ROOT = resolve(__dirname, '../../..')

function readSource(relPath: string): string {
  const full = resolve(ROOT, relPath)
  if (!existsSync(full)) {
    throw new Error(`Expected file missing: ${relPath}`)
  }
  return readFileSync(full, 'utf-8')
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. DB Migration — platform_admins, tenants.status, audit logs
// ═══════════════════════════════════════════════════════════════════════════

describe('Super Admin Portal — Migration 041', () => {
  it('migration file exists', () => {
    expect(existsSync(resolve(ROOT, 'scripts/migrations/041-super-admin-portal.sql'))).toBe(true)
  })

  it('creates platform_admins table with user_id FK', () => {
    const source = readSource('scripts/migrations/041-super-admin-portal.sql')
    expect(source).toContain('CREATE TABLE IF NOT EXISTS platform_admins')
    expect(source).toContain('user_id')
    expect(source).toContain('REFERENCES auth.users(id)')
    expect(source).toContain('revoked_at')
    expect(source).toContain('granted_by')
  })

  it('creates unique partial index for active admins only', () => {
    const source = readSource('scripts/migrations/041-super-admin-portal.sql')
    expect(source).toContain('WHERE revoked_at IS NULL')
  })

  it('adds tenants.status column with valid check constraint', () => {
    const source = readSource('scripts/migrations/041-super-admin-portal.sql')
    expect(source).toContain("status text NOT NULL DEFAULT 'active'")
    expect(source).toContain('active')
    expect(source).toContain('suspended')
    expect(source).toContain('closed')
  })

  it('creates platform_admin_audit_logs table (immutable)', () => {
    const source = readSource('scripts/migrations/041-super-admin-portal.sql')
    expect(source).toContain('CREATE TABLE IF NOT EXISTS platform_admin_audit_logs')
    expect(source).toContain('reason      text NOT NULL')
    expect(source).toContain('target_type')
    expect(source).toContain('target_id')
    expect(source).toContain('changes     jsonb')
  })

  it('enables RLS on new tables (service-role only)', () => {
    const source = readSource('scripts/migrations/041-super-admin-portal.sql')
    expect(source).toContain('ALTER TABLE platform_admins ENABLE ROW LEVEL SECURITY')
    expect(source).toContain('ALTER TABLE platform_admin_audit_logs ENABLE ROW LEVEL SECURITY')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 2. Database Types
// ═══════════════════════════════════════════════════════════════════════════

describe('Super Admin Portal — Database types', () => {
  it('tenants Row includes status field', () => {
    const source = readSource('lib/types/database.ts')
    expect(source).toContain('status: string')
  })

  it('platform_admins table types exist', () => {
    const source = readSource('lib/types/database.ts')
    expect(source).toContain('platform_admins:')
    expect(source).toContain('user_id: string')
    expect(source).toContain('granted_by: string')
    expect(source).toContain('revoked_at: string | null')
  })

  it('platform_admin_audit_logs table types exist', () => {
    const source = readSource('lib/types/database.ts')
    expect(source).toContain('platform_admin_audit_logs:')
    expect(source).toContain('admin_id: string | null')
    expect(source).toContain('target_type: string')
    expect(source).toContain('target_id: string')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 3. Auth — requirePlatformAdmin() dual auth
// ═══════════════════════════════════════════════════════════════════════════

describe('Super Admin Portal — requirePlatformAdmin()', () => {
  it('platform-admin.ts exports requirePlatformAdmin', () => {
    const source = readSource('lib/services/platform-admin.ts')
    expect(source).toContain('export async function requirePlatformAdmin')
  })

  it('supports Bearer token path (checkPlatformAdmin)', () => {
    const source = readSource('lib/services/platform-admin.ts')
    // Inside requirePlatformAdmin, calls checkPlatformAdmin
    expect(source).toContain('checkPlatformAdmin(request)')
    expect(source).toContain("authMethod: 'bearer-token'")
  })

  it('supports session-based path (platform_admins table)', () => {
    const source = readSource('lib/services/platform-admin.ts')
    expect(source).toContain('authenticateRequest()')
    expect(source).toContain("from('platform_admins')")
    expect(source).toContain("is('revoked_at', null)")
    expect(source).toContain("authMethod: 'session'")
  })

  it('throws PlatformAdminError on denial', () => {
    const source = readSource('lib/services/platform-admin.ts')
    expect(source).toContain('throw new PlatformAdminError')
    expect(source).toContain('403')
  })

  it('logs unauthorized access attempts', () => {
    const source = readSource('lib/services/platform-admin.ts')
    expect(source).toContain('[platform-admin] Unauthorized access attempt')
  })

  it('exports PlatformAdminContext and PlatformAdminError types', () => {
    const source = readSource('lib/services/platform-admin.ts')
    expect(source).toContain('export interface PlatformAdminContext')
    expect(source).toContain('export class PlatformAdminError')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 4. Audit Module — platform-admin-audit.ts
// ═══════════════════════════════════════════════════════════════════════════

describe('Super Admin Portal — Audit module', () => {
  it('platform-admin-audit.ts exists', () => {
    expect(existsSync(resolve(ROOT, 'lib/services/platform-admin-audit.ts'))).toBe(true)
  })

  it('exports logPlatformAdminAudit function', () => {
    const source = readSource('lib/services/platform-admin-audit.ts')
    expect(source).toContain('export async function logPlatformAdminAudit')
  })

  it('writes to platform_admin_audit_logs (immutable)', () => {
    const source = readSource('lib/services/platform-admin-audit.ts')
    expect(source).toContain("from('platform_admin_audit_logs')")
  })

  it('writes to tenant-scoped audit_logs', () => {
    const source = readSource('lib/services/platform-admin-audit.ts')
    expect(source).toContain("from('audit_logs')")
  })

  it('writes to tenant-scoped activities', () => {
    const source = readSource('lib/services/platform-admin-audit.ts')
    expect(source).toContain("from('activities')")
  })

  it('uses Promise.allSettled for fire-and-forget', () => {
    const source = readSource('lib/services/platform-admin-audit.ts')
    expect(source).toContain('Promise.allSettled')
  })

  it('fires spike detection', () => {
    const source = readSource('lib/services/platform-admin-audit.ts')
    expect(source).toContain('checkAdminActionSpike')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 5. API Routes — all gated by platform admin auth (auto-discovered)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Walk a directory recursively and collect all `route.ts` files.
 * Returns paths relative to ROOT for readable test names.
 */
function discoverAdminRoutes(dir: string): string[] {
  const results: string[] = []
  function walk(d: string) {
    for (const entry of readdirSync(d)) {
      // Skip test directories
      if (entry === '__tests__' || entry === '__mocks__') continue
      const full = resolve(d, entry)
      if (statSync(full).isDirectory()) {
        walk(full)
      } else if (entry === 'route.ts') {
        results.push(relative(ROOT, full))
      }
    }
  }
  walk(dir)
  return results.sort()
}

describe('Super Admin Portal — API routes use platform admin auth (auto-discovered)', () => {
  // Tenant-scoped admin routes use authenticateRequest() + role check,
  // NOT platform admin auth. Exclude them from this test.
  const TENANT_ADMIN_ROUTES = [
    'app/api/admin/front-desk-kpis',
    'app/api/admin/break-glass',
    'app/api/admin/delegations',
    'app/api/admin/supervision',
    // Sprint 6 Week 3: tenant-scoped Admin-role routes (authenticateRequest + role check)
    'app/api/admin/form-generation-jobs',
    'app/api/admin/rule-snapshots',
  ]

  const discoveredRoutes = discoverAdminRoutes(resolve(ROOT, 'app/api/admin'))
  const platformRoutes = discoveredRoutes.filter(
    (r) => !TENANT_ADMIN_ROUTES.some((prefix) => r.startsWith(prefix))
  )

  it('discovers at least 13 admin route files', () => {
    expect(discoveredRoutes.length).toBeGreaterThanOrEqual(13)
  })

  for (const route of platformRoutes) {
    it(`${route} uses platform admin auth`, () => {
      const source = readSource(route)
      const hasAuth =
        source.includes('withPlatformAdmin') ||
        source.includes('requirePlatformAdmin') ||
        source.includes('checkPlatformAdmin')
      expect(hasAuth).toBe(true)
    })
  }

  // Tenant-scoped admin routes use their own auth (authenticateRequest + role check)
  for (const route of discoveredRoutes.filter(
    (r) => TENANT_ADMIN_ROUTES.some((prefix) => r.startsWith(prefix))
  )) {
    it(`${route} uses tenant admin auth (authenticateRequest + role check)`, () => {
      const source = readSource(route)
      expect(source).toContain('authenticateRequest')
      expect(source).toMatch(/Admin/)
      expect(source).toMatch(/403/)
    })
  }
})

// ═══════════════════════════════════════════════════════════════════════════
// 6. Safety Rules
// ═══════════════════════════════════════════════════════════════════════════

describe('Super Admin Portal — Safety rules', () => {
  it('status route requires reason (min 5 chars)', () => {
    const source = readSource('app/api/admin/tenants/[id]/status/route.ts')
    expect(source).toContain('reason')
    expect(source).toContain('at least 5 characters')
  })

  it('status route prevents closed→active transition', () => {
    const source = readSource('app/api/admin/tenants/[id]/status/route.ts')
    expect(source).toContain("previousStatus === 'closed'")
    expect(source).toContain('permanent')
  })

  it('status route is idempotent', () => {
    const source = readSource('app/api/admin/tenants/[id]/status/route.ts')
    expect(source).toContain('previousStatus === newStatus')
    expect(source).toContain('changed: false')
  })

  it('features route uses optimistic locking (expected_updated_at)', () => {
    const source = readSource('app/api/admin/tenants/[id]/features/route.ts')
    expect(source).toContain('expected_updated_at')
    expect(source).toContain('OPTIMISTIC_LOCK_CONFLICT')
    expect(source).toContain('409')
  })

  it('features route merges (not replaces) feature flags', () => {
    const source = readSource('app/api/admin/tenants/[id]/features/route.ts')
    expect(source).toContain('...currentFlags')
    expect(source).toContain('...featureFlags')
  })

  it('deactivate route prevents last-admin deactivation', () => {
    const source = readSource('app/api/admin/tenants/[id]/users/[userId]/deactivate/route.ts')
    expect(source).toContain('last active admin')
  })

  it('reactivate route checks seat limit before reactivation', () => {
    const source = readSource('app/api/admin/tenants/[id]/users/[userId]/reactivate/route.ts')
    expect(source).toContain('checkSeatLimit')
    expect(source).toContain('seatLimitResponse')
  })

  it('all mutation routes use logPlatformAdminAudit', () => {
    const mutationRoutes = [
      'app/api/admin/tenants/[id]/status/route.ts',
      'app/api/admin/tenants/[id]/features/route.ts',
      'app/api/admin/tenants/[id]/users/[userId]/deactivate/route.ts',
      'app/api/admin/tenants/[id]/users/[userId]/reactivate/route.ts',
      'app/api/admin/tenants/[id]/invites/[inviteId]/revoke/route.ts',
      'app/api/admin/tenants/[id]/cache/route.ts',
    ]
    for (const route of mutationRoutes) {
      const source = readSource(route)
      expect(source).toContain('logPlatformAdminAudit')
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 7. UI — Tenant Detail Page
// ═══════════════════════════════════════════════════════════════════════════

describe('Super Admin Portal — UI detail page', () => {
  it('detail page exists', () => {
    expect(existsSync(resolve(ROOT, 'app/(dashboard)/admin/tenants/[id]/page.tsx'))).toBe(true)
  })

  it('has Overview, Features, Users, Invites, Audit, Operations tabs', () => {
    const source = readSource('app/(dashboard)/admin/tenants/[id]/page.tsx')
    expect(source).toContain('overview')
    expect(source).toContain('features')
    expect(source).toContain('users')
    expect(source).toContain('invites')
    expect(source).toContain('audit')
    expect(source).toContain('operations')
  })

  it('features tab uses Switch component for toggles', () => {
    const source = readSource('app/(dashboard)/admin/tenants/[id]/page.tsx')
    expect(source).toContain('Switch')
    expect(source).toContain('handleFeatureToggle')
  })

  it('features tab requires reason before saving', () => {
    const source = readSource('app/(dashboard)/admin/tenants/[id]/page.tsx')
    expect(source).toContain('featureReason')
    expect(source).toContain('pendingFeatureChanges')
  })

  it('operations tab has cache purge with reason', () => {
    const source = readSource('app/(dashboard)/admin/tenants/[id]/page.tsx')
    expect(source).toContain('cacheReason')
    expect(source).toContain('Purge Cache')
  })

  it('operations tab has rate-limit dashboard', () => {
    const source = readSource('app/(dashboard)/admin/tenants/[id]/page.tsx')
    expect(source).toContain('Rate-Limit Dashboard')
    expect(source).toContain('seat_limit_denials')
    expect(source).toContain('SPIKE')
  })

  it('tenant list page supports pagination', () => {
    const source = readSource('app/(dashboard)/admin/tenants/page.tsx')
    expect(source).toContain('totalPages')
    expect(source).toContain('page')
    expect(source).toContain('per_page')
  })

  it('tenant list page supports status filter', () => {
    const source = readSource('app/(dashboard)/admin/tenants/page.tsx')
    expect(source).toContain('statusFilter')
    expect(source).toContain('suspended')
    expect(source).toContain('closed')
  })

  it('tenant list page rows navigate to detail', () => {
    const source = readSource('app/(dashboard)/admin/tenants/page.tsx')
    expect(source).toContain("router.push(`/admin/tenants/${tenant.id}`)")
  })

  it('slug confirmation guardrail preserved for >2x increases', () => {
    const source = readSource('app/(dashboard)/admin/tenants/[id]/page.tsx')
    expect(source).toContain('needsSlugConfirmation')
    expect(source).toContain('slugConfirm')
  })
})
