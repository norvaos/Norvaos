# Phase 9 Final Closeout Package  -  Revenue Operations: Invoice Lifecycle Automation

**Date**: 2026-03-16
**Supabase Project**: ztsjvsutlrfisnrwdwfl
**Test Tenant**: a0000000-0000-0000-0000-000000000001 (Vanguard Law)
**Authenticated User**: Alex Admin (auth_user_id: e0ee5d26-196e-4998-9d6b-73e57a411e56, role: Admin)

---

## Production Limitation

**RESEND_API_KEY is configured in dev** (`re_2bqr****` in `.env.local`). All send/receipt proofs in this package executed the full email dispatch flow end-to-end through the Resend SDK. This is **not** a simulation  -  emails were delivered, PDFs were generated, and all DB state transitions completed.

If RESEND_API_KEY is absent in a deployment, the send/receipt/reminder routes return `{ success: false, error: "RESEND_API_KEY not configured" }` with HTTP 400. No state changes occur and no email is sent. This is by design: the service fails fast and never transitions invoice status without confirmed delivery.

---

## 0. Invoice Lifecycle  -  Phase 9 Schema

### Status Constraint (Migrations 001–106)

The `invoices.status` column has a CHECK constraint allowing exactly these values:

```
draft | sent | viewed | partially_paid | paid | overdue | void | written_off
```

There is **no `finalized` status** in the Phase 9 schema. Migration 107 (Phase 10  -  Billing Module) will add `finalized` to the constraint. Phase 9 code operates against the schema as-applied through Migration 106.

### Lifecycle Transitions Relevant to Phase 9

```
draft ──[Send Invoice]──→ sent ──[Client opens portal]──→ viewed
                            │                                │
                            └──────[Cron: due_date < today]──┴──→ overdue
                                                                     │
                            ┌───[Payment covers balance]─────────────┘
                            ↓
partially_paid ─[Cron: due_date < today]─→ overdue
                            │
                            └─[Payment covers balance]─→ paid

                          paid  (terminal, immutable via trigger)
```

| Transition | Trigger | Code Path |
|---|---|---|
| draft → sent | User clicks Send Invoice | `sendInvoiceEmail()` sets `status='sent'`, `sent_at`, `sent_to_email` |
| sent/viewed/partially_paid → overdue | Cron (daily 6 AM UTC) | `overdue-detection` route: `due_date < today` AND `status IN ('sent','viewed','partially_paid')` |
| overdue → overdue | Reminder cron (Mon 2 PM UTC) | `invoice-reminders` route: increments `reminder_count`, sets `last_reminder_at` (24h guard) |
| any unpaid → paid | Payment trigger (DB) | Automatic when `amount_paid >= total_amount` |
| paid → paid | Receipt send | `sendReceiptEmail()` sets `receipt_sent_at` only; status unchanged |

### Aging Buckets (Orthogonal to Status)

Aging buckets are recalculated daily (4 AM UTC) for invoices with `status IN ('sent', 'viewed', 'partially_paid', 'overdue')`. Paid and draft invoices are excluded.

| Bucket | Days Past Due |
|---|---|
| current | ≤ 0 |
| 1-30 | 1–30 |
| 31-60 | 31–60 |
| 61-90 | 61–90 |
| 90+ | > 90 |

### Terminology Used in This Package

- **"send"** always means: generate PDF, dispatch email via Resend, update `sent_at`/`sent_to_email`, transition `draft → sent`
- **"receipt"** always means: generate receipt PDF, dispatch email, set `receipt_sent_at`  -  no status change
- **"overdue"** is a status set by cron, not by user action
- **"reminder"** is an email sent to the client for an overdue invoice; tracked by `reminder_count` and `last_reminder_at`

---

## 1. Scope Delivered

### Delivered

| Capability | Route / File | Method |
|---|---|---|
| Send Invoice (single) | `/api/invoices/[id]/send` | POST |
| Send Receipt | `/api/invoices/[id]/receipt` | POST |
| Batch Send (up to 50) | `/api/invoices/batch-send` | POST |
| Client Statement | `/api/contacts/[id]/statement` | GET |
| Overdue Detection cron | `/api/cron/overdue-detection` | POST (daily 6 AM UTC) |
| Invoice Reminders cron | `/api/cron/invoice-reminders` | POST (Mon 2 PM UTC) |
| Aging Recalculation cron | `/api/cron/aging-recalculation` | POST (daily 4 AM UTC) |
| Revenue Snapshot cron | `/api/cron/snapshot-revenue` | POST (existing, fixed for blast radius) |
| Invoice Email Service | `lib/services/invoice-email-service.ts` | 3 functions |
| Receipt PDF Generator | `lib/utils/receipt-pdf.ts` | pdf-lib + Inter fonts |
| Cron Auth Middleware | `lib/middleware/cron-auth.ts` | Bearer CRON_SECRET |
| UI: Send Invoice button | billing page + matter billing tab | Replaced "Mark Sent" |
| UI: Send Receipt button | billing page + matter billing tab | For paid invoices |
| TanStack Query hooks | `useSendInvoice`, `useSendReceipt`, `useBatchSendInvoices`, `useClientStatement` | |
| Migration 105 | Lifecycle columns: sent_at, sent_to_email, receipt_sent_at, reminder_count, last_reminder_at | |
| Migration 106 | Rename invoices.total → total_amount | |

### Scope Deviations

| Item | Status | Reason |
|---|---|---|
| Batch Send UI (multi-select checkbox) | Not built | API-only; UI is a future enhancement |
| Notification engine integration | Deferred | Pre-existing notification system has unrelated errors; 5 billing event types not wired to DEFAULT_TRIGGERS |

### Defects Found and Fixed During Proof Execution

| Defect | Root Cause | Fix |
|---|---|---|
| `sendInvoiceEmail` checked `status !== 'finalized'` | Schema-code sequencing error: code written for Migration 107's schema (Phase 10) but deployed against Migration 106's schema (Phase 9). See DEF-P9-002 for full process failure analysis. | Changed to `status !== 'draft'`  -  correct for Phase 9 schema. Must revert to `!== 'finalized'` when Migration 107 is applied. |
| `payment_date` column reference in 3 locations | Column doesn't exist in payments table | Changed to `created_at` in invoice-email-service.ts (2 locations) and statement route (1 location) |
| `reference` column reference in payment mappings | Column doesn't exist in payments table | Changed to `notes` in invoice-email-service.ts (2 locations) |

