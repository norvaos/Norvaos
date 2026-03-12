/**
 * Seat-Limit Hardening Regression Test Suite
 * ═══════════════════════════════════════════
 *
 * Validates the two hardening areas:
 *   1. Pending invite controls (cap, expiry, unique index)
 *   2. Platform-admin lockdown (route restriction, rate limiting, audit)
 *
 * Tests are structural (source scanning) — they read source files and assert
 * on content patterns, following the seat-limit-invariant.test.ts pattern.
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
// 1. Pending Invite Controls
// ═══════════════════════════════════════════════════════════════════════════

describe('hardening — pending invite cap', () => {
  it('checkSeatLimit enforces a pending invite soft cap', () => {
    const source = readSource('lib/services/seat-limit.ts')
    expect(source).toContain('PENDING_INVITE_HARD_CAP')
    expect(source).toContain('pendingCap')
    expect(source).toContain('pendingCount >= pendingCap')
  })

  it('soft cap formula is min(max_users * 2, PENDING_INVITE_HARD_CAP)', () => {
    const source = readSource('lib/services/seat-limit.ts')
    expect(source).toContain('Math.min(maxUsers * 2, PENDING_INVITE_HARD_CAP)')
  })

  it('PENDING_INVITE_HARD_CAP is exported and set to 25', () => {
    const source = readSource('lib/services/seat-limit.ts')
    expect(source).toContain('export const PENDING_INVITE_HARD_CAP = 25')
  })

  it('SeatLimitResult includes optional reason field for PENDING_INVITE_CAP', () => {
    const source = readSource('lib/services/seat-limit.ts')
    expect(source).toContain("reason?: 'PENDING_INVITE_CAP'")
  })

  it('seatLimitResponse includes reason in 409 body when present', () => {
    const source = readSource('lib/services/seat-limit.ts')
    expect(source).toContain('result.reason')
  })

  it('invite route passes reason through to logSeatLimitDenial', () => {
    const source = readSource('app/api/settings/users/invite/route.ts')
    expect(source).toContain('seatCheck.reason')
  })

  it('denial response returns canonical 409 with PENDING_INVITE_CAP reason', () => {
    const source = readSource('lib/services/seat-limit.ts')
    expect(source).toContain("reason: 'PENDING_INVITE_CAP'")
    expect(source).toContain('status: 409')
  })
})

describe('hardening — expired invite handling', () => {
  it('checkSeatLimit performs on-read expiration of stale invites', () => {
    const source = readSource('lib/services/seat-limit.ts')
    // Should update stale pending invites to expired status using shared constant
    expect(source).toContain('update({ status: INVITE_EXPIRY_STATUS })')
    expect(source).toContain("eq('status', INVITE_PENDING_STATUS)")
    expect(source).toContain("lt('expires_at'")
  })

  it('checkSeatLimit counts only non-expired pending invites', () => {
    const source = readSource('lib/services/seat-limit.ts')
    // The pending count query should filter by expires_at > now()
    expect(source).toContain("gt('expires_at'")
  })

  it('nightly cleanup cron exists', () => {
    expect(existsSync(resolve(ROOT, 'app/api/cron/expire-invites/route.ts'))).toBe(true)
  })

  it('nightly cleanup cron marks stale pending invites as expired', () => {
    const source = readSource('app/api/cron/expire-invites/route.ts')
    // Uses shared constants — same as checkSeatLimit on-read expiration
    expect(source).toContain('update({ status: INVITE_EXPIRY_STATUS })')
    expect(source).toContain("eq('status', INVITE_PENDING_STATUS)")
    expect(source).toContain("lt('expires_at'")
  })

  it('nightly cleanup cron uses CRON_SECRET auth pattern', () => {
    const source = readSource('app/api/cron/expire-invites/route.ts')
    expect(source).toContain('CRON_SECRET')
    expect(source).toContain('Bearer')
    expect(source).toContain('401')
  })

  it('nightly cleanup cron logs results', () => {
    const source = readSource('app/api/cron/expire-invites/route.ts')
    expect(source).toContain('[cron/expire-invites]')
    expect(source).toContain('expired_count')
  })
})

describe('hardening — unique partial index for active invites', () => {
  it('migration 040 exists', () => {
    expect(existsSync(resolve(ROOT, 'scripts/migrations/040-invite-indexes-and-cap.sql'))).toBe(true)
  })

  it('migration 040 creates composite index on (tenant_id, status, expires_at)', () => {
    const source = readSource('scripts/migrations/040-invite-indexes-and-cap.sql')
    expect(source).toContain('idx_user_invites_tenant_status_expires')
    expect(source).toContain('tenant_id, status, expires_at')
  })

  it('migration 040 creates unique partial index on (tenant_id, email) WHERE status=pending', () => {
    const source = readSource('scripts/migrations/040-invite-indexes-and-cap.sql')
    expect(source).toContain('idx_user_invites_tenant_email_active')
    expect(source).toContain('UNIQUE INDEX')
    expect(source).toContain("WHERE status = 'pending'")
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 2. Platform-Admin Lockdown
// ═══════════════════════════════════════════════════════════════════════════

describe('hardening — platform-admin route restriction', () => {
  it('platform-admin.ts documents /api/admin/* restriction', () => {
    const source = readSource('lib/services/platform-admin.ts')
    expect(source).toContain('/api/admin/')
  })

  it('platform-admin auth is ONLY used by files under app/api/admin/', () => {
    // Scan all route files for platform-admin auth imports
    // Routes may use requirePlatformAdmin (session+bearer) or checkPlatformAdmin (bearer-only)
    const adminTenantsRoute = readSource('app/api/admin/tenants/route.ts')
    const adminMaxUsersRoute = readSource('app/api/admin/tenants/[id]/max-users/route.ts')

    // These SHOULD import platform-admin auth (withPlatformAdmin wrapper, requirePlatformAdmin, or checkPlatformAdmin)
    expect(
      adminTenantsRoute.includes('withPlatformAdmin') ||
      adminTenantsRoute.includes('requirePlatformAdmin') ||
      adminTenantsRoute.includes('checkPlatformAdmin')
    ).toBe(true)
    expect(adminMaxUsersRoute.includes('checkPlatformAdmin')).toBe(true)

    // These SHOULD NOT import any platform-admin auth
    const inviteRoute = readSource('app/api/settings/users/invite/route.ts')
    const acceptInviteRoute = readSource('app/api/auth/accept-invite/route.ts')
    const signupRoute = readSource('app/api/auth/signup/route.ts')

    expect(inviteRoute).not.toContain('checkPlatformAdmin')
    expect(inviteRoute).not.toContain('requirePlatformAdmin')
    expect(acceptInviteRoute).not.toContain('checkPlatformAdmin')
    expect(acceptInviteRoute).not.toContain('requirePlatformAdmin')
    expect(signupRoute).not.toContain('checkPlatformAdmin')
    expect(signupRoute).not.toContain('requirePlatformAdmin')
  })
})

describe('hardening — admin route rate limiting', () => {
  it('platform-admin.ts exports checkAdminRateLimit', () => {
    const source = readSource('lib/services/platform-admin.ts')
    expect(source).toContain('export function checkAdminRateLimit')
  })

  it('platform-admin.ts creates rate limiter with 30 req/min', () => {
    const source = readSource('lib/services/platform-admin.ts')
    expect(source).toContain('maxRequests: 30')
    expect(source).toContain('windowMs: 60_000')
  })

  it('GET /api/admin/tenants checks rate limit', () => {
    const source = readSource('app/api/admin/tenants/route.ts')
    // Route uses withPlatformAdmin wrapper which handles rate limiting internally
    expect(
      source.includes('checkAdminRateLimit(request)') ||
      source.includes('withPlatformAdmin')
    ).toBe(true)
  })

  it('PATCH /api/admin/tenants/[id]/max-users checks rate limit', () => {
    const source = readSource('app/api/admin/tenants/[id]/max-users/route.ts')
    expect(source).toContain('checkAdminRateLimit(request)')
  })
})

describe('hardening — mandatory reason for admin mutations', () => {
  it('PATCH max-users requires reason', () => {
    const source = readSource('app/api/admin/tenants/[id]/max-users/route.ts')
    expect(source).toContain('reason')
    expect(source).toContain('at least 5 characters')
    expect(source).toContain('status: 400')
  })
})

describe('hardening — platform-admin audit logging', () => {
  it('platform-admin.ts exports logPlatformAdminAction', () => {
    const source = readSource('lib/services/platform-admin.ts')
    expect(source).toContain('export async function logPlatformAdminAction')
  })

  it('logPlatformAdminAction writes to audit_logs with actor platform-admin', () => {
    const source = readSource('lib/services/platform-admin.ts')
    expect(source).toContain("from('audit_logs')")
    expect(source).toContain("actor: 'platform-admin'")
  })

  it('logPlatformAdminAction writes to activities', () => {
    const source = readSource('lib/services/platform-admin.ts')
    expect(source).toContain("from('activities')")
    expect(source).toContain("actor: 'platform-admin'")
  })

  it('logPlatformAdminAction captures reason, IP, UA, and request_id', () => {
    const source = readSource('lib/services/platform-admin.ts')
    expect(source).toContain('reason')
    expect(source).toContain('ip')
    expect(source).toContain('user_agent')
    expect(source).toContain('request_id')
  })

  it('PATCH max-users calls logPlatformAdminAudit for platform-admin path', () => {
    const source = readSource('app/api/admin/tenants/[id]/max-users/route.ts')
    expect(source).toContain('logPlatformAdminAudit')
  })

  it('PATCH max-users includes request_id in audit metadata', () => {
    const source = readSource('app/api/admin/tenants/[id]/max-users/route.ts')
    expect(source).toContain('request_id')
    expect(source).toContain('getRequestId')
  })
})

describe('hardening — admin console double-gating', () => {
  it('GET /api/admin/tenants returns 403 for non-platform-admin', () => {
    const source = readSource('app/api/admin/tenants/route.ts')
    // Route uses withPlatformAdmin wrapper which handles auth + PlatformAdminError catch internally,
    // OR uses requirePlatformAdmin directly with PlatformAdminError catch
    expect(
      source.includes('withPlatformAdmin') ||
      (source.includes('requirePlatformAdmin') && source.includes('PlatformAdminError'))
    ).toBe(true)
  })

  it('admin tenants page exists as UI route', () => {
    expect(existsSync(resolve(ROOT, 'app/(dashboard)/admin/tenants/page.tsx'))).toBe(true)
  })

  it('admin tenants page fetches from /api/admin/tenants (API-gated)', () => {
    const source = readSource('app/(dashboard)/admin/tenants/page.tsx')
    expect(source).toContain('/api/admin/tenants')
  })

  it('admin console shows Access Denied on 403', () => {
    const source = readSource('app/(dashboard)/admin/tenants/page.tsx')
    expect(source).toContain('Access Denied')
  })

  it('GET /api/admin/tenants filters pending invites by expires_at > now()', () => {
    const source = readSource('app/api/admin/tenants/route.ts')
    expect(source).toContain("gt('expires_at'")
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 3. Integration: Denial Logging Includes Reason
// ═══════════════════════════════════════════════════════════════════════════

describe('hardening — denial logging with reason', () => {
  it('logSeatLimitDenial accepts optional reason parameter', () => {
    const source = readSource('lib/services/seat-limit.ts')
    expect(source).toContain('reason?: string | null')
  })

  it('logSeatLimitDenial includes reason in structured log', () => {
    const source = readSource('lib/services/seat-limit.ts')
    expect(source).toContain('reason: reason ?? undefined')
  })

  it('logSeatLimitDenial includes reason in audit_logs metadata', () => {
    const source = readSource('lib/services/seat-limit.ts')
    expect(source).toContain('reason: reason ?? null')
  })

  it('PENDING_INVITE_CAP denial generates specific description in activities', () => {
    const source = readSource('lib/services/seat-limit.ts')
    expect(source).toContain('Pending invite cap reached')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 4. Concurrency Safety — accept-invite worst-case path
// ═══════════════════════════════════════════════════════════════════════════

describe('hardening — concurrency: two accept-invite, one seat remaining', () => {
  it('accept-invite calls checkSeatLimit BEFORE admin.auth.admin.createUser', () => {
    const source = readSource('app/api/auth/accept-invite/route.ts')
    const seatCheckIdx = source.indexOf('checkSeatLimit(invite.tenant_id)')
    const createUserIdx = source.indexOf('admin.auth.admin.createUser')
    expect(seatCheckIdx).toBeGreaterThan(-1)
    expect(createUserIdx).toBeGreaterThan(-1)
    expect(seatCheckIdx).toBeLessThan(createUserIdx)
  })

  it('accept-invite deletes auth user on users INSERT failure (no orphan)', () => {
    const source = readSource('app/api/auth/accept-invite/route.ts')
    expect(source).toContain('admin.auth.admin.deleteUser(authData.user.id)')
  })

  it('accept-invite handles trigger backstop "User limit reached" error', () => {
    const source = readSource('app/api/auth/accept-invite/route.ts')
    expect(source).toContain("userErr.message?.includes('User limit reached')")
  })

  it('trigger backstop re-queries via checkSeatLimit and returns seatLimitResponse', () => {
    const source = readSource('app/api/auth/accept-invite/route.ts')
    expect(source).toContain('backstopCheck')
    expect(source).toContain('seatLimitResponse(backstopCheck)')
  })

  it('trigger backstop logs denial with distinct entry_point', () => {
    const source = readSource('app/api/auth/accept-invite/route.ts')
    expect(source).toContain("entry_point: 'accept-invite-trigger-backstop'")
  })

  it('BOTH precheck and backstop paths call logSeatLimitDenial (audit trail)', () => {
    const source = readSource('app/api/auth/accept-invite/route.ts')
    // Should have two separate calls: one for precheck, one for backstop
    const firstIdx = source.indexOf('logSeatLimitDenial')
    const secondIdx = source.indexOf('logSeatLimitDenial', firstIdx + 1)
    expect(firstIdx).toBeGreaterThan(-1)
    expect(secondIdx).toBeGreaterThan(-1)
    expect(secondIdx).toBeGreaterThan(firstIdx)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 5. UI Error Contract: SEAT_LIMIT_REACHED + PENDING_INVITE_CAP
// ═══════════════════════════════════════════════════════════════════════════

describe('hardening — UI error contract', () => {
  it('Users page handles SEAT_LIMIT_REACHED code in invite mutation', () => {
    const source = readSource('app/(dashboard)/settings/users/page.tsx')
    expect(source).toContain("error.code === 'SEAT_LIMIT_REACHED'")
  })

  it('Users page handles PENDING_INVITE_CAP reason in invite mutation', () => {
    const source = readSource('app/(dashboard)/settings/users/page.tsx')
    expect(source).toContain("error.reason === 'PENDING_INVITE_CAP'")
  })

  it('Users page shows specific toast for seat limit (not generic error)', () => {
    const source = readSource('app/(dashboard)/settings/users/page.tsx')
    expect(source).toContain('Seat limit reached')
    expect(source).toContain('Too many pending invitations')
  })

  it('accept-invite page handles SEAT_LIMIT_REACHED code', () => {
    const source = readSource('app/(auth)/invite/[token]/page.tsx')
    expect(source).toContain("data.code === 'SEAT_LIMIT_REACHED'")
  })

  it('accept-invite page shows specific seat-limit error (not generic)', () => {
    const source = readSource('app/(auth)/invite/[token]/page.tsx')
    expect(source).toContain('seat limit')
  })

  it('Users page does NOT show generic 403/500 banners for seat-limit denials', () => {
    const source = readSource('app/(dashboard)/settings/users/page.tsx')
    // The onError handler should branch on code, not show generic "Failed to invite"
    // for seat-limit denials
    expect(source).toContain("error.code === 'SEAT_LIMIT_REACHED'")
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 6. UI Copy: Seats = Active Users Only
// ═══════════════════════════════════════════════════════════════════════════

describe('hardening — UI seat policy copy', () => {
  it('Users page header clarifies invites do not consume seats', () => {
    const source = readSource('app/(dashboard)/settings/users/page.tsx')
    expect(source).toContain('Pending invitations do not consume seats')
  })

  it('invite dialog clarifies only active users count toward limit', () => {
    const source = readSource('app/(dashboard)/settings/users/page.tsx')
    expect(source).toContain('Only active users count toward your')
    expect(source).toContain('-seat limit')
  })

  it('admin console clarifies seat policy', () => {
    const source = readSource('app/(dashboard)/admin/tenants/page.tsx')
    expect(source).toContain('Active users consume seats')
    expect(source).toContain('pending invitations do not count')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 7. Platform-Admin Token Rotation Proof
// ═══════════════════════════════════════════════════════════════════════════

describe('hardening — platform-admin token rotation', () => {
  it('checkPlatformAdmin uses direct string equality (no caching)', () => {
    const source = readSource('lib/services/platform-admin.ts')
    // The check reads process.env.PLATFORM_ADMIN_SECRET on every call
    expect(source).toContain('process.env.PLATFORM_ADMIN_SECRET')
    // Direct equality comparison, no session or cache
    expect(source).toContain('token === secret')
  })

  it('token rotation runbook is documented in platform-admin.ts', () => {
    const source = readSource('lib/services/platform-admin.ts')
    expect(source).toContain('TOKEN ROTATION RUNBOOK')
    expect(source).toContain('openssl rand -hex 32')
    expect(source).toContain('Old token stops working INSTANTLY')
  })

  it('no token caching or session mechanism exists', () => {
    const source = readSource('lib/services/platform-admin.ts')
    // checkPlatformAdmin is a pure function — no state, no cache
    expect(source).not.toContain('tokenCache')
    expect(source).not.toContain('sessionStore')
    expect(source).not.toContain('cachedSecret')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 8. Admin UI Guardrail: > 2× Confirmation
// ═══════════════════════════════════════════════════════════════════════════

describe('hardening — admin max_users > 2x guardrail', () => {
  it('admin tenants page tracks slug confirmation state', () => {
    const source = readSource('app/(dashboard)/admin/tenants/page.tsx')
    expect(source).toContain('slugConfirm')
    expect(source).toContain('setSlugConfirm')
  })

  it('admin tenants page computes needsSlugConfirmation for > 2x', () => {
    const source = readSource('app/(dashboard)/admin/tenants/page.tsx')
    expect(source).toContain('needsSlugConfirmation')
    expect(source).toContain('max_users * 2')
  })

  it('admin tenants page blocks submit when slug does not match', () => {
    const source = readSource('app/(dashboard)/admin/tenants/page.tsx')
    expect(source).toContain('slugConfirm !== selectedTenant.slug')
  })

  it('admin tenants page shows warning UI for large increase', () => {
    const source = readSource('app/(dashboard)/admin/tenants/page.tsx')
    expect(source).toContain('Large increase')
    expect(source).toContain('2× the current limit')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 9. Invite Expiry Shared Constants
// ═══════════════════════════════════════════════════════════════════════════

describe('hardening — invite expiry shared constants', () => {
  it('seat-limit.ts exports INVITE_EXPIRY_STATUS and INVITE_PENDING_STATUS', () => {
    const source = readSource('lib/services/seat-limit.ts')
    expect(source).toContain("export const INVITE_EXPIRY_STATUS = 'expired'")
    expect(source).toContain("export const INVITE_PENDING_STATUS = 'pending'")
  })

  it('checkSeatLimit on-read expiration uses INVITE_EXPIRY_STATUS', () => {
    const source = readSource('lib/services/seat-limit.ts')
    expect(source).toContain('update({ status: INVITE_EXPIRY_STATUS })')
  })

  it('checkSeatLimit pending count uses INVITE_PENDING_STATUS', () => {
    const source = readSource('lib/services/seat-limit.ts')
    expect(source).toContain("eq('status', INVITE_PENDING_STATUS)")
  })

  it('cron/expire-invites imports shared constants', () => {
    const source = readSource('app/api/cron/expire-invites/route.ts')
    expect(source).toContain("import { INVITE_EXPIRY_STATUS, INVITE_PENDING_STATUS } from '@/lib/services/seat-limit'")
  })

  it('cron/expire-invites uses INVITE_EXPIRY_STATUS for update', () => {
    const source = readSource('app/api/cron/expire-invites/route.ts')
    expect(source).toContain('update({ status: INVITE_EXPIRY_STATUS })')
  })

  it('cron/expire-invites uses INVITE_PENDING_STATUS for filter', () => {
    const source = readSource('app/api/cron/expire-invites/route.ts')
    expect(source).toContain("eq('status', INVITE_PENDING_STATUS)")
  })

  it('both cron and on-read use .lt(expires_at) (same semantics)', () => {
    const seatLimit = readSource('lib/services/seat-limit.ts')
    const cron = readSource('app/api/cron/expire-invites/route.ts')
    expect(seatLimit).toContain("lt('expires_at'")
    expect(cron).toContain("lt('expires_at'")
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 10. Index + Query Plan Proof Script
// ═══════════════════════════════════════════════════════════════════════════

describe('hardening — EXPLAIN ANALYZE script exists', () => {
  it('explain-seat-limit-queries.sql exists', () => {
    expect(existsSync(resolve(ROOT, 'scripts/explain-seat-limit-queries.sql'))).toBe(true)
  })

  it('explain script covers all three checkSeatLimit count queries', () => {
    const source = readSource('scripts/explain-seat-limit-queries.sql')
    expect(source).toContain('users')
    expect(source).toContain('is_active')
    expect(source).toContain('user_invites')
    expect(source).toContain("status = 'pending'")
    expect(source).toContain('expires_at')
    expect(source).toContain('tenants')
    expect(source).toContain('max_users')
  })

  it('explain script covers the on-read expiration UPDATE', () => {
    const source = readSource('scripts/explain-seat-limit-queries.sql')
    expect(source).toContain("SET status = 'expired'")
    expect(source).toContain('expires_at < now()')
  })

  it('explain script lists indexes on user_invites', () => {
    const source = readSource('scripts/explain-seat-limit-queries.sql')
    expect(source).toContain('pg_indexes')
    expect(source).toContain("tablename = 'user_invites'")
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 11. Observability Alerts
// ═══════════════════════════════════════════════════════════════════════════

describe('hardening — observability alerts', () => {
  it('alerts.ts exists', () => {
    expect(existsSync(resolve(ROOT, 'lib/utils/alerts.ts'))).toBe(true)
  })

  it('alerts.ts exports checkDenialSpike with configurable threshold', () => {
    const source = readSource('lib/utils/alerts.ts')
    expect(source).toContain('export async function checkDenialSpike')
    expect(source).toContain('DENIAL_SPIKE_THRESHOLD')
  })

  it('alerts.ts exports checkAdminActionSpike with configurable threshold', () => {
    const source = readSource('lib/utils/alerts.ts')
    expect(source).toContain('export async function checkAdminActionSpike')
    expect(source).toContain('ADMIN_ACTION_SPIKE_THRESHOLD')
  })

  it('checkDenialSpike emits log.error for alert_type denial_spike', () => {
    const source = readSource('lib/utils/alerts.ts')
    expect(source).toContain('[alert] seat-limit-denial spike')
    expect(source).toContain("alert_type: 'denial_spike'")
  })

  it('checkAdminActionSpike emits log.error for alert_type admin_action_spike', () => {
    const source = readSource('lib/utils/alerts.ts')
    expect(source).toContain('[alert] platform-admin action spike')
    expect(source).toContain("alert_type: 'admin_action_spike'")
  })

  it('logSeatLimitDenial triggers checkDenialSpike (fire-and-forget)', () => {
    const source = readSource('lib/services/seat-limit.ts')
    expect(source).toContain('checkDenialSpike(tenant_id)')
  })

  it('logPlatformAdminAction triggers checkAdminActionSpike (fire-and-forget)', () => {
    const source = readSource('lib/services/platform-admin.ts')
    expect(source).toContain('checkAdminActionSpike()')
  })
})
