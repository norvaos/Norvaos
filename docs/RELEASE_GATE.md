# Release Gate — Sprint 6
**Date**: 2026-03-17 (updated 2026-03-17 after Week 3 blocker closure)
**Sprint**: Sprint 6 (Week 1 + Week 2)
**Release manager**: Zia Waseer
**Determination**: CONDITIONAL GO — all 6 blockers resolved at code level; one operator action outstanding (B3: GitHub Actions green run requires a PR push; local 312/312 tests pass, TSC 0 errors confirmed).

---

## 1. Gate Criteria and Status

| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
| G1 | All Sprint 6 routes return correct HTTP status codes | PASS | Live curl proofs, 2026-03-17 |
| G2 | E2E form generation (Next.js → sidecar → callback → DB) | PASS | Job 52b42477 completed, page_count=1 |
| G3 | Failure-path degradation (sidecar down → 202, job pending) | PASS | Job 993db8d7 stays pending, ECONNREFUSED caught |
| G4 | RLS migrations applied (128, 130) | PASS | Confirmed in Supabase ca-central-1 |
| G5 | Matter-scoped access inviolable | PASS | Cross-tenant attempt returns 404 |
| G6 | Idempotency on form generation | PASS | Same generation_key returns idempotent:true |
| G7 | CI runs Sprint 6 tests on every PR | PARTIAL — operator action required | `ci.yml` updated with Sprint 6 test step. Local run: 312 tests / 16 files — all pass. TSC 0 errors. Green GitHub Actions badge requires one PR push; cannot be automated without repo access. |
| G8 | Migration rollback plans documented | PASS | `scripts/migrations/ROLLBACK.md` + individual `.rollback.sql` files written for migrations 128, 129, 130. |
| G9 | Background job retry/timeout | PASS | Worker at `GET /api/internal/job-worker` deployed. Migration 131 applied to Supabase ca-central-1 (`retry_count` column confirmed). Live DB proof: timeout → `failed` (3 jobs), retry `retry_count` 0→1, ceiling (`retry_count=3`) correctly excluded from retry. `vercel.json` cron `*/2 * * * *` registered. |
| G10 | Security sweep complete | PASS | All Red findings remediated: B2 (sidecar fallback removed, startup assertion added), B5 (rate limiting applied to both public submit routes), B6 (13 cron routes hardened to fail-closed). Amber findings documented with Sprint 7 owners. Full report: `docs/SECURITY_SWEEP.md`. |

---

## 2. Blocker Resolution Record

All 6 blockers are resolved at code/DB level. One operator action (B3 GitHub Actions green run) cannot be completed without a PR push and is documented as a condition of CONDITIONAL GO.

### B1 — Background job reliability ✅ RESOLVED 2026-03-17
**Resolution**: `GET /api/internal/job-worker` route deployed. Migration 131 applied to Supabase ca-central-1 — `retry_count INTEGER NOT NULL DEFAULT 0` confirmed present. `vercel.json` cron `*/2 * * * *` registered. Manual retry endpoint and admin stuck-jobs endpoint built. Live DB proof run: timeout logic transitioned 3 stale pending jobs to `failed`; retry logic incremented `retry_count` 0→1 for a 5-minute-old job; ceiling enforcement confirmed `retry_count=3` job excluded from retry step (count=0 rows affected). Tests: 40+ assertions in `lib/services/__tests__/job-reliability.test.ts` — all pass.
**Remaining operator action**: Register Vercel Cron in production dashboard; confirm `WORKER_SECRET` header is configured for cron invocation.

### B2 — WORKER_SECRET hardcoded fallback ✅ RESOLVED 2026-03-17
**Resolution**: `worker/sidecar.py` fixed — three changes applied:
1. Startup `RuntimeError` if `WORKER_SECRET` is empty — process refuses to start before FastAPI app initialises.
2. `_send_callback` uses `WORKER_SECRET` directly — no `or 'dev-secret'` or any fallback string.
3. Auth middleware hardened — `X-Job-ID` bypass path removed; all POST requests must supply a correct `X-Worker-Key`; missing key → 401.
Confirmed: string `'dev-secret'` does not appear anywhere in `sidecar.py`.
**Remaining operator action**: Set `WORKER_SECRET` to a cryptographically random value (≥32 chars) in the sidecar deployment environment. Confirm value matches Netlify `WORKER_SECRET`.

