# NorvaOS Defect Register

**Register opened:** 2026-03-18  
**Status:** ACTIVE — Defect Stabilization Pass  
**Release posture:** Deployed. Hardened. Not approved for operational release.  
**Production build:** `447d0c8`  

---

## Triage Summary

| Triage tier | Count | IDs |
|---|---|---|
| Release Blocker | 2 | DEF-001, DEF-002 |
| High | 2 | DEF-003, DEF-004 |
| Medium | 6 | DEF-005, DEF-006, DEF-007, DEF-008, DEF-009, DEF-010 |
| Low | 2 | DEF-011, DEF-012 |
| **Total** | **12** | |

---

## Release Blockers

---

### DEF-001 — Form generation callback: no tenant isolation on job update

| Field | Value |
|---|---|
| **Issue ID** | DEF-001 |
| **Module** | Form Generation / Internal Callback |
| **Exact defect** | `POST /api/internal/form-generation-callback` updates `form_generation_log` rows by `job_id` alone using the admin client. No tenant_id verification is performed before the update. Any caller with a valid `WORKER_SECRET` can update any job record across any tenant by supplying an arbitrary `job_id`. |
| **Steps to reproduce** | 1. Obtain `WORKER_SECRET`. 2. Enumerate or guess a `job_id` UUID belonging to tenant B. 3. POST to `/api/internal/form-generation-callback` with `{ job_id: <tenant_B_job>, status: "completed", output_path: "attacker/path" }`. 4. Observe the form_generation_log row for tenant B is updated. |
| **Expected result** | Callback validates the job belongs to a known tenant context, or at minimum fetches the row first and verifies it exists before updating. Cross-tenant update is impossible. |
| **Actual result** | Admin client executes `.update(payload).eq('id', job_id)` with no tenant guard. Row is updated regardless of which tenant owns it. |
| **Severity** | **Release Blocker** |
| **Affected role** | Internal system / any party holding WORKER_SECRET |
| **Affected route / component** | `app/api/internal/form-generation-callback/route.ts` lines 67–76 |
| **Root cause** | Admin client used for form_generation_log update without a tenant_id filter; no pre-fetch to validate ownership before write. |
| **Fix owner** | Dev |
| **ETA** | Sprint 7 Day 1 |
| **Retest evidence** | Pending fix |

---

### DEF-002 — Booking page intake: slug lookup missing tenant filter

| Field | Value |
|---|---|
| **Issue ID** | DEF-002 |
| **Module** | Public Intake / Booking |
| **Exact defect** | `POST /api/booking/[slug]/submit` resolves a booking page using only `slug`, `status = 'published'`, and `is_active = true`. There is no `tenant_id` filter. All subsequent writes (contact creation, appointment creation) are executed under the tenant derived from the unguarded slug lookup. A caller who knows or guesses a valid slug from any tenant can inject appointment and contact records into that tenant's database. |
| **Steps to reproduce** | 1. Discover or enumerate a published booking page slug belonging to tenant A (slugs are human-readable strings, not random). 2. POST to `/api/booking/<slug>/submit` with attacker-controlled `name`, `email`, `date`, `time`. 3. Observe a contact and appointment are created in tenant A's database without any relationship to tenant A's client base. |
| **Expected result** | Slugs are globally unique (enforced by DB constraint) or the route requires a tenant context parameter. Cross-tenant slug confusion is structurally impossible. |
| **Actual result** | No tenant_id filter on slug lookup at line 38–47 of `app/api/booking/[slug]/submit/route.ts`. Any valid slug from any tenant resolves and triggers contact + appointment creation under that tenant. |
| **Severity** | **Release Blocker** |
| **Affected role** | Unauthenticated public |
| **Affected route / component** | `app/api/booking/[slug]/submit/route.ts` lines 38–47 |
| **Root cause** | Booking page slugs are not constrained to be globally unique at the DB level, and the route does not add a tenant scoping parameter to the public URL. |
| **Fix owner** | Dev |
| **ETA** | Sprint 7 Day 1 |
| **Retest evidence** | Pending fix |

