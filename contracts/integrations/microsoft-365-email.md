# Integration Contract: Microsoft 365 Email

**Integration ID:** `microsoft-365-email`
**Module:** Team 3 / Module 1
**Status:** Draft — Pending Proof Validation
**Last Updated:** 2026-03-15
**Source Files Audited:**
- `lib/services/microsoft-graph.ts`
- `lib/services/email-sync.ts`
- `lib/services/email-send.ts`
- `app/api/integrations/microsoft/sync/route.ts`

---

## 1. Integration Purpose and Scope

The Microsoft 365 Email integration connects a NorvaOS user's Microsoft 365 mailbox via OAuth 2.0 with PKCE. It serves two distinct functions:

**Inbound sync (pull):** Uses the Microsoft Graph delta-query API to incrementally pull inbox messages into the `email_messages` and `email_threads` tables. Delta links are persisted per account to enable efficient incremental sync.

**Outbound send:** Uses the Microsoft Graph `me/sendMail` and `me/messages/{id}/reply` APIs to send or reply to email threads from within NorvaOS, scoped to an authenticated user's connected account.

**Out of scope for this integration (handled by `email-service.ts`):** Transactional client notifications (stage change, document request, deadline alert, general) are sent via Resend, not via Microsoft Graph. Those are covered by the Notification Engine contract.

---

## 2. Credential Handling

### Token Storage

Tokens are stored in the `microsoft_connections` table with the following fields:
- `access_token_encrypted` — AES-256-GCM encrypted access token
- `refresh_token_encrypted` — AES-256-GCM encrypted refresh token
- `token_expires_at` — ISO timestamp

Encryption is implemented in `lib/services/microsoft-graph.ts` using Node.js `crypto`:
- Algorithm: `aes-256-gcm`
- Key source: `MICROSOFT_TOKEN_ENCRYPTION_KEY` environment variable (base64-encoded 32-byte key)
- IV: 12 random bytes generated per encryption (`randomBytes(12)`)
- Stored format: `${iv_hex}:${authTag_hex}:${ciphertext_hex}`
- GCM auth tag is stored and verified on decryption (tamper-evident)

### Token Refresh

Implemented in `getValidAccessToken()` in `microsoft-graph.ts`:
1. Fetches connection record from `microsoft_connections`
2. Checks expiry with a 5-minute buffer (`Date.now() < expiresAt - 300_000`)
3. If expired: calls `refreshAccessToken()` which decrypts the stored refresh token, calls `/oauth2/v2.0/token` with `grant_type=refresh_token`, then re-encrypts and persists both new tokens

The refresh is triggered on every API call through `graphFetch()`, so token refresh is transparent and automatic.

### OAuth Flow

- Standard OAuth 2.0 Authorization Code flow with PKCE (S256 challenge method)
- State parameter is HMAC-signed with `clientSecret` and includes a 10-minute expiry
- Scopes: `openid`, `profile`, `email`, `offline_access`, `User.Read`, `Mail.ReadWrite`, `Mail.Send`, `Calendars.ReadWrite`, `Tasks.ReadWrite`, `Files.ReadWrite.All`
- Redirect URI: `${NEXT_PUBLIC_APP_URL}/api/integrations/microsoft/callback`

### Required Environment Variables

| Variable | Purpose |
|---|---|
| `MICROSOFT_CLIENT_ID` | Azure AD app client ID |
| `MICROSOFT_CLIENT_SECRET` | Azure AD app client secret |
| `MICROSOFT_TOKEN_ENCRYPTION_KEY` | Base64-encoded 32-byte AES key |
| `MICROSOFT_TENANT_ID` | Azure tenant (defaults to `common`) |
| `NEXT_PUBLIC_APP_URL` | Used for redirect URI construction |

If any required variable is absent, `getConfig()` throws an error at call time.

---

## 3. Retry Behaviour

### Email Sync (`email-sync.ts`)

**Per-message error handling:** Individual message processing errors are caught and recorded in `result.errors[]`. Processing continues for remaining messages — per-message failures are non-fatal.

**Account-level error tracking:**
- On sync failure, `email_accounts.error_count` is incremented
- `email_accounts.last_error` is set to the error message
- `email_accounts.sync_enabled` is set to `false` when `error_count >= MAX_CONSECUTIVE_ERRORS` (constant: `10`)
- On success: `error_count` is reset to `0`, `last_error` is cleared

**No retry within a single sync run:** Errors are recorded and the sync returns a result object. Re-tries happen on the next scheduled sync invocation.

### Graph API Rate Limiting (`microsoft-graph.ts`)