### B3 — CI green confirmation ⚠️ OPERATOR ACTION REQUIRED
**Resolution (code side complete)**: `ci.yml` updated — Sprint 6 test step added (`pnpm exec vitest run --reporter=verbose lib/services/__tests__/`), type-check step added (`pnpm exec tsc --noEmit`). Local validation: 312 tests / 16 files all pass; TSC 0 errors.
**Remaining action**: Push a PR to the repository. GitHub Actions must execute and return green on the enforcement-gate and build jobs. This is the only blocker that requires an external action (repo push) and cannot be completed in the local environment. This condition must be satisfied before the production freeze is lifted.

### B4 — Migration rollback plans ✅ RESOLVED 2026-03-17
**Resolution**: Rollback scripts written:
- `scripts/migrations/128-read-model-rls.rollback.sql`
- `scripts/migrations/129-refusal-closure-submission.rollback.sql`
- `scripts/migrations/130-form-generation-log.rollback.sql`
- `scripts/migrations/ROLLBACK.md` — rollback order, preconditions, verification queries.

### B5 — Public submit routes rate limiting ✅ RESOLVED 2026-03-17
**Resolution**: `createRateLimiter({ maxRequests: 10, windowMs: 60_000 })` applied to both routes using the pre-existing `lib/middleware/rate-limit.ts` sliding-window implementation. Rate limit check executes before any DB access. 429 returned with `{ error: 'Rate limit exceeded. Please wait before submitting again.' }`. TSC 0 errors confirmed.

### B6 — Cron routes fail-open ✅ RESOLVED 2026-03-17
**Resolution**: 13 route files hardened — fail-open pattern `if (cronSecret) { check }` replaced with fail-closed pattern `if (!cronSecret) return 500`. Files changed: 12 standard cron routes + `app/api/sla/check-breaches/route.ts` (module-scope `?? ''` variant). `job-worker` route was already fail-closed (no change). Zero grep hits for `if (cronSecret)` remaining in `app/api/`. TSC 0 errors confirmed.

---

## 3. Accepted Residual Risks

### AR-001 — create-jr-matter uses admin client for INSERT
**Risk**: `create-jr-matter` route bypasses RLS on the INSERT into `matters` by using `createAdminClient()`. If the application-level role check (Lawyer/Admin only) is bypassed due to a future auth misconfiguration, a lower-privileged user could create matter records.
**Likelihood**: Low
**Impact**: Medium — a Paralegal or Billing user could create a JR matter record, which is a data integrity issue but not a data exfiltration risk.
**Why accepted**: This is a documented workaround for a confirmed PostgREST limitation: `INSERT ... RETURNING` applies RLS to the RETURNING clause before any `matter_access` record exists for the new row, causing a false 404. The application-level auth check is present and tested. A future fix (e.g., a Postgres function with SECURITY DEFINER) is the correct remediation and is scoped to Sprint 7.
**Owner**: Zia Waseer — to be resolved in Sprint 7 with a SECURITY DEFINER RPC function.

### AR-002 — PDF output stored in /tmp on the sidecar host
**Risk**: Generated PDFs are written to `/tmp/norvaos-forms/<job_id>.pdf` on the sidecar host. This path is ephemeral on serverless or containerised deployments (e.g., Fly.io, Railway, or any platform with ephemeral filesystems). If the sidecar restarts, the file is lost. The `output_path` in `form_generation_log` points to a local filesystem path, not Supabase Storage.
**Likelihood**: High (on any platform with ephemeral storage)
**Impact**: Medium — generated PDFs are lost on sidecar restart; the job record shows `completed` but the file is not accessible.
**Why accepted**: The sidecar is dev-mode only for Sprint 6. The `generate_pdf_dev` function explicitly documents this limitation. Beta users are not expected to retrieve generated PDFs as downloadable assets in this sprint. The production path (pikepdf + Supabase Storage) is deferred to Sprint 7.
**Owner**: Zia Waseer — Sprint 7 storage integration required before any end-user PDF download feature is exposed.

