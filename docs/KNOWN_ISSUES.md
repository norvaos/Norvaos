# Known Issues Register

This document tracks known issues in NorvaOS. Issues are logged here
when they are identified, partially mitigated, or intentionally deferred.
P0 blockers must be resolved before any production release.

Last updated: 2026-03-17 — Sprint 6 close-out

---

## ISSUE-001 — Pending form generation jobs have no automatic retry or timeout

**Severity**: P1 (high)
**Status**: Partially mitigated — code complete, deployment pending (Release Gate B1)
**Component**: `form_generation_log` / `GET /api/internal/job-worker` / Python sidecar
**Description**: `form_generation_log` rows with `status='pending'` have no
automatic retry logic or timeout enforced at the database layer. If the Python
sidecar is unreachable or crashes after a job is dispatched, the job remains
`pending` indefinitely with no alert and no retry.
**Impact**: Form generation jobs silently stall. Users see no progress and no
error. Operators have no visibility without manual database inspection.
**Mitigation**: Week 3 work built: `GET /api/internal/job-worker` marks jobs
older than 10 minutes as `failed` and re-dispatches jobs 2–10 minutes old with
`retry_count < 3`. `POST /api/matters/[id]/form-generation-jobs/[jobId]/retry`
provides manual retry. `GET /api/admin/form-generation-jobs/stuck` provides
admin visibility. Migration 131 adds `retry_count` column.
**Status is NOT closed until:**
- Migration 131 is applied and confirmed in production (verify `retry_count` column exists).
- Vercel Cron entry (`*/2 * * * *` → `/api/internal/job-worker`) is confirmed active and receiving calls with a valid `WORKER_SECRET` header.
- At least one stuck job smoke-test passes end-to-end (insert old pending row, confirm worker transitions it to `failed` within one cron cycle).
**Resolution target**: Sprint 6 Week 3 — blocked on migration 131 deployment and cron registration.

---

## ISSUE-002 — Admin client used for matters INSERT in create-jr-matter

**Severity**: P2 (medium)
**Status**: Open
**Component**: `POST /api/matters/create-jr-matter` (or equivalent JR matter creation route)
**Description**: The JR matter creation route uses `createAdminClient()` (service
role key) to perform the `INSERT` on the `matters` table. This is a workaround
for a PostgREST limitation: RLS policies with `RETURNING` clauses cannot be
satisfied by the authenticated client in certain upsert scenarios.
**Impact**: Tenant isolation is not enforced at the database layer for this
specific INSERT — it is enforced at the application layer by explicitly setting
`tenant_id` from the authenticated session. A bug in the application code could
theoretically write a row to the wrong tenant. No current exploit path is known.
**Mitigation**: Application-layer enforcement: `tenant_id` is always set from
`auth.tenantId` (derived from the JWT), not from the request body. Code review
required for any change to this route.
**Resolution**: Investigate PostgREST RLS + RETURNING workaround. Possible fix:
use a database function (SECURITY DEFINER) that validates tenant context before
inserting, removing the need for service-role access.

---

## ISSUE-003 — Python sidecar not production-ready (dev PDF output only)

**Severity**: P1 (high)
**Status**: Open
**Component**: `worker/sidecar.py` / Python sidecar service
**Description**: The Python sidecar (`worker/sidecar.py`) generates minimal
placeholder PDFs for development. It does not produce real IRCC XFA-format
forms (IMM5257E, IMM1294E, etc.). Field mapping from matter data to IRCC form
fields is not implemented.
**Impact**: Any form generated in production via `POST /api/matters/[id]/generate-form`
will produce a placeholder PDF, not a compliant IRCC form. This makes the
feature non-functional for real client submissions.
**Mitigation**: Feature is gated by `PYTHON_SIDECAR_URL` environment variable.
If not configured, jobs stay in `pending` state and no placeholder PDF is
generated. Do not configure `PYTHON_SIDECAR_URL` in production until the sidecar
produces compliant output.
**Resolution**: Full sidecar implementation required: XFA form rendering library
integration, field mapping engine, IRCC form template library. Estimated effort:
significant. Must be completed before form generation is exposed to clients.

---

## ISSUE-004 — Generated PDF output_path is a local filesystem path, not Supabase Storage URL

**Severity**: P1 (high)
**Status**: Open
**Component**: `form_generation_log.output_path` / Python sidecar / `POST /api/internal/form-generation-callback`
**Description**: The `output_path` column in `form_generation_log` is populated
by the Python sidecar callback. The current sidecar implementation writes the
generated PDF to a local `/tmp/` path and sends that local path as `output_path`.
This path is not accessible from Next.js serverless functions or any other service.
**Impact**: Even when the sidecar reports `status='completed'`, the `output_path`
value is not a retrievable URL. The PDF cannot be downloaded or displayed to users.
Paths like `/tmp/job-abc123.pdf` are ephemeral and disappear on sidecar restart.
**Mitigation**: None currently. The field is stored but not used in any UI flow.
**Resolution**: Sidecar must upload the generated PDF to Supabase Storage and
send the Supabase Storage path (e.g., `tenant-id/forms/job-id.pdf`) as
`output_path`. Next.js can then generate a signed URL from this path for
client download. This requires Supabase Storage credentials in the sidecar
environment.

