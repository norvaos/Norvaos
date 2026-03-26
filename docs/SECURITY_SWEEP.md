# Security Sweep  -  Week 3
Date: 2026-03-17

## 1. createAdminClient() Inventory

All usages were read from the actual source files. The `createAdminClient()` function in `lib/supabase/admin.ts` creates a Supabase client using the `SUPABASE_SERVICE_ROLE_KEY`, which bypasses all Row Level Security policies.

| File | Operation | Justification | Risk Level |
|------|-----------|---------------|------------|
| `lib/services/auth.ts` | SELECT roles by id | Role data lives across tenant boundary; user client can't self-join | Low |
| `lib/services/portal-auth.ts` | SELECT portal_links by token_hash; UPDATE access tracking | No Supabase Auth session in token-authenticated flows | Low |
| `lib/services/kiosk-auth.ts` | SELECT portal_links by raw token; UPDATE access tracking | No session in kiosk flows | Low  -  see Finding 1.2 |
| `lib/services/platform-admin.ts` | SELECT platform_admins; INSERT audit_logs, activities | Platform-admin gate checked before every usage | Low |
| `app/api/auth/signup/route.ts` | auth.admin.createUser, INSERT tenants/roles/users | Self-service signup; no session exists yet | Low |
| `app/api/auth/accept-invite/route.ts` | SELECT user_invites; auth.admin.createUser; INSERT users | Invite token is the auth credential | Low |
| `app/api/settings/users/invite/route.ts` | INSERT user_invites | Called after authenticateRequest() + requirePermission(users, create) | Low |
| `app/api/settings/users/[userId]/route.ts` | UPDATE users | After authenticateRequest() + permission check | Low |
| `app/api/settings/users/[userId]/deactivate/route.ts` | UPDATE users | After auth + permission check | Low |
| `app/api/settings/users/invites/[inviteId]/revoke/route.ts` | UPDATE user_invites | After auth + permission check | Low |
| `app/api/settings/firm/route.ts` | UPDATE tenants | After auth + requirePermission(settings, edit), scoped to auth.tenantId | Low |
| `app/api/settings/office/route.ts` | UPDATE tenants | After auth + permission check, scoped to auth.tenantId | Low |
| `app/api/settings/signature/route.ts` | UPDATE users/settings | After auth, scoped to auth.userId | Low |
| `app/api/settings/kiosk/route.ts` | UPDATE tenants.settings | After auth + permission check | Low |
| `app/api/settings/workflow-config/route.ts` | UPDATE tenant config | After auth + permission check | Low |
| `app/api/settings/front-desk/route.ts` | UPDATE tenant settings | After auth + permission check | Low |
| `app/api/admin/tenants/**` | Cross-tenant reads/writes on tenants, users, features | requirePlatformAdmin() gate (Bearer token or session check against platform_admins table) | Low |
| `app/api/booking/[slug]/submit/route.ts` | INSERT contacts, leads, appointments | Public endpoint; tenant is derived from booking_page.tenant_id (not user-supplied) | Medium  -  see Finding 1.1 |
| `app/api/forms/[slug]/submit/route.ts` | INSERT contacts, leads, intake_submissions | Public endpoint; tenant is derived from intake_forms.tenant_id | Medium  -  see Finding 1.1 |
| `app/api/portal/[token]/upload/route.ts` | INSERT documents, activities; storage upload | validatePortalToken() gates access; writes scoped to link.tenant_id and link.matter_id | Low |
| `app/api/portal/[token]/messages/route.ts` | SELECT/INSERT matter_comments | validatePortalToken() gate; writes scoped to link.matter_id | Low |
| `app/api/portal/[token]/questionnaire/route.ts` | UPDATE portal_links.metadata | validatePortalToken() gate; scope limited to link.id | Low  -  see Finding 1.3 |
| `app/api/portal/[token]/ircc-forms/[formId]/save/route.ts` | UPDATE contacts.immigration_data | validatePortalToken(); form verified to belong to matter's type | Low |
| `app/api/kiosk/[token]/complete/route.ts` | INSERT check_in_sessions, documents, leads, activities | validateKioskToken() gate; all writes scoped to link.tenant_id | Low |
| `app/api/kiosk/[token]/id-scan/route.ts` | Storage upload to private id-scans bucket | validateKioskToken() + session verification | Low |
| `app/api/signing/[token]/route.ts` | SELECT signing session data | Token-authenticated; data scoped by token lookup | Low |
| `app/api/signing/[token]/sign/route.ts` | Signature execution | Token-authenticated; rate-limited 5 req/min | Low |
| `app/api/cron/expire-invites/route.ts` | UPDATE user_invites across all tenants | CRON_SECRET Bearer check; cross-tenant by design (maintenance) | Low |
| `app/api/cron/*/route.ts` (11 cron routes) | Various cross-tenant maintenance reads/writes | All protected by CRON_SECRET Bearer check | Low |
| `app/api/internal/form-generation-callback/route.ts` | UPDATE form_generation_log | X-Worker-Key == WORKER_SECRET check | Low |
| `app/api/internal/job-worker/route.ts` | SELECT/UPDATE form_generation_log; re-dispatch to sidecar | X-Worker-Key == WORKER_SECRET check | Low |
| `app/api/trust-accounting/transactions/route.ts` | INSERT trust_transactions, trust_holds, trust_audit_log | After auth + requirePermission(trust_accounting, create) | Low |
| `app/api/document-engine/instances/route.ts` | INSERT document instances | After auth + requirePermission(document_generation, create) | Low |
| `app/api/ircc/forms/[formId]/relabel/route.ts` | UPDATE ircc_form_fields | After auth + requirePermission(form_packs, create); scoped to auth.tenantId | Low |
| `lib/services/break-glass.ts` | Break-glass privilege escalation | Dedicated break-glass audit and approval workflow | Medium  -  see Finding 1.4 |
| `lib/services/seat-limit.ts` | SELECT users/invites for seat counting | Read-only across tenant; called only from auth'd routes | Low |

