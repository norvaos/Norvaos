# Integration Hardening Checklist

**Module:** Team 3 / Module 1
**Version:** 1.0
**Date:** 2026-03-15

Every integration must pass all items in this checklist before being marked **production-ready**. Items marked with a status show the current state as assessed during the 2026-03-15 audit.

Legend:
- `PASS`  -  Verified as implemented from source code
- `FAIL`  -  Verified as NOT implemented; gap exists
- `PARTIAL`  -  Partially implemented with documented caveats
- `UNVERIFIED`  -  Could not be confirmed from audited files

---

## How to Use This Checklist

For each integration, copy this checklist and fill in the status column. Any `FAIL` item blocks production sign-off. `PARTIAL` and `UNVERIFIED` items require additional investigation and a documented decision (fix or accept with rationale).

---

## Master Checklist

### 1. Contract and Documentation

- [ ] **Contract document exists** in `contracts/integrations/` and is populated from actual source code
- [ ] **All identified gaps** are labelled `IDENTIFIED GAP` with specific descriptions
- [ ] **Integration is listed** in `contracts/README.md` with status and review date
- [ ] **Source files are mapped** in the contract

---

### 2. Credential Security

- [ ] **Credentials stored encrypted (never plaintext)**  -  OAuth tokens, API keys, and secrets must be stored encrypted at rest. Plaintext tokens must never appear in the database.
- [ ] **Encryption key is external**  -  Encryption key must come from an environment variable, not be hardcoded
- [ ] **Encryption algorithm is appropriate**  -  AES-256-GCM or equivalent authenticated encryption required; AES-ECB or unauthenticated modes are not acceptable
- [ ] **Tokens excluded from all log output**  -  No plaintext or encrypted tokens must appear in log lines, error messages, or console output
- [ ] **Credentials never stored in source control**  -  `.env` files with secrets must be in `.gitignore`; contract documents must not contain actual credential values

---

### 3. Token Lifecycle

- [ ] **Token refresh handled gracefully**  -  Expired tokens are refreshed automatically before API calls proceed; callers do not need to handle expiry manually
- [ ] **Refresh failure surfaces clearly**  -  If a refresh token is revoked or invalid, the error is surfaced to the user (not silently swallowed) and the connection is marked inactive
- [ ] **Token expiry buffer applied**  -  Refresh is triggered before the token actually expires (e.g., 5-minute buffer), not only after receiving a 401
- [ ] **Revocation path exists**  -  Disconnecting an integration revokes or invalidates the stored tokens and marks the connection inactive

---

### 4. Retry Logic

- [ ] **Retry logic present with bounded attempts**  -  Failed operations are retried with a defined maximum retry count; infinite retry loops must not exist
- [ ] **Exponential backoff applied**  -  Retry delays increase exponentially; consecutive retries do not hammer the external service
- [ ] **Rate limit responses handled**  -  HTTP 429 responses are handled by respecting the `Retry-After` header with a bounded maximum wait
- [ ] **Retry count is bounded**  -  There is a hard maximum on retry attempts; the system eventually gives up and records a permanent failure

---

### 5. Idempotency

- [ ] **Idempotency key or deduplication present**  -  Enqueued jobs or webhook events include an idempotency key; duplicate submissions produce the same result, not duplicate records
- [ ] **At-least-once delivery handled safely**  -  External systems (Stripe, webhook senders) may deliver the same event more than once; idempotency prevents duplicate processing
- [ ] **Upsert used where appropriate**  -  Database writes use upsert (`onConflict`) where duplicate detection is required, not bare insert
- [ ] **Event replay is safe**  -  Re-processing the same event or re-running the same import does not corrupt existing data

---

### 6. Failure Handling and Logging

- [ ] **All failures logged (not silently caught)**  -  Every catch block either rethrows or emits a log entry with context; bare `catch {}` blocks must not exist
- [ ] **Structured logger used**  -  All log output uses `log.info/warn/error/debug` from `lib/utils/logger.ts`; `console.log/warn/error` must not be used in service files
- [ ] **`tenant_id` included in all log lines**  -  Every log entry from a service that processes tenant data must include `tenant_id` in the context object
- [ ] **Error messages sanitised**  -  Log entries must not include plaintext tokens, passwords, full email body content, or other sensitive data
- [ ] **Failure reason is specific**  -  Error log messages indicate what failed (which service, which operation) rather than generic messages

---

### 7. Alert and Signal Coverage

- [ ] **Alert/signal exists for repeated failures**  -  When an integration crosses a failure threshold (e.g., 10 consecutive sync errors), a structured error log, metric, or notification is emitted
- [ ] **Circuit breaker or account disabling is logged**  -  When an account or connection is disabled due to repeated errors, this state change produces an observable signal
- [ ] **Permanent failure is distinguishable from transient failure**  -  Log entries differentiate between "retrying" and "permanently failed" states
- [ ] **Missing configuration is surfaced at startup**  -  Required environment variables (API keys, secrets) are checked at startup or first use with clear error messages; silent failure is not acceptable

---

### 8. PII and Sensitive Content Protection