### AR-003 — No UI for form generation status
**Risk**: The `form_generation_log` table is populated via the API, but there is no UI component showing form generation job status (pending / processing / completed / failed) to the user.
**Likelihood**: N/A (missing feature, not a probabilistic risk)
**Impact**: Low — power users or staff can query the job status via the API, but there is no self-service visibility for non-technical users.
**Why accepted**: The API is the primary deliverable for Sprint 6. UI work is backlogged for a future sprint when the full form generation user flow is designed.
**Owner**: Zia Waseer — Sprint 7 or 8.

### AR-004 — Sidecar auth middleware accepts X-Job-ID as implicit authorisation
**Risk**: The sidecar auth middleware (sidecar.py lines 59–72) accepts a POST with a valid `X-Job-ID` header without validating `X-Worker-Key` when `WORKER_SECRET` is set. The logic only rejects if `worker_key` is provided AND does not match — meaning a request with only `X-Job-ID` (no `X-Worker-Key`) passes through unchallenged.
**Likelihood**: Low — the sidecar should not be internet-accessible; it is intended to be an internal service reachable only from the Next.js host.
**Impact**: Medium — if the sidecar is inadvertently exposed (e.g., misconfigured reverse proxy), any caller who knows a valid job UUID could trigger a generation job.
**Why accepted**: The sidecar is not deployed to a public URL in beta. Network-level isolation (private VPC or localhost) is the primary control. This auth weakness must be hardened before the sidecar is deployed to any internet-accessible endpoint.
**Owner**: Zia Waseer — review before Sprint 7 sidecar deployment.

---

## 4. Non-Accepted Risks (must mitigate before GO)

### NAR-001 — WORKER_SECRET hardcoded fallback to 'dev-secret' (maps to Blocker B2)
**Risk**: sidecar.py `_send_callback` uses `WORKER_SECRET or 'dev-secret'`. In a production environment where `WORKER_SECRET` is not set in the sidecar's env, all callbacks authenticate with the literal string `dev-secret`. If `WORKER_SECRET` is also set to `dev-secret` in the Next.js environment (operator error), the security control is entirely nullified.
**Why not accepted**: This is a direct authentication bypass risk on the internal callback endpoint. The `form-generation-callback` route uses admin-level Supabase access to update job records. An attacker who can reach the callback endpoint and knows the `dev-secret` fallback (it is in the public source code) can mark any job as completed or failed.
**Mitigation required**: Sidecar must assert `WORKER_SECRET` is non-empty at startup. Netlify `WORKER_SECRET` must be set to a cryptographically random value (minimum 32 chars). Sidecar deployment must confirm the same secret is in its environment.

### NAR-003 — Public submit routes have no rate limiting (maps to Blocker B5)
**Risk**: `app/api/forms/[slug]/submit/route.ts` and `app/api/booking/[slug]/submit/route.ts` are fully unauthenticated and use `createAdminClient()` to insert contacts, leads, and submissions. No per-IP or per-slug rate limit exists. An attacker can enumerate valid slugs and flood any tenant with junk records at full network speed.
**Why not accepted**: Unauthenticated write paths with admin-client access and no rate limiting are a data-integrity and availability risk in production. A spam campaign against a booking slug would corrupt the contacts and leads tables.
**Mitigation required**: Add Vercel Edge rate limiting (or a token-bucket middleware) on the `/api/forms/[slug]/submit` and `/api/booking/[slug]/submit` paths before production go-live. Minimum: 10 submissions per IP per minute.

