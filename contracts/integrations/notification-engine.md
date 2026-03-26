# Integration Contract: Notification Engine

**Integration ID:** `notification-engine`
**Module:** Team 3 / Module 1
**Status:** Draft  -  Pending Proof Validation
**Last Updated:** 2026-03-15
**Source Files Audited:**
- `lib/services/notification-engine.ts`
- `lib/services/email-service.ts`
- `lib/utils/logger.ts`

---

## 1. Integration Purpose and Scope

The notification engine (`dispatchNotification`) is the unified entry point for all internal staff notifications within NorvaOS. It fans out to multiple delivery channels based on tenant configuration and per-user preferences.

**Three delivery channels:**

1. **In-app**  -  Writes a row to the `notifications` table; surfaced to users via real-time subscription or polling from the frontend
2. **Email**  -  Sends via Resend using `sendInternalEmail()` from `email-service.ts`; targets internal staff email addresses (not client email addresses)
3. **Push**  -  Web push notifications via `sendPushNotification()` from `lib/services/push-service.ts`; placeholder/partial implementation

**Client-facing notification emails** (stage change, document request, deadline alert, general) are handled by separate functions in `email-service.ts` (`sendStageChangeEmail`, `sendClientEmail`) and are distinct from the notification engine. Those functions also log to `client_notifications` and use Resend directly, bypassing `dispatchNotification`.

**Supported event types (with defaults):**

| Event Type | In-App | Email | Push |
|---|---|---|---|
| `stage_change` | Yes | Yes | No |
| `task_assigned` | Yes | Yes | Yes |
| `task_completed` | Yes | No | No |
| `document_uploaded` | Yes | No | No |
| `new_message` | Yes | Yes | Yes |
| `deadline_approaching` | Yes | Yes | Yes |
| `matter_updated` | Yes | No | No |
| Unknown event types | Yes | No | No (fallback default) |

Tenants can override per-event channel configuration via `tenants.settings.notification_triggers` (a JSONB field). If tenant settings are missing or the event type is not configured, the default triggers table above applies.

---

## 2. Credential Handling

The notification engine itself holds no credentials. Credentials are managed by the services it delegates to:

- **Email channel:** `sendInternalEmail()` in `email-service.ts` reads `RESEND_API_KEY` at call time. If absent, the function silently returns without sending.
- **Push channel:** `sendPushNotification()` in `lib/services/push-service.ts`  -  not audited in detail; credentials assumed to be VAPID keys in environment variables.
- **In-app channel:** Direct database insert via Supabase client  -  no external credentials required.

---

## 3. Retry Behaviour

### Dispatch Level

`dispatchNotification` uses `Promise.allSettled(promises)` to fan out to all channels for all recipients. `allSettled` ensures that a failure in one channel or one recipient does not abort other deliveries. Results (fulfilled/rejected) are not inspected  -  settled rejections are silently discarded.

**IDENTIFIED GAP  -  No retry on channel delivery failure:** If `deliverInApp`, `deliverEmail`, or `deliverPush` throws (or their internal promises reject), the exception is caught by their individual `try/catch` blocks, logged, and dropped. There is no retry mechanism. A transient Supabase error on `deliverInApp` or a transient Resend API error on `deliverEmail` will result in a permanently missed notification with no retry.

### Per-Channel Behaviour

**In-app (`deliverInApp`):**
- One `insert` to `notifications` table
- On failure: `log.error('In-app notification failed', ...)`  -  error is logged and swallowed
- No retry

**Email (`deliverEmail`):**
- Calls `sendInternalEmail()` which calls Resend API
- `sendInternalEmail` catches all errors internally and logs `console.error('[email-service] Failed to send internal email: ...')`
- No retry at any level

**Push (`deliverPush`):**
- Calls `sendPushNotification()` from `push-service.ts`
- Only web push subscriptions with `endpoint` and `keys` are processed
- On failure: `log.error('Push notification failed', ...)`  -  error is logged and swallowed
- No retry

---

## 4. Idempotency Guarantees

**IDENTIFIED GAP  -  No deduplication on dispatch:** `dispatchNotification` does not check whether a notification for the same event has already been sent to the same recipient. If called twice with the same event (e.g., due to a bug in the calling code or a cron job running twice), it will:
- Insert duplicate rows in the `notifications` table (in-app)
- Attempt to send duplicate emails via Resend
- Attempt to send duplicate push notifications

There is no idempotency key on the `notifications` table insert, and no deduplication lookup before dispatch.

---

## 5. Failure Modes and Fallback Behaviour

| Failure | Behaviour |
|---|---|
| `event.recipientUserIds` is empty | Returns immediately (no work done, no log) |
| Tenant settings fetch fails | Falls through to default triggers (`DEFAULT_TRIGGERS`) |
| All channels disabled for event type | Returns with `log.debug('Notification skipped  -  all channels disabled')` |
| User fetch returns empty | Returns immediately |
| User has no email | Email channel skipped (checked by `user.email` truthiness) |
| User's `email_notifications` pref is `false` | Email channel skipped |
| `RESEND_API_KEY` not set | `sendInternalEmail` returns silently without sending |
| User has no device tokens | Push channel skipped |
| `deliverInApp` DB insert fails | Logged via `log.error`; other channels continue |
| `deliverEmail` Resend fails | Logged via `console.error` in `email-service.ts`; other channels continue |
| `deliverPush` fails | Logged via `log.error`; other channels continue |
| Outer `try/catch` in `dispatchNotification` triggers | Logged via `log.error('Notification dispatch failed', ...)` with `tenant_id` and `event_type`; function returns without throwing |

