# Proof Plan  -  Team 3 / Module 1: Integration Contracts

**Module:** Team 3 / Module 1
**Date:** 2026-03-15
**Purpose:** Define the specific proof artefacts required to validate each integration contract before production sign-off

---

## Overview

Each integration contract must be validated by producing concrete proof artefacts demonstrating that the described behaviour matches runtime behaviour. Where a contract identifies a gap, the proof must either confirm the gap exists (and accept it with documentation) or confirm that a fix has been applied.

Proof artefacts are stored in a separate `proof/` directory (to be created) and referenced by filename in the relevant contract document.

---

## 1. Microsoft 365 Email Integration

### 1.1 Successful Connection Proof

**Artefact:** Screenshot of `microsoft_connections` table row showing:
- `is_active = true`
- `access_token_encrypted` is non-empty (encrypted form visible, not plaintext)
- `refresh_token_encrypted` is non-empty
- `token_expires_at` is in the future

**Test procedure:**
1. Navigate to Settings → Integrations → Microsoft 365
2. Complete OAuth flow with a test Microsoft account
3. Query: `SELECT id, user_id, is_active, token_expires_at, created_at FROM microsoft_connections WHERE is_active = true LIMIT 1`
4. Capture screenshot of result

**Pass criteria:** Row exists with `is_active = true` and non-null encrypted token fields.

---

### 1.2 Successful Email Sync Proof

**Artefact:** Screenshot of `email_messages` and `email_threads` rows created after first sync, plus `email_accounts.last_sync_at` and `delta_link` populated.

**Test procedure:**
1. Ensure the test Microsoft account has at least 3 emails in the inbox
2. Trigger sync via `POST /api/integrations/microsoft/sync` with body `{ "sync_type": "all" }`
3. Query: `SELECT id, tenant_id, subject, direction, received_at, synced_at FROM email_messages ORDER BY synced_at DESC LIMIT 10`
4. Query: `SELECT id, delta_link IS NOT NULL AS has_delta_link, last_sync_at, error_count FROM email_accounts`
5. Capture screenshots

**Pass criteria:** `email_messages` rows exist; `delta_link` is populated; `error_count = 0`; `last_sync_at` is recent.

---

### 1.3 Incremental Sync (Delta) Proof

**Artefact:** Log output showing sync ran with 0 created, 0 updated on second run (no new messages); then 1 created after sending one new test email.

**Test procedure:**
1. Run sync twice immediately in succession; record `created` and `updated` counts from API response
2. Send one test email to the connected mailbox
3. Run sync again; record `created` count
4. Capture API responses

**Pass criteria:** Second run shows 0 created; run after new email shows 1 created.

---

### 1.4 Token Auto-Refresh Proof

**Artefact:** SQL showing `token_expires_at` updated to a future time after an artificial expiry; log output showing no auth error.

**Test procedure:**
1. Manually update `token_expires_at` to 1 minute in the past in the database
2. Trigger a sync immediately
3. Query `token_expires_at`  -  it must now be a future timestamp (proving refresh occurred)
4. Verify sync completed without error

**Pass criteria:** `token_expires_at` advances to a new future time; sync succeeds.

---

### 1.5 Invalid Credential Handling Proof

**Artefact:** Screenshot of `email_accounts.sync_enabled = false` after 10 consecutive failures; `error_count = 10`; `last_error` message visible.

**Test procedure:**
1. Update `refresh_token_encrypted` to an invalid value in the database
2. Run sync 10 times
3. Query: `SELECT id, sync_enabled, error_count, last_error FROM email_accounts WHERE id = '{test_account_id}'`

**Pass criteria:** `sync_enabled = false`, `error_count >= 10`, `last_error` is non-null.

---

### 1.6 Email Send Proof

**Artefact:** `email_send_events` row created; confirmation from the target mailbox that the email was received.

**Test procedure:**
1. Use the send email API/UI to send an email to a test address
2. Query: `SELECT id, tenant_id, email_account_id, matter_id, sent_by, sent_at FROM email_send_events ORDER BY sent_at DESC LIMIT 1`
3. Verify receipt in the target mailbox

**Pass criteria:** `email_send_events` row exists with correct `sent_by` and `sent_at`; email received externally.

---

### 1.7 Gap Confirmation: Unbounded Retry Recursion

**Artefact:** Documented acknowledgement (or fix PR reference) for the unbounded 429 recursion gap.

**Procedure:** Either (a) fix the recursion cap and provide the PR reference, or (b) document that the gap is accepted with the following rationale and SLA.

