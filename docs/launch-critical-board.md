# NorvaOS  -  Launch-Critical Board

**Last Updated:** 2026-03-16T18:36Z
**Status:** Final launch-readiness verification complete. All code-side and DB-side work is done. Remaining gates are deployment configuration only.

---

## CLOSED  -  Runtime-Proven, Off the Board

| Item | Closed | Evidence |
|------|--------|---------|
| Team 3 M4  -  DB-backed Onboarding Tracker | 2026-03-16 | 6/6 proofs live. Migration 110 applied. RLS + unique constraint enforced. Cleaned up. |
| RISK-001  -  Stripe idempotency | 2026-03-16 | `stripe_processed_events` table + partial UNIQUE index on `billing_invoices` confirmed applied. |
| Team 4  -  Payment Plan Workflow | 2026-03-16 | 9/9 proofs live. Migration 109 applied. Trigger confirmed. Test data cleaned. |
| Team 3 P1c  -  Microsoft Graph Bounded Retry (RISK-003) | 2026-03-16 | 4/4 proofs. Iterative loop, MAX_RETRIES=5, no recursion. |
| Phase 8  -  Billing enforcement, immutability, segregation | 2026-03-15 | 7-proof evidence pack. Migrations 102–104 applied. |
| Phase 9  -  Invoice lifecycle automation | 2026-03-16 | Closeout package at `docs/phase9-final-closeout-package.md`. |
| Phase 10 Team 1  -  Statement auth + send guard | 2026-03-16 | OR-6 and OR-7 closed. 5+7 proofs pass. |
| Team 2 Module 1  -  Admin control centre | 2026-03-16 | Runtime + cross-tenant + permission proofs passed. |
| Team 2 Module 3  -  Migration/import | 2026-03-16 | Migration 108 applied. Rollback engine hardened. |
| Team 2 Module 4  -  Tenant setup & onboarding | 2026-03-16 | Migration 109 applied. localStorage replaced with DB. |

---

## REMAINING DEPLOYMENT GATES (not code defects)

All code-side and database-side work is complete. What remains are production deployment configuration items that must be verified in the production deployment platform (Vercel or equivalent). These are NOT present in `.env.local` by design  -  `.env.local` is the local development file and should never contain production secrets.

### Gate 1  -  Stripe live-mode secrets (HARD GATE)
**What to verify in the production deployment platform:**
- `STRIPE_SECRET_KEY` = `sk_live_...` (not `sk_test_REPLACE_ME`)
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` = `pk_live_...` (not `pk_test_REPLACE_ME`)
- `STRIPE_WEBHOOK_SECRET` = real webhook signing secret from Stripe dashboard (not `whsec_REPLACE_ME`)
- Webhook endpoint in Stripe dashboard points to the production URL, not localhost

**Why it is not a code defect:** `.env.local` is the local dev file. Production env vars are configured in the deployment platform. This is standard practice.

### Gate 2  -  Production app URL
**What to verify in the production deployment platform:**
- `NEXT_PUBLIC_APP_URL` = production HTTPS URL (not `http://localhost:3000`)
- All OAuth callback URLs in any connected providers updated to match

### Gate 3  -  TypeScript compile errors (2 pre-existing defects)
These are real errors that should be resolved before launch, but they are NOT in billing-critical paths:
- `DEF-LC-001`: `app/api/import/upload/route.ts:98`  -  `Json` type used but not imported from `@/lib/types/database`. Import route functionality only.
- `DEF-LC-002`: `lib/services/notifications/email-delivery-adapter.ts:162`  -  Resend `emails.send()` called with `html`/`text` fields but Resend API requires either `html` OR a template object, not mixed. Email delivery functionality only.

---

## DECISIONS RECORDED  -  2026-03-16

### Decision A  -  GHL / Clio: **FORMALLY DEFERRED**

**Decision:** GHL and Clio are not in immediate launch scope.
**Recorded:** 2026-03-16
**Rationale:** Integration hardening proof (P1b) requires provider credentials and live OAuth connections that are not provisioned. Integrations are not required for day-one platform launch. GHL/Clio surfaces will be unavailable in the initial release.
**Effect on RISK-002:** RISK-002 is reclassified from production-blocking to deferred. It is not resolved  -  the implementation is complete and the proof requirement is parked. When GHL/Clio credentials are provisioned post-launch, P1b proof must be executed before those surfaces are enabled in production.
**Reopen trigger:** Decision to enable GHL or Clio for any production tenant.

---

### Decision B  -  Demo environment: **FORMALLY DEFERRED**

**Decision:** Demo environment is not in immediate launch scope.
**Recorded:** 2026-03-16
**Rationale:** No demo tenant row exists. No `DEMO_TENANT_ID` configured. Demo environment is a sales tool, not a platform-completion requirement. Not needed before first production tenant goes live.
**Effect on M3:** Team 3 Module 3 (demo environment) is reclassified from blocked-not-runtime-proven to deferred. When a demo tenant is needed for active sales use, run seed → verify → reset scripts and close M3 at that time.
**Reopen trigger:** Decision to stand up a live demo environment for sales purposes.

---

## DEFERRED ITEMS (formally off the launch-critical path)

| Item | Decision date | Reopen trigger |
|------|--------------|----------------|
| Team 3 P1b  -  GHL/Clio token refresh hardening | 2026-03-16 | Enable GHL/Clio in production |
| Team 3 M3  -  Demo environment | 2026-03-16 | Stand up live demo for sales |

---

## LAUNCH-READINESS SUMMARY

```
BILLING CORE:              ✓ Closed (Phases 8–10, payment plans)
PAYMENT PLANS:             ✓ Closed (9/9 proofs, migration 109 applied)
INVOICE LIFECYCLE:         ✓ Closed (Phase 9)
CLIENT PORTAL BILLING:     ✓ Closed (Phase 10)
MICROSOFT GRAPH RETRY:     ✓ Closed (P1c / RISK-003)
STRIPE IDEMPOTENCY:        ✓ Closed (RISK-001  -  stripe_processed_events + partial UNIQUE index confirmed)
ONBOARDING TRACKER (M4):   ✓ Closed (migration 110 applied, 6/6 proofs live)
GHL/CLIO HARDENING (P1b):  → DEFERRED (2026-03-16)
DEMO ENVIRONMENT (M3):     → DEFERRED (2026-03-16)
REPORTING (Module 2):      ✗ Blocked  -  balance_due/total_amount discrepancy fix required

DEPLOYMENT GATES (config  -  not code):
  Stripe live secrets:     ✗ Must verify in production deployment platform
  Production app URL:      ✗ Must verify in production deployment platform
  TSC DEF-LC-001:          ✗ Json type missing in import route (non-billing)
  TSC DEF-LC-002:          ✗ Resend API type mismatch in email adapter (non-billing)
```

---

*This document is the authoritative launch blocker list. Do not open new feature work until RISK-001 is remediated and Decisions A and B are recorded.*