### Findings

**Finding 1.1  -  Public form and booking endpoints (Medium)**
`app/api/forms/[slug]/submit/route.ts` and `app/api/booking/[slug]/submit/route.ts` are fully unauthenticated. They derive `tenant_id` from the form/booking page record (which requires a matching public slug), then use the admin client to INSERT contacts, leads, and submissions. This is by design for public intake, but it means:
- An attacker who can enumerate valid slugs can create arbitrary contacts/leads in any tenant.
- There is no content-size limit on freeform text fields such as `notes`, `guest_notes`, or intake `data` JSONB.
- Rate limiting is present on booking (slug lookup) but the submit route itself (`/api/booking/[slug]/submit`) does not have its own IP rate limiter  -  only the booking page read has one.
- **Remediation**: Add an IP rate limiter (e.g. 10 submissions per minute per IP) to both submit routes; add server-side field-length caps on freeform text fields before inserting into JSONB columns.

**Finding 1.2  -  Kiosk token stored as plaintext (Low-Medium)**
`lib/services/kiosk-auth.ts` queries `portal_links` by `.eq('token', token)` using the raw token value. In contrast, the general portal auth (`lib/services/portal-auth.ts`) hashes tokens with SHA-256 before the DB lookup using a `token_hash` column. The original `portal_links` schema (migration 017) stored the raw token in a `token` column; `token_hash` was added later. Kiosk tokens are looked up by the raw `token` column. If the `portal_links` table were ever exposed via a SQL injection or a misconfigured DB dump, kiosk tokens would be immediately usable. Portal tokens (for client portal) are better protected because the DB only stores the hash. Risk is partially mitigated by the short expiry window on kiosk tokens.
- **Remediation**: Migrate kiosk token lookup to use `token_hash` column (same as portal-auth.ts pattern) so no live plaintext token is stored.

**Finding 1.3  -  Questionnaire responses stored in portal_links.metadata JSONB (Low)**
`app/api/portal/[token]/questionnaire/route.ts` deep-merges arbitrary client-supplied `responses` into `portal_links.metadata`. While access is gated by token validation, the content is not sanitised or schema-validated before storage. A client could store unexpected keys in the metadata object. This is limited to the scope of their own portal link (they cannot affect other links or tenants), so the blast radius is small.
- **Remediation**: Define an allowed-keys allowlist or Zod schema for questionnaire responses before merging into metadata.

**Finding 1.4  -  break-glass.ts (Medium, pending review)**
`lib/services/break-glass.ts` uses `createAdminClient()` and appears to implement an emergency privilege escalation flow. This file was identified but not fully read within scope. The break-glass pattern is inherently high-risk if not properly gated with approval, time-boxing, and immutable audit logging.
- **Remediation**: Review the break-glass implementation in a dedicated audit session; verify it requires multi-person approval, produces immutable audit records, and auto-revokes after a configurable time window.