---

## High

---

### DEF-003 — Generate-form: sidecar URL dispatched without protocol validation

| Field | Value |
|---|---|
| **Issue ID** | DEF-003 |
| **Module** | Form Generation |
| **Exact defect** | `POST /api/matters/[id]/generate-form` reads `PYTHON_SIDECAR_URL` from env and dispatches a form generation payload to `${sidecarUrl}/generate-form` without validating the URL is well-formed or uses HTTPS. If `PYTHON_SIDECAR_URL` is set to an attacker-controlled or misconfigured value, the payload — which includes `job_id`, `callback_url`, `field_overrides`, and `matter_id` — is sent to an arbitrary endpoint. |
| **Steps to reproduce** | 1. Set `PYTHON_SIDECAR_URL=http://attacker.example.com` in environment. 2. POST to `/api/matters/<id>/generate-form`. 3. Observe full job payload including sensitive field data posted to attacker server. |
| **Expected result** | Route validates `PYTHON_SIDECAR_URL` is a syntactically valid HTTPS URL before dispatching. HTTP and relative URLs are rejected at startup or at dispatch time. |
| **Actual result** | Line 168 of `app/api/matters/[id]/generate-form/route.ts` sends the payload to the raw env value without any protocol or hostname check. |
| **Severity** | **High** |
| **Affected role** | Any authenticated user who can trigger form generation |
| **Affected route / component** | `app/api/matters/[id]/generate-form/route.ts` lines 154–175 |
| **Root cause** | No URL validation performed before sidecar fetch dispatch. |
| **Fix owner** | Dev |
| **ETA** | Sprint 7 Day 2 |
| **Retest evidence** | Pending fix |

---

### DEF-004 — Job worker: sidecar URL dispatched without protocol validation

| Field | Value |
|---|---|
| **Issue ID** | DEF-004 |
| **Module** | Background Job Worker |
| **Exact defect** | Same class of defect as DEF-003. `GET /api/internal/job-worker` re-dispatches stalled or pending jobs to `PYTHON_SIDECAR_URL` without URL validation. |
| **Steps to reproduce** | Same as DEF-003 — misconfigured or malicious `PYTHON_SIDECAR_URL` causes job payloads to be sent to arbitrary endpoints on retry. |
| **Expected result** | URL validated before dispatch. |
| **Actual result** | Raw env value used at line 141 of `app/api/internal/job-worker/route.ts`. |
| **Severity** | **High** |
| **Affected role** | Internal worker (WORKER_SECRET bearer) |
| **Affected route / component** | `app/api/internal/job-worker/route.ts` lines 130–150 |
| **Root cause** | Same as DEF-003 — no URL validation on sidecar dispatch path. |
| **Fix owner** | Dev |
| **ETA** | Sprint 7 Day 2 |
| **Retest evidence** | Pending fix |

---

## Medium

---

### DEF-005 — Matter close: blocker check is non-atomic (race condition)

| Field | Value |
|---|---|
| **Issue ID** | DEF-005 |
| **Module** | Matter Lifecycle |
| **Exact defect** | `POST /api/matters/[id]/close` fetches open deficiencies, trust balance, and risk flags in parallel, then — if all pass — executes the close update. These are two separate DB round-trips with no locking between them. A concurrent request (e.g., a second tab or automated process) could resolve a blocker between the check and the close, or two simultaneous close requests could both pass the guard. |
| **Steps to reproduce** | 1. Send two simultaneous POST requests to `/api/matters/<id>/close` with valid body. 2. Both may pass the blocker check before either commits. 3. Both attempt to update `matters.status` to closed. |
| **Expected result** | Close operation is atomic — guard check and status update occur in a single DB transaction or the update includes a `WHERE status = 'active'` guard that makes the second write a no-op. |
| **Actual result** | Two-phase check-then-update pattern at lines 70–177 of `app/api/matters/[id]/close/route.ts`. No optimistic lock or transaction wrapping. |
| **Severity** | **Medium** |
| **Affected role** | Lawyer, Admin |
| **Affected route / component** | `app/api/matters/[id]/close/route.ts` lines 70–177 |
| **Root cause** | Non-atomic check-then-act pattern; missing `WHERE status != 'closed'` guard on the update or transaction wrapper. |
| **Fix owner** | Dev |
| **ETA** | Sprint 7 Day 3 |
| **Retest evidence** | Pending fix |

