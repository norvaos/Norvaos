# Integration Contract: Clio Import

**Integration ID:** `clio`
**Module:** Team 3 / Module 1
**Status:** Draft  -  Pending Proof Validation
**Last Updated:** 2026-03-15
**Source Files Audited:**
- `app/api/integrations/clio/connect/route.ts`
- `app/api/integrations/clio/callback/route.ts`
- `app/api/integrations/clio/disconnect/route.ts`
- `app/api/integrations/clio/status/route.ts`
- `lib/services/import/adapters/clio/contacts.ts` (representative adapter)
- `lib/services/import/adapters/clio/` (directory listing)

---

## 1. Integration Purpose and Scope

The Clio integration connects a NorvaOS tenant's Clio (legal practice management) account via OAuth 2.0 to enable one-time or periodic bulk import of matter, contact, and billing data into NorvaOS. Like GHL, this is a data migration pipeline, not a live bidirectional sync.

**Import entities supported (as adapter files):**
- Contacts (individuals and organisations)
- Matters
- Tasks
- Notes
- Time Entries
- Documents (metadata reference)
- Calendar events
- Communications
- Bills
- Custom Fields
- Practice Areas
- Relationships

**Not in scope:** Live webhook-based sync from Clio; ongoing billing or trust accounting synchronisation.

---

## 2. Credential Handling

### OAuth Flow

The Clio OAuth flow mirrors the GHL pattern:
- `GET /api/integrations/clio/connect` requires authentication and `settings.edit` permission
- State is signed via `signClioState()` containing `userId` and `tenantId`
- Callback verifies state via `verifyClioState()`
- `exchangeClioCode()` exchanges the authorization code for tokens
- `getClioProfile()` fetches the connected Clio user's profile (ID and name)

The profile fetch (`getClioProfile`) is unique to Clio and is absent in the GHL flow. The Clio user's `id` (as `platform_user_id`) and `name` (as `platform_user_name`) are stored on the connection record.

### Token Storage

Tokens are stored in `platform_connections` with `platform: 'clio'`:
- `access_token_encrypted`  -  AES-encrypted access token
- `refresh_token_encrypted`  -  AES-encrypted refresh token
- `token_expires_at`  -  ISO timestamp
- `platform_user_id`  -  Clio user ID (string-coerced from integer)
- `platform_user_name`  -  Clio user display name
- Upserted on `tenant_id, platform` conflict key

Encryption uses `encryptToken()` from `lib/services/clio/oauth.ts`  -  not directly audited but assumed to follow the same AES-256-GCM pattern as the Microsoft implementation.

**IDENTIFIED GAP  -  Clio OAuth service not audited:** `lib/services/clio/oauth.ts` was not in the initial file scope. The encryption implementation and state signing details are assumed from the pattern but unverified.

### Required Environment Variables

| Variable | Purpose |
|---|---|
| `CLIO_CLIENT_ID` | Clio OAuth app client ID |
| `CLIO_CLIENT_SECRET` | Clio OAuth app client secret |
| `NEXT_PUBLIC_APP_URL` | Redirect URI construction |

If `CLIO_CLIENT_ID` or `CLIO_CLIENT_SECRET` are absent, the connect route returns `400` with `error: 'clio_not_configured'`.

---

## 3. Retry Behaviour

### Connection OAuth

No retry on OAuth code exchange or profile fetch. If either fails, the callback redirects to `/settings/data-import?error=clio_callback_failed`.

### Import Execution

**IDENTIFIED GAP  -  Import runs not using job queue:** Identical gap to GHL. The import adapter files define field mappings and transform functions only. No execution layer that enqueues import runs via `lib/services/job-queue.ts` was identified in the audited scope.

### Token Refresh

**IDENTIFIED GAP  -  No token refresh path visible:** Same gap as GHL. Clio access tokens expire (typically after a short window). No auto-refresh was observed. Import runs initiated after token expiry will fail with authentication errors from the Clio API.

---

## 4. Idempotency Guarantees

### Connection Upsert

Callback uses `upsert` with `onConflict: 'tenant_id,platform'`. Re-running OAuth for the same tenant overwrites the existing Clio connection.

### Import Records

**IDENTIFIED GAP  -  No import deduplication key:** The Clio contacts adapter maps Clio's `Id` field to `__source_id`, but no upsert logic using `__source_id` as a conflict key was found in the audited adapter files. Re-running an import may create duplicate contact, matter, or task records.

The Clio contacts adapter's `validate()` function requires at least one of: first_name, last_name, email_primary, or organization_name. Empty-record rejection is enforced.

---

## 5. Failure Modes and Fallback Behaviour