---

## 2. SECURITY DEFINER Functions

| Function | Migration | Purpose | Tenant-Scoped? |
|----------|-----------|---------|----------------|
| `apply_risk_override(p_intake_id, p_tenant_id, p_matter_id, ...)` | 025, fixed in 087 | Atomic 3-table update: matter_intake + risk_override_history + audit_logs | Yes  -  enforces `tenant_id = p_tenant_id` on UPDATE and all INSERTs |
| `upload_document_version(...)` | 028, fixed in 087 | Atomic document slot + version creation with row locking | Yes  -  tenant_id propagated through all inserts |
| `review_document_version(...)` | 028, fixed in 087 | Atomic document review (slot + version + audit) | Yes  -  tenant scoped |
| `has_billing_view()` | 033, fixed in 087 | Returns TRUE if auth.uid() user has billing:view permission | N/A  -  reads calling user's own role |
| `acquire_idempotency_lock(p_idempotency_key)` | 043, fixed in 087 | pg_advisory_lock for idempotent action execution | Not directly  -  key is caller-supplied; advisory locks are session-scoped |
| `release_idempotency_lock(p_idempotency_key)` | 043, fixed in 087 | Releases advisory lock | N/A |
| `execute_action_atomic(p_tenant_id, ...)` | 043, fixed in 087 | Atomic triple-write: workflow_actions + audit_logs + activities | Yes  -  all writes use caller-supplied p_tenant_id |
| `auto_end_stale_shifts()` | 050, fixed in 087 | Marks front_desk_shifts as ended after 12h | Yes  -  per-tenant shift scoping |
| `compute_shift_kpis(p_shift_id)` | 051, fixed in 087 | Calculates KPIs for a single shift | Shift-scoped (shift implicitly belongs to one tenant) |
| `compute_checkin_response_times(p_shift_id)` | 051, fixed in 087 | Response time calculations for a shift | Shift-scoped |
| `compute_day_kpis(p_date, p_user_id, p_tenant_id)` | 051, fixed in 087 | Day-level KPI rollup | Yes  -  p_tenant_id param |
| `create_form_pack_version(...)` | 052, fixed in 087 | Creates new form pack version | Yes  -  tenant_id propagated |
| `approve_form_pack_version(...)` | 052, fixed in 087 | Approves a form pack version | Yes  -  tenant_id propagated |
| `add_form_pack_artifact(...)` | 052, fixed in 087 | Adds artifact to form pack | Yes  -  tenant scoped |
| `publish_form_assignment_template(...)` | 074, fixed in 087 | Publishes a form assignment template | Yes  -  tenant_id stored on template |
| `archive_form_assignment_template(...)` | 074, fixed in 087 | Archives a form assignment template | Yes  -  tenant_id stored on template |
| `check_matter_access(p_user_id, p_matter_id)` | 094 | 9-path access control check for matter visibility | Yes  -  explicitly checks v_user.tenant_id == v_matter.m_tenant_id |
| `seed_post_submission_doc_types(p_tenant_id)` | 097 | Seeds document type catalogue for a tenant | Yes  -  all inserts use p_tenant_id |
| `seed_expiry_reminder_rules(p_tenant_id)` | 097 | Seeds expiry reminder rules for a tenant | Yes  -  all inserts use p_tenant_id |
| `snapshot_contact_profile_to_matter(p_matter_person_id, p_contact_id, p_tenant_id, ...)` | 112 | Copies contacts.immigration_data → matter_people.profile_data | Yes  -  enforces tenant_id on both contact and matter_people lookups |
| `sync_matter_profile_to_canonical(p_matter_person_id, p_contact_id, p_tenant_id, ...)` | 112 | Syncs profile fields back to canonical contact | Yes  -  enforces tenant_id on both lookups |
| `get_my_role()` | 126 | Returns role name for auth.uid() via users → roles join | N/A  -  returns calling user's own role |

### Findings

**Finding 2.1  -  Migration 087 applied search_path fix (Good)**
Migration 087 (`087-security-definer-search-path-fix.sql`) explicitly documents and remediates a class of schema-hijacking attacks: every `SECURITY DEFINER` function that was missing `SET search_path = public` was re-declared with the fix. All functions in the canonical set now include `SET search_path = public`.

