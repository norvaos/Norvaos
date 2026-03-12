/**
 * Observability alert utilities for seat-limit and platform-admin operations.
 *
 * Two alert conditions:
 *   1. Spike in seat_limit_denial per tenant → invite spam or broken automation
 *   2. Spike in platform-admin actions     → possible token compromise
 *
 * Implementation: query audit_logs for recent entries, compare against
 * configurable thresholds, and emit structured warn/error logs that a log
 * aggregator (Vercel Logs, Axiom, Sentry, OTel) can turn into real alerts.
 *
 * Usage: call from a periodic health-check cron, or inline after each denial.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { log } from '@/lib/utils/logger'

// ── Configurable thresholds ──────────────────────────────────────────────

/** If a single tenant triggers more than this many seat_limit_denial audit entries in 1 hour, alert. */
export const DENIAL_SPIKE_THRESHOLD = 10

/** Time window for denial spike detection (ms). */
export const DENIAL_SPIKE_WINDOW_MS = 60 * 60 * 1000 // 1 hour

/** If more than this many platform-admin actions happen globally in 10 minutes, alert. */
export const ADMIN_ACTION_SPIKE_THRESHOLD = 20

/** Time window for admin action spike detection (ms). */
export const ADMIN_ACTION_SPIKE_WINDOW_MS = 10 * 60 * 1000 // 10 minutes

// ── Alert functions ──────────────────────────────────────────────────────

/**
 * Check for seat_limit_denial spikes for a specific tenant.
 *
 * Call this after every denial (fire-and-forget) or from a cron job.
 * Emits `log.error('[alert] seat-limit-denial spike')` when threshold is exceeded.
 *
 * Returns true if a spike was detected.
 */
export async function checkDenialSpike(tenantId: string): Promise<boolean> {
  try {
    const admin = createAdminClient()
    const since = new Date(Date.now() - DENIAL_SPIKE_WINDOW_MS).toISOString()

    const { count } = await admin
      .from('audit_logs')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('action', 'seat_limit_denial')
      .gte('created_at', since)

    const denialCount = count ?? 0

    if (denialCount >= DENIAL_SPIKE_THRESHOLD) {
      log.error('[alert] seat-limit-denial spike', {
        tenant_id: tenantId,
        denial_count: denialCount,
        threshold: DENIAL_SPIKE_THRESHOLD,
        window_minutes: DENIAL_SPIKE_WINDOW_MS / 60_000,
        alert_type: 'denial_spike',
      })
      return true
    }

    return false
  } catch {
    // Alert check must never break the caller
    return false
  }
}

/**
 * Check for platform-admin action spikes (global, all tenants).
 *
 * Call this after every platform-admin mutation or from a cron job.
 * Emits `log.error('[alert] platform-admin action spike')` when threshold is exceeded.
 *
 * Returns true if a spike was detected.
 */
export async function checkAdminActionSpike(): Promise<boolean> {
  try {
    const admin = createAdminClient()
    const since = new Date(Date.now() - ADMIN_ACTION_SPIKE_WINDOW_MS).toISOString()

    const { count } = await admin
      .from('audit_logs')
      .select('*', { count: 'exact', head: true })
      .eq('action', 'max_users_updated')
      .gte('created_at', since)

    const actionCount = count ?? 0

    if (actionCount >= ADMIN_ACTION_SPIKE_THRESHOLD) {
      log.error('[alert] platform-admin action spike', {
        action_count: actionCount,
        threshold: ADMIN_ACTION_SPIKE_THRESHOLD,
        window_minutes: ADMIN_ACTION_SPIKE_WINDOW_MS / 60_000,
        alert_type: 'admin_action_spike',
      })
      return true
    }

    return false
  } catch {
    // Alert check must never break the caller
    return false
  }
}
