# Integration Contract: GoHighLevel (GHL) Import

**Integration ID:** `ghl`
**Module:** Team 3 / Module 1
**Status:** Draft — Pending Proof Validation
**Last Updated:** 2026-03-15
**Source Files Audited:**
- `app/api/integrations/ghl/connect/route.ts`
- `app/api/integrations/ghl/callback/route.ts`
- `app/api/integrations/ghl/disconnect/route.ts`
- `app/api/integrations/ghl/status/route.ts`
- `lib/services/import/adapters/ghl/contacts.ts` (representative adapter)
- `lib/services/import/adapters/ghl/` (directory listing)

---

## 1. Integration Purpose and Scope

The GoHighLevel (GHL) integration connects a NorvaOS tenant's GHL account via OAuth 2.0 to enable one-time or periodic bulk import of CRM data into NorvaOS. It is not a live sync — it is a data migration / import pipeline.

**Import entities supported (as adapter files):**
- Contacts
- Opportunities (leads)
- Tasks
- Notes
- Pipeline Stages
- Calendar events
- Conversations
- Tags
- Custom Fields
- Invoices
- Companies
- Documents
- Forms
- Payments
- Surveys
- Users

**Not in scope:** Live webhook-based sync from GHL; ongoing bidirectional data exchange.

---

## 2. Credential Handling

### OAuth Flow

GHL uses an OAuth 2.0 Authorization Code flow. The connect route (`GET /api/integrations/ghl/connect`) requires authentication and the `settings.edit` permission.