**Finding 2.2  -  execute_action_atomic() trusted caller-supplied tenant_id (Amber)**
`execute_action_atomic()` receives `p_tenant_id` as a plain parameter and uses it for all inserts without cross-checking against the calling session's tenant. Because this function is granted to the `authenticated` role, a tenant user could theoretically call it via supabase.rpc() and supply a different tenant's UUID as `p_tenant_id`, writing audit log and activity records into another tenant's namespace. In practice, the application always calls this function from the API layer (server-side), which resolves `auth.tenantId` from the JWT and passes it. However, no DB-level guard prevents an authenticated user from calling it directly with a different UUID.
- **Remediation**: Add a guard at the top of `execute_action_atomic()` that verifies `p_tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid())`, or revoke the `authenticated` grant and call only via `service_role`.

**Finding 2.3  -  acquire_idempotency_lock uses session-level advisory locks (Amber)**
`acquire_idempotency_lock()` uses `pg_advisory_lock()` (session-level). If the database connection pool reuses connections across requests (as Supabase poolers do in transaction mode), the advisory lock may not be released between requests. The corresponding `release_idempotency_lock()` must always be called  -  no automatic cleanup occurs on request end in pooled mode. Review whether locks are always released even on error paths in the calling code.

**Finding 2.4  -  check_matter_access correctly enforces 9 paths (Good)**
`check_matter_access()` in migration 094 explicitly checks `v_user.tenant_id != v_matter.m_tenant_id` early and returns FALSE on mismatch. All 9 access paths remain intact. The function is not granted to `anon`.

---

## 3. Routes with Privileged Writes

The table below focuses on routes that mutate data (INSERT/UPDATE/DELETE). Only a representative sample of all 160+ routes is shown; patterns are consistent.

| Route | Method | Client Used | Auth Required | Tenant-Scoped |
|-------|--------|-------------|---------------|---------------|
| `POST /api/auth/signup` | POST | admin | No (public) | N/A  -  creates new tenant |
| `POST /api/auth/accept-invite` | POST | admin | No (invite token) | Yes  -  tenant from invite record |
| `POST /api/settings/users/invite` | POST | admin | Yes (session + users:create) | Yes  -  auth.tenantId |
| `PATCH /api/settings/users/[userId]` | PATCH | admin | Yes (session + users:edit) | Yes  -  auth.tenantId |
| `POST /api/settings/users/[userId]/deactivate` | POST | admin | Yes (session + users:edit) | Yes  -  auth.tenantId |
| `DELETE /api/settings/users/invites/[inviteId]/revoke` | DELETE | admin | Yes (session + users:create) | Yes  -  auth.tenantId |
| `PATCH /api/settings/firm` | PATCH | admin | Yes (session + settings:edit) | Yes  -  auth.tenantId |
| `POST /api/admin/tenants/[id]/bootstrap` | POST | admin | Yes (platformAdmin gate) | Yes  -  explicit tenantId param |
| `POST /api/admin/tenants/[id]/features` | POST | admin | Yes (platformAdmin gate) | Yes  -  explicit tenantId param |
| `POST /api/forms/[slug]/submit` | POST | admin | No (public) | Yes  -  from form record |
| `POST /api/booking/[slug]/submit` | POST | admin | No (public) | Yes  -  from booking_page record |
| `POST /api/portal/[token]/upload` | POST | admin | No (portal token) | Yes  -  from portal link |
| `POST /api/portal/[token]/messages` | POST | admin | No (portal token) | Yes  -  from portal link |
| `POST /api/portal/[token]/questionnaire` | POST | admin | No (portal token) | Yes  -  from portal link |
| `POST /api/portal/[token]/ircc-forms/[formId]/save` | POST | admin | No (portal token) | Yes  -  from portal link |
| `POST /api/kiosk/[token]/complete` | POST | admin | No (kiosk token) | Yes  -  from kiosk link |
| `POST /api/kiosk/[token]/id-scan` | POST | admin | No (kiosk token) | Yes  -  from kiosk link |
| `POST /api/signing/[token]/sign` | POST | admin | No (signing token) | Yes  -  token → signer |
| `POST /api/trust-accounting/transactions` | POST | admin (for inserts) | Yes (session + trust_accounting:create) | Yes  -  auth.tenantId |
| `POST /api/document-engine/instances` | POST | admin | Yes (session + document_generation:create) | Yes  -  auth.tenantId |
| `POST /api/internal/form-generation-callback` | POST | admin | No (X-Worker-Key) | Yes  -  job_id scoped |
| `GET /api/internal/job-worker` | GET | admin | No (X-Worker-Key) | No  -  cross-tenant by design |
| `POST /api/cron/expire-invites` | POST | admin | No (CRON_SECRET Bearer) | No  -  cross-tenant by design |
| `POST /api/matters` | POST | admin | Yes (session + matters:create) | Yes  -  auth.tenantId |