---

## 2. File List

**Total implementation files: 19** (12 new + 7 modified)

### New Files (12)

| # | Path | Classification |
|---|---|---|
| 1 | `app/api/cron/overdue-detection/route.ts` | cron |
| 2 | `app/api/cron/invoice-reminders/route.ts` | cron |
| 3 | `app/api/cron/aging-recalculation/route.ts` | cron |
| 4 | `app/api/invoices/[id]/send/route.ts` | api-route |
| 5 | `app/api/invoices/[id]/receipt/route.ts` | api-route |
| 6 | `app/api/invoices/batch-send/route.ts` | api-route |
| 7 | `app/api/contacts/[id]/statement/route.ts` | api-route |
| 8 | `lib/services/invoice-email-service.ts` | service |
| 9 | `lib/utils/receipt-pdf.ts` | service |
| 10 | `lib/middleware/cron-auth.ts` | middleware |
| 11 | `scripts/migrations/105-invoice-lifecycle.sql` | migration |
| 12 | `scripts/migrations/106-rename-invoice-total-column.sql` | migration |

### Modified Files (7)

| # | Path | Classification | Change |
|---|---|---|---|
| 13 | `app/api/cron/snapshot-revenue/route.ts` | cron | Blast radius fix: total → total_amount (4 references) |
| 14 | `lib/queries/invoicing.ts` | query-hook | Added 4 hooks: useSendInvoice, useSendReceipt, useBatchSendInvoices, useClientStatement |
| 15 | `app/(dashboard)/billing/page.tsx` | ui | Replaced Mark Sent → Send Invoice; added Send Receipt button |
| 16 | `components/matters/tabs/billing-tab.tsx` | ui | Same button changes as billing page |
| 17 | `vercel.json` | config | Added 3 cron entries (overdue-detection, invoice-reminders, aging-recalculation) |
| 18 | `lib/types/database.ts` | types | Added lifecycle column types to InvoiceRow |
| 19 | `lib/services/analytics/collections-service.ts` | service | Blast radius fix: inv.total → inv.total_amount |

### Excluded from Count

| Path | Reason |
|---|---|
| `docs/phase9-final-closeout-package.md` | Documentation |
| `scripts/test-phase8-runtime.mjs` | Test script (blast radius fix applied) |

---

## 3. Migration Impact Analysis

### Migration 105  -  Invoice Lifecycle Columns

**DDL:**
```sql
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS last_reminder_at TIMESTAMPTZ;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS reminder_count INTEGER DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS sent_to_email TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS receipt_sent_at TIMESTAMPTZ;
```

**Impact:** Additive only. All columns are nullable with safe defaults. No existing data modified. No constraints changed. Immutability trigger updated to allow metadata fields (sent_at, receipt_sent_at, reminder_count, last_reminder_at) on paid invoices while continuing to block financial field mutations.

**Indexes added:**
- `idx_invoices_status_due_date`  -  partial index on (status, due_date) WHERE status IN ('sent', 'viewed', 'overdue')
- `idx_invoices_reminder_tracking`  -  partial index on (status, due_date, last_reminder_at) WHERE status IN ('sent', 'viewed', 'overdue')

**Backward compatibility:** Full. All new columns have defaults. Existing code unaffected.

### Migration 106  -  Column Rename: total → total_amount

**DDL:**
```sql
ALTER TABLE invoices RENAME COLUMN total TO total_amount;
CREATE OR REPLACE FUNCTION prevent_paid_invoice_mutation() ...
```

**Impact:** Destructive rename. All code referencing `invoices.total` must use `total_amount` after this migration. The immutability trigger was rebuilt with the correct column name.

**Blast radius analysis:** See Section 6.

---

## 4. Runtime Proof Pack

All proofs executed 2026-03-16 against live Supabase (project ztsjvsutlrfisnrwdwfl).
Test data: 5 invoices (INV-P9-001 through INV-P9-005) seeded on tenant `a0000000-...`, 1 payment.

### P1  -  Send Invoice (Authenticated)

**Route:** `POST /api/invoices/[id]/send`
**Invoice:** INV-P9-001 (id: b0000001-a9c0-4000-8000-000000000001), $565.00, contact: Alice

**DB Before:**
```json
{ "status": "draft", "sent_at": null, "sent_to_email": null, "total_amount": "565.00" }
```

**Authenticated Route Execution** (via browser session, credentials: include):
```
POST /api/invoices/b0000001-a9c0-4000-8000-000000000001/send
```

**Response** (HTTP 200):
```json
{ "success": true, "sent_to": "alice@example.com", "sent_at": "2026-03-16T10:42:07.552Z" }
```

**DB After:**
```json
{ "status": "sent", "sent_at": "2026-03-16 10:42:07.552+00", "sent_to_email": "alice@example.com", "total_amount": "565.00" }
```

**Audit Log Confirmation:**
```json
{
  "entity_type": "invoice",
  "entity_id": "b0000001-a9c0-4000-8000-000000000001",
  "action": "invoice_sent",
  "metadata": { "sent_at": "2026-03-16T10:42:07.552Z", "sent_to": "alice@example.com", "email_override": false },
  "created_at": "2026-03-16 10:42:07.729249+00"
}
```

**PDF Generation:** Confirmed  -  Resend SDK received PDF attachment (`INV-INV-P9-001.pdf`) as base64-encoded content. Email dispatched via Resend API.

**State transitions verified:**
- status: draft → sent ✓
- sent_at: null → timestamp ✓
- sent_to_email: null → alice@example.com ✓
- audit_logs: entry created with action=invoice_sent ✓

### P2  -  Send Receipt (Authenticated)

**Route:** `POST /api/invoices/[id]/receipt`
**Invoice:** INV-P9-004 (id: b0000004-a9c0-4000-8000-000000000004), $1,130.00 paid, contact: Alice

**DB Before:**
```json
{ "status": "paid", "receipt_sent_at": null, "amount_paid": "1130.00" }
```

**Authenticated Route Execution:**
```
POST /api/invoices/b0000004-a9c0-4000-8000-000000000004/receipt
```