---

## 2. Microsoft OneDrive Integration

### 2.1 Successful Connection Proof

Same as Microsoft 365 Email 1.1  -  shared `microsoft_connections` table.

---

### 2.2 Browse OneDrive Proof

**Artefact:** API response JSON showing list of OneDrive items with `id`, `name`, `size`, `isFolder`, `webUrl`.

**Test procedure:**
1. Call `GET /api/integrations/microsoft/onedrive` (or equivalent browse endpoint)
2. Capture JSON response

**Pass criteria:** Array of items returned with correct structure.

---

### 2.3 Folder Hierarchy Creation Proof

**Artefact:** Screenshot of `NorvaOS/Matters/{MatterNumber}/` folder visible in the user's OneDrive via the web interface; `matters.onedrive_folder_id` populated.

**Test procedure:**
1. Create a new matter with a matter number
2. Trigger the matter folder sync operation
3. Open OneDrive web interface and navigate to `NorvaOS/Matters/`
4. Query: `SELECT id, matter_number, onedrive_folder_id FROM matters WHERE onedrive_folder_id IS NOT NULL LIMIT 1`

**Pass criteria:** Folder exists in OneDrive; `onedrive_folder_id` is populated in the database.

---

### 2.4 File Link Proof

**Artefact:** `documents` row in database with `external_provider = 'microsoft_onedrive'`, `onedrive_item_id` non-null, `onedrive_web_url` non-null.

**Test procedure:**
1. Browse to an existing OneDrive file via the integration UI
2. Link the file to a matter
3. Query: `SELECT id, file_name, external_provider, onedrive_item_id, onedrive_web_url FROM documents WHERE external_provider = 'microsoft_onedrive' LIMIT 1`

**Pass criteria:** Document row exists with correct provider and item ID.

---

### 2.5 File Upload Proof

**Artefact:** API response with `oneDriveItemId` and `webUrl`; file visible in OneDrive web interface.

**Test procedure:**
1. Upload a file under 4 MB via the integration
2. Capture the API response
3. Verify file appears in the target OneDrive folder

**Pass criteria:** Upload API returns success with `oneDriveItemId`; file visible in OneDrive.

---

### 2.6 Gap Confirmation: 4 MB Upload Limit

**Artefact:** Attempt to upload a 5 MB file; capture the `console.warn` log output showing the skip message.

**Pass criteria:** Log shows `'exceeds 4MB simple upload limit'`; no crash or unhandled error.

---

## 3. GoHighLevel (GHL) Integration

### 3.1 Successful Connection Proof

**Artefact:** `platform_connections` row with `platform = 'ghl'`, `is_active = true`, encrypted tokens non-null.

**Test procedure:**
1. Complete GHL OAuth flow in Settings → Data Import
2. Query: `SELECT id, tenant_id, platform, is_active, platform_user_id, location_id, connected_by, updated_at FROM platform_connections WHERE platform = 'ghl'`
3. Capture screenshot

**Pass criteria:** Row exists with `is_active = true`.

---

### 3.2 State Signing Verification Proof

**Artefact:** HTTP response showing 302 redirect to error page when OAuth callback receives a tampered state parameter.

**Test procedure:**
1. Intercept the OAuth callback URL
2. Modify the state parameter (change one character)
3. Submit the modified callback URL
4. Capture the redirect destination

**Pass criteria:** Redirects to `/settings/data-import?error=ghl_callback_failed`.

---

### 3.3 Reconnect Idempotency Proof

**Artefact:** Before and after screenshot of `platform_connections` table showing only one row for `(tenant_id, 'ghl')` after completing OAuth twice.

**Pass criteria:** One row; `updated_at` timestamp changes; no duplicate row.

---

### 3.4 Disconnect Proof

**Artefact:** `platform_connections.is_active = false` after disconnect; status endpoint returns disconnected state.

**Test procedure:**
1. Connect GHL
2. Disconnect via the UI
3. Query `platform_connections` for `is_active`
4. Call status endpoint and capture response

**Pass criteria:** `is_active = false`; status endpoint returns disconnected.

---

### 3.5 Adapter Validation Proof

**Artefact:** Attempt to import a GHL CSV row with no first name, last name, or email; capture validation error response.

**Test procedure:**
1. Prepare a CSV with a row containing only blank name/email fields
2. Submit for import preview
3. Capture the validation error

**Pass criteria:** Validation error: `'At least one of first name, last name, or email is required.'`

---

### 3.6 Gap Confirmation: No Token Refresh