---

### DEF-006 — Deficiency creation allowed on closed matters

| Field | Value |
|---|---|
| **Issue ID** | DEF-006 |
| **Module** | Matter Lifecycle / Deficiencies |
| **Exact defect** | `POST /api/matters/[id]/deficiencies` verifies the matter belongs to the tenant but does not check whether the matter is already closed. A user can create a deficiency on a `closed_won`, `closed_lost`, or `closed_withdrawn` matter, mutating a record that should be immutable after closure. |
| **Steps to reproduce** | 1. Close a matter (`status = closed_won`). 2. POST to `/api/matters/<closed_matter_id>/deficiencies` with valid body. 3. Observe deficiency created successfully — status 201. |
| **Expected result** | Route returns 409 Conflict if matter status is any closed variant. Closed matters are immutable. |
| **Actual result** | No status check in deficiency creation path. Deficiency is created on closed matter. |
| **Severity** | **Medium** |
| **Affected role** | Lawyer, Admin |
| **Affected route / component** | `app/api/matters/[id]/deficiencies/route.ts` POST handler, lines 65–120 |
| **Root cause** | Matter status not fetched or checked before deficiency creation; only matter existence and tenant membership are verified. |
| **Fix owner** | Dev |
| **ETA** | Sprint 7 Day 2 |
| **Retest evidence** | Pending fix |

---

### DEF-007 — Required document slots not enforced at matter close

| Field | Value |
|---|---|
| **Issue ID** | DEF-007 |
| **Module** | Matter Lifecycle / Document Management |
| **Exact defect** | The matter close route checks for open deficiencies and trust balance but does not verify that all document slots marked `is_required = true` have at least one accepted upload. A matter can be closed with required documents missing. |
| **Steps to reproduce** | 1. Configure a document slot with `is_required = true` for a matter type. 2. Create a matter of that type without uploading the required document. 3. POST to `/api/matters/<id>/close` with a valid closure body. 4. Observe the matter closes successfully despite the unfulfilled required slot. |
| **Expected result** | Close route fetches all `is_required` document slots for the matter and returns 422 with a blocker entry if any required slot has no accepted document version. |
| **Actual result** | Close route blockers list (lines 71–103 of `close/route.ts`) does not include a required-slot check. Matter closes. |
| **Severity** | **Medium** |
| **Affected role** | Lawyer, Admin |
| **Affected route / component** | `app/api/matters/[id]/close/route.ts` blocker evaluation block |
| **Root cause** | Required document slot enforcement was not included in the closure guard when the close route was written. |
| **Fix owner** | Dev |
| **ETA** | Sprint 7 Day 3 |
| **Retest evidence** | Pending fix |

---

### DEF-008 — Public form submission: orphaned contact/lead on file upload failure

