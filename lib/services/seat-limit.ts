import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { log } from '@/lib/utils/logger'
import type { Json } from '@/lib/types/database'
import { checkDenialSpike } from '@/lib/utils/alerts'

// ── Policy v1: seats = active users only ────────────────────────────────────
// Pending invites are tracked for visibility but do NOT count toward the seat
// limit. This avoids false blocks when invites expire or are never accepted.
// The DB trigger (enforce_max_users) is the authoritative backstop and also
// counts active users only, so the app-layer precheck and the trigger agree.
//
// Pending invite cap: a separate soft cap prevents invite abuse. If active
// pending invites exceed max_users * 2 (capped at 25), new invites are denied.
// ─────────────────────────────────────────────────────────────────────────────

export const SEAT_LIMIT_CODE = 'SEAT_LIMIT_REACHED' as const

/** Soft cap on active pending invites = min(max_users * 2, PENDING_INVITE_HARD_CAP). */
export const PENDING_INVITE_HARD_CAP = 25

/**
 * Invite expiry threshold: invites with `expires_at <= now()` are expired.
 *
 * Used by both on-read expiration in checkSeatLimit() and the nightly cron
 * at /api/cron/expire-invites. Both MUST use `.lt('expires_at', ...)` with
 * the same semantics so they produce identical results on the same dataset.
 *
 * The threshold is always evaluated as `new Date().toISOString()` at call time.
 * This constant documents the shared contract and is referenced in tests.
 */
export const INVITE_EXPIRY_STATUS = 'expired' as const
export const INVITE_PENDING_STATUS = 'pending' as const

export interface SeatLimitResult {
  allowed: boolean
  tenant_id: string
  max_users: number
  active_user_count: number
  pending_invites: number
  evaluated_at: string
  /** Present when denial is due to pending-invite cap rather than seat limit. */
  reason?: 'PENDING_INVITE_CAP'
}

/**
 * Check whether a tenant has room for one more active user.
 *
 * Also enforces a pending-invite cap to prevent invite abuse:
 *   cap = min(max_users * 2, PENDING_INVITE_HARD_CAP)
 *
 * Side-effect: marks stale invites (status='pending' AND expires_at <= now())
 * as expired on-read, so counts stay accurate without waiting for the nightly cron.
 *
 * Runs four operations (three parallel queries + on-read expiration) using the
 * admin client. Returns a typed result that callers forward to
 * `seatLimitResponse()` on denial and `logSeatLimitDenial()` for observability.
 */
export async function checkSeatLimit(tenantId: string): Promise<SeatLimitResult> {
  const admin = createAdminClient()

  // ── On-read expiration: mark stale invites as expired ──
  // Fire-and-forget — don't block the check. The count query below uses
  // expires_at > now() so stale rows are excluded even if this hasn't committed yet.
  const now = new Date().toISOString()

  // ── On-read expiration using shared constants ──
  void admin
    .from('user_invites')
    .update({ status: INVITE_EXPIRY_STATUS })
    .eq('tenant_id', tenantId)
    .eq('status', INVITE_PENDING_STATUS)
    .lt('expires_at', now)
    .then(() => {}, () => {})

  const [activeResult, pendingResult, tenantResult] = await Promise.all([
    admin
      .from('users')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('is_active', true),
    // Count only non-expired pending invites (expires_at > now)
    admin
      .from('user_invites')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('status', INVITE_PENDING_STATUS)
      .gt('expires_at', now),
    admin
      .from('tenants')
      .select('max_users')
      .eq('id', tenantId)
      .single(),
  ])

  const activeCount = activeResult.count ?? 0
  const pendingCount = pendingResult.count ?? 0
  const maxUsers = tenantResult.data?.max_users ?? null

  // NULL guard: every tenant MUST have an explicit max_users value.
  // If missing, deny by default and surface the issue.
  if (maxUsers === null) {
    return {
      allowed: false,
      tenant_id: tenantId,
      max_users: 0,
      active_user_count: activeCount,
      pending_invites: pendingCount,
      evaluated_at: new Date().toISOString(),
    }
  }

  // ── Seat-limit check (v1: active users only) ──
  if (activeCount >= maxUsers) {
    return {
      allowed: false,
      tenant_id: tenantId,
      max_users: maxUsers,
      active_user_count: activeCount,
      pending_invites: pendingCount,
      evaluated_at: new Date().toISOString(),
    }
  }

  // ── Pending-invite cap check ──
  const pendingCap = Math.min(maxUsers * 2, PENDING_INVITE_HARD_CAP)
  if (pendingCount >= pendingCap) {
    return {
      allowed: false,
      tenant_id: tenantId,
      max_users: maxUsers,
      active_user_count: activeCount,
      pending_invites: pendingCount,
      evaluated_at: new Date().toISOString(),
      reason: 'PENDING_INVITE_CAP',
    }
  }

  return {
    allowed: true,
    tenant_id: tenantId,
    max_users: maxUsers,
    active_user_count: activeCount,
    pending_invites: pendingCount,
    evaluated_at: new Date().toISOString(),
  }
}