### NAR-004 — Cron routes fail open when CRON_SECRET is unset (maps to Blocker B6)
**Risk**: Cron route guards use the pattern `if (cronSecret) { ...validate... }`. When `CRON_SECRET` env var is not set, `cronSecret` is falsy and the auth check is skipped entirely, allowing unauthenticated triggering of maintenance jobs.
**Why not accepted**: Unprotected cron endpoints can be triggered by any caller who discovers the URL. Depending on what the cron job does (cross-tenant maintenance, batch writes), this is a reliability and integrity risk.
**Mitigation required**: Invert the guard: if `CRON_SECRET` is unset, reject all requests with 500 (misconfigured). Confirm `CRON_SECRET` is set in Netlify production environment.

### NAR-002 — No retry mechanism (maps to Blocker B1)
**Risk**: A sidecar outage during business hours causes all form generation requests to accumulate as `pending` with no automatic recovery. The operator has no alerting, no queue visibility, and no documented remediation procedure.
**Why not accepted**: Unrecoverable job state in a workflow the client depends on (immigration form preparation) is a service reliability failure. The sprint explicitly documented this as a known weak point. It cannot be carried as accepted risk for a production release.
**Mitigation required**: Retry worker + migration 131 + operator runbook section for stuck jobs.

---

## 5. Deferred Items (out of scope for this release)

| Item | Reason deferred | Target sprint |
|------|----------------|---------------|
| Real IRCC XFA form filling (pikepdf / xfa_filler) | Dev PDF (stdlib only) sufficient for beta proof; production requires IRCC template procurement and pikepdf integration | Sprint 7 |
| PDF storage in Supabase Storage | Local /tmp path sufficient for sidecar proof; production requires Supabase Storage integration and signed URL delivery | Sprint 7 |
| Email notifications for form completion | Not in scope for Sprint 6; no email trigger on job status change | Sprint 7 |
| UI component for form generation job status | API is the deliverable; UI design not yet approved | Sprint 7 or 8 |
| parent_matter_id foreign key column on matters | create-jr-matter stores parent link in custom_fields JSONB due to missing column; proper FK column deferred | Sprint 7 |
| SECURITY DEFINER RPC for matter INSERT | Workaround is admin client; proper DB-level solution requires Postgres function | Sprint 7 |
| Sidecar deployment to production infrastructure | Sidecar runs locally for dev proof; production hosting (Fly.io / Railway / internal VPC) not yet provisioned | Sprint 7 |
| Judicial Review matter type seed data | create-jr-matter falls back gracefully (null matter_type_id) when no matching type exists; tenant must seed their own JR matter type | Sprint 7 onboarding |
| Real email OAuth (Microsoft Graph) for native email | Documented as open closure task in Level 1 approval; three email scenarios remain unvalidated | Post-Sprint 7 |

---

## 6. Pre-production Checklist

Items the operator must confirm before lifting the production freeze. Each item requires an observed value, not "I believe it is set."

**Week 3 blockers:**
- [x] Blocker B1 resolved: worker code deployed, migration 131 applied, live DB proof complete (2026-03-17)
- [x] Blocker B2 resolved: sidecar.py startup assertion added, `'dev-secret'` fallback removed, X-Job-ID bypass closed (2026-03-17)
- [ ] **Blocker B3 outstanding**: Push PR → confirm GitHub Actions enforcement-gate green → update this document to GO
- [x] Blocker B4 resolved: rollback scripts for migrations 128, 129, 130 written (2026-03-17)
- [x] Blocker B5 resolved: rate limiting applied to public submit routes (2026-03-17)
- [x] Blocker B6 resolved: 13 cron routes hardened to fail-closed (2026-03-17)

**Environment variables:**
- [ ] `WORKER_SECRET` set in Netlify production environment — value is a cryptographically random string, minimum 32 characters, NOT `dev-secret`
- [ ] `WORKER_SECRET` set in the sidecar deployment environment — same value as Netlify
- [ ] `PYTHON_SIDECAR_URL` set in Netlify environment (or explicitly documented that sidecar is not deployed and all form generation jobs will remain pending — this must be a conscious operator decision, not an oversight)
- [ ] `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` confirmed pointing to production Supabase project (ca-central-1)
- [ ] `NEXTAUTH_URL` (used to construct callback_url in generate-form route) set to `https://sparkly-kelpie-27e16b.netlify.app`