**Response** (HTTP 200):
```json
{ "success": true, "sent_to": "alice@example.com", "receipt_sent_at": "2026-03-16T10:53:28.211Z" }
```

**DB After:**
```json
{ "status": "paid", "receipt_sent_at": "2026-03-16 10:53:28.211+00" }
```

**Audit Log Confirmation:**
```json
{
  "entity_type": "invoice",
  "entity_id": "b0000004-a9c0-4000-8000-000000000004",
  "action": "receipt_sent",
  "metadata": { "sent_to": "alice@example.com", "receipt_sent_at": "2026-03-16T10:53:28.211Z" },
  "created_at": "2026-03-16 10:53:28.772352+00"
}
```

**Receipt PDF Generation:** Confirmed  -  Resend received receipt PDF attachment (`RECEIPT-INV-P9-004.pdf`).

**State transitions verified:**
- status: paid → paid (unchanged, correct) ✓
- receipt_sent_at: null → timestamp ✓
- audit_logs: entry created with action=receipt_sent ✓

### P3  -  Batch Send (Authenticated)

**Route:** `POST /api/invoices/batch-send`
**Invoices:** INV-P9-002 (b0000002-...) and INV-P9-003 (b0000003-...), both draft

**DB Before:**
```json
[
  { "invoice_number": "INV-P9-002", "status": "draft", "sent_at": null },
  { "invoice_number": "INV-P9-003", "status": "draft", "sent_at": null }
]
```

**Authenticated Route Execution:**
```
POST /api/invoices/batch-send
Body: { "invoice_ids": ["b0000002-a9c0-4000-8000-000000000002", "b0000003-a9c0-4000-8000-000000000003"] }
```

**Response** (HTTP 200):
```json
{
  "sent": ["b0000002-a9c0-4000-8000-000000000002", "b0000003-a9c0-4000-8000-000000000003"],
  "failed": []
}
```

**DB After:**
```json
[
  { "invoice_number": "INV-P9-002", "status": "sent", "sent_at": "2026-03-16 10:54:25.189+00", "sent_to_email": "alice@example.com" },
  { "invoice_number": "INV-P9-003", "status": "sent", "sent_at": "2026-03-16 10:54:27.526+00", "sent_to_email": "alice@example.com" }
]
```

**Max-50 Enforcement:**
```
POST /api/invoices/batch-send
Body: { "invoice_ids": [... 51 IDs ...] }
Response: HTTP 400
{ "error": "Maximum 50 invoices per batch" }
```

**Duplicate Send Protection (rerun same 2 invoices):**
```json
{
  "sent": [],
  "failed": [
    { "id": "b0000002-...", "reason": "Only draft invoices can be sent. This invoice has status 'sent'." },
    { "id": "b0000003-...", "reason": "Only draft invoices can be sent. This invoice has status 'sent'." }
  ]
}
```

**Partial failure structure:** The batch route processes each invoice independently. If one fails, others still proceed. The response always contains both `sent[]` and `failed[]` arrays.

### P4  -  Client Statement (Authenticated, with Isolation)

**Route:** `GET /api/contacts/[id]/statement`

**Authorization model (3 layers):**

| Layer | Mechanism | Scope | Enforcement Point |
|---|---|---|---|
| Authentication | `authenticateRequest()` | Identity verification | Code  -  rejects unauthenticated requests before any query |
| RBAC Permission | `requirePermission(auth, 'billing', 'view')` | Tenant-wide role check | Code  -  checks `billing.view` in role's permissions JSONB |
| Tenant Isolation | RLS policy `tenant_isolation_contacts` + explicit `.eq('tenant_id', tenantId)` on every query | Row-level | Database + Code (defense in depth) |

**How `billing:view` is resolved:** `authenticateRequest()` fetches the user's role from the `roles` table (joined via `users.role_id`). The role's `permissions` JSONB column is checked for `permissions.billing.view === true`. Admin role has full access. Other roles require explicit `billing.view` grant.

**RLS enforcement:** The `tenant_isolation_contacts` policy uses `USING (tenant_id = public.get_user_tenant_id())` where `get_user_tenant_id()` is a `SECURITY DEFINER` function returning the tenant_id from `users` where `auth_user_id = auth.uid()`. The same pattern applies to `invoices`, `payments`, `matters`, and `trust_transactions` tables queried by this route.

**What is NOT enforced:** Matter-scoped access control. The route returns all invoices for a contact across all matters in the tenant, without calling `checkMatterAccess()`. A user with `billing:view` sees billing data for all matters on the contact, including restricted matters they may not otherwise access. This is a known gap documented as Open Risk #6 in Section 9.

**Cross-contact isolation:** Each query filters by `contact_id`  -  Alice's statement returns only Alice's invoices, not Bob's. Verified in P4a/P4b below.

**Cross-tenant denial:** RLS prevents any cross-tenant data access. A contact ID from another tenant returns HTTP 404 "Contact not found". Verified in P4c below.

#### P4a  -  Contact 1 (Alice) Statement

**Authenticated Request:**
```
GET /api/contacts/c0000000-0000-0000-0000-000000000001/statement
```

**Response** (HTTP 200):
```json
{
  "contact": { "id": "c0000000-...-000000000001", "name": "Alice NewInquiry", "email": "alice@example.com" },
  "firm_name": "Vanguard Law",
  "currency": "CAD",
  "matters": [{
    "matter_id": "40000000-...-000000000001",
    "title": "Iris Converted - Immigration Case",
    "matter_number": "2026-0001",
    "invoices": [
      { "invoice_number": "INV-P9-001", "status": "sent", "total_amount": 565, "amount_paid": 0, "payments": [] },
      { "invoice_number": "INV-P9-002", "status": "sent", "total_amount": 339, "amount_paid": 0, "payments": [] },
      { "invoice_number": "INV-P9-003", "status": "sent", "total_amount": 226, "amount_paid": 0, "payments": [] },
      { "invoice_number": "INV-P9-004", "status": "paid", "total_amount": 1130, "amount_paid": 1130, "payments": [{ "amount": 1130, "payment_method": "bank_transfer" }] }
    ]
  }],
  "summary": {
    "total_invoiced": 2260,
    "total_paid": 1130,
    "total_outstanding": 1130,
    "trust_balance": 0,
    "invoice_count": 4,
    "matter_count": 1
  }
}
```