The engine is designed to be non-throwing  -  `dispatchNotification` never propagates exceptions to the caller.

---

## 6. Observability

### Logging

The notification engine uses the structured `log` utility from `lib/utils/logger.ts` for its own log calls:
- `log.debug`  -  channel disabled skip
- `log.info`  -  successful dispatch completion (includes `tenant_id`, `event_type`, `recipient_count`, enabled `channels`)
- `log.error`  -  dispatch-level failure, in-app failure, push failure

However, the email channel (`deliverEmail` → `sendInternalEmail`) uses `console.error` rather than `log.error`.

**IDENTIFIED GAP  -  Mixed logging in email path:** The email delivery path within the notification engine ultimately uses `console.error` (in `email-service.ts`), which is inconsistent with the structured logging used by the engine itself. Email delivery failures will not appear with `tenant_id` context in log aggregators.

### Structured Log Fields (on success)

When `log.info('Notification dispatched', ...)` is called, the following fields are included:
- `tenant_id`
- `event_type`
- `recipient_count` (as string)
- `channels` (comma-separated list of enabled channels)

### Database Audit Trail

- `notifications` table  -  one row per in-app notification per recipient; includes `tenant_id`, `user_id`, `title`, `message`, `notification_type`, `entity_type`, `entity_id`, `channels`, `priority`
- `client_notifications` table  -  used by client-facing email functions (`sendClientEmail`, `sendStageChangeEmail`), not by `dispatchNotification`

**IDENTIFIED GAP  -  No email delivery audit for staff notifications:** `deliverEmail` calls `sendInternalEmail`, which does not write to `client_notifications` or any audit table. There is no persistent record of internal staff notification emails attempted or delivered. Only the in-app `notifications` row serves as evidence of the event.

---

## 7. Data Classification

| Data | Classification | Stored Where |
|---|---|---|
| Notification title | Business context | `notifications.title` |
| Notification message | Business context / potentially PII | `notifications.message` |
| Recipient user ID | Internal identifier | `notifications.user_id` |
| Entity type and ID (e.g., matter UUID) | Internal identifier | `notifications.entity_type`, `entity_id` |
| Recipient email address | PII | In memory during email dispatch; not stored in notification log |
| Recipient first name | PII | In memory during email rendering; not stored in notification log |
| Device push tokens | Sensitive device identifier | `users.device_tokens` (JSONB array) |

**Note:** The notification message may contain matter references, task descriptions, or other case-related context. Care must be taken to ensure notification messages do not include verbatim email content, document content, or financial figures.

---

## 8. Tenant Isolation

Tenant isolation is explicitly implemented in the notification engine:

```typescript
const { data: users } = await supabase
  .from('users')
  .select('id, email, first_name, notification_prefs, device_tokens')
  .eq('tenant_id', event.tenantId)   // <-- explicit tenant scope
  .in('id', event.recipientUserIds)
```

The code comment in `notification-engine.ts` explicitly notes:
> "IMPORTANT: Always scope by tenant_id to prevent cross-tenant data leaks, especially when this function is called from cron jobs using the admin client."

All `notifications` inserts include `tenant_id`. Tenant channel config is fetched with `.eq('id', tenantId)`. Isolation is correct.

---

## 9. Known Limitations

1. **Push notifications are a placeholder:** The push channel calls `sendPushNotification` but only handles `platform: 'web'` subscriptions with `endpoint` and `keys`. Native mobile push (APNs/FCM) is not implemented. The `push-service.ts` file was not audited.
2. **No retry for any channel:** Transient failures result in permanently missed notifications.
3. **No deduplication:** Duplicate dispatch results in duplicate in-app rows and duplicate email sends.
4. **No staff email audit trail:** Internal staff email notifications leave no persistent record beyond the in-app `notifications` row.
5. **Tenant settings override is all-or-nothing per event type:** Tenants can configure channel preferences per event type, but cannot configure per-user overrides at the tenant level (only the user's own `notification_prefs` can override).
6. **Unknown event types get in-app only:** Any event type not in `DEFAULT_TRIGGERS` defaults to `{ in_app: true, email: false, push: false }`. This is a safe default but may surprise callers expecting email for custom event types.

---

## 10. Acceptance Criteria

- [ ] `dispatchNotification` never throws  -  all errors are caught and logged
- [ ] In-app notifications are inserted to `notifications` table with correct `tenant_id`, `user_id`, `notification_type`
- [ ] Users with `email_notifications: false` in `notification_prefs` do not receive email notifications
- [ ] Tenant with all channels disabled for an event type skips dispatch cleanly with a debug log
- [ ] Users from a different tenant are not notified even if their IDs are in `recipientUserIds` (`.eq('tenant_id')` guard)
- [ ] Channel failures do not abort delivery to other channels or other recipients
- [ ] `log.info('Notification dispatched')` fires with `tenant_id`, `event_type`, `recipient_count`, and `channels` on success
- [ ] `RESEND_API_KEY` absent causes email channel to skip silently (verified via test without the key)

**GAP items requiring remediation before production:**
- [ ] Retry mechanism for in-app and email channels (or gap explicitly accepted with documented SLA)
- [ ] Deduplication key (event fingerprint) added to prevent duplicate notifications on double-dispatch
- [ ] Audit log for internal staff email notifications (to `client_notifications` or a dedicated table)
- [ ] `console.error` in `sendInternalEmail` replaced with structured `log.error` including `tenant_id`
- [ ] Push notification implementation audited and its production readiness assessed