**Migration state:**
- [ ] Migration 128 applied and confirmed: run `SELECT policyname FROM pg_policies WHERE tablename = 'trust_transactions'` — policy `trust_transactions_select` must exist
- [ ] Migration 129 applied and confirmed: run `SELECT column_name FROM information_schema.columns WHERE table_name = 'ircc_correspondence' AND column_name = 'jr_deadline'` — must return one row
- [ ] Migration 130 applied and confirmed: run `SELECT table_name FROM information_schema.tables WHERE table_name = 'form_generation_log'` — must return one row
- [ ] Migration 131 applied and confirmed: `retry_count` and `last_attempted_at` columns present on `form_generation_log`

**Smoke test checklist:**
- [ ] POST /api/matters/{id}/close with a matter that has open deficiencies → returns 422 with `open_deficiencies` blocker
- [ ] POST /api/matters/{id}/close with all guards clear → returns 200 with `closed_at`
- [ ] POST /api/matters/{id}/confirm-submission with `confirmation_number` only → returns 200
- [ ] POST /api/matters/{id}/generate-form → returns 202 with `job_id`
- [ ] Re-POST /api/matters/{id}/generate-form with same `generation_key` → returns 200 with `idempotent: true`
- [ ] POST /api/internal/form-generation-callback without X-Worker-Key → returns 401
- [ ] Cross-tenant matter access attempt → returns 404
- [ ] Confirm retry worker picks up a manually inserted pending job within one cron cycle

**Sign-off:**
- [ ] Release manager (Zia Waseer) has reviewed all checklist items above and confirmed each is green
- [ ] No open P0 or P1 bugs in the defect register dated within 7 days of this review

---

## 7. Release Manager Sign-off

**Determination**: CONDITIONAL GO

**Conditions satisfied (code level)**:
- ✅ B1: Retry worker deployed, migration 131 applied, live DB proof complete.
- ✅ B2: Sidecar `'dev-secret'` fallback removed, startup assertion added, X-Job-ID auth bypass closed.
- ✅ B4: Rollback scripts for migrations 128, 129, 130 written.
- ✅ B5: Rate limiting applied to public form/booking submit routes.
- ✅ B6: All 13 cron routes hardened to fail-closed.
- ✅ G9: Migration 131 applied to Supabase ca-central-1, confirmed.
- ✅ G10: All security sweep Red findings remediated.
- ✅ TSC: 0 errors across entire codebase.
- ✅ Tests: 312/312 pass locally (Sprint 6 + job reliability + all prior suites).

**One condition outstanding before full GO**:
- ⚠️ B3 (G7): GitHub Actions green run. The `ci.yml` workflow is updated and local tests pass, but a live GitHub Actions run must confirm green before the production freeze is lifted. **Action**: Push a PR, wait for Actions to pass, then update this document to GO.

**Operator environment actions required before deployment**:
1. Set `WORKER_SECRET` to a cryptographically random value (≥32 chars) in **both** Netlify and sidecar environments.
2. Set `CRON_SECRET` to a cryptographically random value in Netlify production environment.
3. Confirm `PYTHON_SIDECAR_URL` is either set (sidecar deployed) or explicitly unset with operator acceptance that form generation jobs will stay `pending` until sidecar is deployed.
4. Set `NEXTAUTH_URL=https://sparkly-kelpie-27e16b.netlify.app` in Netlify.
5. Apply migration 131 to any staging environment that mirrors production (already applied to ca-central-1 production).

**Accepted residual risks**: AR-001 through AR-004 as documented in Section 3. No change.

**Non-accepted risks now resolved**: NAR-001 (B2 ✅), NAR-002 (B1 ✅), NAR-003 (B5 ✅), NAR-004 (B6 ✅).

**Production URL**: https://sparkly-kelpie-27e16b.netlify.app

**Production freeze status**: CONDITIONAL — freeze lifts when B3 GitHub Actions green run is confirmed and operator environment actions above are completed. Release manager must update this document to GO before any production deployment.