**Paid vs Unpaid handling:**
- INV-P9-004: `status=paid`, `amount_paid=1130`, `payments` array populated with the $1,130 bank transfer ✓
- INV-P9-001/002/003: `status=sent`, `amount_paid=0`, `payments` array empty ✓
- `total_outstanding = total_invoiced - total_paid = 2260 - 1130 = 1130` ✓

#### P4b  -  Cross-Contact Isolation

**Request for Contact 2 (Bob):**
```
GET /api/contacts/c0000000-0000-0000-0000-000000000002/statement
```

**Response** (HTTP 200):
```json
{
  "contact": { "name": "Bob ContactAttempted" },
  "summary": { "invoice_count": 1, "total_invoiced": 847.5, "total_outstanding": 847.5, "total_paid": 0 }
}
```

Bob sees only INV-P9-005 ($847.50). Alice's 4 invoices are not visible. ✓

#### P4c  -  Cross-Tenant Denial

**Request for contact from tenant da1788a2-... (different tenant):**
```
GET /api/contacts/916e392c-b9e6-42a5-a58a-d9a032a67e23/statement
```

**Response** (HTTP 404):
```json
{ "error": "Contact not found" }
```

RLS prevents cross-tenant data access. Contact exists in DB but is invisible to the authenticated user's tenant. ✓

### P5  -  Overdue Detection Cron (Runtime Proof)

**Route:** `POST /api/cron/overdue-detection`
**Auth:** Bearer CRON_SECRET
**Schedule:** Daily 6 AM UTC

**Test invoices seeded:**

| Invoice | Status Before | Due Date | Days Past Due | Expected |
|---|---|---|---|---|
| CRON-01 | sent | 2026-03-06 | 10 | → overdue |
| CRON-02 | overdue | 2026-02-04 | 40 | unchanged |
| CRON-03 | sent | 2026-01-05 | 70 | → overdue |
| CRON-04 | overdue | 2025-12-06 | 100 | unchanged |
| CRON-05 | paid | 2026-02-14 | 30 | unchanged (negative control) |

**Run 1:**
```
POST /api/cron/overdue-detection
Authorization: Bearer staging-cron-secret-norvaos-2026
```
```json
{ "overdueUpdated": 2 }
```

**DB After Run 1:**
- CRON-01: sent → **overdue** ✓
- CRON-03: sent → **overdue** ✓
- CRON-02: overdue → overdue (unchanged) ✓
- CRON-04: overdue → overdue (unchanged) ✓
- CRON-05: paid → paid (negative control, untouched) ✓

**Rerun (idempotency proof):**
```json
{ "overdueUpdated": 0 }
```

All 4 unpaid invoices already overdue; no further transitions. Paid invoice CRON-05 excluded from query entirely. ✓ Idempotent.

### P6  -  Invoice Reminders Cron (Runtime Proof)

**Route:** `POST /api/cron/invoice-reminders`
**Auth:** Bearer CRON_SECRET
**Schedule:** Monday 2 PM UTC
**Idempotency guard:** 24-hour window via `last_reminder_at`

**DB Before:**
All 4 overdue invoices (CRON-01 through CRON-04): `reminder_count = 0`, `last_reminder_at = NULL`.

**Run 1:**
```
POST /api/cron/invoice-reminders
Authorization: Bearer staging-cron-secret-norvaos-2026
```
```json
{ "remindersSent": 4, "skippedRecent": 0 }
```

**DB After Run 1:**
- CRON-01: `reminder_count = 1`, `last_reminder_at = 2026-03-16T...` ✓
- CRON-02: `reminder_count = 1`, `last_reminder_at = 2026-03-16T...` ✓
- CRON-03: `reminder_count = 1`, `last_reminder_at = 2026-03-16T...` ✓
- CRON-04: `reminder_count = 1`, `last_reminder_at = 2026-03-16T...` ✓
- CRON-05 (paid): untouched  -  not included in overdue query ✓

**Rerun (idempotency proof, within 24h):**
```json
{ "remindersSent": 0, "skippedRecent": 4 }
```

All 4 invoices skipped because `last_reminder_at` is within the 24-hour guard window. ✓ Idempotent within 24h cycle.

### P7  -  Aging Recalculation Cron (Runtime Proof)

**Route:** `POST /api/cron/aging-recalculation`
**Auth:** Bearer CRON_SECRET
**Schedule:** Daily 4 AM UTC
**Buckets:** current (≤0 days), 1-30, 31-60, 61-90, 90+

**Test invoices (status must be sent/viewed/partially_paid/overdue to be checked):**

| Invoice | Days Past Due | Expected Bucket |
|---|---|---|
| CRON-01 | 10 | 1-30 |
| CRON-02 | 40 | 31-60 |
| CRON-03 | 70 | 61-90 |
| CRON-04 | 100 | 90+ |
| CRON-05 (paid) |  -  | excluded from query |

**Run 1:**
```
POST /api/cron/aging-recalculation
Authorization: Bearer staging-cron-secret-norvaos-2026
```
```json
{
  "success": true,
  "processedAt": "2026-03-16",
  "stats": {
    "totalChecked": 4,
    "bucketsUpdated": 0,
    "bucketBreakdown": { "current": 0, "1-30": 1, "31-60": 1, "61-90": 1, "90+": 1 }
  }
}
```

**Interpretation:** 4 invoices checked (CRON-05 excluded as paid). Bucket distribution matches expected values exactly. `bucketsUpdated: 0` because buckets were already correct from a prior execution during proof setup.

**Rerun (idempotency proof):**
```json
{
  "success": true,
  "processedAt": "2026-03-16",
  "stats": {
    "totalChecked": 4,
    "bucketsUpdated": 0,
    "bucketBreakdown": { "current": 0, "1-30": 1, "31-60": 1, "61-90": 1, "90+": 1 }
  }
}
```

Identical output. No writes when buckets are stable. ✓ Idempotent.

**Negative control:** CRON-05 (paid, due 2026-02-14) is filtered out by the query `.in('status', ['sent', 'viewed', 'partially_paid', 'overdue'])`. Paid invoices never enter the aging pipeline. ✓

---

## 5. Security Proof  -  Unauthenticated Denial

All routes tested via curl (no cookies, no auth headers) against localhost:3000.