**Artefact:** Documented gap acknowledgement. Artificially expire the access token, attempt an import, capture the authentication error from GHL's API.

**Pass criteria:** Error confirms token expiry; no crash; user receives actionable guidance to re-authorise.

---

## 4. Clio Integration

### 4.1 Successful Connection Proof

**Artefact:** `platform_connections` row with `platform = 'clio'`, `is_active = true`, `platform_user_name` populated with the Clio user's display name.

**Test procedure:**
1. Complete Clio OAuth flow
2. Query: `SELECT id, tenant_id, platform, is_active, platform_user_id, platform_user_name, connected_by, updated_at FROM platform_connections WHERE platform = 'clio'`

**Pass criteria:** Row exists with `is_active = true` and non-null `platform_user_name`.

---

### 4.2 State Signing Verification Proof

Same as GHL 3.2 but for the Clio callback. Tampered state must redirect to `?error=clio_callback_failed`.

---

### 4.3 Field Mapping Proof

**Artefact:** Imported Clio contact row in `contacts` table with Canadian English field names correctly mapped.

**Test procedure:**
1. Prepare a Clio export CSV with `Province`, `Postal Code`, `Date of Birth` columns populated
2. Import via the Clio adapter
3. Query the resulting `contacts` row for `province_state`, `postal_code`, `date_of_birth`

**Pass criteria:** Fields mapped correctly; `date_of_birth` is in `YYYY-MM-DD` format.

---

### 4.4 Adapter Validation Proof

**Artefact:** Validation error response when an empty row is submitted.

**Pass criteria:** Validation error: `'At least one of name, email, or organisation name is required.'`

---

### 4.5 Gap Confirmation: No Token Refresh

Same procedure as GHL 3.6.

---

## 5. Stripe Webhooks Integration

### 5.1 Successful Checkout Event Proof

**Artefact:** `tenants.subscription_status = 'active'` and a `subscriptions` row after receiving a `checkout.session.completed` event.

**Test procedure (using Stripe CLI):**
1. Run: `stripe trigger checkout.session.completed --add checkout_session:metadata.tenant_id={test_tenant_id} --add checkout_session:metadata.plan_tier=starter`
2. Query: `SELECT id, subscription_status, subscription_tier, stripe_customer_id FROM tenants WHERE id = '{test_tenant_id}'`
3. Query: `SELECT id, status, plan_tier, current_period_start, current_period_end FROM subscriptions WHERE tenant_id = '{test_tenant_id}'`

**Pass criteria:** Tenant `subscription_status = 'active'`; subscription row exists.

---

### 5.2 Invalid Signature Rejection Proof

**Artefact:** HTTP 400 response with `{ "error": "Invalid signature" }`.

**Test procedure:**
1. Send a POST to `/api/webhooks/stripe` with a valid-format JSON body but incorrect or missing `stripe-signature` header
2. Capture the HTTP response

**Pass criteria:** 400 response body matches `{ "error": "Invalid signature" }`.

---

### 5.3 Subscription Cancellation Proof

**Artefact:** `tenants.subscription_status = 'cancelled'` and `subscriptions.status = 'cancelled'` after `customer.subscription.deleted` event.

**Test procedure:**
1. Trigger `customer.subscription.deleted` via Stripe CLI (or test mode cancellation)
2. Query tenant and subscription rows

**Pass criteria:** Both rows show `status = 'cancelled'`.

---

### 5.4 Invoice Paid Proof

**Artefact:** `billing_invoices` row with `status = 'paid'`, `amount` correct, `invoice_url` non-null.

**Test procedure:**
1. Trigger `invoice.paid` via Stripe CLI
2. Query: `SELECT id, stripe_invoice_id, amount, status, invoice_url, period_start, period_end FROM billing_invoices ORDER BY created_at DESC LIMIT 1`

**Pass criteria:** Row exists with `status = 'paid'`.

---

### 5.5 Payment Failed Proof

**Artefact:** `tenants.subscription_status = 'past_due'` and `billing_invoices` row with `status = 'failed'`.

**Test procedure:**
1. Trigger `invoice.payment_failed` via Stripe CLI
2. Query tenant and billing_invoices

**Pass criteria:** Tenant is `past_due`; invoice row shows `failed`.

---

### 5.6 Gap Confirmation: Duplicate Invoice Row

**Artefact:** Two `billing_invoices` rows with the same `stripe_invoice_id` after replaying the same `invoice.paid` event twice.

