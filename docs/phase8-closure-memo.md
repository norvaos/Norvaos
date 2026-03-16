# Phase 8 — Final Closure Memo

**Date:** 2026-03-15
**Status:** Approved for production
**Approval note:** Operational readiness items (runbook, restore test, observability) were delivered after follow-up request. Future phases must not come for approval before runtime proof, restore proof, and observability proof are ready.

---

## 1. Final Document Index

| Document | Path |
|---|---|
| Production Runbook | `docs/production-runbook.md` |
| Restore Test Evidence | `docs/restore-test-evidence.md` |
| Operational Readiness Package | `docs/operational-readiness-package.md` |
| Phase 8 Evidence Addendum | `docs/phase8-evidence-addendum.md` |
| Phase 8 Supplemental Proof Addendum | `docs/phase8-supplemental-proof-addendum.md` |
| Core Enforcement Spec | `docs/core-enforcement-spec-v1.md` |
| Enforcement Waivers | `docs/enforcement/waivers.md` |
| Sensitive Surfaces Registry | `docs/enforcement/sensitive-surfaces.json` |
| Phase 8 Closure Memo | `docs/phase8-closure-memo.md` |

---

## 2. Final Code and Database Impact Summary

### Migrations Applied to Production

| Migration | Supabase Version | Objects Created |
|---|---|---|
| 102 — Invoice Paid Immutability | 20260315212522 | 2 triggers (`trg_invoices_paid_immutable`, `trg_invoices_paid_no_delete`), 2 functions (`prevent_paid_invoice_mutation`, `prevent_paid_invoice_delete`), 1 function (`prevent_issued_cheque_mutation`), 1 trigger (`trg_cheques_issued_immutable`) |
| 103 — Portal Token Hashing | 20260315212546 | 1 column (`token_hash`), 1 index (`idx_portal_links_token_hash`), 2 columns (`last_rate_limit_hit_at`, `rate_limit_count`), data migration (47 tokens hashed, plaintext redacted) |
| 104 — Segregation of Duties | 20260315212602 | 3 triggers (`trg_disbursement_segregation`, `trg_payment_plan_segregation`, `trg_write_off_segregation`), 3 functions (`enforce_disbursement_segregation`, `enforce_payment_plan_segregation`, `enforce_write_off_segregation`) |

### New Files (9)

| File | Purpose |
|---|---|
| `lib/services/portal-auth.ts` | Shared portal token validation (SHA-256 hash lookup) |
| `scripts/check-schema-drift.mjs` | CI schema drift detection |
| `sentry.client.config.ts` | Sentry client init (10% traces, error replays) |
| `sentry.server.config.ts` | Sentry server init (20% traces) |
| `sentry.edge.config.ts` | Sentry edge runtime init |
| `instrumentation.ts` | Next.js instrumentation hook |
| `scripts/migrations/102-invoice-paid-immutability.sql` | Migration source |
| `scripts/migrations/103-portal-token-hashing.sql` | Migration source |
| `scripts/migrations/104-segregation-of-duties-triggers.sql` | Migration source |

### Modified Files (61)

**Infrastructure and library files (10):**

| File | Change |
|---|---|
| `lib/services/auth.ts` | Added `is_active` check — deactivated users blocked at API level |
| `lib/supabase/middleware.ts` | Added `is_active` check — deactivated users redirected at navigation level |
| `lib/services/require-role.ts` | RBAC enforcement helper |
| `lib/queries/portal-links.ts` | Token creation now hashes via Web Crypto, stores `token_hash`, redacts plaintext |
| `lib/queries/trust-accounting.ts` | Fixed `useTrustReport` enabled guard (`!!params.trustAccountId` added) |
| `lib/monitoring/error-reporter.ts` | Wired to `Sentry.captureException()` and `Sentry.captureMessage()` |
| `components/workplace/quick-access-rail.tsx` | Added Trust tab to `RAIL_ITEMS` |
| `next.config.ts` | Wrapped with `withSentryConfig()`, added Sentry CSP `connect-src` |
| `.github/workflows/ci.yml` | Added type-check and schema drift CI steps |
| `.env.example` | Added 4 Sentry environment variables |

**Error boundaries wired to `reportError()` (4):**

| File |
|---|
| `app/global-error.tsx` |
| `app/(dashboard)/error.tsx` |
| `app/(dashboard)/matters/[id]/error.tsx` |
| `app/(dashboard)/leads/[id]/error.tsx` |

**Portal routes converted to `validatePortalToken()` (22):**

All routes under `app/api/portal/[token]/` — billing (2), booking, calendar, client-upload, events, ircc-forms (3), ircc-questionnaire (2), messages, questionnaire-edit-request, questionnaire, shared-documents, slot-upload, statement, summary, tasks, timeline, trust, upload.

**API routes with RBAC added in Phase 8 (25):**

