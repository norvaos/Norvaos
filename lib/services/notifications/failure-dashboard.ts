/**
 * Notification Failure Dashboard — Data Service
 *
 * Aggregates delivery tracking data into summary views for the support
 * dashboard and health monitoring surfaces.
 *
 * Reads from the in-memory delivery tracker and dead-letter queue.
 * No database reads — all data comes from the in-process tracking stores.
 *
 * Team 3 / Module 2 — Notification & Communications Adapters
 */

import { getRecentFailures, checkAlertThreshold } from '@/lib/services/notifications/delivery-tracker'
import { getDeadLetterItemsForTenant } from '@/lib/services/notifications/retry-handler'
import { log } from '@/lib/utils/logger'

// ─── Types ──────────────────────────────────────────────────────────────────

export type ChannelHealth = 'healthy' | 'degraded' | 'down'

export interface ChannelHealthStatus {
  email: ChannelHealth
  'in-app': ChannelHealth
  push: ChannelHealth
  lastChecked: string // ISO
}

export interface NotificationFailureSummary {
  tenantId: string
  windowMinutes: number
  totalFailures: number
  byChannel: Record<string, number>
  deadLetterCount: number
  alertThresholdExceeded: boolean
  oldestFailureAt?: string
  lastChecked: string // ISO
}

// ─── Health Classification ───────────────────────────────────────────────────

/**
 * Map failure count to a health status.
 *
 * Thresholds (per channel, 15-minute window):
 * - 0      → healthy
 * - 1–3    → degraded
 * - 4+     → down
 */
function classifyChannelHealth(failureCount: number): ChannelHealth {
  if (failureCount === 0) return 'healthy'
  if (failureCount <= 3) return 'degraded'
  return 'down'
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Return an aggregated failure summary for a tenant.
 *
 * Always scoped to `tenantId` — never returns cross-tenant data.
 */
export function getNotificationFailureSummary(
  tenantId: string,
  windowMinutes = 15,
): NotificationFailureSummary {
  log.debug('failure_dashboard.summary_requested', {
    tenant_id: tenantId,
    window_minutes: windowMinutes,
  })

  const recent = getRecentFailures(tenantId, windowMinutes)
  const deadLetterItems = getDeadLetterItemsForTenant(tenantId)
  const alertExceeded = checkAlertThreshold(tenantId)

  return {
    tenantId,
    windowMinutes,
    totalFailures: recent.totalFailures,
    byChannel: recent.byChannel,
    deadLetterCount: deadLetterItems.length,
    alertThresholdExceeded: alertExceeded,
    oldestFailureAt: recent.oldestFailureAt,
    lastChecked: new Date().toISOString(),
  }
}

/**
 * Return per-channel health status for a tenant.
 *
 * Used by the support dashboard to render colour-coded health badges.
 */
export function getChannelHealth(tenantId: string): ChannelHealthStatus {
  const recent = getRecentFailures(tenantId, 15)

  const status: ChannelHealthStatus = {
    email: classifyChannelHealth(recent.byChannel.email),
    'in-app': classifyChannelHealth(recent.byChannel['in-app']),
    push: classifyChannelHealth(recent.byChannel.push),
    lastChecked: new Date().toISOString(),
  }

  log.debug('failure_dashboard.channel_health_checked', {
    tenant_id: tenantId,
    email_health: status.email,
    'in-app_health': status['in-app'],
    push_health: status.push,
  })

  return status
}