| Field | Value |
|---|---|
| **Issue ID** | DEF-008 |
| **Module** | Public Intake / Forms |
| **Exact defect** | `POST /api/forms/[slug]/submit` creates a contact and optionally a lead record before attempting file uploads. If file upload fails, the route returns 500 but the contact and lead records are already committed to the database. The partial submission leaves orphaned CRM records with no associated files. |
| **Steps to reproduce** | 1. Submit a form with file attachments when Supabase Storage is unavailable or quota exceeded. 2. Observe a 500 response. 3. Query the contacts table — a contact record for the submitter exists. |
| **Expected result** | File uploads are attempted before contact/lead creation, or the entire operation is wrapped in a transaction that rolls back on any failure. |
| **Actual result** | Contact created at lines 184–274, lead created at lines 302–345, file upload attempted at lines 131–158. Failure at upload leaves contact + lead with no linked files. |
| **Severity** | **Medium** |
| **Affected role** | Unauthenticated public submitter |
| **Affected route / component** | `app/api/forms/[slug]/submit/route.ts` — ordering of contact creation vs file upload |
| **Root cause** | Incorrect operation order; no transactional rollback on partial failure. |
| **Fix owner** | Dev |
| **ETA** | Sprint 7 Day 3 |
| **Retest evidence** | Pending fix |

---

### DEF-009 — Portal client upload: null contact_id not validated

| Field | Value |
|---|---|
| **Issue ID** | DEF-009 |
| **Module** | Client Portal |
| **Exact defect** | `POST /api/portal/[token]/client-upload` derives `contact_id` from the portal link record returned by `validatePortalToken()`. If `contact_id` is null in the link record, it is inserted into the documents table without a null check, creating a document row with `contact_id = null`. |
| **Steps to reproduce** | 1. Create a portal link where `contact_id` is null (e.g., matter-only link with no contact association). 2. Upload a document via the portal. 3. Observe document inserted with null contact_id — FK constraint may or may not fire depending on schema. |
| **Expected result** | Route returns 422 if portal link has no contact_id and the upload requires one, or explicitly allows null and handles downstream gracefully. |
| **Actual result** | No null check at line 148 of `app/api/portal/[token]/client-upload/route.ts`. Insert proceeds with null contact_id. |
| **Severity** | **Medium** |
| **Affected role** | Portal client (unauthenticated with valid token) |
| **Affected route / component** | `app/api/portal/[token]/client-upload/route.ts` line ~148 |
| **Root cause** | Implicit assumption that portal links always have a contact_id; no defensive null check before insert. |
| **Fix owner** | Dev |
| **ETA** | Sprint 7 Day 3 |
| **Retest evidence** | Pending fix |

---

### DEF-010 — Matter creation: workflow kit activation failure leaves matter stageless

| Field | Value |
|---|---|
| **Issue ID** | DEF-010 |
| **Module** | Matter Lifecycle / Workflow |
| **Exact defect** | `POST /api/matters` calls `activateWorkflowKit()` after creating the matter record. If kit activation fails, the error is logged as non-fatal and the matter is returned as created. The matter exists in the database with no `current_stage_id` set, meaning all downstream stage advance, gating, and close operations operate on a stageless matter — undefined behaviour throughout the lifecycle. |
| **Steps to reproduce** | 1. Create a matter with a valid `matter_stage_pipeline_id` pointing to a pipeline with a misconfigured initial stage. 2. `activateWorkflowKit()` throws or returns an error. 3. Observe the matter is created (201 response) but has no stage state. 4. Attempt to advance the stage — undefined behaviour. |
| **Expected result** | If kit activation fails, the matter creation is rolled back (or the matter is immediately marked as requiring manual intervention). A matter must never be created without a valid initial stage. |
| **Actual result** | Lines 157–160 of `app/api/matters/route.ts` log the error and continue. Matter exists with no stage. |
| **Severity** | **Medium** |
| **Affected role** | Admin, Lawyer |
| **Affected route / component** | `app/api/matters/route.ts` lines 142–160 |
| **Root cause** | Kit activation failure treated as non-fatal; no rollback or compensating action taken. |
| **Fix owner** | Dev |
| **ETA** | Sprint 7 Day 2 |
| **Retest evidence** | Pending fix |

---

## Low

---

### DEF-011 — Trust accounting: no pre-insert account existence check

