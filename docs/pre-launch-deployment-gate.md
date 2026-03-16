# NorvaOS — Pre-Launch Deployment Gate

**Document type:** Mandatory deployment verification checklist
**Completed by:** Deployment owner (the person with access to the production deployment platform and Stripe dashboard)
**Required before:** Any production traffic is accepted
**Date issued:** 2026-03-16

This checklist has no partial credit. Every item must be confirmed with an exact observed value. "I think it's set" is not confirmation. "Confirmed — value begins sk_live_" is confirmation.

---

## Gate A — Stripe Configuration

### A1 — STRIPE_SECRET_KEY (server-side)

**Where to check:** Production deployment platform → Environment variables

| Check | Required | Observed | Pass/Fail |
|-------|----------|----------|-----------|
| Key is present | Yes | | |
| Key begins with `sk_live_` | Yes | | |
| Key does NOT begin with `sk_test_` | Yes | | |
| Key is NOT `sk_test_REPLACE_ME` | Yes | | |

**Action if fail:** Log in to Stripe dashboard → Developers → API keys → copy the Secret key (live mode). Set it in the deployment platform.

---

### A2 — NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY (client-side)

**Where to check:** Production deployment platform → Environment variables

| Check | Required | Observed | Pass/Fail |
|-------|----------|----------|-----------|
| Key is present | Yes | | |
| Key begins with `pk_live_` | Yes | | |
| Key does NOT begin with `pk_test_` | Yes | | |
| Key is NOT `pk_test_REPLACE_ME` | Yes | | |

**Action if fail:** Stripe dashboard → Developers → API keys → copy the Publishable key (live mode).

---

### A3 — STRIPE_WEBHOOK_SECRET (webhook replay protection)

**Where to check:** Production deployment platform → Environment variables

| Check | Required | Observed | Pass/Fail |
|-------|----------|----------|-----------|
| Value is present | Yes | | |
| Value begins with `whsec_` | Yes | | |
| Value is NOT `whsec_REPLACE_ME` | Yes | | |
| Value length is greater than 32 characters | Yes | | |

**Action if fail:** Stripe dashboard → Developers → Webhooks → select the production endpoint → Signing secret → Reveal. Copy and set in the deployment platform.

**Why this matters:** If `STRIPE_WEBHOOK_SECRET` is the placeholder, the webhook handler will reject every real Stripe event with HTTP 400 ("Invalid signature"). Billing events will not be processed. No invoice will ever be marked paid.

---

### A4 — Stripe Webhook Endpoint URL

**Where to check:** Stripe dashboard → Developers → Webhooks → endpoint list

| Check | Required | Observed | Pass/Fail |
|-------|----------|----------|-----------|
| A webhook endpoint exists | Yes | | |
| Endpoint URL begins with `https://` | Yes | | |
| Endpoint URL contains the production domain (NOT localhost, NOT 127.0.0.1) | Yes | | |
| Endpoint URL path ends with `/api/webhooks/stripe` | Yes | | |
| Events subscribed include `invoice.paid` | Yes | | |
| Events subscribed include `invoice.payment_failed` | Yes | | |
| Events subscribed include `customer.subscription.updated` | Yes | | |

**Action if fail:** Stripe dashboard → Developers → Webhooks → Add endpoint. URL: `https://<your-production-domain>/api/webhooks/stripe`. Select events listed above.

---

## Gate B — Application URL

### B1 — NEXT_PUBLIC_APP_URL

**Where to check:** Production deployment platform → Environment variables

| Check | Required | Observed | Pass/Fail |
|-------|----------|----------|-----------|
| Value is present | Yes | | |
| Value begins with `https://` | Yes | | |
| Value does NOT contain `localhost` | Yes | | |
| Value does NOT contain `127.0.0.1` | Yes | | |
| Value matches the domain where the app is deployed | Yes | | |

**Action if fail:** Set `NEXT_PUBLIC_APP_URL=https://<your-production-domain>` in the deployment platform.

---

## Gate C — Migration Verification in Production Database

All four migrations must be confirmed applied in the production Supabase project.

**Where to check:** Run these queries in the Supabase dashboard SQL editor for the production project (`https://supabase.com/dashboard/project/ztsjvsutlrfisnrwdwfl/sql`).

### C1 — Migration 107 (billing module)

```sql
SELECT
  EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'payment_plans') AS payment_plans_exists,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'invoices' AND column_name = 'total_amount') AS invoices_total_amount_exists,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'invoices' AND column_name = 'amount_paid') AS invoices_amount_paid_exists,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'invoices' AND column_name = 'balance_due') AS invoices_balance_due_exists;
```