---

## ISSUE-005 — Worker secret falls back to 'dev-secret' if WORKER_SECRET not set

**Severity**: P0 (blocker) — in production; P3 (low) — in development
**Status**: Resolved — code fix applied 2026-03-17 (Release Gate B2 closed)
**Component**: `worker/sidecar.py` / `GET /api/internal/job-worker` / `POST /api/internal/form-generation-callback`
**Description**: The Python sidecar contains a hardcoded fallback value `'dev-secret'`
for `WORKER_SECRET` when the environment variable is not set (pattern:
`WORKER_SECRET or 'dev-secret'`). This is a code-level defect, not merely an
environment configuration issue. Even if `WORKER_SECRET` is set in the Next.js
environment, the sidecar can silently authenticate with `'dev-secret'` if its
own environment is misconfigured. The fallback is in the public source code,
making it trivially discoverable.
**Impact**: If `WORKER_SECRET` is not set in the sidecar's deployment environment,
any caller who knows the URL and the literal string `'dev-secret'` can trigger
callbacks that mark jobs completed or failed with arbitrary output paths. The
`form-generation-callback` endpoint uses `createAdminClient()` and performs
privileged DB writes.
**What "Mitigated" status previously claimed** (incorrect): "Closed by setting
`WORKER_SECRET` in production environment." This was wrong because setting the
env var in Next.js does not prevent the sidecar from using its own `'dev-secret'`
fallback if the sidecar's env is misconfigured. The issue is bilateral.
**Required fix (code-level, not config-level)**:
1. `worker/sidecar.py`: Remove `or 'dev-secret'` fallback. Assert `WORKER_SECRET`
   is non-empty at startup; raise `RuntimeError` and refuse to start if unset.
2. All references to `WORKER_SECRET` in the sidecar must use the env value
   directly with no fallback.
3. The X-Job-ID implicit auth bypass (sidecar accepts requests without
   X-Worker-Key if X-Job-ID is present) must also be fixed: require X-Worker-Key
   on all protected endpoints when WORKER_SECRET is set.
**Resolution applied 2026-03-17**:
1. Startup assertion added: `if not WORKER_SECRET: raise RuntimeError(...)` — sidecar refuses to start if env var is missing or empty.
2. `_send_callback` now uses `WORKER_SECRET` directly with no fallback string.
3. Auth middleware hardened: `X-Job-ID` no longer grants implicit auth. All POST requests must supply a valid `X-Worker-Key` when `WORKER_SECRET` is set. Missing key = `''` ≠ `WORKER_SECRET` → 401.
4. Confirmed: string `'dev-secret'` does not appear anywhere in `sidecar.py`.
**Remaining operator action**: Confirm `WORKER_SECRET` is set in the sidecar deployment environment (same value as Netlify `WORKER_SECRET`). Smoke-test: restart sidecar without `WORKER_SECRET` set and confirm it refuses to start.

---

## ISSUE-006 — form_generation_log missing retry_count column

**Severity**: P2 (medium)
**Status**: Open — resolved by migration 131
**Component**: `form_generation_log` table / `GET /api/internal/job-worker`
**Description**: The `form_generation_log` table created in migration 130 does
not include a `retry_count` column. The job-worker route (`GET /api/internal/job-worker`)
references `retry_count` in its retry-dispatch query (`.lt('retry_count', 3)`)
and its update payload. Without this column the query will fail or silently
return no results.
**Impact**: The job-worker retry loop cannot enforce the `retry_count < 3` guard.
Without `retry_count`, the worker may re-dispatch the same job indefinitely.
The `.lt('retry_count', 3)` filter on a non-existent column returns a PostgREST
error, preventing any retries.
**Mitigation**: Migration 131 (Week 3) adds `retry_count INTEGER NOT NULL DEFAULT 0`
to `form_generation_log`. Deploy migration 131 before enabling the job-worker cron.
**Resolution**: Apply migration 131. Verify the column exists via Supabase
dashboard before registering the cron job.

---

## ISSUE-007 — Matter closure trust balance check does not handle partial reconciliations

**Severity**: P2 (medium)
**Status**: Deferred
**Component**: `POST /api/matters/[id]/close` — trust reconciliation guard
**Description**: The closure guard performs a simple debit/credit balance check:
it sums all `trust_transactions` for the matter and blocks closure if the net
balance is non-zero. This does not account for partial reconciliations, escrow
arrangements, or retainers that are intentionally left open at closure (e.g.,
a retainer partially consumed with a planned refund).
**Impact**: Matters with legitimately open trust positions cannot be closed
without first manually zeroing the trust balance, even when the firm has
reconciled the matter according to its own accounting rules. This may cause
friction for common real-world scenarios.
**Mitigation**: The guard can be temporarily bypassed by an Admin manually
adjusting trust_transactions to zero the balance before closure. The `closed_reason`
field (min 30 chars) provides an audit trail for the rationale.
**Resolution**: Deferred to post-Sprint 6. Proposed enhancement: add an
`override_trust_check` boolean (Admin-only) that allows closure with a documented
reason when trust is not zeroed. Requires legal/compliance sign-off before
implementation.