| Field | Value |
|---|---|
| **Issue ID** | DEF-011 |
| **Module** | Trust Accounting |
| **Exact defect** | `POST /api/trust-accounting/transactions` validates amount > 0 and fetches the account for `hold_days`, but does not explicitly verify the caller has write permission on that specific trust account before inserting. The DB trigger catches overdrafts but not invalid account references at the permission level. |
| **Steps to reproduce** | 1. Authenticate as a Lawyer with permission to create trust transactions. 2. POST with a `trust_account_id` belonging to a different matter or client outside the Lawyer's assigned matters. 3. Observe whether the insert succeeds. |
| **Expected result** | Route verifies the trust account belongs to a matter the authenticated user has access to before inserting. |
| **Actual result** | Account fetched only for `hold_days` (line 102–106 of transactions route); no explicit permission check on whether this Lawyer may write to this account. |
| **Severity** | **Low** |
| **Affected role** | Lawyer |
| **Affected route / component** | `app/api/trust-accounting/transactions/route.ts` lines 88–151 |
| **Root cause** | Missing scoped permission check on trust account before transaction insert; relies on RLS alone. |
| **Fix owner** | Dev |
| **ETA** | Sprint 7 Day 4 |
| **Retest evidence** | Pending fix |

---

### DEF-012 — Matter close: no terminal-stage gate before closure

| Field | Value |
|---|---|
| **Issue ID** | DEF-012 |
| **Module** | Matter Lifecycle |
| **Exact defect** | The matter close route does not verify the matter is in a terminal stage before accepting closure. A matter that is mid-workflow (e.g., in "Document Review" stage with pending actions) can be closed directly without completing the stage pipeline. |
| **Steps to reproduce** | 1. Create a matter in an early workflow stage. 2. Do not advance through stages. 3. POST to `/api/matters/<id>/close` with a valid closure reason and no open deficiencies. 4. Matter closes despite not reaching a terminal stage. |
| **Expected result** | Close route checks whether the matter's current stage is marked as `is_terminal = true` in the stage configuration, and returns a blocker if not. |
| **Actual result** | No stage-terminal check in the close route blocker evaluation. Matter closes from any stage. |
| **Severity** | **Low** |
| **Affected role** | Lawyer, Admin |
| **Affected route / component** | `app/api/matters/[id]/close/route.ts` blocker evaluation block |
| **Root cause** | Terminal-stage gate was not included in the closure guard; close route was designed without a dependency on stage pipeline state. |
| **Fix owner** | Dev |
| **ETA** | Sprint 7 Day 4 |
| **Retest evidence** | Pending fix |

---

## Defect Status Tracker

| ID | Title | Severity | Status | Fixed in | Retested |
|---|---|---|---|---|---|
| DEF-001 | Callback no tenant isolation | Release Blocker | OPEN | — | — |
| DEF-002 | Booking slug no tenant filter | Release Blocker | OPEN | — | — |
| DEF-003 | Generate-form sidecar URL unvalidated | High | OPEN | — | — |
| DEF-004 | Job-worker sidecar URL unvalidated | High | OPEN | — | — |
| DEF-005 | Close matter non-atomic blocker check | Medium | OPEN | — | — |
| DEF-006 | Deficiency on closed matter | Medium | OPEN | — | — |
| DEF-007 | Required slots not enforced at close | Medium | OPEN | — | — |
| DEF-008 | Orphaned contact on file upload failure | Medium | OPEN | — | — |
| DEF-009 | Portal upload null contact_id | Medium | OPEN | — | — |
| DEF-010 | Stageless matter on kit activation failure | Medium | OPEN | — | — |
| DEF-011 | Trust accounting weak account permission | Low | OPEN | — | — |
| DEF-012 | No terminal-stage gate at close | Low | OPEN | — | — |

---

*Register maintained by: Dev*  
*Next review: Sprint 7 completion*