The `graphFetch()` function handles HTTP 429 responses:
- Reads the `Retry-After` header (parses as integer seconds, defaults to 5 if absent)
- Sleeps for `retryAfter * 1000` milliseconds
- Recursively re-calls itself with the same arguments

**IDENTIFIED GAP — Unbounded recursion:** The 429 handler calls `graphFetch()` recursively with no maximum retry depth. A sustained rate-limit episode will eventually cause a stack overflow or indefinite blocking. There is no cap on the number of retry attempts.

### Email Send (`email-send.ts`)

No retry logic is implemented for send failures. `sendEmailViaProvider()` catches errors and returns `{ success: false, error: message }`. The caller is responsible for any retry decision.

---

## 4. Idempotency Guarantees

### Email Sync

Upsert on `email_threads` uses `onConflict: 'tenant_id,conversation_id'`. If the thread already exists, only `message_count` and `participant_emails` are updated.

For `email_messages`, the code checks for existence by `(tenant_id, message_id)` before inserting (explicit select + branch), and only updates `is_read` and `synced_at` if the message already exists. This provides idempotency: replaying the same sync will not create duplicate messages.

Delta link persistence ensures that subsequent runs only fetch new or changed messages.

### Email Send

**IDENTIFIED GAP — No send idempotency:** `sendEmailViaProvider()` creates an `email_send_events` record, but `message_id` is inserted as `null` with a comment that it "will be linked on next sync." There is no mechanism to prevent a double-send if the function is called twice (e.g., user double-submits). The send event record does not serve as a deduplication gate.

---

## 5. Failure Modes and Fallback Behaviour

| Failure | Behaviour |
|---|---|
| `MICROSOFT_TOKEN_ENCRYPTION_KEY` not set | `getConfig()` throws; all Graph calls fail with an error |
| Access token expired | Auto-refreshed via `refreshAccessToken()` before the API call proceeds |
| Refresh token invalid or revoked | `refreshAccessToken()` throws; `graphFetch()` throws; sync is marked failed; `error_count` incremented |
| `microsoft_connections` row missing or inactive | `getValidAccessToken()` throws `'Microsoft connection not found or inactive'` |
| Graph API 429 | Recursive retry after `Retry-After` seconds (unbounded — see gap above) |
| Graph API other 4xx/5xx | `GraphError` thrown with `status` and `code` properties |
| Per-message processing error | Recorded in `result.errors[]`; sync continues for remaining messages |
| 10 consecutive sync failures | `sync_enabled` set to `false`; account disabled; error logged |
| `email_accounts` row not found or inactive | Sync throws `'Email account not found or inactive'` |
| No active `microsoft_connections` for user | Sync throws `'No active Microsoft connection found for this user'` |
| Resend API failure (client notifications) | Notification status updated to `'failed'`; error recorded in `client_notifications.error_message`; function does not throw |

---

## 6. Observability

### Logging

- Sync errors are logged with `console.error('[email-sync] ...')` — **not** via the structured `log` utility from `lib/utils/logger.ts`
- Account disabled after 10 errors is logged with `console.error('[email-sync] Email account {id} disabled after 10 consecutive errors')`
- Send errors are logged with `console.error('[email-send] Error sending email:', ...)`
- `email-service.ts` uses mixed `console.log`, `console.warn`, and `console.error` — not structured logger

**IDENTIFIED GAP — Unstructured logging:** The Microsoft email integration services (`email-sync.ts`, `email-send.ts`) use `console.error/warn/log` instead of the structured `log` utility. This means these log lines will not have `tenant_id`, `user_id`, or structured context fields. They will not be parseable by log aggregators expecting JSON format.

### Database Audit Trail

- `email_accounts.last_sync_at`, `error_count`, `last_error`, `sync_enabled` — updated on every sync
- `email_accounts.delta_link` — persisted after each successful sync batch
- `email_messages.synced_at` — updated on every sync for existing messages
- `email_send_events` — created per send with `tenant_id`, `email_account_id`, `matter_id`, `sent_by`, `sent_at`
- `client_notifications` — row per notification with `status`, `resend_message_id`, `sent_at`, `error_message`

### Alerts

**IDENTIFIED GAP — No alert signal:** There is no alert, metric, or event emitted when `sync_enabled` is set to `false` after 10 consecutive errors. An account could be silently disabled without any operational notification. The only observable signal is the database row state.

---

## 7. Data Classification

The following PII and sensitive data flows through this integration:

