# Scope Memo — Team 3 / Module 2
## Notification and Communications Adapters

**Date:** 2026-03-16
**Status:** Delivered
**Deployment impact:** Zero — new files only, no existing files modified

---

## Files Created

| File | Purpose |
|------|---------|
| `lib/utils/retry.ts` | Exponential backoff retry utility with jitter, non-retryable error classification, structured logging |
| `lib/services/notifications/dispatch-adapter.ts` | Hardened notification dispatch with deduplication, retry, PII-safe logging |
| `lib/services/notifications/email-delivery-adapter.ts` | Hardened Resend wrapper with retry, masked recipients in logs, Sentry capture |
| `lib/services/notifications/delivery-tracker.ts` | In-process ring buffer (2000 entries) tracking delivery outcomes per tenant/channel |
| `lib/services/notifications/retry-handler.ts` | Bounded retry scheduler (max 3) with in-memory dead-letter queue |
| `lib/services/notifications/failure-dashboard.ts` | Aggregated failure summary and per-channel health status service |

**Total new files:** 6

---

## Files Modified

**None.** This module is additive only.

The following existing files were audited and are candidates for future wiring:
- `lib/services/notification-engine.ts` — business logic unchanged; `dispatchNotification` is the function wrapped by `dispatch-adapter.ts`
- `lib/services/email-send.ts` — still uses `console.*` directly (P1 gap from Module 1 audit); can be replaced by callers using `email-delivery-adapter.ts`

---

## Schema Changes

**None.** No database migrations. No new tables. No enum changes.

Delivery tracking is in-process (ring buffer). Log lines are the durable audit trail.

---

## Permission Changes

**None.** No new roles, no new RLS policies, no new API routes.

---

## What This Module Does NOT Touch

- `notification-engine.ts` business logic — when notifications fire, who receives them, which channels are used
- Email content or template selection
- RBAC or RLS configuration
- Billing, trust, or matter core logic
- Any existing API routes

---

## Proof Plan

### 1. Successful send proof
- Call `sendEmail()` with a valid Resend API key and `to: ['test@example.com']`
- Verify structured log line with `tenant_id`, `correlation_tag`, `message_id`, `attempts: 1`
- Verify `recordDeliveryAttempt` records a `sent` entry

### 2. Failed send proof
- Call `sendEmail()` with an invalid API key
- Verify retry attempts are logged (3 attempts with delays)
- Verify final `EMAIL_DELIVERY_PERMANENT_FAILURE` log line
- Verify Sentry capture is triggered

### 3. Retry proof
- Mock Resend to fail twice then succeed
- Verify `attempt_failed` log lines for attempts 1 and 2
- Verify `delivered successfully` log line on attempt 3 with `attempts: 3`

### 4. Duplicate prevention proof
- Call `dispatchNotification()` twice within 60 seconds with the same event
- Verify second call returns `{ dispatched: false, reason: 'deduplicated' }`
- Verify log line: `"Notification deduplicated — already dispatched within window"`

### 5. PII not in logs proof
- Inspect all log lines for a send operation
- Verify no email body content appears
- Verify recipient addresses appear only as `***@domain.com (…xyz)` masked format

### 6. Alert threshold proof
- Insert 6 failed delivery records for a tenant within 15 minutes via `recordDeliveryAttempt`
- Call `checkAlertThreshold(tenantId)`
- Verify it returns `true` and emits `delivery_alert_threshold_exceeded` log

### 7. Dead-letter proof
- Call `scheduleRetry()` with `attemptCount: 3` (at max)
- Verify item appears in `getDeadLetterItems()`
- Verify Sentry message is captured

---

## Acceptance Criteria

- [x] Retry is bounded — `retryWithBackoff` always stops at `maxAttempts`
- [x] Non-retryable errors (4xx except 429) do not retry
- [x] Email recipient addresses are masked in all log output
- [x] Email body content never appears in log output
- [x] Delivery outcomes (sent/failed/retrying) are tracked per tenant/channel
- [x] Alert threshold check exists for >5 failures in 15 minutes
- [x] Dead-letter queue captures permanently failed items
- [x] All log lines include `tenant_id`
- [x] Sentry capture on permanent email failure with tenant context

---

## Known Limitations

1. **In-process only**: Deduplication and delivery tracking are in-memory. Restarting the process clears all state. For cross-process deduplication, Upstash Redis (already installed) would be required.
2. **Dead-letter is volatile**: Dead-letter queue is in-memory — items are lost on restart. A future task should persist these to the `job_runs` table.
3. **`email-send.ts` not replaced**: The existing email service still uses `console.*` directly. Callers should migrate to `email-delivery-adapter.ts`. This is a P1 gap, not blocking this module.
4. **Notification engine not wired to dispatch-adapter**: The adapter is available but not yet called from `notification-engine.ts`. Wiring it in requires modifying the engine (scoped to a future task with explicit approval).
5. **Ring buffer resets on restart**: The 2000-entry ring buffer is ephemeral. Health checks after restart will show healthy until new data flows in.
