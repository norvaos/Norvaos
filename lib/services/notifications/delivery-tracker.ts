/**
 * Delivery Tracker
 *
 * In-process ring buffer tracking delivery outcomes per tenant and channel.
 * Used by the dispatch adapter and email delivery adapter to record attempts
 * and by the failure dashboard to surface health signals.
 *
 * Design: no database writes  -  structured log lines are the audit trail.
 * The in-memory store serves as a fast read surface for alert threshold checks.
 *
 * Team 3 / Module 2  -  Notification & Communications Adapters
 */

import { log } from '@/lib/utils/logger'

// ─── Types ──────────────────────────────────────────────────────────────────

export type DeliveryChannel = 'email' | 'in-app' | 'push'
export type DeliveryStatus = 'sent' | 'failed' | 'retrying'

export interface DeliveryAttemptParams {
  tenantId: string
  channel: DeliveryChannel
  entityType: string
  entityId: string
  status: DeliveryStatus
  error?: string
  attempts: number
}

export interface DeliveryRecord {
  tenantId: string
  channel: DeliveryChannel
  entityType: string
  entityId: string
  status: DeliveryStatus
  error?: string
  attempts: number
  recordedAt: number // unix ms
}

export interface DeliveryFailureSummary {
  tenantId: string
  windowMinutes: number
  totalFailures: number
  byChannel: Record<DeliveryChannel, number>
  oldestFailureAt?: string // ISO
}

// ─── Ring Buffer ─────────────────────────────────────────────────────────────

const RING_BUFFER_SIZE = 2_000

const buffer: DeliveryRecord[] = new Array(RING_BUFFER_SIZE)
let head = 0
let count = 0

function push(record: DeliveryRecord): void {
  buffer[head % RING_BUFFER_SIZE] = record
  head++
  if (count < RING_BUFFER_SIZE) count++
}

function getAll(): DeliveryRecord[] {
  if (count === 0) return []
  if (count < RING_BUFFER_SIZE) return buffer.slice(0, count).filter(Boolean)

  // Ring is full  -  return in chronological order
  const start = head % RING_BUFFER_SIZE
  return [
    ...buffer.slice(start).filter(Boolean),
    ...buffer.slice(0, start).filter(Boolean),
  ]
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Record a delivery attempt outcome.
 *
 * Always emits a structured log line regardless of in-memory state.
 * Error text is included in logs but email addresses and body content
 * must never be passed in `params.error`.
 */
export function recordDeliveryAttempt(params: DeliveryAttemptParams): void {
  const record: DeliveryRecord = {
    ...params,
    recordedAt: Date.now(),
  }

  push(record)

  log.info('delivery_attempt', {
    tenant_id: params.tenantId,
    channel: params.channel,
    entity_type: params.entityType,
    entity_id: params.entityId,
    status: params.status,
    attempts: params.attempts,
    // Only log error code/message, never body content or addresses
    ...(params.error ? { error_message: params.error.slice(0, 200) } : {}),
  })
}

/**
 * Return aggregated failure counts for a tenant within a sliding time window.
 */
export function getRecentFailures(
  tenantId: string,
  windowMinutes: number,
): DeliveryFailureSummary {
  const cutoff = Date.now() - windowMinutes * 60_000
  const records = getAll()

  const failures = records.filter(
    (r) => r.tenantId === tenantId && r.status === 'failed' && r.recordedAt >= cutoff,
  )

  const byChannel: Record<DeliveryChannel, number> = { email: 0, 'in-app': 0, push: 0 }
  let oldestMs: number | undefined

  for (const f of failures) {
    byChannel[f.channel] = (byChannel[f.channel] ?? 0) + 1
    if (oldestMs === undefined || f.recordedAt < oldestMs) {
      oldestMs = f.recordedAt
    }
  }

  return {
    tenantId,
    windowMinutes,
    totalFailures: failures.length,
    byChannel,
    oldestFailureAt: oldestMs ? new Date(oldestMs).toISOString() : undefined,
  }
}

/**
 * Returns true if the failure rate for `tenantId` exceeds the alert threshold:
 * more than 5 failed deliveries within the last 15 minutes.
 *
 * Callers should alert or escalate when this returns true.
 */
export function checkAlertThreshold(tenantId: string): boolean {
  const summary = getRecentFailures(tenantId, 15)
  const exceeded = summary.totalFailures > 5

  if (exceeded) {
    log.warn('delivery_alert_threshold_exceeded', {
      tenant_id: tenantId,
      failure_count: summary.totalFailures,
      window_minutes: 15,
    })
  }

  return exceeded
}

/** @internal  -  for testing only */
export function _resetBufferForTesting(): void {
  buffer.fill(undefined as unknown as DeliveryRecord)
  head = 0
  count = 0
}
