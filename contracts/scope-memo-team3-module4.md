# Scope Memo — Team 3 / Module 4
## Support and Implementation Tooling

**Date:** 2026-03-16
**Status:** Delivered
**Deployment impact:** Additive only — new files, new routes; no existing files modified

---

## Files Created

| File | Purpose |
|------|---------|
| `lib/services/support/health-service.ts` | System health checks scoped to tenantId (database, email, job queue) |
| `lib/services/support/onboarding-tracker.ts` | File-based onboarding phase tracker (no DB migration) |
| `app/api/support/health/route.ts` | GET endpoint — returns health status; requires `settings:view` permission |
| `app/api/support/issue/route.ts` | POST endpoint — issue intake; logs to Sentry; requires `settings:view` permission |
| `app/(dashboard)/settings/support/page.tsx` | Support dashboard UI — health indicators, job queue status, issue form link |
| `app/(dashboard)/settings/support/issue/page.tsx` | Issue intake form UI — title, description, area, severity |
| `docs/support/implementation-checklist.md` | 7-phase onboarding checklist for implementation team |
| `scripts/support/verify-environment.ts` | CLI health check script — 6 checks, exits 1 on FAIL |

**Total new files:** 8

---

## Files Modified

**None.** All changes are additive.

---

## New API Routes

| Route | Method | Auth Required | Permission |
|-------|--------|--------------|------------|
| `/api/support/health` | GET | Yes | `settings:view` |
| `/api/support/issue` | POST | Yes | `settings:view` |

Both routes use the existing `authenticateRequest()` + `requirePermission()` pattern. Unauthenticated or unauthorised requests receive 401/403 — no internal data is exposed.

---

## Schema Changes

**None.** Onboarding tracker uses file-based storage at `data/onboarding/{tenantId}.json`. No new tables, no migrations.

---

## Permission Changes

**None.** Existing `settings:view` permission is reused. No new roles, no new permission names.

---

## What This Module Does NOT Touch

- Core monitoring architecture (Sentry setup, Vercel Logs)
- Any existing settings pages
- Billing, trust, or matter logic
- Auth setup or RLS policies
- Release process or CI/CD
- Any existing API routes

---

## Proof Plan

### 1. Support team access rules proven
- Call `GET /api/support/health` without auth cookie → expect 401
- Call `GET /api/support/health` as a user without `settings:view` → expect 403
- Call `GET /api/support/health` as an admin → expect 200 with health data

### 2. Issue tracking flow proven
- Submit issue form with valid data → expect `{ received: true, reference: "ISS-xxx" }`
- Check Sentry for captured message with `tenant_id` tag and full description
- Check server log for `support.issue.received` line — confirm description is NOT in log (Sentry only)

### 3. Health indicators reflect actual service state
- Pause email integration → reload support dashboard → email badge shows "Disconnected"
- Create 10 stalled jobs (pending > 1 hour) → job queue badge shows "Down"
- Restore → badges return to "Healthy"

### 4. Unsafe actions blocked or logged
- All health endpoint calls are logged with `tenant_id` and `user_id`
- No stack traces or internal error messages are exposed in API responses
- Issue description content never appears in console logs — only in Sentry

### 5. Environment verification catches real misconfiguration
- Unset `NEXT_PUBLIC_SUPABASE_ANON_KEY` → `verify-environment.ts` exits 1 with FAIL
- Remove email integration → script shows WARN
- All checks PASS on a correctly configured environment

---

## Acceptance Criteria

- [x] Health endpoint requires authentication — unauthenticated requests receive 401
- [x] Health endpoint requires `settings:view` permission — unauthorised users receive 403
- [x] Health indicators (database, email, job queue) reflect actual service state — not hardcoded
- [x] Issue form captures to Sentry with full context including tenant and user
- [x] Issue description content is NOT logged to console — Sentry only
- [x] All health check calls logged with `tenant_id` and `user_id`
- [x] Support dashboard does not expose raw error messages or stack traces to users
- [x] Environment verification script exits 1 on FAIL, 0 on PASS/WARN
- [x] Onboarding tracker is file-based — no schema migration required
- [x] Implementation checklist covers all 7 phases

---

## Known Limitations

1. **Onboarding tracker is file-based**: JSON files at `data/onboarding/` work for single-instance deployments. Serverless or multi-instance environments need a shared store (database or Redis). Marked as future work.
2. **Health checks use service role key**: `health-service.ts` creates its own Supabase client with the service role key. If the key is not set in the server environment, health checks will fail gracefully (return 'degraded').
3. **No onboarding tracker UI**: The onboarding tracker service exists but has no admin UI. Status updates must be made via code or direct file edits. UI is a future task.
4. **Support dashboard not linked in sidebar**: The `/settings/support` route exists but must be manually added to the settings sidebar navigation. That navigation file modification was out of scope for this module.
5. **Issue intake goes to Sentry only**: There is no ticketing system integration (Linear, Jira, etc.). That extension was out of scope.
6. **verify-environment.ts requires ts-node**: The script uses `ts-node`. If not available, install with `pnpm add -D ts-node`.
