# Proof Artifacts  -  Team 3 / Module 2
## Notification and Communications Adapters

**Date:** 2026-03-16

---

## Smoke Test Procedures

### Test 1  -  Successful Email Send

**Setup:**
- Set `RESEND_API_KEY` to a valid key
- Have a test recipient address (`test@example.com`)

**Steps:**
```typescript
import { sendEmail } from '@/lib/services/notifications/email-delivery-adapter'

const result = await sendEmail(
  {
    from: 'NorvaOS <noreply@norvaos.com>',
    to: ['test@example.com'],
    subject: 'Test delivery',
    text: 'This is a test.',
    correlationTag: 'smoke_test',
  },
  { tenantId: 'test-tenant-001' },
)
```

**Expected result:**
```typescript
{ sent: true, messageId: 'msg_xxxx', attempts: 1 }
```

**Expected log lines:**
```json
{"level":"info","message":"Email delivery initiated","tenant_id":"test-tenant-001","correlation_tag":"smoke_test","recipient_count":1,"recipients_masked":"***@example.com (…est)"}
{"level":"info","message":"Email delivered successfully","tenant_id":"test-tenant-001","message_id":"msg_xxxx","attempts":1}
```

**Pass criteria:** `result.sent === true`, no error in log, `messageId` is non-null.

---

### Test 2  -  Failed Send with Retry

**Setup:**
- Set `RESEND_API_KEY` to an invalid key (or unset)

**Steps:**
```typescript
const result = await sendEmail(
  { from: 'noreply@norvaos.com', to: ['test@example.com'], subject: 'Test', text: 'Test' },
  { tenantId: 'test-tenant-001' },
)
```

**Expected result:**
```typescript
{ sent: false, error: 'RESEND_API_KEY is not configured...', attempts: 1 }
```
(NonRetryableError  -  stops after 1 attempt)

**For transient failure simulation** (mock Resend to return 500):
- Expect `attempts: 3`
- Expect 3 `"Attempt failed  -  will retry"` log lines
- Expect 1 `"All retry attempts exhausted"` log line

**Pass criteria:** `result.sent === false`, `result.attempts <= 3`, Sentry capture triggered.

---

### Test 3  -  Retry then Succeed

**Setup:**
- Mock Resend to fail on attempts 1 and 2, succeed on attempt 3

**Steps:**
```typescript
let callCount = 0
jest.spyOn(resend.emails, 'send').mockImplementation(async () => {
  callCount++
  if (callCount < 3) throw new Error('500 Service Unavailable')
  return { data: { id: 'msg_abc' }, error: null }
})

const result = await sendEmail(payload, { tenantId: 'test-tenant-001' })
```

**Expected result:**
```typescript
{ sent: true, messageId: 'msg_abc', attempts: 3 }
```

**Expected log lines:** 2x `"Attempt failed  -  will retry"`, 1x `"Retry succeeded"`, 1x `"Email delivered successfully"`.

**Pass criteria:** `result.sent === true`, `result.attempts === 3`.

---

### Test 4  -  Duplicate Prevention

**Steps:**
```typescript
import { dispatchNotification, _resetDedupMapForTesting } from '@/lib/services/notifications/dispatch-adapter'
_resetDedupMapForTesting()

const event = {
  tenantId: 'test-tenant-001',
  eventType: 'task_assigned',
  entityType: 'task',
  entityId: 'task-123',
  recipientUserIds: ['user-1'],
  title: 'New task',
  message: 'You have a new task.',
  channels: ['in-app' as const],
}

const result1 = await dispatchNotification(supabase, event, { tenantId: 'test-tenant-001' })
const result2 = await dispatchNotification(supabase, event, { tenantId: 'test-tenant-001' })
```

**Expected:**
```typescript
result1 // { dispatched: true, attempts: 1, ... }
result2 // { dispatched: false, reason: 'deduplicated', attempts: 0, ... }
```

**Expected log line for result2:**
```json
{"level":"info","message":"Notification deduplicated  -  already dispatched within window","event_type":"task_assigned","entity_id":"task-123"}
```

**Pass criteria:** Second call returns `reason: 'deduplicated'`, no duplicate dispatch to engine.

---

### Test 5  -  PII Not in Logs

**Steps:**
1. Run Test 1 (successful send) with recipients `john.doe.realname@example.com`
2. Capture all log lines during the operation
3. Search log output for the full email address

**Expected:**
- Full address `john.doe.realname@example.com` does NOT appear in any log line
- Masked form `***@example.com (…ame)` appears instead
- Email body/subject text does NOT appear in logs

**Pass criteria:** `grep "john.doe.realname@example.com"` returns no results in log output.

---

### Test 6  -  Alert Threshold

**Steps:**
```typescript
import { recordDeliveryAttempt, checkAlertThreshold } from '@/lib/services/notifications/delivery-tracker'
import { _resetBufferForTesting } from '@/lib/services/notifications/delivery-tracker'

_resetBufferForTesting()

// Record 6 failures within the 15-minute window
for (let i = 0; i < 6; i++) {
  recordDeliveryAttempt({
    tenantId: 'test-tenant-001',
    channel: 'email',
    entityType: 'notification',
    entityId: `event-${i}`,
    status: 'failed',
    error: 'Resend 503',
    attempts: 3,
  })
}

const exceeded = checkAlertThreshold('test-tenant-001')
```

**Expected:** `exceeded === true`

**Expected log line:**
```json
{"level":"warn","message":"delivery_alert_threshold_exceeded","tenant_id":"test-tenant-001","failure_count":6,"window_minutes":15}
```

**Pass criteria:** Returns `true`, warn log emitted.

---

### Test 7  -  Dead Letter Queue

**Steps:**
```typescript
import { scheduleRetry, getDeadLetterItems, _resetDeadLetterForTesting } from '@/lib/services/notifications/retry-handler'

_resetDeadLetterForTesting()

const failed = {
  id: 'delivery-001',
  tenantId: 'test-tenant-001',
  channel: 'email' as const,
  entityType: 'notification',
  entityId: 'event-001',
  errorMessage: 'Resend permanent failure',
  attemptCount: 3, // at max
  firstFailedAt: new Date().toISOString(),
  lastFailedAt: new Date().toISOString(),
}

scheduleRetry(failed, { tenantId: 'test-tenant-001' }, async () => {
  throw new Error('should not be called')
})

const items = getDeadLetterItems()
```

**Expected:**
- `items.length === 1`
- `items[0].tenantId === 'test-tenant-001'`
- Sentry message captured

**Pass criteria:** Item in dead-letter queue, no retry scheduled, Sentry capture confirmed.

---

## Alerting Proof

**Scenario:** Configure a monitoring rule to alert when log line contains `"delivery_alert_threshold_exceeded"`.

**Verification:** In Sentry or Vercel Logs, create a filter:
```
message = "delivery_alert_threshold_exceeded"
```

Trigger the alert threshold (Test 6), then verify an alert/notification appears in the configured channel within 5 minutes.

**Pass criteria:** Alert received within SLA.