| Failure | Behaviour |
|---|---|
| `CLIO_CLIENT_ID` or `CLIO_CLIENT_SECRET` not set | Connect route returns 400 with `clio_not_configured` |
| Invalid OAuth state | `verifyClioState()` throws; callback redirects to `data-import?error=clio_callback_failed` |
| Code exchange failure | Error caught; callback redirects to `data-import?error=clio_callback_failed` |
| Profile fetch failure (`getClioProfile`) | Error thrown from `try` block; callback redirects to `data-import?error=clio_callback_failed` |
| Upsert to `platform_connections` fails | Error thrown; callback redirects to `data-import?error=clio_callback_failed` |
| Access token expired during import | **IDENTIFIED GAP**  -  No refresh path; import fails with authentication error |
| Adapter validation failure | `validate()` returns error strings; enforcement depends on import execution layer |

---

## 6. Observability

### Logging

The connect and callback routes use `console.error` with prefixes `[clio/connect]` and `[clio/callback]`.

**IDENTIFIED GAP  -  Unstructured logging:** Same gap as GHL. No structured `log.*` calls. No `tenant_id` in log context.

**IDENTIFIED GAP  -  No import run audit:** No import run table or job queue integration for Clio import runs was identified.

### Database Audit Trail

- `platform_connections`  -  one row per tenant per platform; tracks `connected_by`, `platform_user_id`, `platform_user_name`, `updated_at`, `error_count`, `last_error`, `last_error_at`

The Clio record is richer than GHL's because it also stores `platform_user_name` (the Clio user's display name).

---

## 7. Data Classification

| Data | Classification | Stored Where |
|---|---|---|
| Clio access token | Secret | `platform_connections.access_token_encrypted` |
| Clio refresh token | Secret | `platform_connections.refresh_token_encrypted` |
| Contact PII (names, DOB, email, phone, address) | PII | `contacts` table after import |
| Matter data (title, practice area, status) | Confidential / business data | `matters` table after import |
| Time entries | Confidential / billing data | `time_entries` table after import |
| Bills / financial records | Confidential / financial PII | `bills` table after import |
| Clio source IDs | Low sensitivity | Mapped to `__source_id` |

**Note:** The Clio contacts adapter maps `Date of Birth` to `date_of_birth`  -  this is biometric/identity-sensitive PII. Extra care must be taken to ensure this field is stored only in the `contacts` table with appropriate RLS and is not exposed in log output during import.

---

## 8. Tenant Isolation

- `platform_connections` is scoped by `tenant_id`
- OAuth state carries signed `tenantId` to bind the callback
- Import data must be tagged with `tenant_id` at insert time (assumed, not verified in execution layer)

**IDENTIFIED GAP  -  Import tenant scoping unverified:** Same gap as GHL. Tenant scoping during record insertion cannot be confirmed without auditing the import execution layer.

---

## 9. Known Limitations

1. **One-time import model:** Clio integration supports data migration, not live sync.
2. **No token refresh:** Users must re-authorise to import after token expiry.
3. **No deduplication:** Re-running import may create duplicate records.
4. **Document references only:** The Clio documents adapter likely imports metadata references, not actual file content (Clio document content would require separate download from Clio's API).
5. **Import execution layer not audited:** The mechanism invoking adapters and writing to the database was not identified.
6. **Date of Birth handling:** DOB is stored as a date string (`YYYY-MM-DD` after truncating the ISO timestamp). Time zone handling during parse may introduce off-by-one errors for DOBs near midnight UTC.

---

## 10. Acceptance Criteria

- [ ] Connecting a Clio account completes OAuth flow, fetches profile, and stores encrypted tokens plus user identity in `platform_connections`
- [ ] State parameter is signed and verified; tampering returns a redirect error
- [ ] Re-authorising an existing Clio connection upserts tokens without creating a duplicate row
- [ ] Disconnecting sets `is_active = false` on the `platform_connections` row
- [ ] Status endpoint returns connected/disconnected state with Clio user name
- [ ] Clio contacts adapter correctly maps all field aliases including Canadian English variants (Province, Postal Code)
- [ ] Adapter `validate()` rejects records with no identity fields

**GAP items requiring remediation before production:**
- [ ] `lib/services/clio/oauth.ts` audited and encryption/refresh implementation verified
- [ ] Token refresh logic implemented or explicit strategy documented
- [ ] Import execution layer identified, audited, and documented
- [ ] Per-record deduplication implemented (upsert on `__source_id`)
- [ ] Import runs audited via job queue or dedicated import log table
- [ ] Structured logger used in Clio route handlers
- [ ] DOB time zone handling verified to prevent off-by-one date errors