- [ ] **Sensitive content excluded from logs**  -  PII (email addresses, names, DOBs, message content) and financial data must not appear in structured log output
- [ ] **Attachment and full body content not stored unnecessarily**  -  Email bodies should be stored only to the extent needed; attachments should not be downloaded unless explicitly required
- [ ] **Data minimisation applied**  -  Only the minimum necessary data is fetched from external APIs and stored locally
- [ ] **Sensitive fields documented**  -  The contract identifies what PII and sensitive data flows through the integration and where it is stored

---

### 9. Tenant Isolation

- [ ] **Tenant isolation enforced (no cross-tenant data)**  -  All database reads and writes include an explicit `tenant_id` filter; there is no code path where data from one tenant could be written to or read by another
- [ ] **Admin client scoped appropriately**  -  When the service-role admin client is used (bypasses RLS), explicit `tenant_id` guards are present in every query
- [ ] **OAuth state is tenant-bound**  -  State parameters in OAuth flows carry a signed `tenant_id` that is verified in the callback
- [ ] **Connection ownership validated**  -  API routes validate that the requested connection or account belongs to the authenticated user's tenant before passing it to service functions

---

### 10. Operational Readiness

- [ ] **Connection test UI available**  -  Users can verify their integration is connected and working from the settings UI without triggering a full sync or import
- [ ] **Disconnect/revoke flow exists**  -  Users can disconnect an integration from the UI; disconnecting marks the connection inactive and prevents further API calls
- [ ] **Status endpoint returns accurate state**  -  The integration status API returns the current connection state (connected, disconnected, error, last sync time) accurately
- [ ] **Manual resync/reimport available**  -  For sync-based integrations, a manual trigger exists to force a full resync without waiting for the next scheduled run
- [ ] **Error state is surfaced in UI**  -  When an integration is in an error state (e.g., token revoked, sync disabled), the user sees a clear error in the settings UI with guidance on how to resolve it

---

## Per-Integration Assessment (2026-03-15 Audit)

| Check | MS Email | OneDrive | GHL | Clio | Stripe | Notifications |
|---|---|---|---|---|---|---|
| Contract exists | PASS | PASS | PASS | PASS | PASS | PASS |
| Credentials encrypted | PASS | PASS | PASS* | PASS* | N/A† | N/A† |
| Token refresh handled | PASS | PASS | FAIL | FAIL | N/A | N/A |
| Refresh failure surfaces | PASS | PASS | UNVERIFIED | UNVERIFIED | N/A | N/A |
| Retry with bounded attempts | FAIL‡ | FAIL | FAIL | FAIL | PARTIAL§ | FAIL |
| Rate limit handled | PARTIAL‡ | PARTIAL‡ | UNVERIFIED | UNVERIFIED | N/A | N/A |
| Idempotency key / dedup | PASS | FAIL | FAIL | FAIL | FAIL | FAIL |
| All failures logged | PARTIAL | PARTIAL | PARTIAL | PARTIAL | PARTIAL | PARTIAL |
| Structured logger used | FAIL | FAIL | FAIL | FAIL | FAIL | PARTIAL |
| `tenant_id` in log lines | FAIL | FAIL | FAIL | FAIL | FAIL | PASS |
| PII excluded from logs | PASS | PASS | PASS | PASS | PASS | PASS |
| Tenant isolation enforced | PARTIAL** | PARTIAL** | PARTIAL | PARTIAL | PASS | PASS |
| Alert on repeated failure | FAIL | FAIL | N/A | N/A | FAIL | N/A |
| Connection test UI | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED | N/A | N/A |
| Disconnect flow exists | PASS | PASS | PASS | PASS | N/A | N/A |
| Status endpoint | PASS | N/A | PASS | PASS | N/A | N/A |

**Notes:**
- `*` Encryption assumed to match Microsoft pattern; `lib/services/ghl/oauth.ts` and `lib/services/clio/oauth.ts` not directly audited
- `†` Stripe and notifications do not use OAuth token storage
- `‡` `graphFetch` handles 429 but retry is unbounded recursive recursion (no max depth)
- `§` Stripe relies on its own retry infrastructure; internal handler has no retry
- `**` Tenant isolation enforced in queries but `connectionId` ownership not validated in OneDrive routes; email sync has no explicit `tenant_id` guard on connection lookup

---

## Remediation Priority

**P0  -  Block on production:**
1. GHL / Clio token refresh (expiry during import causes silent data loss)
2. Stripe `billing_invoices` non-idempotent insert (financial data integrity)
3. Stripe silent event consumption (revenue impact)
4. Unbounded retry recursion (potential stack overflow under sustained rate limiting)

**P1  -  Fix before production sign-off:**
5. Structured logging across all integrations
6. `tenant_id` in all service log lines
7. Alert signal on email sync account disable
8. GHL / Clio import deduplication
9. OneDrive `linkOneDriveFile` duplicate check

**P2  -  Document and accept or schedule:**
10. Push notification implementation assessment
11. `email_send_events.message_id` linking strategy
12. Import execution layer audit (GHL and Clio)
13. Connection test UI coverage
14. Stale OneDrive folder cache recovery runbook
