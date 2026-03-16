/**
 * Notification Dispatch Adapter
 *
 * Hardened wrapper over the notification engine that adds:
 * - Idempotency / deduplication via an in-memory TTL map
 * - Bounded retry with exponential backoff (max 3 attempts)
 * - Structured logging with tenant context on every code path
 * - PII protection: no client names or email addresses in log lines
 *
 * This adapter does NOT change notification business logic (when to send,
 * who receives, which channels). It only hardens the delivery layer.
 *
 * Scope constraint: no schema migrations, no new API routes.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'
import type { NotificationEvent } from '@/lib/services/notification-engine'
import { dispatchNotification as engineDispatch } from '@/lib/services/notification-engine'
import { retryWithBackoff } from '@/lib/utils/retry'
import { log } from '@/lib/utils/logger'
import { recordDeliveryAttempt } from '@/lib/services/notifications/delivery-tracker'

// ─── Types ──────────────────────────────────────────────────────────────────

export interface DispatchContext {
  tenantId: string
}

export type DispatchResult =
  | {
      dispatched: true
      idempotencyKey: string
      attempts: number
    }
  | {
      dispatched: false
      reason: 'deduplicated' | 'permanent_failure' | 'no_recipients'
      idempotencyKey: string
      error?: string
      attempts: number
    }

// ─── In-Memory Deduplication Store ──────────────────────────────────────────
//
// Keys are evicted after TTL_MS to prevent unbounded growth.
// This is intentionally simple: the duplicate window is one minute,
// matching the `timestamp_minute` component of the key.
// For cross-process deduplication, a shared cache (Redis/Upstash) would
// be required — that is a future hardening task outside this scope.

const DEDUP_TTL_MS = 60_000 // 1 minute — matches timestamp_minute key component
const MAX_DEDUP_MAP_SIZE = 5_000 // upper bound to prevent memory growth

interface DedupEntry {
  expiresAt: number
}

const dedupMap = new Map<string, DedupEntry>()

function pruneExpiredDedupEntries(): void {
  const now = Date.now()
  // Prune at most 200 entries per call to keep overhead constant
  let pruned = 0
  for (const [key, entry] of dedupMap.entries()) {
    if (entry.expiresAt <= now) {
      dedupMap.delete(key)
      pruned++
      if (pruned >= 200) break
    }
  }
}

function isDuplicate(key: string): boolean {
  const entry = dedupMap.get(key)
  if (!entry) return false
  if (entry.expiresAt <= Date.now()) {
    dedupMap.delete(key)
    return false
  }
  return true
}

function markSeen(key: string): void {
  pruneExpiredDedupEntries()

  // Hard cap: if map is full, evict oldest entry
  if (dedupMap.size >= MAX_DEDUP_MAP_SIZE) {
    const firstKey = dedupMap.keys().next().value
    if (firstKey !== undefined) dedupMap.delete(firstKey)
  }

  dedupMap.set(key, { expiresAt: Date.now() + DEDUP_TTL_MS })
}

// ─── Idempotency Key ─────────────────────────────────────────────────────────

/**
 * Generate a deduplication key from stable event components.
 *
 * The key includes a "timestamp minute" bucket so that the same logical event
 * fired within the same 60-second window is treated as a duplicate.
 * Events separated by more than 60 seconds are considered distinct.
 *
 * Note: `title` and `message` are intentionally excluded — they may contain PII.
 */
function buildIdempotencyKey(event: NotificationEvent): string {
  const minuteBucket = Math.floor(Date.now() / 60_000)
  const entityPart = event.entityId ? `${event.entityType ?? 'unknown'}:${event.entityId}` : 'no-entity'
  const recipientHash = event.recipientUserIds.slice().sort().join(',')
  return [
    event.tenantId,
    event.eventType,
    entityPart,
    recipientHash,
    minuteBucket,
  ].join('|')
}

// ─── Dispatch Adapter ────────────────────────────────────────────────────────