**Required result:** All four columns return `true`.

| Check | Required | Observed | Pass/Fail |
|-------|----------|----------|-----------|
| `payment_plans_exists` = true | Yes | | |
| `invoices_total_amount_exists` = true | Yes | | |
| `invoices_amount_paid_exists` = true | Yes | | |
| `invoices_balance_due_exists` = true | Yes | | |

---

### C2 — Migration 108 (Stripe idempotency)

```sql
SELECT
  EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'stripe_processed_events') AS stripe_events_table_exists,
  EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'billing_invoices'
    AND indexname = 'billing_invoices_stripe_invoice_paid_key'
  ) AS partial_unique_index_exists;
```

**Required result:** Both return `true`.

| Check | Required | Observed | Pass/Fail |
|-------|----------|----------|-----------|
| `stripe_events_table_exists` = true | Yes | | |
| `partial_unique_index_exists` = true | Yes | | |

---

### C3 — Migration 109 (payment plan instalments)

```sql
SELECT
  EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'payment_plan_instalments') AS instalments_table_exists,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'payments' AND column_name = 'instalment_id') AS instalment_id_column_exists,
  EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'payment_plan_instalments'
    AND indexdef LIKE '%WHERE%is_active%'
  ) AS partial_unique_active_plan_exists;
```

**Required result:** All three return `true`.

| Check | Required | Observed | Pass/Fail |
|-------|----------|----------|-----------|
| `instalments_table_exists` = true | Yes | | |
| `instalment_id_column_exists` = true | Yes | | |
| `partial_unique_active_plan_exists` = true | Yes | | |

---

### C4 — Migration 110 (tenant onboarding)

```sql
SELECT
  EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'tenant_onboarding') AS table_exists,
  (SELECT relrowsecurity FROM pg_class WHERE relname = 'tenant_onboarding') AS rls_enabled,
  EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'tenant_onboarding'
    AND policyname = 'tenant_onboarding_tenant_isolation'
  ) AS policy_exists,
  EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'tenant_onboarding'
    AND constraint_name = 'tenant_onboarding_tenant_phase_key'
  ) AS unique_constraint_exists;
```

**Required result:** All four return `true`.

| Check | Required | Observed | Pass/Fail |
|-------|----------|----------|-----------|
| `table_exists` = true | Yes | | |
| `rls_enabled` = true | Yes | | |
| `policy_exists` = true | Yes | | |
| `unique_constraint_exists` = true | Yes | | |

---

## Gate D — Final Confirmation

This gate requires the deployment owner to sign off on all preceding gates.

| Gate | Status |
|------|--------|
| A1 — STRIPE_SECRET_KEY live-mode | |
| A2 — NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY live-mode | |
| A3 — STRIPE_WEBHOOK_SECRET real signing secret | |
| A4 — Stripe webhook endpoint → production URL | |
| B1 — NEXT_PUBLIC_APP_URL production HTTPS URL | |
| C1 — Migration 107 applied | |
| C2 — Migration 108 applied | |
| C3 — Migration 109 applied | |
| C4 — Migration 110 applied | |

**Launch is authorised when all 9 rows above show PASS.**

---

## Known Open Items (non-blocking for core billing surfaces)

These two TypeScript defects exist and should be resolved in a follow-on patch. They do not affect billing, payment plans, invoicing, or onboarding.

| ID | File | Line | Defect | Affected surface |
|----|------|------|--------|-----------------|
| DEF-LC-001 | `app/api/import/upload/route.ts` | 98 | `Json` type used but not imported from `@/lib/types/database` | Import/upload functionality |
| DEF-LC-002 | `lib/services/notifications/email-delivery-adapter.ts` | 162 | `resend.emails.send()` called with `html`/`text` fields, but current Resend SDK requires either `html` or a `template` object — type conflict | Email notification delivery |

These do not gate launch of billing or payment surfaces. They must be resolved before the import and email notification surfaces are used in production.

---

## Deferred Items (not launch gates — recorded for the record)

| Item | Status | Reopen trigger |
|------|--------|----------------|
| Team 3 P1b — GHL/Clio token refresh hardening (RISK-002) | Deferred 2026-03-16 | Enable GHL or Clio for any production tenant |
| Team 3 M3 — Demo environment | Deferred 2026-03-16 | Decision to stand up live demo for sales |

---

*This checklist is the final gate between code-complete and launch. All nine items in Gate D must be confirmed PASS by the deployment owner before production traffic is accepted.*