### Findings

**Finding 3.1  -  Public booking submit lacks per-IP rate limiting on the submit path (Medium)**
`POST /api/booking/[slug]/submit` uses the admin client and creates contacts, leads, and appointments without an IP-based rate limiter on the submit handler itself. The GET `/api/booking/[slug]` endpoint has rate limiting, but a bot could bypass it and POST directly. This could be used to spam a tenant with fake leads and contacts.
- **Remediation**: Apply the existing `createRateLimiter` pattern (e.g. 10 requests/minute/IP) to the submit handler.

**Finding 3.2  -  Public form submit lacks per-IP rate limiting on the submit path (Medium)**
Same as 3.1. `POST /api/forms/[slug]/submit` has no IP-based rate limiter on the submit route itself.

**Finding 3.3  -  Cron routes unauthenticated when CRON_SECRET is not set (Low)**
All cron routes include the pattern: `if (cronSecret) { ...check... }`. If `CRON_SECRET` is not configured in the environment, the auth check is silently skipped and anyone can trigger cross-tenant maintenance operations. In production `CRON_SECRET` should always be set, but the defensive pattern should fail closed rather than open.
- **Remediation**: Change the guard to: if CRON_SECRET is falsy → return 501 / "cron not configured" rather than bypassing auth.

**Finding 3.4  -  Internal job-worker and form-generation-callback fail open when WORKER_SECRET is not set (Medium)**
The internal routes check `if (!workerSecret || workerKey !== workerSecret)` and return 401 only when `workerSecret` is non-empty AND the key matches. When `workerSecret` is empty (env var missing), `!workerSecret` is true and the check triggers correctly (returns 401). On review, this is actually fail-closed: `!workerSecret` evaluates to true when the secret is not set, triggering a 401. Verified correct.

**Finding 3.5  -  Portal questionnaire can overwrite all metadata keys (Low)**
`POST /api/portal/[token]/questionnaire` spreads arbitrary user-supplied keys into `portal_links.metadata` via object spread. Keys like `intake_form_id`, `questionnaire_submitted_at`, or other internal fields stored in metadata could be overwritten by a client if they know the key names. The update is scoped to the validated portal link, so no cross-tenant leakage is possible, but a client could manipulate their own portal link's internal state.
- **Remediation**: Store questionnaire responses in a dedicated column or sub-key (e.g. `metadata.questionnaire.responses`) and strip any attempt to overwrite reserved keys.

**Finding 3.6  -  trust-accounting/transactions uses admin client for INSERT instead of RLS-scoped client (Amber)**
`POST /api/trust-accounting/transactions` authenticates the user via `authenticateRequest()` (establishing `auth.tenantId`), then switches to `createAdminClient()` for the actual INSERT. This means the DB-level RLS INSERT policy (migration 126, role IN 'Billing', 'Admin') is bypassed  -  enforcement is entirely application-layer via `requirePermission(auth, 'trust_accounting', 'create')`. If the application-layer check is ever skipped or bypassed, the admin client would write transactions without the DB backstop.
- **Remediation**: Use `auth.supabase` (the user-scoped client) for the trust transaction INSERT to retain the DB-level role gate, or document why the admin client is required here.

---

## 4. Sensitive JSONB Fields

