/**
 * Seat-Limit Invariant Test Suite
 * ════════════════════════════════
 *
 * Validates that:
 *   - Every user-creation entry point uses the centralised checkSeatLimit()
 *   - All denials produce a canonical HTTP 409 SEAT_LIMIT_REACHED response
 *   - Denial instrumentation (audit_logs + activities) is wired at every entry point
 *   - Platform-admin bypass is correctly implemented
 *   - DB trigger backstop is preserved with the correct entry_point tag
 *   - Dedupe guard exists in logSeatLimitDenial
 *
 * Tests are structural (source scanning) — they read source files and assert on
 * content patterns, following the max-users-regression.test.ts pattern.
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
// 1. Precheck at Every Entry Point
// ═══════════════════════════════════════════════════════════════════════════

describe('seat-limit — precheck at every entry point', () => {
  it('seat-limit.ts exists and exports checkSeatLimit', () => {
    const source = readSource('lib/services/seat-limit.ts')
    expect(source).toContain('export async function checkSeatLimit')
  })

  it('seat-limit.ts exports seatLimitResponse', () => {
    const source = readSource('lib/services/seat-limit.ts')
    expect(source).toContain('export function seatLimitResponse')
  })

  it('seat-limit.ts exports logSeatLimitDenial', () => {
    const source = readSource('lib/services/seat-limit.ts')
    expect(source).toContain('export async function logSeatLimitDenial')
  })

  it('seat-limit.ts exports SEAT_LIMIT_CODE constant', () => {
    const source = readSource('lib/services/seat-limit.ts')
    expect(source).toContain("export const SEAT_LIMIT_CODE = 'SEAT_LIMIT_REACHED'")
  })

  it('seat-limit.ts exports SeatLimitResult type with evaluated_at', () => {
    const source = readSource('lib/services/seat-limit.ts')
    expect(source).toContain('export interface SeatLimitResult')
    expect(source).toContain('evaluated_at')
  })

  it('invite route imports checkSeatLimit from seat-limit', () => {
    const source = readSource('app/api/settings/users/invite/route.ts')
    expect(source).toContain("import { checkSeatLimit, seatLimitResponse, logSeatLimitDenial } from '@/lib/services/seat-limit'")
  })

  it('invite route calls checkSeatLimit', () => {
    const source = readSource('app/api/settings/users/invite/route.ts')
    expect(source).toContain('checkSeatLimit(auth.tenantId)')
  })

  it('accept-invite route imports checkSeatLimit from seat-limit', () => {
    const source = readSource('app/api/auth/accept-invite/route.ts')
    expect(source).toContain("import { checkSeatLimit, seatLimitResponse, logSeatLimitDenial } from '@/lib/services/seat-limit'")
  })

  it('accept-invite route calls checkSeatLimit BEFORE createUser', () => {
    const source = readSource('app/api/auth/accept-invite/route.ts')
    const seatCheckIndex = source.indexOf('checkSeatLimit(invite.tenant_id)')
    const createUserIndex = source.indexOf('admin.auth.admin.createUser')
    expect(seatCheckIndex).toBeGreaterThan(-1)
    expect(createUserIndex).toBeGreaterThan(-1)
    expect(seatCheckIndex).toBeLessThan(createUserIndex)
  })

  it('signup route is exempt with documented comment', () => {
    const source = readSource('app/api/auth/signup/route.ts')
    expect(source).toContain('Seat-limit exempt')
    expect(source).toContain('max_users is set explicitly')
  })

  it('signup route sets max_users explicitly (non-null) at tenant creation', () => {
    const source = readSource('app/api/auth/signup/route.ts')
    expect(source).toContain('max_users: 5')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 2. Standardised 409 Response
// ═══════════════════════════════════════════════════════════════════════════

describe('seat-limit — standardised 409 response', () => {
  it('invite route uses seatLimitResponse on denial', () => {
    const source = readSource('app/api/settings/users/invite/route.ts')
    expect(source).toContain('seatLimitResponse(seatCheck)')
  })

  it('accept-invite route uses seatLimitResponse on denial (precheck)', () => {
    const source = readSource('app/api/auth/accept-invite/route.ts')
    expect(source).toContain('seatLimitResponse(seatCheck)')
  })

  it('accept-invite route uses seatLimitResponse on trigger backstop', () => {
    const source = readSource('app/api/auth/accept-invite/route.ts')
    expect(source).toContain('seatLimitResponse(backstopCheck)')
  })

  it('seatLimitResponse returns HTTP 409 with canonical shape', () => {
    const source = readSource('lib/services/seat-limit.ts')
    expect(source).toContain('SEAT_LIMIT_CODE')
    expect(source).toContain('status: 409')
    expect(source).toContain('active_user_count')
    expect(source).toContain('max_users')
    expect(source).toContain('tenant_id')
    expect(source).toContain('pending_invites')
  })

  it('invite route does NOT have old ?? 5 fallback', () => {
    const source = readSource('app/api/settings/users/invite/route.ts')
    expect(source).not.toMatch(/max_users\s*\?\?\s*5/)
    expect(source).not.toMatch(/max_users\s*\|\|\s*5/)
  })

  it('invite route does NOT return 403 for seat-limit denial', () => {
    const source = readSource('app/api/settings/users/invite/route.ts')
    // The old inline precheck returned 403; now all seat-limit denials are 409.
    // The route may legitimately return 403 for non-seat-limit reasons
    // (e.g. role assignment restriction via requirePermission / Admin guard),
    // so we check the specific seat-limit denial block uses seatLimitResponse
    // (which returns 409) rather than a raw 403.
    const seatCheckCall = source.split('seatCheck.allowed')[1]?.split('existingUser')[0] ?? ''
    expect(seatCheckCall).not.toContain('status: 403')
    // Also verify it uses the canonical seatLimitResponse helper
    expect(seatCheckCall).toContain('seatLimitResponse')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 3. Denial Instrumentation + Dedupe
// ═══════════════════════════════════════════════════════════════════════════

describe('seat-limit — denial instrumentation', () => {
  it('logSeatLimitDenial writes to audit_logs', () => {
    const source = readSource('lib/services/seat-limit.ts')
    expect(source).toContain("from('audit_logs')")
    expect(source).toContain("action: 'seat_limit_denial'")
  })

  it('logSeatLimitDenial writes to activities', () => {
    const source = readSource('lib/services/seat-limit.ts')
    expect(source).toContain("from('activities')")
    expect(source).toContain("activity_type: 'seat_limit_denial'")
  })

  it('logSeatLimitDenial has dedupe guard (1h window)', () => {
    const source = readSource('lib/services/seat-limit.ts')
    // Check for the 1-hour window in the dedupe logic
    expect(source).toContain('60 * 60 * 1000')
    expect(source).toContain('recentCount')
  })

  it('logSeatLimitDenial always emits structured log.warn (no dedupe on logs)', () => {
    const source = readSource('lib/services/seat-limit.ts')
    expect(source).toContain("log.warn('[seat-limit] denied'")
  })

  it('invite route calls logSeatLimitDenial on denial with entry_point invite', () => {
    const source = readSource('app/api/settings/users/invite/route.ts')
    expect(source).toContain("entry_point: 'invite'")
    expect(source).toContain('logSeatLimitDenial')
  })

  it('accept-invite route calls logSeatLimitDenial on denial with entry_point accept-invite', () => {
    const source = readSource('app/api/auth/accept-invite/route.ts')
    expect(source).toContain("entry_point: 'accept-invite'")
    expect(source).toContain('logSeatLimitDenial')
  })

  it('accept-invite trigger backstop uses entry_point accept-invite-trigger-backstop', () => {
    const source = readSource('app/api/auth/accept-invite/route.ts')
    expect(source).toContain("entry_point: 'accept-invite-trigger-backstop'")
  })

  it('both routes capture IP and UA for denial logging', () => {
    const inviteSource = readSource('app/api/settings/users/invite/route.ts')
    const acceptSource = readSource('app/api/auth/accept-invite/route.ts')
    for (const source of [inviteSource, acceptSource]) {
      expect(source).toContain('x-forwarded-for')
      expect(source).toContain('user-agent')
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 4. Platform-Admin
// ═══════════════════════════════════════════════════════════════════════════

describe('seat-limit — platform-admin', () => {
  it('platform-admin.ts exists and exports checkPlatformAdmin', () => {
    const source = readSource('lib/services/platform-admin.ts')
    expect(source).toContain('export function checkPlatformAdmin')
  })

  it('platform-admin.ts reads PLATFORM_ADMIN_SECRET env var', () => {
    const source = readSource('lib/services/platform-admin.ts')
    expect(source).toContain('PLATFORM_ADMIN_SECRET')
  })

  it('platform-admin.ts checks Authorization Bearer header', () => {
    const source = readSource('lib/services/platform-admin.ts')
    expect(source).toContain('Bearer')
    expect(source).toContain('authorization')
  })

  it('admin max-users route imports checkPlatformAdmin', () => {
    const source = readSource('app/api/admin/tenants/[id]/max-users/route.ts')
    expect(source).toContain('checkPlatformAdmin')
    expect(source).toContain("from '@/lib/services/platform-admin'")
  })

  it('admin max-users route uses checkPlatformAdmin for dual auth', () => {
    const source = readSource('app/api/admin/tenants/[id]/max-users/route.ts')
    expect(source).toContain('checkPlatformAdmin(request)')
    expect(source).toContain('isPlatformAdmin')
  })

  it('admin max-users route requires mandatory reason', () => {
    const source = readSource('app/api/admin/tenants/[id]/max-users/route.ts')
    expect(source).toContain('reason')
    expect(source).toContain('at least 5 characters')
  })

  it('admin max-users route captures IP and UA via extractRequestMeta', () => {
    const source = readSource('app/api/admin/tenants/[id]/max-users/route.ts')
    expect(source).toContain('extractRequestMeta(request)')
    expect(source).toContain('ip')
    expect(source).toContain('user_agent')
  })

  it('admin max-users route writes to activities', () => {
    const source = readSource('app/api/admin/tenants/[id]/max-users/route.ts')
    expect(source).toContain("from('activities')")
    expect(source).toContain("activity_type: 'max_users_updated'")
  })

  it('GET /api/admin/tenants is platform-admin only', () => {
    const source = readSource('app/api/admin/tenants/route.ts')
    // Route uses withPlatformAdmin wrapper (which handles requirePlatformAdmin + PlatformAdminError internally),
    // OR uses requirePlatformAdmin directly with PlatformAdminError catch
    expect(
      source.includes('withPlatformAdmin') ||
      (source.includes('requirePlatformAdmin(request)') && source.includes('PlatformAdminError'))
    ).toBe(true)
  })

  it('GET /api/admin/tenants returns at_limit flag', () => {
    const source = readSource('app/api/admin/tenants/route.ts')
    expect(source).toContain('at_limit')
    expect(source).toContain('active_users')
    expect(source).toContain('pending_invites')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 5. DB Trigger Backstop Preserved
// ═══════════════════════════════════════════════════════════════════════════

describe('seat-limit — DB trigger backstop preserved', () => {
  it('accept-invite still handles User limit reached trigger error', () => {
    const source = readSource('app/api/auth/accept-invite/route.ts')
    expect(source).toContain("userErr.message?.includes('User limit reached')")
  })

  it('trigger backstop maps to canonical 409 via seatLimitResponse', () => {
    const source = readSource('app/api/auth/accept-invite/route.ts')
    // After detecting trigger error, re-queries via checkSeatLimit and responds via seatLimitResponse
    expect(source).toContain('backstopCheck')
    expect(source).toContain('seatLimitResponse(backstopCheck)')
  })

  it('trigger backstop logs with distinct entry_point', () => {
    const source = readSource('app/api/auth/accept-invite/route.ts')
    expect(source).toContain("entry_point: 'accept-invite-trigger-backstop'")
  })

  it('migration 039 is unchanged (enforce_max_users function)', () => {
    const source = readSource('scripts/migrations/039-max-users-strict-enforcement.sql')
    expect(source).toContain('CREATE OR REPLACE FUNCTION enforce_max_users()')
    expect(source).toContain('IF max_allowed IS NULL THEN')
    expect(source).toContain('IF current_count >= max_allowed THEN')
    expect(source).toContain('User limit reached')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 6. Policy v1 Contract
// ═══════════════════════════════════════════════════════════════════════════

describe('seat-limit — policy v1 contract', () => {
  it('seat-limit.ts documents the policy as active users only', () => {
    const source = readSource('lib/services/seat-limit.ts')
    expect(source).toContain('Policy v1: seats = active users only')
  })

  it('checkSeatLimit denies when active_user_count >= max_users (not pending)', () => {
    const source = readSource('lib/services/seat-limit.ts')
    expect(source).toContain('activeCount >= maxUsers')
  })

  it('SeatLimitResult includes pending_invites for visibility', () => {
    const source = readSource('lib/services/seat-limit.ts')
    expect(source).toContain('pending_invites: number')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 7. Admin Console UI
// ═══════════════════════════════════════════════════════════════════════════

describe('seat-limit — admin console UI', () => {
  it('admin tenants page exists', () => {
    expect(existsSync(resolve(ROOT, 'app/(dashboard)/admin/tenants/page.tsx'))).toBe(true)
  })

  it('admin tenants page fetches from /api/admin/tenants', () => {
    const source = readSource('app/(dashboard)/admin/tenants/page.tsx')
    expect(source).toContain('/api/admin/tenants')
  })

  it('admin tenants page shows At Limit badge', () => {
    const source = readSource('app/(dashboard)/admin/tenants/page.tsx')
    expect(source).toContain('At Limit')
    expect(source).toContain('destructive')
  })

  it('admin tenants page has Increase Seats action with reason field', () => {
    const source = readSource('app/(dashboard)/admin/tenants/page.tsx')
    expect(source).toContain('Increase Seats')
    expect(source).toContain('reason')
  })

  it('navigation includes Tenants under Admin', () => {
    const source = readSource('lib/config/navigation.ts')
    expect(source).toContain("title: 'Tenants'")
    expect(source).toContain("href: '/admin/tenants'")
    expect(source).toContain('Building2')
  })
})
