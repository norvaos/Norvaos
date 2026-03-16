/**
 * Notification Retry Handler
 *
 * Manages bounded retry scheduling for failed notification deliveries.
 * Provides a dead-letter queue for permanently failed items.
 *
 * Design:
 * - Max 3 retries total (checked before scheduling)
 * - After max retries: log to Sentry + write to dead-letter store
 * - Dead-letter is in-memory; items are retrievable for monitoring
 *
 * Team 3 / Module 2 — Notification & Communications Adapters
 */

import * as Sentry from '@sentry/nextjs'
import { log } from '@/lib/utils/logger'

// ─── Types ──────────────────────────────────────────────────────────────────

export interface FailedDelivery {
  id: string
  tenantId: string
  channel: 'email' | 'in-app' | 'push'
  entityType: string
  entityId: string
  errorMessage: string
  attemptCount: number
  firstFailedAt: string // ISO
  lastFailedAt: string // ISO
}

export interface RetryContext {
  tenantId: string
}

// ─── Constants ───────────────────────────────────────────────────────────────

const MAX_RETRY_ATTEMPTS = 3
const DEAD_LETTER_MAX_SIZE = 500

// ─── Dead-Letter Queue ───────────────────────────────────────────────────────

const deadLetterQueue: FailedDelivery[] = []

function addToDeadLetter(item: FailedDelivery): void {
  // Cap size: drop oldest if full
  if (deadLetterQueue.length >= DEAD_LETTER_MAX_SIZE) {
    deadLetterQueue.shift()
  }
  deadLetterQueue.push(item)

  log.error('delivery_dead_lettered', {
    tenant_id: item.tenantId,
    channel: item.channel,
    entity_type: item.entityType,
    entity_id: item.entityId,
    attempt_count: item.attemptCount,
    error_code: 'MAX_RETRIES_EXHAUSTED',
  })

  // Escalate to Sentry
  Sentry.withScope((scope) => {
    scope.setTag('tenant_id', item.tenantId)
    scope.setTag('channel', item.channel)
    scope.setTag('entity_type', item.entityType)
    scope.setExtra('attempt_count', item.attemptCount)
    scope.setExtra('first_failed_at', item.firstFailedAt)
    scope.setExtra('last_failed_at', item.lastFailedAt)
    // Never pass PII in extras — only structural metadata
    Sentry.captureMessage(
      `Notification permanently failed after ${item.attemptCount} attempts: ${item.entityType}`,
      'error',
    )
  })
}

// ─── Retry Scheduler ─────────────────────────────────────────────────────────

/**
 * Schedule a retry for a failed delivery job.
 *
 * Checks the attempt count before scheduling — if attempts >= MAX_RETRY_ATTEMPTS,
 * the item is moved to the dead-letter queue instead of retrying.
 *
 * Note: this function schedules via setTimeout (in-process). For durable
 * cross-process retry, enqueue to the job queue via `enqueueJob`. That
 * extension is outside the current module scope.
 */
export function scheduleRetry(
  failed: FailedDelivery,
  context: RetryContext,
  retryFn: () => Promise<void>,
): void {
  const { tenantId } = context

  if (failed.attemptCount >= MAX_RETRY_ATTEMPTS) {
    log.warn('delivery_retry_limit_reached', {
      tenant_id: tenantId,
      channel: failed.channel,
      entity_id: failed.entityId,
      attempt_count: failed.attemptCount,
      max_attempts: MAX_RETRY_ATTEMPTS,
    })
    addToDeadLetter(failed)
    return
  }

  const delayMs = Math.min(1_000 * Math.pow(2, failed.attemptCount), 10_000)

  log.info('delivery_retry_scheduled', {
    tenant_id: tenantId,
    channel: failed.channel,
    entity_id: failed.entityId,
    attempt_count: failed.attemptCount,
    next_attempt: failed.attemptCount + 1,
    delay_ms: delayMs,
  })

  setTimeout(() => {
    retryFn().catch((err) => {
      log.error('delivery_retry_failed', {
        tenant_id: tenantId,
        channel: failed.channel,
        entity_id: failed.entityId,
        error_message: err instanceof Error ? err.message : String(err),
      })

      const updated: FailedDelivery = {
        ...failed,
        attemptCount: failed.attemptCount + 1,
        lastFailedAt: new Date().toISOString(),
        errorMessage: err instanceof Error ? err.message : String(err),
      }

      scheduleRetry(updated, context, retryFn)
    })
  }, delayMs)
}

// ─── Dead-Letter Accessors ───────────────────────────────────────────────────

/**
 * Return all items currently in the dead-letter queue.
 * Used by the failure dashboard and monitoring surfaces.
 */
export function getDeadLetterItems(): ReadonlyArray<FailedDelivery> {
  return deadLetterQueue
}

/**
 * Return dead-letter items for a specific tenant.
 */
export function getDeadLetterItemsForTenant(tenantId: string): FailedDelivery[] {
  return deadLetterQueue.filter((item) => item.tenantId === tenantId)
}

/**
 * Clear dead-letter items for a tenant (e.g. after manual resolution).
 * Logs the clear action for audit trail.
 */
export function clearDeadLetterForTenant(tenantId: string, resolvedBy: string): void {
  const before = deadLetterQueue.length
  let removed = 0

  for (let i = deadLetterQueue.length - 1; i >= 0; i--) {
    if (deadLetterQueue[i].tenantId === tenantId) {
      deadLetterQueue.splice(i, 1)
      removed++
    }
  }

  log.info('dead_letter_cleared', {
    tenant_id: tenantId,
    items_removed: removed,
    queue_size_before: before,
    queue_size_after: deadLetterQueue.length,
    resolved_by: resolvedBy,
  })
}

/** @internal — for testing only */
export function _resetDeadLetterForTesting(): void {
  deadLetterQueue.length = 0
}