| Data | Classification | Stored Where |
|---|---|---|
| OAuth access token | Secret | `microsoft_connections.access_token_encrypted` (AES-256-GCM encrypted) |
| OAuth refresh token | Secret | `microsoft_connections.refresh_token_encrypted` (AES-256-GCM encrypted) |
| Email body (HTML and text) | Confidential / PII | `email_messages.body_html`, `email_messages.body_text` (bodyPreview only — 255 chars max) |
| Email subject | Confidential / PII | `email_messages.subject` |
| Sender/recipient email addresses | PII | `email_messages.from_address`, `email_threads.participant_emails` |
| Email attachment flag | Low sensitivity | `email_messages.has_attachments` (boolean only — no attachment content stored) |
| Client email address | PII | `client_notifications.recipient_email` |
| Client first name | PII | Used in email rendering, not stored in notification log |

**Note on body storage:** `email_messages.body_text` stores only `bodyPreview` (a 255-character preview), not the full body. `body_html` stores the full HTML body if `contentType === 'html'`. Full email content including any attachments is NOT downloaded or stored.

**Tokens in logs:** The encryption/decryption functions operate on plaintext tokens in memory. If an exception is thrown during decryption and the error message is logged, it will not contain the plaintext token (errors from `createDecipheriv` do not include input data). This is acceptable.

---

## 8. Tenant Isolation

- All `email_accounts` records are scoped by `tenant_id`
- All `email_messages` and `email_threads` records are scoped by `tenant_id`
- `email-sync.ts` fetches the account by `emailAccountId` and uses `account.tenant_id` for all inserts
- `email-send.ts` fetches account by `accountId` and uses `account.tenant_id` for the send event record
- The Graph API calls are made with the connection owner's OAuth token — data is inherently scoped to that user's mailbox

**IDENTIFIED GAP — No explicit tenant guard on sync route:** `POST /api/integrations/microsoft/sync` fetches the connection by `user_id = auth.userId` and `is_active = true`, which implicitly scopes to the authenticated user. However, there is no explicit `tenant_id` check on the connection lookup. A user ID collision across tenants (theoretically impossible with Supabase `auth.uid()` UUIDs but worth noting) would not be caught by an additional guard.

---

## 9. Known Limitations

1. **Initial sync window:** The first sync fetches messages from the last 90 days only. Messages older than 90 days are not imported on initial connection.
2. **Inbox only:** Delta sync targets `me/mailFolders/inbox/messages` only. Sent items, drafts, and other folders are not synced.
3. **No attachment download:** Attachment content is not downloaded or stored. Only the `has_attachments` boolean is recorded.
4. **Body preview only for text:** `body_text` field stores `bodyPreview` (max ~255 characters), not the full plain-text body.
5. **Simple upload limit:** (Applies to OneDrive; email send has no attachment support currently.)
6. **No message deletion:** When Graph reports `@removed` on a delta item (message deleted in Outlook), NorvaOS skips it — no soft-delete is applied to the `email_messages` row.
7. **Send message ID not linked:** After `sendEmailViaProvider()`, the `email_send_events.message_id` is `null`. The sent message will appear in the next delta sync as a regular message, but the send event record is never programmatically linked to the resulting message row.
8. **Calendar and task sync:** The `POST /api/integrations/microsoft/sync` route also handles calendar and task sync via `lib/services/microsoft-sync.ts`, which is not audited in this contract. Calendar and task sync are out of scope for the email contract.

---

## 10. Acceptance Criteria

The following criteria must all pass before this integration is marked production-ready:

- [ ] AES-256-GCM encryption is verified: tokens cannot be read from the database without the encryption key
- [ ] Token auto-refresh is verified: an artificially expired access token is refreshed transparently before the next Graph call
- [ ] Delta sync produces correct created/updated counts on first run and incremental runs
- [ ] After 10 consecutive sync errors, `sync_enabled` is set to `false` and no further syncs are attempted
- [ ] Sending a new email via Graph creates an `email_send_events` row
- [ ] Replying to a message uses the `me/messages/{id}/reply` endpoint (not `me/sendMail`)
- [ ] Per-message processing errors do not abort the entire sync batch
- [ ] `MICROSOFT_TOKEN_ENCRYPTION_KEY` missing causes a clear configuration error, not a silent failure
- [ ] All PII fields are absent from log output (email addresses, token values, message content)
- [ ] Disconnect flow (`/api/integrations/microsoft/disconnect`) sets `is_active = false` on the connection row

**GAP items requiring remediation before production:**
- [ ] Rate-limit recursion capped with a maximum retry depth (e.g., 5 attempts)
- [ ] Structured logger (`log.*`) used instead of `console.*` in email-sync and email-send services
- [ ] Alert signal (log error or metric) emitted when `sync_enabled` is set to `false`
- [ ] `email_send_events.message_id` linking strategy defined and implemented or gap accepted with documentation