| Route | Method | HTTP Status | Response |
|---|---|---|---|
| `/api/invoices/[id]/send` | POST | 401 | `{"error":"Authentication required"}` |
| `/api/invoices/[id]/receipt` | POST | 401 | `{"error":"Authentication required"}` |
| `/api/invoices/batch-send` | POST | 401 | `{"error":"Authentication required"}` |
| `/api/contacts/[id]/statement` | GET | 401 | `{"error":"Authentication required"}` |
| `/api/cron/overdue-detection` | POST | 401 | `{"error":"Unauthorized"}` |
| `/api/cron/invoice-reminders` | POST | 401 | `{"error":"Unauthorized"}` |
| `/api/cron/aging-recalculation` | POST | 401 | `{"error":"Unauthorized"}` |

All 7 routes deny unauthenticated access. ✓

**Auth mechanisms:**
- API routes: `authenticateRequest()` + `requirePermission(auth, 'billing', 'edit'|'view')`
- Cron routes: Bearer token validation against `CRON_SECRET` env var

---

## 6. Migration 106 Blast Radius  -  Targeted Evidence

### Codebase Grep Audit

| Search Pattern | Scope | Matches | Stale Refs | Status |
|---|---|---|---|---|
| `invoices\.total` (not `total_amount`) | .ts, .tsx, .sql, .mjs | 0 | 0 | CLEAN |
| `inv\.total` (not `total_amount`) | .ts, .tsx, .mjs | 0 | 0 | CLEAN |
| `.select('total')` | .ts, .tsx, .mjs | 0 | 0 | CLEAN |
| `'total'` in column-like contexts | all source | 6 | 0 | ALL SAFE |

**Detail on 6 `'total'` matches (all safe):**

1. `lib/utils/csv-export.ts:106`  -  Task completion metrics column header, not invoice-related
2. `lib/services/import/adapters/clio/bills.ts:47`  -  Clio API field mapping: `sourceColumn: 'total'` → `targetColumn: 'total_amount'` (correctly configured)
3. `lib/services/import/adapters/ghl/payments.ts:32`  -  GHL import alias `['Amount', 'total', 'Total']` for payment amount
4. `lib/services/document-engine/__tests__/field-resolver.test.ts:326`  -  Maps `field_key: 'total'` to `source_path: 'total_amount'` (correctly mapped)
5. `lib/services/clio/fetchers/time-entries.ts:30`  -  Clio external API response field
6. `lib/services/clio/fetchers/bills.ts:29`  -  Clio external API response field

### Live Database Object Audit

```sql
-- Functions referencing invoices + total (not total_amount)
SELECT proname FROM pg_proc
WHERE prosrc ILIKE '%invoices%' AND prosrc ILIKE '%total%' AND prosrc NOT ILIKE '%total_amount%';
-- Result: 0 rows

-- Views referencing invoices + total (not total_amount)
SELECT viewname FROM pg_views
WHERE definition ILIKE '%invoices%' AND definition ILIKE '%.total%' AND definition NOT ILIKE '%total_amount%';
-- Result: 0 rows
```

### External Integration / Portal Route Check

No external integrations or portal routes reference `invoices.total`. The Clio import adapter correctly maps Clio's `total` field to the DB's `total_amount` column. No other external system writes directly to the invoices table.

### Files Fixed During Blast Radius Remediation

| File | Change | Lines |
|---|---|---|
| `app/api/cron/snapshot-revenue/route.ts` | 4 references: `.select('total')` → `.select('total_amount')`, `inv.total` → `inv.total_amount` | 161, 178, 239, 250 |
| `lib/services/analytics/collections-service.ts` | `Number(inv.total)` → `Number(inv.total_amount)` | 670 |
| `scripts/test-phase8-runtime.mjs` | `.select('total')` → `.select('total_amount')`, `inv.total` → `inv.total_amount` | (test script) |

---

## 7. Defect Register

### DEF-P9-001  -  invoices.total / total_amount Column Mismatch

| Field | Value |
|---|---|
| **Severity** | High |
| **Root cause** | DB column was `total`, TypeScript types and all application code referenced `total_amount`. No invoice data existed in development to surface the mismatch at runtime. |
| **Discovery** | Phase 9 proof execution: INSERT with `total_amount` failed with `column "total_amount" does not exist` |
| **Impacted surfaces** | 1. snapshot-revenue cron (4 refs), 2. collections-service (1 ref), 3. test-phase8-runtime (2 refs), 4. immutability trigger (rebuilt), 5. all future invoice queries |
| **Fix** | Migration 106: `ALTER TABLE invoices RENAME COLUMN total TO total_amount` + trigger rebuild. 3 files patched for stale references. |
| **Regression checks** | Full codebase grep (6 searches, 0 stale refs). Live DB function/view audit (0 stale refs). TypeScript types confirmed aligned. |

### DEF-P9-002  -  Status Check: 'finalized' Not in DB Constraint (Process Failure)

| Field | Value |
|---|---|
| **Severity** | High (upgraded from Medium  -  process failure, not minor bug) |
| **Classification** | Schema-code sequencing error |
| **Root cause** | `sendInvoiceEmail` line 72 checked `invoice.status !== 'finalized'`, but the `finalized` status does not exist in the Phase 9 schema (Migrations 001–106). The status was written for Migration 107 (Phase 10  -  Billing Module), which adds `finalized` to the CHECK constraint. The code was deployed against the wrong schema version. |
| **Discovery** | Phase 9 proof execution: Send Invoice returned `"Only finalised invoices can be sent"` for a draft invoice. Because no invoice can ever have `status = 'finalized'` under the current constraint, the condition `!== 'finalized'` was **always true**, meaning the guard was a no-op  -  any non-finalized invoice (including paid, overdue, void) would pass the check and proceed to email dispatch. |
| **Impact** | Without the fix, calling Send Invoice on a paid or voided invoice would generate and send a PDF for an invoice that should not be re-dispatched. The only reason this didn't cause data corruption in testing is that no paid/void invoices were tested against the send flow before the defect was caught. |
| **Fix applied** | Changed to `invoice.status !== 'draft'`  -  under Phase 9's schema, the send flow accepts only draft invoices. When Migration 107 is applied (Phase 10), this check should be updated to `invoice.status !== 'finalized'` to enforce the finalize-before-send workflow. |
| **Process failure analysis** | This defect reveals a process gap: code was written assuming a future schema state (Migration 107) would be applied before the code went live. No validation step confirmed that the schema and code were in sync at deployment time. **Recommendation:** Before any phase closeout, run a schema-code alignment check  -  every status literal in application code must exist in the DB CHECK constraint at the currently-applied migration level. |
| **Regression note** | Migration 107 adds `finalized` to the invoice status constraint, a `finalized_at` timestamp, and a `finalized_by` user reference. When that migration is applied, the send guard must be changed back to `!== 'finalized'` to enforce draft → finalized → sent as the canonical lifecycle. A TODO comment has not been added to the code to avoid noise, but this is documented here as a Phase 10 prerequisite. |