| Route Group | Count | Permission | Routes |
|---|---|---|---|
| E-sign | 9 | `documents:view` / `documents:edit` | cancel, remind, requests (CRUD), requests/[id]/document, requests/[id]/signed, resend, send-retainer, send |
| Email | 7 | `communications:view` / `communications:edit` | accounts, send, sync, threads, threads/[threadId], threads/[threadId]/associate, unmatched |
| Document view | 1 | `documents:view` | documents/view |
| Matter document-request | 1 | `matters:edit` | matters/[id]/document-request |
| Matter access | 1 | `matters:view` | matters/[id]/access |
| Settings signature | 1 | `settings:view` / `settings:edit` | settings/signature |
| Retainer | 3 | `leads:view` / `leads:edit` | mark-paper-signed, preview-pdf, retry-conversion |
| Admin KPI | 2 | `settings:view` | front-desk-kpis, front-desk-kpis/export |

1 route audited and exempted: `push-subscribe` (self-service, no elevated permission required).

**Total files touched:** 70 (9 new + 61 modified)

### Database Object Totals (Post-Phase 8)

| Object | Count |
|---|---|
| Tables | 212 |
| Triggers | 112 |
| Indexes | 820 |
| FK Constraints | 700 |
| Functions | 87 |
| Total rows | 11,872 |
| Database size | 42 MB |
| RLS-enabled tables | 209 / 212 |

**RLS exceptions (3):**

| Table | Reason |
|---|---|
| `common_field_registry` | Shared reference data for IRCC form field mapping. No `tenant_id` column. Not tenant-scoped. |
| `plan_features` | SaaS plan feature definitions. Global configuration, not tenant-scoped. |
| `waitlist` | Public waitlist signups. Pre-authentication, no tenant context. |

---

## 3. Deployment Checklist

### Pre-Deploy

- [ ] Verify all environment variables in Vercel match `.env.example`
- [ ] Confirm `NEXT_PUBLIC_SENTRY_DSN` is set (or intentionally blank)
- [ ] Confirm `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN` are set (or intentionally blank)
- [ ] Verify migrations 102, 103, 104 are applied (completed 2026-03-15)
- [ ] Take pre-deploy database snapshot: `pg_dump --format=custom`

### Deploy

- [ ] Push to `main` branch (triggers CI: lint → type-check → schema drift → build)
- [ ] CI passes all stages including type-check and schema drift
- [ ] Vercel preview deployment passes smoke test
- [ ] Promote to production

### Post-Deploy

- [ ] Execute post-deploy validation checklist (Section 4)
- [ ] Verify Sentry receiving events (if DSN configured)
- [ ] Monitor Vercel function logs for 15 minutes — no unhandled errors

---

## 4. Post-Deploy Validation Checklist

### Authentication and Authorization

- [ ] Login as Admin user — dashboard loads
- [ ] Login as non-Admin user — restricted routes return 403
- [ ] Deactivated user cannot access any API route or navigate past middleware

### Trust Tab

- [ ] Open any matter — Trust tab visible in QuickAccessRail
- [ ] Trust tab opens TrustPanel in RightDrawer

### Portal

- [ ] Create new portal link — token stored as `REDACTED`, `token_hash` populated
- [ ] Access portal via valid token — loads correctly
- [ ] Access portal via invalid token — returns 404

### Immutability

- [ ] Create invoice, mark paid, attempt edit via UI — blocked
- [ ] Audit logs page — no edit/delete controls exposed

### API Health

- [ ] `GET /api/health` returns 200
- [ ] Response headers present: `X-Response-Time`, `X-Request-Id`

### Error Reporting

- [ ] Trigger client error — appears in Sentry (if DSN configured)
- [ ] Check Vercel logs — structured JSON format with `tenant_id`

---

## 5. Carry-Forward Items

| # | Item | Type | Notes |
|---|---|---|---|
| 1 | Email live-validation (3 scenarios) | Deferred | Blocked on Azure App Registration + admin consent. Code-side done. |
| 2 | Schema types not DB-generated | Limitation | CI drift check reduces risk. Full generation (e.g. `supabase gen types`) recommended. Not eliminated. |
| 3 | Bank feed integration | Future phase | Boundary structures in place. Not implemented. |
| 4 | QuickBooks integration | Future phase | Boundary structures in place. Not implemented. |
| 5 | Redis cache | Recommended | Auth hits DB on every request without Redis. Acceptable at current scale. |
| 6 | Sentry DSN activation | Configuration | Code deployed and ready. Requires Sentry project creation and DSN config in Vercel. |
| 7 | Full binary restore test | Recommended | Phase 8 restore test verified all database objects (212 tables, 112 triggers, 820 indexes, 700 FK constraints) and executed live trigger functional tests. A full `pg_dump` / `pg_restore` cycle into a separate instance was not executed. Recommended before onboarding external clients. |

### Process Carry-Forward

Future phases must include in their initial approval submission — not as follow-up:

- Runtime proof (live trigger tests, live API denial tests)
- Restore proof (database object inventory, trigger functional verification)
- Observability proof (monitoring integration confirmed)

---

**Phase 8: CLOSED**