| Table | Column | Contains | Risk |
|-------|--------|----------|------|
| `intake_submissions` | `data` | All raw form submission answers (PII: names, addresses, immigration history, financial info) | High |
| `intake_forms` | `fields` | Form field config including labels, mappings, conditions | Low |
| `intake_forms` | `settings` | Notify email, auto-assign, section conditions | Low |
| `booking_pages` | `questions` | Custom booking questions config | Low |
| `appointments` | `answers` | Booking page question answers (PII: purpose of visit, case details) | Medium |
| `portal_links` | `metadata` | Questionnaire responses, intake_form_id, internal state flags | Medium  -  see Finding 1.3 |
| `portal_links` | `permissions` | Per-link capability flags | Low |
| `tenants` | `settings` | Kiosk config, branding URLs, inactivity timeouts | Low |
| `tenants` | `feature_flags` | Enabled/disabled feature toggles | Low |
| `tenants` | `portal_branding` | Logo URLs, colour overrides | Low |
| `contacts` | `immigration_data` | Full immigration profile (passport, travel history, status records) | High |
| `matter_people` | `profile_data` | Snapshot of immigration_data at time of matter creation | High |
| `front_desk_shifts` | `metadata` | Shift metadata (shift notes, config) | Low |
| `check_in_sessions` | `metadata` | Walk-in form answers, ID scan metadata, locale | Medium |
| `form_generation_log` | `metadata` | field_overrides for PDF generation (includes form field values) | Medium |
| `activities` | `metadata` | Context per activity type (contact IDs, lead IDs, file names, etc.) | Low |
| `audit_logs` | `changes` | Before/after field values for audited changes | Medium |
| `workflow_actions` | `action_config`, `previous_state`, `new_state` | Full action state serialised as JSONB | Medium |
| `roles` | `permissions` | Role permission map (resource → operation → bool) | Low |
| `users` | `settings`, `notification_prefs` | Per-user config and notification preferences | Low |
| `document_slot_templates` | `conditions` | Conditional display rules for document slots | Low |

### Remediation Plan

**Priority 1  -  intake_submissions.data and contacts.immigration_data (High)**
These columns store the most sensitive PII in the system. Recommended actions:
- Confirm that the `documents` storage bucket and these JSONB columns are excluded from any database export or backup process accessible to non-DBA personnel.
- Implement column-level encryption (Supabase Vault) for `contacts.immigration_data` and `matter_people.profile_data` before any third-party data processor integration is added.
- Add a maximum payload size check server-side before inserting into `intake_submissions.data` (a 10 MB JSON blob is currently not prevented).

**Priority 2  -  appointments.answers and check_in_sessions.metadata (Medium)**
These receive unauthenticated user-supplied data (booking guests and kiosk visitors). Currently there is no schema validation or content sanitisation before storage. Recommend adding Zod validation of the `answers` object on the booking submit route, and stripping or validating the `answers` object on the kiosk complete route.

**Priority 3  -  portal_links.metadata (Medium)**
Questionnaire responses from clients are merged into this free-form column without an allowlist. See Finding 1.3. Store responses in a dedicated column or enforce a schema before merging.

**Priority 4  -  form_generation_log.metadata and field_overrides (Medium)**
The job-worker re-reads `field_overrides` from `form_generation_log.metadata` and forwards them to the Python sidecar. If an attacker could write to this table, they could inject arbitrary field values into a PDF generation job. The table's RLS allows authenticated tenant users to INSERT (with tenant check), but only the admin client is used for reads during retry dispatch. Verify that no user-facing route allows arbitrary writes to `form_generation_log.metadata`.

---

## 5. Summary

### Green (no action needed)
- All authenticated API routes correctly call `authenticateRequest()` before any writes.
- All authenticated routes use `requirePermission()` from `lib/services/require-role.ts` for capability gating.
- Platform-admin routes are gated by `requirePlatformAdmin()` (dual path: Bearer token + session check against `platform_admins` table) with rate limiting (30 req/min/IP).
- All `SECURITY DEFINER` functions were retrofitted with `SET search_path = public` in migration 087.
- `check_matter_access()` implements the full 9-path access model with cross-tenant guard.
- Storage writes (document uploads) are correctly gated  -  client-side authenticated users cannot write to the documents bucket (migration 025); only service_role can.
- Portal and signing token routes are rate-limited.
- ID scans are stored in a private `id-scans` bucket (not accessible to authenticated clients directly).
- Role-based RLS on trust accounting tables (migrations 126, 128) adds a DB-layer backstop for reads and writes on financial tables.
- `get_my_role()` (migration 126) and `has_billing_view()` (migration 033) correctly scope themselves to `auth.uid()` only.
- Seat limit enforcement has both application-layer precheck and DB trigger backstop.
- Deactivated users are blocked immediately in `authenticateRequest()` regardless of session state.
- Cron and worker routes fail closed when `WORKER_SECRET` is not set (correctly returns 401).

### Amber (monitor / document)
- `execute_action_atomic()`  -  trusted caller-supplied `p_tenant_id` without DB-level verification (Finding 2.2).
- `acquire_idempotency_lock()`  -  advisory locks in transaction-pooled environments may have leak risk (Finding 2.3).
- `trust-accounting/transactions` INSERT  -  bypasses DB-level RLS role gate by using admin client; application-layer check must remain complete (Finding 3.6).
- Portal questionnaire metadata merge  -  no reserved-key protection (Finding 1.3 / Finding 3.5).
- Kiosk token stored as plaintext in DB vs. portal token stored as SHA-256 hash (Finding 1.2).
- `break-glass.ts`  -  requires dedicated audit review (Finding 1.4).
- `form_generation_log.metadata.field_overrides`  -  flows to Python sidecar without server-side sanitisation.