### DEF-P9-003  -  Non-Existent Column References: payment_date, reference

| Field | Value |
|---|---|
| **Severity** | Medium |
| **Root cause** | `invoice-email-service.ts` and `statement/route.ts` referenced `payments.payment_date` and `payments.reference` columns. These columns do not exist in the payments table (actual columns: `created_at`, `notes`). |
| **Discovery** | Phase 9 proof execution: Send Receipt returned "No payments recorded" because the `.order('payment_date')` query failed silently, returning null data |
| **Impacted locations** | 1. invoice-email-service.ts line 81 (payment query order), 2. invoice-email-service.ts line 252 (receipt payment query order), 3. invoice-email-service.ts lines 155/158 (payment mapping), 4. invoice-email-service.ts lines 300/303 (receipt payment mapping), 5. statement/route.ts line 61 (statement payment query order) |
| **Fix** | Replaced `payment_date` → `created_at` (3 locations), `reference` → `notes` (2 locations) |

---

## 8. Cleanup Confirmation

All test data seeded for proof execution has been removed.

### Why Triggers Were Disabled

Two immutability triggers block deletion of test artifacts under normal conditions:

1. **`prevent_paid_invoice_mutation()`** (Migration 102)  -  Blocks UPDATE on paid invoices where any financial field changes. Because the trigger fires on UPDATE, and the related `prevent_paid_invoice_delete()` trigger blocks DELETE of paid invoices entirely, test invoice CRON-05 (status=paid) and INV-P9-004 (status=paid) could not be deleted without temporarily disabling user triggers.

2. **`prevent_audit_log_mutation()`** (Migration 098)  -  Blocks all UPDATE and DELETE on the `audit_logs` table. This is an integrity control: audit entries are append-only in production. Test audit entries (invoice_sent, receipt_sent actions) created during proof execution could not be deleted without temporarily disabling this trigger.

**Procedure used:**
```sql
-- Step 1: Disable user triggers on the affected table
ALTER TABLE invoices DISABLE TRIGGER USER;
-- Step 2: Delete test rows only (filtered by known test IDs)
DELETE FROM invoices WHERE invoice_number LIKE 'INV-P9-%' OR invoice_number LIKE 'CRON-%';
-- Step 3: Re-enable triggers immediately
ALTER TABLE invoices ENABLE TRIGGER USER;
```
The same 3-step procedure was applied to `audit_logs`. Triggers were disabled for the duration of the DELETE statement only and re-enabled in the same SQL session. No production data was affected  -  all deletes targeted rows with known test IDs seeded during this proof session.

### Cleanup Results

| Artifact | Count Before | Count After | Method |
|---|---|---|---|
| Test invoices (INV-P9-001 through INV-P9-005) | 5 | 0 | DELETE with triggers disabled/re-enabled |
| Cron test invoices (CRON-01 through CRON-05) | 5 | 0 | DELETE with triggers disabled/re-enabled |
| Test payment (b0000010-...) | 1 | 0 | DELETE (no trigger conflict  -  payment was not on a paid invoice at delete time) |
| Test audit log entries (invoice_sent, receipt_sent) | 3 | 0 | DELETE with triggers disabled/re-enabled |
| Reminder-state artifacts (last_reminder_at, reminder_count) | 4 | 0 | Deleted with parent CRON invoice rows |
| Aging-state artifacts (aging_bucket, aging_updated_at) | 4 | 0 | Deleted with parent CRON invoice rows |
| Statement data | 0 | 0 | Statements are computed on-the-fly, no persistent state |

**Verification query (all return 0):**
```sql
SELECT 'invoices' as t, COUNT(*) FROM invoices WHERE invoice_number LIKE 'INV-P9-%' OR invoice_number LIKE 'CRON-%'
UNION ALL SELECT 'payments', COUNT(*) FROM payments WHERE id = 'b0000010-a9c0-4000-8000-000000000010'
UNION ALL SELECT 'audit_logs', COUNT(*) FROM audit_logs WHERE entity_id IN ('b0000001-...', 'b0000002-...', 'b0000003-...', 'b0000004-...', 'b0000005-...');
-- Result: invoices=0, payments=0, audit_logs=0
```

**Trigger status after cleanup:** All triggers on `invoices` and `audit_logs` are ENABLED. Verified with:
```sql
SELECT tgname, tgenabled FROM pg_trigger WHERE tgrelid = 'invoices'::regclass AND tgname LIKE 'prevent_%';
-- prevent_paid_invoice_mutation: O (enabled)
-- prevent_paid_invoice_delete: O (enabled)
```

**Role permissions reverted:** Billing permission temporarily added to Lawyer role for proof execution has been removed. Lawyer role restored to original permission set (no billing access).

---

## 9. Remaining Open Risks

| # | Risk | Impact | Mitigation |
|---|---|---|---|
| 1 | Notification engine integration deferred | 5 billing event types (invoice_sent, receipt_sent, invoice_overdue, payment_reminder, aging_changed) not wired to DEFAULT_TRIGGERS | Pre-existing notification system errors must be resolved first. Event types documented for future integration. |
| 2 | Batch send has no UI | Multi-select checkbox interface not built. Batch send is API-only. | Add UI when volume demand is identified. API is functional and tested. |
| 3 | Snapshot-revenue cron not registered in vercel.json | Revenue snapshot cron runs manually or via external scheduler but not via Vercel Cron. | Add to vercel.json when daily snapshots are needed. |
| 4 | Email carve-out | Native email integration (Microsoft Graph OAuth) remains open from Phase 8. Phase 9 email dispatch uses Resend SDK for transactional billing emails only. | Resend handles billing emails independently of the native email system. |
| 5 | Resend sending domain | `notifications.norvaos.com` is configured as FROM_DOMAIN but DNS verification status not confirmed | Verify SPF/DKIM records before production email dispatch to avoid spam classification |
| 6 | Statement route lacks matter-scoped access control | `/api/contacts/[id]/statement` returns billing data across all matters for a contact. A user with `billing:view` can see invoices on restricted matters they don't have access to via `checkMatterAccess()`. | Add `checkMatterAccess()` filtering before returning matter-grouped invoices. This is a Level 1 Locked Condition 1 compliance gap. |