/**
 * Dispatch a notification event with retry, deduplication, and structured
 * delivery tracking.
 *
 * @param supabase  - Admin Supabase client (passed through to engine)
 * @param event     - The notification event to dispatch
 * @param context   - Delivery context (tenantId required for log scoping)
 */
export async function dispatchNotification(
  supabase: SupabaseClient<Database>,
  event: NotificationEvent,
  context: DispatchContext,
): Promise<DispatchResult> {
  const { tenantId } = context
  const idempotencyKey = buildIdempotencyKey(event)

  // Guard: empty recipient list
  if (event.recipientUserIds.length === 0) {
    log.debug('Dispatch skipped — no recipients', {
      tenant_id: tenantId,
      event_type: event.eventType,
      entity_id: event.entityId,
    })
    return {
      dispatched: false,
      reason: 'no_recipients',
      idempotencyKey,
      attempts: 0,
    }
  }

  // Guard: duplicate dispatch within TTL window
  if (isDuplicate(idempotencyKey)) {
    log.info('Notification deduplicated — already dispatched within window', {
      tenant_id: tenantId,
      event_type: event.eventType,
      entity_id: event.entityId,
      idempotency_key: idempotencyKey,
    })
    recordDeliveryAttempt({
      tenantId,
      channel: 'in-app',
      entityType: event.entityType ?? 'unknown',
      entityId: event.entityId ?? 'unknown',
      status: 'sent', // treated as success — not an error
      attempts: 0,
    })
    return {
      dispatched: false,
      reason: 'deduplicated',
      idempotencyKey,
      attempts: 0,
    }
  }

  // Attempt dispatch with retry
  const result = await retryWithBackoff(
    () => engineDispatch(supabase, event),
    {
      maxAttempts: 3,
      baseDelayMs: 1_000,
      maxDelayMs: 10_000,
      tenantId,
      operation: 'notification_dispatch',
      onRetry: (attempt, err) => {
        recordDeliveryAttempt({
          tenantId,
          channel: 'in-app',
          entityType: event.entityType ?? 'unknown',
          entityId: event.entityId ?? 'unknown',
          status: 'retrying',
          error: err.message,
          attempts: attempt - 1,
        })
      },
    },
  )

  if (result.success) {
    markSeen(idempotencyKey)

    log.info('Notification dispatched successfully', {
      tenant_id: tenantId,
      event_type: event.eventType,
      entity_id: event.entityId,
      recipient_count: event.recipientUserIds.length,
      attempts: result.attempts,
    })

    recordDeliveryAttempt({
      tenantId,
      channel: 'in-app',
      entityType: event.entityType ?? 'unknown',
      entityId: event.entityId ?? 'unknown',
      status: 'sent',
      attempts: result.attempts,
    })

    return {
      dispatched: true,
      idempotencyKey,
      attempts: result.attempts,
    }
  }

  // Permanent failure
  log.error('Notification dispatch permanently failed', {
    tenant_id: tenantId,
    event_type: event.eventType,
    entity_id: event.entityId,
    recipient_count: event.recipientUserIds.length,
    error_code: 'DISPATCH_PERMANENT_FAILURE',
    error_message: result.error.message,
    attempts: result.attempts,
  })

  recordDeliveryAttempt({
    tenantId,
    channel: 'in-app',
    entityType: event.entityType ?? 'unknown',
    entityId: event.entityId ?? 'unknown',
    status: 'failed',
    error: result.error.message,
    attempts: result.attempts,
  })

  return {
    dispatched: false,
    reason: 'permanent_failure',
    idempotencyKey,
    error: result.error.message,
    attempts: result.attempts,
  }
}

// ─── Test Helpers ─────────────────────────────────────────────────────────────
// Exported for unit tests only — not part of the public API.

/** @internal */
export function _resetDedupMapForTesting(): void {
  dedupMap.clear()
}

/** @internal */
export function _getDedupMapSizeForTesting(): number {
  return dedupMap.size
}
