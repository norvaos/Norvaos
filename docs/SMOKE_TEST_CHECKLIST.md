# Production Smoke-Test Checklist

Run this checklist after every production deployment. The operator executing
the checklist should be a Lawyer or Admin user with access to the production
Supabase project and the deployed application URL.

Mark each item as it is verified. Do not proceed to the next section if a
previous section has failures  -  escalate immediately.

**Date:** ___________________
**Deployed version:** ___________________
**Operator:** ___________________
**Environment URL:** ___________________

---

## Pre-deployment

- [ ] All CI checks are green on the deploy commit (GitHub Actions → build job = Pass, Sprint 6 tests job = Pass)
- [ ] Migration(s) applied in target environment  -  confirm via Supabase dashboard → Table Editor:
  - [ ] `matter_deficiencies` table exists (Migration 128)
  - [ ] `matter_risk_flags` table exists (Migration 128)
  - [ ] `ircc_correspondence` table has columns `jr_deadline`, `jr_basis`, `urgent_task_id`, `client_notified_at` (Migration 129)
  - [ ] `refusal_actions` table exists (Migration 129)
  - [ ] `form_generation_log` table exists (Migration 130)
  - [ ] `form_generation_log.retry_count` column exists (Migration 131)
- [ ] Environment variables are set in the deployment platform:
  - [ ] `SUPABASE_SERVICE_ROLE_KEY`  -  required for admin operations (create-jr-matter, job-worker)
  - [ ] `WORKER_SECRET`  -  must be a cryptographically random string (min 32 chars); must NOT be `dev-secret`
  - [ ] `PYTHON_SIDECAR_URL`  -  set to the production sidecar base URL, or intentionally unset if sidecar is not deployed
  - [ ] `NEXTAUTH_URL`  -  must be the production application URL (used for sidecar callback URL construction)
  - [ ] `NEXT_PUBLIC_SUPABASE_URL`  -  production Supabase project URL
  - [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY`  -  production Supabase anon key

---

## Auth & access

- [ ] Login as Admin user succeeds (email/password via `/login` page, session cookie set)
- [ ] Login as Lawyer user succeeds (email/password via `/login` page, session cookie set)
- [ ] Unauthenticated `GET /api/matters` returns 401 (verify with `curl -i <URL>/api/matters`  -  no cookie)

---

## Matters

- [ ] Create a new matter: `POST /api/matters` with valid body returns 200 or 201 with a `matter.id`
- [ ] Matters list page (`/matters`) loads without error and displays at least one matter
- [ ] Matter detail page (`/matters/<id>`) loads for an existing matter without error

---

## Sprint 6  -  Submission confirmation

- [ ] `POST /api/matters/<id>/confirm-submission` with body `{"confirmation_number": "IRCC-TEST-123"}` returns 200 with `intake` object
- [ ] Re-calling `POST /api/matters/<id>/confirm-submission` with the same body updates `submission_confirmed_at` (idempotent update, not 409)
- [ ] `POST /api/matters/<id>/confirm-submission` with empty body `{}` returns 422 with error message

---

## Sprint 6  -  Refusal workflow

- [ ] `POST /api/matters/<id>/ircc-correspondence/<corrId>/handle-refusal` with a correspondence item of `item_type='refusal'` and body `{"jr_basis": "inland"}` returns 200 with `jr_deadline` set
- [ ] The returned `jr_deadline` is 15 days after the correspondence `item_date` for `jr_basis='inland'`
- [ ] `POST .../handle-refusal` with `jr_basis='outside_canada'` returns 200 with `jr_deadline` 60 days after `item_date`
- [ ] `POST .../handle-refusal` on a non-refusal correspondence item returns 422 with appropriate error
- [ ] A `refusal_actions` row with `action_type='jr_deadline_set'` exists in the database after the call

---

## Sprint 6  -  Matter closure

- [ ] `POST /api/matters/<id>/close` with missing `closed_reason` returns 422 with `blockers[]` containing `missing_closure_reason`
- [ ] `POST /api/matters/<id>/close` with `closed_reason` shorter than 30 characters returns 422 with `blockers[]`
- [ ] `POST /api/matters/<id>/close` with valid body (≥30 char reason, no open deficiencies, no risk flags, zero trust balance) returns 200 with `closed_at` and `status`
- [ ] After successful closure, `matters.status` is one of `closed_won`, `closed_lost`, or `closed_withdrawn` in the database

---

## Sprint 6  -  Form generation

- [ ] `POST /api/matters/<id>/generate-form` with body `{"form_template_id": "IMM5257E"}` returns 202 with `job_id` and `status: "pending"`
- [ ] A `form_generation_log` row with the returned `job_id` exists in Supabase with `status='pending'`
- [ ] `GET /api/internal/job-worker` with header `X-Worker-Key: <WORKER_SECRET>` returns 200 with `{processed, retried, timed_out}` (Week 3)
- [ ] `POST /api/matters/<id>/form-generation-jobs/<jobId>/retry` with a failed job returns 202 with `status: "pending"` and incremented `retry_count` (Week 3)

---

## Internal endpoints  -  auth guard

- [ ] `GET /api/internal/job-worker` **without** `X-Worker-Key` header returns 401
- [ ] `GET /api/internal/job-worker` with **incorrect** `X-Worker-Key` returns 401
- [ ] `POST /api/internal/form-generation-callback` **without** `X-Worker-Key` header returns 401
- [ ] `POST /api/internal/form-generation-callback` with **incorrect** `X-Worker-Key` returns 401

---

## Python sidecar (only if `PYTHON_SIDECAR_URL` is configured)

- [ ] `GET <PYTHON_SIDECAR_URL>/health` returns `{"status": "ok"}` (HTTP 200)
- [ ] `POST <PYTHON_SIDECAR_URL>/generate-form` with valid payload returns `{"accepted": true}` (HTTP 200 or 202)
- [ ] After a successful sidecar call, the `form_generation_log` row transitions from `pending` → `processing` within ~5 seconds
- [ ] After the sidecar callback completes, the `form_generation_log` row transitions to `completed` with a non-null `output_path`

---

## Data integrity

- [ ] `form_generation_log` table exists with columns: `id`, `tenant_id`, `matter_id`, `form_template_id`, `generation_key`, `status`, `output_path`, `error_message`, `page_count`, `retry_count`, `processing_started_at`, `completed_at`, `requested_by`, `metadata`, `created_at`, `updated_at`
- [ ] `matter_deficiencies` table exists (spot-check: query returns without error)
- [ ] `matter_risk_flags` table exists (spot-check: query returns without error)
- [ ] `refusal_actions` table exists (spot-check: query returns without error)
- [ ] RLS is enabled on `form_generation_log`: a Supabase anon-key request to `form_generation_log` without auth returns zero rows (not an error, but empty result)

---

## Sign-off

**Checklist completed by:** ___________________
**Result:** Pass / Fail
**Failures (if any):** ___________________
**Action taken:** ___________________