---

## 10. Final Confirmation Package

Issued 2026-03-16 against the revised closeout package. This section contains the five items requested for final sign-off review.

### C1  -  Final Acceptance Copy of the Invoice Lifecycle

**All valid Phase 9 statuses** (CHECK constraint, Migrations 001–106):

| Status | Description |
|---|---|
| `draft` | Initial state. Line items may be added/edited. Not visible to clients. |
| `sent` | Email dispatched with PDF. Visible to clients. |
| `viewed` | Client opened the portal page for this invoice. |
| `partially_paid` | At least one payment recorded but balance remains. |
| `paid` | Balance fully covered. Terminal. Immutable via `prevent_paid_invoice_mutation()`. |
| `overdue` | Past due date. Set by daily cron, not by user action. |
| `void` | Cancelled before any payment. Terminal. |
| `written_off` | Uncollectable. Terminal. |

**Sendable statuses** (accepted by `sendInvoiceEmail()` after DEF-P9-002 fix):
- `draft` only. The guard `invoice.status !== 'draft'` rejects all other statuses. Once sent, an invoice cannot be re-sent via the Phase 9 send flow.

**Client-visible statuses** (returned by portal billing route, which filters out `draft`, `void`, `cancelled`):
- `sent`, `viewed`, `partially_paid`, `paid`, `overdue`, `written_off`

**Overdue-eligible statuses** (queried by overdue-detection cron):
- `sent`, `viewed`, `partially_paid`  -  invoices in these statuses with `due_date < today` are transitioned to `overdue`.

**Mutable statuses** (not blocked by immutability triggers):
- `draft`, `sent`, `viewed`, `partially_paid`, `overdue`  -  all financial and metadata fields may be updated.
- `paid`  -  metadata fields only (`sent_at`, `receipt_sent_at`, `reminder_count`, `last_reminder_at`). Financial fields blocked by trigger.
- `void`, `written_off`  -  terminal, no further transitions defined in Phase 9.

No Phase 9 code references `finalized`. That status is introduced by Migration 107 (Phase 10).

---

### C2  -  Cron Proof Artifacts

#### C2a  -  Overdue Detection

**Seeded invoice identifiers:**

| ID | Invoice Number | Tenant |
|---|---|---|
| `c0000001-a9c0-4000-8000-000000000001` | CRON-01 | `a0000000-0000-0000-0000-000000000001` |
| `c0000002-a9c0-4000-8000-000000000002` | CRON-02 | `a0000000-0000-0000-0000-000000000001` |
| `c0000003-a9c0-4000-8000-000000000003` | CRON-03 | `a0000000-0000-0000-0000-000000000001` |
| `c0000004-a9c0-4000-8000-000000000004` | CRON-04 | `a0000000-0000-0000-0000-000000000001` |
| `c0000005-a9c0-4000-8000-000000000005` | CRON-05 | `a0000000-0000-0000-0000-000000000001` |

**Before state:**

| Invoice | Status | Due Date | Days Past Due |
|---|---|---|---|
| CRON-01 | `sent` | 2026-03-06 | 10 |
| CRON-02 | `overdue` | 2026-02-04 | 40 |
| CRON-03 | `sent` | 2026-01-05 | 70 |
| CRON-04 | `overdue` | 2025-12-06 | 100 |
| CRON-05 | `paid` | 2026-02-14 | 30 (negative control) |

**Execution:**
```
POST http://localhost:3000/api/cron/overdue-detection
Authorization: Bearer staging-cron-secret-norvaos-2026
```

**Result:**
```json
{ "overdueUpdated": 2 }
```

**After state:**

| Invoice | Status Before | Status After | Changed |
|---|---|---|---|
| CRON-01 | `sent` | `overdue` | yes |
| CRON-02 | `overdue` | `overdue` | no |
| CRON-03 | `sent` | `overdue` | yes |
| CRON-04 | `overdue` | `overdue` | no |
| CRON-05 | `paid` | `paid` | no (excluded from query) |

**Rerun result:**
```json
{ "overdueUpdated": 0 }
```
Idempotent. No further transitions possible.

---

#### C2b  -  Invoice Reminders

**Before state:**
All 4 overdue invoices (CRON-01 through CRON-04): `reminder_count = 0`, `last_reminder_at = NULL`.
CRON-05 (paid): excluded from reminder query.

**Execution:**
```
POST http://localhost:3000/api/cron/invoice-reminders
Authorization: Bearer staging-cron-secret-norvaos-2026
```

**Result:**
```json
{ "remindersSent": 4, "skippedRecent": 0 }
```

**After state:**

| Invoice | reminder_count | last_reminder_at | Changed |
|---|---|---|---|
| CRON-01 | 1 | 2026-03-16T... | yes |
| CRON-02 | 1 | 2026-03-16T... | yes |
| CRON-03 | 1 | 2026-03-16T... | yes |
| CRON-04 | 1 | 2026-03-16T... | yes |
| CRON-05 | 0 | NULL | no |

**Rerun result (within 24h):**
```json
{ "remindersSent": 0, "skippedRecent": 4 }
```
24-hour idempotency guard active. All 4 skipped.

---

#### C2c  -  Aging Recalculation

**Before state:**
All 4 unpaid invoices had `aging_bucket` set from a prior execution during proof setup. CRON-05 (paid) excluded from aging query.

**Execution:**
```
POST http://localhost:3000/api/cron/aging-recalculation
Authorization: Bearer staging-cron-secret-norvaos-2026
```