State parameter handling:
- State is HMAC-signed via `signGhlState()` (from `lib/services/ghl/oauth.ts` — not directly audited, but pattern matches Clio's implementation)
- State contains `userId` and `tenantId`
- State is verified via `verifyGhlState()` in the callback

Token exchange occurs in `exchangeGhlCode()` in the callback route.

### Token Storage

Tokens are stored in the `platform_connections` table (not `microsoft_connections`):
- `access_token_encrypted` — encrypted access token
- `refresh_token_encrypted` — encrypted refresh token
- `token_expires_at` — ISO timestamp
- `platform: 'ghl'` discriminator
- `location_id` — GHL location ID from the token response
- `platform_user_id` — GHL user ID from the token response
- Upserted on `tenant_id, platform` conflict key

Encryption uses `encryptToken()` imported from `lib/services/ghl/oauth.ts`. Based on the pattern observed in `lib/services/microsoft-graph.ts`, this is expected to be AES-256-GCM, but the GHL OAuth service file was not directly audited.

**IDENTIFIED GAP — GHL OAuth service not audited:** `lib/services/ghl/oauth.ts` was not in the initial file list. The encryption implementation, token refresh logic, and state signing details for GHL are assumed to mirror the Microsoft pattern but have not been verified from source.

### Required Environment Variables

| Variable | Purpose |
|---|---|
| `GHL_CLIENT_ID` | GHL OAuth app client ID |
| `GHL_CLIENT_SECRET` | GHL OAuth app client secret |
| `NEXT_PUBLIC_APP_URL` | Redirect URI construction |

If `GHL_CLIENT_ID` or `GHL_CLIENT_SECRET` are absent, the connect route returns a `400` with `error: 'ghl_not_configured'`.

---

## 3. Retry Behaviour

### Connection OAuth

No retry on OAuth code exchange. If `exchangeGhlCode()` fails, the callback redirects to `/settings/data-import?error=ghl_callback_failed`. The user must manually re-initiate the OAuth flow.

### Import Execution

**IDENTIFIED GAP — Import runs not using job queue:** There is no evidence in the audited files that GHL import runs are enqueued via `lib/services/job-queue.ts`. The import adapter files define field mappings and transform functions but do not contain execution logic. The actual import execution mechanism (API route, server action, or job) was not identified during this audit.

Without job queue integration, there is no automatic retry for failed import runs, no per-run audit log in `job_runs`, and no backoff.

### Token Refresh

**IDENTIFIED GAP — No token refresh path visible:** The `platform_connections` table stores a `token_expires_at` field and encrypted refresh token, but no auto-refresh logic was found in the audited GHL files. The GHL import adapter does not call a `getValidAccessToken()` equivalent before making GHL API calls. If the access token expires during an import run, the run will fail with an authentication error.

---

## 4. Idempotency Guarantees

### Connection Upsert

The callback route uses `upsert` with `onConflict: 'tenant_id,platform'` to store tokens. Re-running the OAuth flow for the same tenant will overwrite the existing connection record.

### Import Records

**IDENTIFIED GAP — No import deduplication key:** The import adapters define field mappings but no per-record idempotency mechanism was observed. If an import run is re-executed (e.g., user re-imports the same CSV or re-authorises and runs import again), duplicate records may be created in the target tables (`contacts`, `leads`, etc.).

The `__source_id` field is mapped from GHL's `id` field in the contacts adapter, suggesting it is intended for deduplication, but no `upsert` logic using `__source_id` as a conflict key was found in the audited adapter files.

---

## 5. Failure Modes and Fallback Behaviour

| Failure | Behaviour |
|---|---|
| `GHL_CLIENT_ID` or `GHL_CLIENT_SECRET` not set | `connect` route returns 400 with `ghl_not_configured` |
| Invalid OAuth state | `verifyGhlState()` throws; callback redirects to `data-import?error=ghl_callback_failed` |
| Code exchange failure | Error caught; callback redirects to `data-import?error=ghl_callback_failed` |
| Upsert to `platform_connections` fails | Error thrown; callback redirects to `data-import?error=ghl_callback_failed` |
| Access token expired during import | **IDENTIFIED GAP** — No refresh path; import will fail with authentication error |
| Disconnect invoked | Route sets `is_active = false` on the `platform_connections` row (assumed; disconnect route not audited in detail) |
| Import adapter validation failure | Adapter `validate()` function returns error strings; execution depends on caller implementation |

---

## 6. Observability

### Logging

The connect and callback routes use `console.error` for error logging with context prefixes `[ghl/connect]` and `[ghl/callback]`.

**IDENTIFIED GAP — Unstructured logging:** GHL routes use `console.error/log` rather than the structured `log` utility. Log lines will not include `tenant_id` or be parseable as JSON.

**IDENTIFIED GAP — No import run logging:** Without job queue integration, there is no structured log of import runs, record counts processed, errors per record, or completion timestamps.

### Database Audit Trail

- `platform_connections` — one row per tenant per platform; tracks `connected_by`, `updated_at`, `error_count`, `last_error`, `last_error_at`

**IDENTIFIED GAP — No import history table visible:** There is no `import_runs` or `data_import_events` table audited for GHL. If such a table exists, it was not part of this audit's file scope.

---

## 7. Data Classification

The following data flows through the GHL integration:

| Data | Classification | Stored Where |
|---|---|---|
| GHL access token | Secret | `platform_connections.access_token_encrypted` |
| GHL refresh token | Secret | `platform_connections.refresh_token_encrypted` |
| Contact PII (names, emails, phones, addresses) | PII | `contacts` table after import |
| Opportunity/lead data | Confidential / business data | `leads` or `matters` table after import |
| GHL source IDs | Low sensitivity | Mapped to `__source_id` (handling depends on importer implementation) |

---

## 8. Tenant Isolation

- `platform_connections` has `tenant_id` and is upserted by `tenant_id, platform`
- State parameter in OAuth flow carries `tenantId` (signed) to bind the callback to the correct tenant
- Import operations are assumed to scope inserts by `tenant_id` from the connection record

**IDENTIFIED GAP — Import tenant scoping unverified:** The import execution path was not found in audited files. Tenant scoping during record insertion cannot be confirmed without auditing the execution layer.

---

## 9. Known Limitations

1. **One-time import model:** GHL integration is designed for data migration, not live bidirectional sync.
2. **No token refresh:** Access tokens will expire; users must re-authorise to import after token expiry.
3. **No deduplication:** Re-running import may create duplicate records.
4. **Inbox-only scope:** (Email-specific — not applicable to GHL.)
5. **Import execution layer not audited:** The mechanism that invokes adapter transformations and writes to the database was not identified in the audit scope.
6. **Rate limiting from GHL API:** No rate-limit handling was observed in the audited adapter files (adapters perform only data transformation, not API calls directly).

---

## 10. Acceptance Criteria

- [ ] Connecting a GHL account completes the OAuth flow and stores encrypted tokens in `platform_connections`
- [ ] State parameter is signed and verified; replay or tampering returns a redirect error
- [ ] Re-authorising an existing GHL connection upserts tokens without creating a duplicate row
- [ ] Disconnecting sets `is_active = false` on the `platform_connections` row
- [ ] Status endpoint returns connected/disconnected state correctly
- [ ] GHL contacts adapter maps required fields to NorvaOS schema (first_name, last_name, email, phone, address)
- [ ] Adapter `validate()` rejects records with no name, no email, and no last name

**GAP items requiring remediation before production:**
- [ ] `lib/services/ghl/oauth.ts` audited and encryption/refresh implementation verified
- [ ] Token refresh logic implemented or documented strategy for handling token expiry
- [ ] Import execution layer identified, audited, and documented
- [ ] Per-record deduplication strategy implemented (upsert on `__source_id` or equivalent)
- [ ] Import runs surfaced in a job queue or audit log table
- [ ] Structured logger used in GHL route handlers