**Test procedure:**
1. Replay the same `invoice.paid` Stripe event twice (use Stripe CLI event resend)
2. Query: `SELECT COUNT(*) FROM billing_invoices WHERE stripe_invoice_id = '{test_invoice_id}'`

**Pass criteria (gap confirmed):** Count = 2 (confirms the gap; remediation required before production).

---

### 5.7 Gap Confirmation: Silent Event Consumption

**Artefact:** `checkout.session.completed` with no `tenant_id` in metadata returns 200; log shows error but no alert.

**Test procedure:**
1. Send a `checkout.session.completed` event with no `tenant_id` in metadata via Stripe CLI
2. Capture the HTTP response
3. Capture log output

**Pass criteria (gap confirmed):** HTTP 200 returned; `console.error('No tenant_id in checkout session metadata')` in logs; no visible alert signal.

---

## 6. Notification Engine

### 6.1 In-App Notification Delivery Proof

**Artefact:** `notifications` row in database with correct `tenant_id`, `user_id`, `notification_type`, `title`.

**Test procedure:**
1. Trigger a `stage_change` event via `dispatchNotification` (e.g., advance a matter stage)
2. Query: `SELECT id, tenant_id, user_id, title, notification_type, created_at FROM notifications ORDER BY created_at DESC LIMIT 5`

**Pass criteria:** Row exists with correct fields.

---

### 6.2 Email Channel Opt-Out Proof

**Artefact:** No email sent to a user with `notification_prefs.email_notifications = false`.

**Test procedure:**
1. Set `notification_prefs = { "email_notifications": false }` for a test user
2. Trigger a `task_assigned` notification for that user
3. Verify no email was sent (check Resend dashboard or absence of send log)
4. Verify `notifications` in-app row was still created

**Pass criteria:** In-app row exists; no email delivery attempt.

---

### 6.3 Tenant Isolation Proof

**Artefact:** Notification only delivered to users matching `tenant_id`; users from other tenants not notified even if their IDs are in the recipient list.

**Test procedure:**
1. Create a `NotificationEvent` with `recipientUserIds` containing a user from a different tenant
2. Dispatch the event
3. Verify only users matching `tenant_id` receive the notification

**Pass criteria:** No `notifications` row for the out-of-tenant user.

---

### 6.4 Non-Throw Behaviour Proof

**Artefact:** Application does not crash or return a 500 when Resend API is unavailable.

**Test procedure:**
1. Temporarily set `RESEND_API_KEY` to an invalid value in a test environment
2. Trigger a notification that would normally send an email
3. Verify the API route that triggered the notification still returns 200/success

**Pass criteria:** No unhandled exception; calling route succeeds; log shows email failure.

---

### 6.5 All-Channels-Disabled Skip Proof

**Artefact:** `log.debug('Notification skipped  -  all channels disabled')` in log output when all channels are configured as `false` for an event type.

**Test procedure:**
1. Set `notification_triggers.test_event: { in_app: false, email: false, push: false }` in `tenants.settings`
2. Dispatch a `test_event` notification
3. Capture log output

**Pass criteria:** Debug log entry present; no `notifications` row created; no email sent.

---

### 6.6 Gap Confirmation: No Retry

**Artefact:** Deliberate in-app notification failure (e.g., unique constraint violation on `notifications` table) produces a single `log.error` entry; no retry is attempted.

**Test procedure:**
1. Insert a `notifications` row manually for a user with a specific entity
2. Trigger the same notification again with conditions that would cause a DB conflict
3. Capture log output; verify only one error log, no retry

**Pass criteria (gap confirmed):** Single error log; no duplicate insert attempt; calling code not affected.

---

## Proof Artefact Storage

All proof artefacts should be stored as follows:

```
contracts/proof/
  microsoft-365-email/
    1.1-connection-screenshot.png
    1.2-sync-result.json
    1.3-delta-sync-response.json
    1.4-token-refresh-sql.txt
    1.5-account-disabled-sql.txt
    1.6-send-events-sql.txt
    1.7-retry-gap-decision.md
  microsoft-onedrive/
    ...
  ghl/
    ...
  clio/
    ...
  stripe/
    ...
  notification-engine/
    ...
```

Each proof artefact file should include:
- Date the test was run
- Environment (staging/production)
- Tester name
- Test procedure followed
- Outcome (pass/fail/gap-confirmed)

---

## Proof Completion Gate

All integrations must have proof artefacts collected and reviewed by the Lead Engineer before the operational readiness date of 2026-03-20. Integrations with outstanding `FAIL` items in the hardening checklist that are not covered by a documented acceptance decision cannot be marked production-ready.