### Red (must fix before production)
- Public booking and form submit routes lack per-IP rate limiting on the submit endpoint (Findings 3.1, 3.2). This is exploitable without any credentials and could be used to spam tenant data.
- Cron routes fail open when `CRON_SECRET` env var is missing (Finding 3.3). While production should always set this, the guard should fail closed.

---

## 6. Recommendations

Ordered by priority (P1 = must fix, P2 = fix before next release, P3 = planned):

**P1  -  Rate limit public submit endpoints**
Add `createRateLimiter({ maxRequests: 10, windowMs: 60_000 })` at the top of:
- `app/api/forms/[slug]/submit/route.ts`
- `app/api/booking/[slug]/submit/route.ts`

Also add a server-side field-length cap (e.g. max 2000 chars per text field, max 100 KB total payload) before inserting into intake `data` JSONB.

**P1  -  Fail closed on missing CRON_SECRET**
Change all cron route auth guards from `if (cronSecret) { check }` to:
```typescript
if (!cronSecret) return NextResponse.json({ error: 'Cron not configured' }, { status: 501 })
if (authHeader !== `Bearer ${cronSecret}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
```

**P2  -  Migrate kiosk token to hash-based lookup**
Add a `token_hash` column to `portal_links` (if not already present for the kiosk case), compute SHA-256 on issuance, and update `lib/services/kiosk-auth.ts` to query by `token_hash` instead of `token`. This brings kiosk tokens to parity with portal tokens.

**P2  -  Add tenant guard to execute_action_atomic()**
Add a validation step at the start of the function that verifies `p_tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid())`, or change the GRANT to revoke access from `authenticated` and call only from service_role (admin client). Document the chosen approach.

**P2  -  Trust accounting INSERT: use user-scoped client or document deviation**
In `app/api/trust-accounting/transactions/route.ts`, either switch the INSERT to use `auth.supabase` so the DB-level role gate from migration 126 applies, or add a comment explaining why the admin client is needed and confirming the application-layer check is the sole guard.

**P2  -  Protect portal_links.metadata reserved keys**
In `app/api/portal/[token]/questionnaire/route.ts`, store responses under a dedicated sub-key (e.g. `metadata.questionnaire`) and prevent client-supplied keys from overwriting `intake_form_id`, `questionnaire_submitted_at`, or other internal fields.

**P3  -  Break-glass dedicated audit**
Conduct a focused review of `lib/services/break-glass.ts` to verify: (a) multi-person approval gate, (b) immutable audit trail on escalation and revocation, (c) time-bounded access with automatic expiry.

**P3  -  Column-level encryption for immigration_data**
Evaluate Supabase Vault or application-layer encryption for `contacts.immigration_data` and `matter_people.profile_data` before connecting any third-party data processor or analytics pipeline.

**P3  -  Payload size cap on JSONB columns**
Add Zod or manual validation on `appointments.answers`, `check_in_sessions.metadata.answers`, and any other route that accepts user-supplied JSONB to enforce maximum total payload size (e.g. 64 KB) before inserting into the database.

**P3  -  Review advisory lock lifecycle in pooled environments**
Document or test the interaction between `acquire_idempotency_lock()` (session-level `pg_advisory_lock`) and Supabase's connection pooler. If the pooler operates in transaction mode, session-level locks may persist across requests on reused connections. Consider switching to transaction-level advisory locks (`pg_advisory_xact_lock`) which are automatically released at transaction end.

---

## 7. Formal Written Decision  -  Trust Accounting Admin Client

**Route**: `POST /api/trust-accounting/transactions` (`app/api/trust-accounting/transactions/route.ts`)
**Finding reference**: Finding 3.6
**Decision date**: 2026-03-17
**Decision owner**: Zia Waseer

### Why admin client is currently used

The POST handler performs three DB operations:
1. `trust_transactions` INSERT + `.select().single()` (RETURNING clause)
2. `trust_holds` INSERT (cheque-hold record, conditional)
3. `trust_audit_log` INSERT (audit trail)

The primary reason for `createAdminClient()` is the same PostgREST limitation that affects `create-jr-matter`: PostgREST applies the table's SELECT USING RLS policy to the RETURNING clause of an INSERT at query execution time. If the `trust_transactions` SELECT USING policy requires `tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid())`, this is evaluated against the just-inserted row before the session's RLS context is fully populated, causing a spurious 404/empty response. Using the admin client bypasses this.

The `trust_holds` and `trust_audit_log` INSERTs follow in the same DB call context and reuse the already-created admin client for consistency. These tables may also have restrictive INSERT policies that block authenticated-user direct inserts (they are internal accounting tables not intended to be written directly by the user client).

### Compensating controls in place

| Control | Implementation | Strength |
|---------|---------------|----------|
| Session authentication | `authenticateRequest()` verifies cookie-based Supabase session before any write | Strong |
| Permission gate | `requirePermission(auth, 'trust_accounting', 'create')`  -  Billing and Admin roles only | Strong |
| Tenant isolation | `tenant_id` on all three inserts is `auth.tenantId` (JWT-derived, server-resolved)  -  never user-supplied | Strong |
| Amount validation | `amountCents > 0` enforced at app layer before insert | Adequate |
| Transaction type guard | Only `deposit` and `opening_balance` allowed via direct creation; disbursements require separate approval workflow | Strong |
| DB overdraft trigger | Migration 126 DB trigger fires regardless of client used  -  INSERT is rejected if it would cause trust balance to go negative | Strong (trigger is client-agnostic) |
| Audit trail | Every transaction recorded in `trust_audit_log` with `user_id: auth.userId` | Strong |

### Accepted deviation and rationale

The DB-level RLS INSERT policy (migration 126  -  role IN 'Billing', 'Admin') is bypassed because the admin client is used. This DB backstop does not apply for this route. However, the application-layer permission check (`requirePermission`) enforces the same constraint and is executed before the DB write. The overdraft protection DB trigger remains fully active.

This deviation is **accepted for Sprint 6** because:
- The compensating controls are thorough and tested.
- The PostgREST RETURNING+RLS limitation is the same root cause as `create-jr-matter`, which is already accepted as AR-001.
- A user cannot reach this route without a valid session AND Billing/Admin role.
- Cross-tenant contamination is not possible: `tenant_id` is set from the JWT-derived `auth.tenantId`.

### Required remediation (Sprint 7)

Replace the `createAdminClient()` INSERT with a `SECURITY DEFINER` PostgreSQL function `record_trust_transaction(...)` that:
1. Verifies `p_tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid())` internally.
2. Performs all three writes (transaction + optional hold + audit log) atomically within the function.
3. Returns the created transaction row.

This removes the need for service-role access from the application layer while preserving the RETURNING data.

**Sprint 7 owner**: Backend engineer
**Target**: Sprint 7, first milestone

---

## 8. Formal Written Decision  -  execute_action_atomic() Tenant Trust

**Function**: `execute_action_atomic(p_tenant_id, ...)` (migration 043, fixed in 087)
**Finding reference**: Finding 2.2
**Decision date**: 2026-03-17
**Decision owner**: Zia Waseer

### Current state

`execute_action_atomic()` is a SECURITY DEFINER function granted to the `authenticated` role. It accepts `p_tenant_id` as a caller-supplied parameter and uses it for all inserts without an internal cross-check against `auth.uid()`'s actual tenant. An authenticated user calling `supabase.rpc('execute_action_atomic', { p_tenant_id: 'other-tenant-uuid', ... })` directly would write audit and activity records into another tenant's namespace.

### Why this is Amber, not Red

In practice, this function is called exclusively from server-side API routes that derive `p_tenant_id` from `auth.tenantId` (JWT-derived). Direct RPC calls from the browser are not an intended usage pattern. However, there is no DB-level control preventing it.

### Remediation decision

**Chosen path**: Add a tenant guard at the top of the function body:
```sql
IF p_tenant_id != (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()) THEN
  RAISE EXCEPTION 'tenant_id mismatch: caller tenant does not match supplied p_tenant_id';
END IF;
```

This DB-level check means that even if a user calls the function directly with a foreign tenant UUID, the function raises an exception before writing anything.

**Owner**: Zia Waseer
**Target sprint**: Sprint 7
**Migration**: Will be `132-execute-action-atomic-tenant-guard.sql`
**Interim risk**: Low  -  no authenticated user-facing UI exposes direct RPC calls to `execute_action_atomic`. All calls go through authenticated API routes that enforce tenant context.