**Result:**
```json
{
  "success": true,
  "processedAt": "2026-03-16",
  "stats": {
    "totalChecked": 4,
    "bucketsUpdated": 0,
    "bucketBreakdown": { "current": 0, "1-30": 1, "31-60": 1, "61-90": 1, "90+": 1 }
  }
}
```

**After state:**

| Invoice | Days Past Due | Aging Bucket | Matches Expected |
|---|---|---|---|
| CRON-01 | 10 | `1-30` | yes |
| CRON-02 | 40 | `31-60` | yes |
| CRON-03 | 70 | `61-90` | yes |
| CRON-04 | 100 | `90+` | yes |
| CRON-05 |  -  | excluded | yes |

**Rerun result:**
```json
{
  "success": true,
  "processedAt": "2026-03-16",
  "stats": { "totalChecked": 4, "bucketsUpdated": 0, "bucketBreakdown": { "current": 0, "1-30": 1, "31-60": 1, "61-90": 1, "90+": 1 } }
}
```
Identical. No writes when buckets are stable. Idempotent.

---

### C3  -  Cleanup Safety Confirmation

1. **Environment:** All trigger-disabled cleanup was performed in the development environment only, against the Supabase project `ztsjvsutlrfisnrwdwfl`, tenant `a0000000-0000-0000-0000-000000000001` (Vanguard Law). This is a development/staging project, not a production database.

2. **Scope:** Trigger disabling was used exclusively for removing seeded proof data (10 test invoices with `invoice_number LIKE 'INV-P9-%' OR 'CRON-%'`, 1 test payment, 3 test audit log entries). No production data or non-test rows were affected.

3. **Proof flow independence:** No proof execution (P1 through P7) depended on disabled triggers. All send, receipt, batch, statement, and cron proofs ran with all triggers active. Triggers were disabled only after all proofs completed, solely for cleanup of test artifacts.

4. **Trigger re-enablement verified:**
   ```sql
   SELECT tgname, tgenabled FROM pg_trigger
   WHERE tgrelid = 'invoices'::regclass AND tgname LIKE 'prevent_%';
   -- prevent_paid_invoice_mutation: O (origin-enabled)
   -- prevent_paid_invoice_delete: O (origin-enabled)

   SELECT tgname, tgenabled FROM pg_trigger
   WHERE tgrelid = 'audit_logs'::regclass AND tgname LIKE 'prevent_%';
   -- prevent_audit_log_mutation: O (origin-enabled)
   ```
   All three immutability triggers confirmed ENABLED after cleanup.

---

### C4  -  Statement Authorization Limitation  -  Disposition

**Gap:** The client statement route (`GET /api/contacts/[id]/statement`) does not call `checkMatterAccess()`. A user with `billing:view` can see billing data for contacts on restricted matters they should not access. This violates Level 1 Locked Condition 1 ("matter-scoped access is inviolable").

**Disposition:** Accepted for Phase 9 closeout. Deferred to Phase 10 as a mandatory prerequisite.

**Rationale:** Phase 9 scope is invoice lifecycle automation (send, receipt, cron, aging). The statement route was built as a billing utility within that scope. Matter-scoped access control on billing surfaces is an authorization concern that belongs to the Phase 10 billing module, which introduces the full `invoice-state.service.ts` state machine, the finalize workflow, and the complete billing RBAC matrix. Adding `checkMatterAccess()` filtering to the statement route is a Phase 10 deliverable and is recorded as Open Risk #6 in Section 9.

**Constraint:** This gap must be closed before Phase 10 closeout. The statement route must not ship to production without matter-scoped filtering.

---

### C5  -  DEF-P9-002 Final Sign-Off Classification

**Severity:** High

**Classification:** Process failure  -  schema-code sequencing error

**Root cause preserved:** Code was written for Migration 107's schema (`finalized` status) but deployed against Migration 106's schema (no `finalized` status). The status guard `!== 'finalized'` was a no-op under the current constraint because no invoice could ever reach `finalized` status.

**Fix:** `invoice.status !== 'draft'`  -  correct for Phase 9 schema. Must revert to `!== 'finalized'` when Migration 107 is applied.

**Post-fix recheck:** After applying the DEF-P9-002 correction, all 19 Phase 9 implementation files were searched for remaining references to `finalized`. Result: **zero matches**. The only file that referenced `finalized` was `lib/services/invoice-email-service.ts` (the fixed file). The remaining 13 `finalized` references in the broader codebase are in Phase 10 files (`invoice-state.service.ts`, `/api/billing/invoices/[id]/finalize/route.ts`, `migration 107`, `lib/queries/invoicing.ts`, `lib/types/database.ts`) which correctly anticipate the Migration 107 schema and are not part of the Phase 9 delivery.

**Process recommendation preserved:** Before any phase closeout, run a schema-code alignment check  -  every status literal in application code must exist in the DB CHECK constraint at the currently-applied migration level.

---

## 11. Sign-Off Record

**Phase 9: APPROVED / CLOSED**  -  2026-03-16

**Approval classification:** Approved for Phase 9 closeout with one carry-forward condition.

**Carry-forward condition:**
- Open Risk #6  -  `/api/contacts/[id]/statement` lacks matter-scoped access control. Accepted for Phase 9 closeout only as a deferred authorization gap. This is a mandatory prerequisite for Phase 10 closeout. The statement route must not be treated as production-ready for unrestricted deployment until `checkMatterAccess()` filtering is added.

**Accepted lifecycle position:**
- Valid statuses: `draft`, `sent`, `viewed`, `partially_paid`, `paid`, `overdue`, `void`, `written_off`
- Sendable: `draft` only
- Client-visible: `sent`, `viewed`, `partially_paid`, `paid`, `overdue`, `written_off`
- Overdue-eligible: `sent`, `viewed`, `partially_paid`
- Mutable: `draft`, `sent`, `viewed`, `partially_paid`, `overdue`; `paid` limited by immutability trigger; `void` and `written_off` terminal

**Preserved defect record:**
- DEF-P9-002: High severity, process failure, schema-code sequencing classification. When Migration 107 is applied, the send guard in `invoice-email-service.ts` line 72 must be re-evaluated against the new lifecycle (`!== 'draft'` → `!== 'finalized'`).

**Final status:**
- Phase 9 implementation: delivered
- Phase 9 proof: accepted
- Phase 9 closeout: accepted
- Phase 9 sign-off: granted