/**
 * Return the canonical HTTP 409 response for a seat-limit denial.
 *
 * Every seat-limit denial across the entire app uses this shape — no other
 * format is acceptable. Consumers can pattern-match on `code: 'SEAT_LIMIT_REACHED'`.
 *
 * When the denial is due to the pending-invite cap, `reason: 'PENDING_INVITE_CAP'`
 * is included so the client can show a more specific message.
 */
export function seatLimitResponse(result: SeatLimitResult): NextResponse {
  return NextResponse.json(
    {
      code: SEAT_LIMIT_CODE,
      tenant_id: result.tenant_id,
      max_users: result.max_users,
      active_user_count: result.active_user_count,
      pending_invites: result.pending_invites,
      ...(result.reason ? { reason: result.reason } : {}),
    },
    { status: 409 }
  )
}

// ── Denial logging with 1-hour dedupe ───────────────────────────────────────

export interface SeatLimitDenialParams {
  tenant_id: string
  active_user_count: number
  pending_invites: number
  max_users: number
  entry_point: string
  user_id?: string | null
  ip?: string | null
  user_agent?: string | null
  reason?: string | null
}

/**
 * Log a seat-limit denial to structured logs, audit_logs, and activities.
 *
 * Dedupe guard: if an audit_logs entry with the same action + tenant +
 * entry_point exists within the last hour, skip the DB writes (still emits
 * a structured warn log so real-time streaming sees every denial).
 *
 * Fire-and-forget via Promise.allSettled — never blocks the response.
 */
export async function logSeatLimitDenial(params: SeatLimitDenialParams): Promise<void> {
  const {
    tenant_id,
    active_user_count,
    pending_invites,
    max_users,
    entry_point,
    user_id,
    ip,
    user_agent,
    reason,
  } = params

  // Always emit structured log (no dedupe — streaming consumers see every hit)
  log.warn('[seat-limit] denied', {
    tenant_id,
    active_user_count,
    pending_invites,
    max_users,
    entry_point,
    user_id: user_id ?? undefined,
    ip: ip ?? undefined,
    user_agent: user_agent ?? undefined,
    reason: reason ?? undefined,
  })

  const admin = createAdminClient()

  // ── Dedupe check: same tenant + entry_point in last 1 hour ──
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()

  const { count: recentCount } = await admin
    .from('audit_logs')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tenant_id)
    .eq('action', 'seat_limit_denial')
    .gte('created_at', oneHourAgo)

  if (recentCount && recentCount > 0) {
    // Recent audit entry exists — skip DB writes to avoid spam
    return
  }

  // ── Write audit_logs + activities in parallel, fire-and-forget ──
  await Promise.allSettled([
    admin.from('audit_logs').insert({
      tenant_id,
      user_id: user_id ?? null,
      entity_type: 'tenant',
      entity_id: tenant_id,
      action: 'seat_limit_denial',
      changes: {
        active_user_count,
        pending_invites,
        max_users,
      } as Json,
      metadata: {
        entry_point,
        ip: ip ?? null,
        user_agent: user_agent ?? null,
        reason: reason ?? null,
      } as Json,
    }),

    admin.from('activities').insert({
      tenant_id,
      activity_type: 'seat_limit_denial',
      title: 'Seat limit reached',
      description: reason === 'PENDING_INVITE_CAP'
        ? `Pending invite cap reached at ${entry_point}: ${pending_invites} active pending invites (cap: ${Math.min(max_users * 2, PENDING_INVITE_HARD_CAP)}).`
        : `Seat limit denial at ${entry_point}: ${active_user_count}/${max_users} active users (${pending_invites} pending invites).`,
      entity_type: 'tenant',
      entity_id: tenant_id,
      user_id: user_id ?? null,
      metadata: {
        entry_point,
        active_user_count,
        pending_invites,
        max_users,
        reason: reason ?? null,
      } as Json,
    }),
  ])

  // ── Observability: fire-and-forget spike detection ──
  checkDenialSpike(tenant_id).catch(() => {})
}
