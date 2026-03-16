# Phase 9 — Planning Package

**Prepared:** 2026-03-15
**Status:** Pending approval — no implementation until approved

---

## 1. Phase 9 Scope Memo

### Objective

**Phase 9: Revenue Operations — Invoice Lifecycle Automation and Billing Cron Infrastructure**

Complete the invoice-to-collection revenue loop by adding invoice email dispatch, automated reminders, overdue detection, aging recalculation, payment receipts, client statements, and notification wiring for all billing events.

### Business Reason

Phase 8 built billing analytics, collections panels, and financial controls (immutability, segregation). But the revenue loop is incomplete: invoices can be created and marked paid, but cannot be emailed to clients, reminders are manual, overdue detection is manual, aging buckets are static, and payment receipts do not exist. A law firm cannot operate billing without these automations.

The billing UI, time tracking page, collections panel, and analytics dashboard already exist. Phase 9 completes the automation layer underneath them.

### In-Scope

| Item | Description |
|---|---|
| Invoice email dispatch | `POST /api/invoices/[id]/send` — generates PDF, emails to billing contact via Resend, updates status to `sent`, logs to `audit_logs` |
| Invoice reminder cron | `/api/cron/invoice-reminders` — sends reminder emails for unpaid invoices past due date, respects `reminder_count` and configurable intervals |
| Overdue detection cron | `/api/cron/overdue-detection` — transitions `sent`/`viewed` invoices past `due_date` to `overdue`, dispatches notification |
| Aging recalculation cron | `/api/cron/aging-recalculation` — recalculates `aging_bucket` for all unpaid invoices based on days past due |
| Payment receipt generation | `POST /api/invoices/[id]/receipt` — generates receipt PDF and optionally emails to billing contact |
| Client statement endpoint | `GET /api/contacts/[id]/statement` — consolidated statement across all matters for a contact |
| Notification wiring | Wire `dispatchNotification()` for billing events: `invoice_sent`, `invoice_overdue`, `payment_received`, `payment_plan_created`, `write_off_approved` |
| Invoice batch send | `POST /api/invoices/batch-send` — send multiple draft invoices in one operation |
| Vercel cron registration | Add 3 new cron entries to `vercel.json` |

### Out-of-Scope

| Item | Reason |
|---|---|
| Stripe payment link generation | Requires Stripe product/price setup per invoice — deferred to Phase 10 |
| Recurring invoices | Subscription billing engine — deferred |
| Dunning escalation workflow (demand letters, external collection referral) | Requires legal template system — deferred |
| SMS notifications for billing events | No SMS provider integrated — deferred |
| Multi-currency support | Not needed for single-tenant Canadian firm |
| Invoice approval workflow | Firm currently has single-approver model; not requested |
| Email inbound/outbound via Microsoft Graph | Remains blocked on Azure App Registration — separate carve-out |
| QuickBooks sync | Remains deferred per Phase 7/8 boundary |
| Bank feed reconciliation | Remains deferred |
| Time entry approval workflow | No firm requirement stated |

### Dependencies

| Dependency | Status | Impact |
|---|---|---|
| Resend SDK | ✅ Installed (`resend` in package.json) | Invoice and receipt email dispatch |
| Invoice PDF generation | ✅ Exists (`lib/utils/invoice-pdf.ts`, used by `/api/invoices/[id]/pdf`) | Reused for email attachments and receipts |
| Notification engine | ✅ Exists (`lib/services/notification-engine.ts`) | Reused for billing event dispatch |
| Push service | ✅ Exists (`lib/services/push-service.ts`) | Reused for push notifications |
| Collections service | ✅ Exists (`lib/services/analytics/collections-service.ts`) | Reused for write-off and payment plan notifications |
| Sentry | ✅ Integrated (Phase 8) | Error reporting for cron jobs |
| Structured logger | ✅ Exists (`lib/utils/logger.ts`) | Cron job logging |

### Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Resend rate limits on bulk send | Medium | Reminder cron could hit limits | Batch send with 100ms delay between emails; configurable batch size |
| Cron job timeout (Vercel 10s limit on hobby, 60s on pro) | Low | Long-running aging recalculation | Process in batches of 100 invoices per invocation |
| Invoice PDF generation failure blocks send | Low | Email sent without attachment | Fail the send; do not email without PDF |
| Reminder spam if cron runs multiple times | Medium | Client receives duplicate reminders | Idempotency: check `last_reminder_at` before sending; minimum 24h gap |
| Aging cron overwrites manual aging override | Low | Incorrect bucket after manual correction | No manual override exists — aging is always computed |

### Success Criteria

1. An invoice can be created, sent via email to the billing contact, and the client receives a PDF attachment
2. Unpaid invoices past due date are automatically transitioned to `overdue` status within 24 hours
3. Aging buckets are recalculated daily and reflect accurate days-past-due
4. Automated reminders are sent at configurable intervals (e.g., 7, 14, 30 days past due)
5. Payment receipts can be generated and emailed after payment is recorded
6. A consolidated client statement can be generated for any contact
7. All billing events dispatch notifications via the existing notification engine
8. Batch send works for up to 50 invoices in a single operation

### Acceptance Criteria

1. `POST /api/invoices/[id]/send` returns 200, invoice status transitions to `sent`, billing contact receives email with PDF attachment, `audit_logs` entry created
2. `POST /api/invoices/[id]/send` returns 403 for non-`billing:edit` roles
3. `POST /api/invoices/[id]/send` returns 400 for non-`draft` invoices
4. `/api/cron/overdue-detection` transitions only invoices with `status IN ('sent', 'viewed')` and `due_date < NOW()`
5. `/api/cron/aging-recalculation` sets correct bucket: current (0-30), 31-60, 61-90, 91-120, 120+
6. `/api/cron/invoice-reminders` does not send if `last_reminder_at` is within configured minimum interval
7. `/api/cron/invoice-reminders` increments `reminder_count` and updates `last_reminder_at`
8. All cron endpoints require `Authorization: Bearer CRON_SECRET` header
9. Payment receipt PDF includes firm name, invoice number, amount paid, payment method, date
10. Client statement includes all matters, all invoices, all payments, trust balance, outstanding total
11. Paid invoices remain immutable (Phase 8 trigger still enforced — no regression)
12. All new routes have RBAC via `requirePermission()`
13. All new routes log via structured logger with tenant context
14. All new routes report errors to Sentry via `reportError()`

### Data Migration

No data migration required. All new columns use defaults. Existing invoices will get aging buckets recalculated on first cron run.

### Schema Changes

| Change | Type | Details |
|---|---|---|
| `invoices.last_reminder_at` | New column | `TIMESTAMPTZ DEFAULT NULL` — tracks last reminder sent |
| `invoices.reminder_count` | New column | `INTEGER DEFAULT 0` — number of reminders sent |
| `invoices.sent_at` | New column | `TIMESTAMPTZ DEFAULT NULL` — when invoice was emailed |
| `invoices.sent_to_email` | New column | `TEXT DEFAULT NULL` — recipient email address |
| `invoices.receipt_sent_at` | New column | `TIMESTAMPTZ DEFAULT NULL` — when receipt was emailed |

### Permissions, RLS, Audit, Restore, Observability Changes

| Area | Changes Required |
|---|---|
| Permissions | No new permission entities. All new routes use existing `billing:view`, `billing:edit`, `billing:create` |
| RLS | No new RLS policies. Invoice table already has RLS. New columns inherit existing policies. |
| Audit | Invoice send and receipt send logged to `audit_logs`. Cron runs logged via structured logger. |
| Restore | New columns are non-destructive (nullable with defaults). Restore test baseline updated for new column count. |
| Observability | Cron jobs report errors to Sentry. All routes use `withTiming()` middleware. |

---

## 2. Surface Inventory

### Database

| Surface | Type | Change |
|---|---|---|
| `invoices` table | ALTER TABLE | 5 new columns: `last_reminder_at`, `reminder_count`, `sent_at`, `sent_to_email`, `receipt_sent_at` |
| `audit_logs` table | INSERT | New entries for invoice send, receipt send, batch send events |
| `notifications` table | INSERT | New entries for billing event notifications |

No new tables. No new triggers. No new functions. No new RLS policies.

### API Routes (7 new)

| Route | Method | Purpose |
|---|---|---|
| `/api/invoices/[id]/send` | POST | Send invoice email with PDF |
| `/api/invoices/[id]/receipt` | POST | Generate and send payment receipt |
| `/api/invoices/batch-send` | POST | Batch send multiple invoices |
| `/api/contacts/[id]/statement` | GET | Client statement across all matters |
| `/api/cron/overdue-detection` | GET | Cron: transition overdue invoices |
| `/api/cron/invoice-reminders` | GET | Cron: send automated reminders |
| `/api/cron/aging-recalculation` | GET | Cron: recalculate aging buckets |

### Cron Jobs (3 new)

| Path | Schedule | Purpose |
|---|---|---|
| `/api/cron/overdue-detection` | `0 6 * * *` (daily 6 AM UTC / 1 AM EST) | Transition past-due invoices to overdue |
| `/api/cron/invoice-reminders` | `0 14 * * 1` (Monday 2 PM UTC / 9 AM EST) | Send payment reminders |
| `/api/cron/aging-recalculation` | `0 4 * * *` (daily 4 AM UTC / 11 PM EST) | Recalculate aging buckets |

### UI Pages

No new pages. Existing pages affected:

| Page | Change |
|---|---|
| `app/(dashboard)/billing/page.tsx` | Add "Send Invoice" button to invoice row actions, add "Send Receipt" button after recording payment |
| `app/(dashboard)/billing/page.tsx` | Add "Batch Send" button for selected draft invoices |
| Portal billing view | No change — portal already displays invoice status |

### Portal Surfaces

No portal changes. Portal reads invoice status which will now reflect `sent`/`overdue` transitions automatically.

### Shared Services (modified)

| Service | Change |
|---|---|
| `lib/services/notification-engine.ts` | Add billing event types to defaults table |
| `lib/utils/invoice-pdf.ts` | Add receipt PDF generation function (or separate `receipt-pdf.ts`) |

### Query Hooks (modified)

| Hook File | Change |
|---|---|
| `lib/queries/invoicing.ts` | Add `useSendInvoice()`, `useSendReceipt()`, `useBatchSendInvoices()`, `useClientStatement()` mutations/queries |

### External Integrations

| Integration | Usage |
|---|---|
| Resend | Email dispatch for invoice send, receipt send, reminders |
| Sentry | Error reporting for cron failures |

---

## 3. Enforcement Matrix

| Surface | Auth Rule | Permission | Tenant Isolation | Audit | Immutability | Segregation of Duties | Logging/Monitoring |
|---|---|---|---|---|---|---|---|
| `POST /api/invoices/[id]/send` | `authenticateRequest()` | `billing:edit` | Invoice `tenant_id` must match auth tenant | `audit_logs` entry: `invoice_sent` | Cannot send paid invoices (status check) | N/A | `withTiming()`, `log.info()`, Sentry |
| `POST /api/invoices/[id]/receipt` | `authenticateRequest()` | `billing:edit` | Invoice `tenant_id` must match auth tenant | `audit_logs` entry: `receipt_sent` | N/A | N/A | `withTiming()`, `log.info()`, Sentry |
| `POST /api/invoices/batch-send` | `authenticateRequest()` | `billing:edit` | All invoices must belong to auth tenant | `audit_logs` entry per invoice sent | Cannot send paid invoices | N/A | `withTiming()`, `log.info()`, Sentry |
| `GET /api/contacts/[id]/statement` | `authenticateRequest()` | `billing:view` | Contact `tenant_id` must match auth tenant | N/A (read-only) | N/A | N/A | `withTiming()`, `log.info()`, Sentry |
| `GET /api/cron/overdue-detection` | `CRON_SECRET` bearer token | N/A (system) | Processes all tenants | Logs via structured logger | Does not modify paid invoices | N/A | `log.info()`, Sentry on failure |
| `GET /api/cron/invoice-reminders` | `CRON_SECRET` bearer token | N/A (system) | Processes all tenants, emails scoped per tenant | Logs via structured logger | Does not modify paid invoices | N/A | `log.info()`, Sentry on failure |
| `GET /api/cron/aging-recalculation` | `CRON_SECRET` bearer token | N/A (system) | Processes all tenants | Logs via structured logger | Only updates `aging_bucket` and `aging_updated_at` (allowed fields per Phase 8 immutability trigger) | N/A | `log.info()`, Sentry on failure |
| `invoices` new columns | RLS (existing) | Existing policies | Existing `tenant_id` USING/WITH CHECK | N/A | `sent_at`, `sent_to_email`, `receipt_sent_at` are metadata — immutability trigger allows `updated_at` and notes on paid invoices; new columns must be added to the allowed-fields list | N/A | N/A |

### Critical Immutability Consideration

The Phase 8 `prevent_paid_invoice_mutation()` trigger locks specific columns on paid invoices. The new columns (`last_reminder_at`, `reminder_count`, `sent_at`, `sent_to_email`, `receipt_sent_at`) are metadata fields that may need to be updated after payment (e.g., sending a receipt on a paid invoice). These columns must be added to the trigger's allowed-update list alongside `aging_bucket`, `aging_updated_at`, `notes`, and `updated_at`.

**This requires a migration (105) to ALTER the trigger function.**

---

## 4. Proof Plan

### Runtime Proof Required

| Test | Method | Expected Result |
|---|---|---|
| Invoice send — happy path | `POST /api/invoices/[id]/send` with valid draft invoice | 200, status → `sent`, `sent_at` populated, email delivered, audit log created |
| Invoice send — paid invoice rejected | `POST /api/invoices/[id]/send` with paid invoice | 400, status unchanged |
| Invoice send — wrong tenant | `POST /api/invoices/[id]/send` with invoice from different tenant | 404 (RLS returns no rows) |
| Invoice send — insufficient permission | Call with `billing:view` role (not `billing:edit`) | 403 |
| Receipt send | `POST /api/invoices/[id]/receipt` after payment recorded | 200, `receipt_sent_at` populated, email delivered |
| Batch send | `POST /api/invoices/batch-send` with 3 draft invoices | 200, all 3 transition to `sent` |
| Client statement | `GET /api/contacts/[id]/statement` | 200, returns matters + invoices + payments + trust balance |

### Negative Path Tests

| Test | Expected Result |
|---|---|
| Send invoice with no billing contact email | 400, descriptive error |
| Send invoice already in `sent` status | 400, "Invoice already sent" |
| Batch send with mix of draft and non-draft | Partial success: only drafts sent, non-drafts returned as errors |
| Cron with invalid `CRON_SECRET` | 401 |
| Reminder cron on invoice with `last_reminder_at` < 24h ago | Skipped, no email sent |
| Overdue cron on paid invoice | Skipped, status unchanged |
| Aging cron on paid invoice | Only updates `aging_bucket` (allowed by immutability trigger) |

### Role/RLS Denial Tests

| Role | Route | Expected |
|---|---|---|
| Front Desk (no billing permission) | `POST /api/invoices/[id]/send` | 403 |
| Paralegal (`billing:view` only) | `POST /api/invoices/[id]/send` | 403 |
| Paralegal (`billing:view` only) | `GET /api/contacts/[id]/statement` | 200 (view permitted) |
| Admin | All billing routes | 200 (Admin bypasses permission checks) |
| Unauthenticated | Any billing route | 401 |

### Cron Idempotency Tests

| Test | Method | Expected |
|---|---|---|
| Overdue cron run twice in same hour | Run cron, check results, run again | Second run: 0 invoices transitioned (already overdue) |
| Reminder cron run twice in same day | Run cron, check results, run again | Second run: 0 reminders sent (`last_reminder_at` within minimum interval) |
| Aging cron run twice | Run cron, check results, run again | Second run: same buckets, `aging_updated_at` updated but values unchanged |

### Restore Impact

| Item | Impact |
|---|---|
| New columns on `invoices` | Non-destructive: nullable with defaults. Restore of pre-Phase-9 backup will have NULL values; first cron run will populate aging. |
| Migration 105 (trigger update) | Must be re-applied after restore if restoring from pre-Phase-9 backup. |
| Baseline update | Table count unchanged (212). Trigger count unchanged (112, trigger function body updated but trigger count same). Column count on `invoices` increases by 5. |

### Observability Proof

| Item | Proof |
|---|---|
| Cron job success logging | Structured JSON log with `cron_name`, `invoices_processed`, `duration_ms` |
| Cron job failure reporting | Sentry event with cron name, error details, tenant context |
| Invoice send audit trail | `audit_logs` row with `action: 'invoice_sent'`, `entity_type: 'invoice'`, `entity_id`, `user_id` |
| Email delivery tracking | Resend webhook or delivery status logged |

### Test Data Cleanup Plan

| Data | Cleanup |
|---|---|
| Test invoices created during proof | Delete via SQL (temporarily disable immutability trigger, delete, re-enable) — same pattern as Phase 8 restore test |
| Test notification records | Delete from `notifications` where title matches test pattern |
| Test audit log entries | Audit logs are immutable by design — test entries remain (tagged with `[TEST]` prefix in metadata) |

---

## 5. Technical Design

### Schema Plan

**Migration 105 — Invoice Lifecycle Columns and Trigger Update:**

```sql
-- Add lifecycle tracking columns
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS last_reminder_at TIMESTAMPTZ;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS reminder_count INTEGER DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS sent_to_email TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS receipt_sent_at TIMESTAMPTZ;

-- Update immutability trigger to allow metadata fields on paid invoices
CREATE OR REPLACE FUNCTION prevent_paid_invoice_mutation()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status = 'paid' THEN
    -- Allow only metadata field updates on paid invoices
    IF (
      NEW.total IS DISTINCT FROM OLD.total OR
      NEW.amount_paid IS DISTINCT FROM OLD.amount_paid OR
      NEW.status IS DISTINCT FROM OLD.status OR
      NEW.invoice_number IS DISTINCT FROM OLD.invoice_number OR
      NEW.matter_id IS DISTINCT FROM OLD.matter_id OR
      NEW.tenant_id IS DISTINCT FROM OLD.tenant_id OR
      NEW.issue_date IS DISTINCT FROM OLD.issue_date OR
      NEW.due_date IS DISTINCT FROM OLD.due_date OR
      NEW.contact_id IS DISTINCT FROM OLD.contact_id
    ) THEN
      RAISE EXCEPTION 'Paid invoices are immutable. Use a credit note or reversal for corrections. Invoice: %', OLD.id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

This preserves the existing immutability contract (core financial fields locked) while allowing metadata updates (`aging_bucket`, `aging_updated_at`, `notes`, `updated_at`, `last_reminder_at`, `reminder_count`, `sent_at`, `sent_to_email`, `receipt_sent_at`).

### API Contract Changes

**`POST /api/invoices/[id]/send`**

```
Request:  { email_override?: string }  // optional: override billing contact email
Response: { success: true, sent_to: string, sent_at: string }
Errors:   400 (not draft), 403 (no permission), 404 (not found / wrong tenant)
```

**`POST /api/invoices/[id]/receipt`**

```
Request:  { email_override?: string }
Response: { success: true, sent_to: string, receipt_sent_at: string }
Errors:   400 (no payment recorded), 403, 404
```

**`POST /api/invoices/batch-send`**

```
Request:  { invoice_ids: string[] }  // max 50
Response: { sent: string[], failed: { id: string, reason: string }[] }
Errors:   400 (empty list, exceeds 50), 403
```

**`GET /api/contacts/[id]/statement`**

```
Request:  Query params: ?from=2026-01-01&to=2026-03-15 (optional date range)
Response: { contact, matters: [{ matter, invoices, payments }], trust_balance, total_outstanding }
Errors:   403, 404
```

**`GET /api/cron/overdue-detection`**

```
Headers:  Authorization: Bearer {CRON_SECRET}
Response: { processed: number, transitioned: number }
Errors:   401 (invalid secret)
```

**`GET /api/cron/invoice-reminders`**

```
Headers:  Authorization: Bearer {CRON_SECRET}
Response: { processed: number, reminders_sent: number, skipped: number }
Errors:   401
```

**`GET /api/cron/aging-recalculation`**

```
Headers:  Authorization: Bearer {CRON_SECRET}
Response: { processed: number, buckets_changed: number }
Errors:   401
```

### UI Flow Changes

**Billing page — invoice row actions:**

Current: `Mark Sent` (manually changes status)
New: `Send Invoice` (emails PDF, transitions status, logs audit) replaces `Mark Sent` for draft invoices

**Billing page — after recording payment:**

Current: Dialog closes
New: Dialog closes → toast with "Send Receipt?" action button → clicking triggers `POST /api/invoices/[id]/receipt`

**Billing page — batch operations:**

Current: None
New: Checkbox selection on draft invoices → "Send Selected" button → progress indicator → result summary toast

### Edge Cases

| Edge Case | Handling |
|---|---|
| Billing contact has no email address | Return 400 with message "Billing contact has no email address. Add an email to the contact record or provide an email override." |
| Invoice has $0 total | Allow send (legitimate for retainer-only matters). Log warning. |
| Resend API failure during batch send | Continue processing remaining invoices. Return partial success with failed IDs and reasons. |
| Cron runs during maintenance window | Cron jobs are idempotent. Re-running after maintenance produces correct results. |
| Invoice deleted between batch-send request and processing | Skip with error "Invoice not found". |
| Multiple payments on same invoice (partial payments) | Receipt generation includes all payments to date, not just latest. |
| Contact has multiple email addresses | Use primary email from `contacts.email`. `email_override` in request body allows caller to specify. |

### Rollback Plan

| Scenario | Action |
|---|---|
| Migration 105 causes issues | Corrective migration 106: revert trigger function to Phase 8 version. New columns are nullable — can remain without harm. |
| Invoice send route has bugs | Disable "Send Invoice" button in UI by reverting UI change. Backend route can remain deployed (unused). |
| Cron jobs misbehave | Remove cron entries from `vercel.json` and redeploy. Cron endpoints remain but are not called. |
| Full Phase 9 rollback | Vercel instant rollback to pre-Phase-9 deployment. New columns remain in DB (harmless). Trigger function reverted via corrective migration. |

### Deployment Impact

| Item | Impact |
|---|---|
| Migration 105 | Must run before deploying code (code references new columns) |
| `vercel.json` cron changes | Take effect on next deployment |
| `CRON_SECRET` env var | Must be set in Vercel before cron jobs fire |
| Resend API key | Already configured (used by existing email service) |
| Zero downtime | Yes — ALTER TABLE ADD COLUMN is non-blocking in PostgreSQL |

### Post-Deploy Smoke Test List

- [ ] `POST /api/invoices/[id]/send` with a draft test invoice — email received
- [ ] `POST /api/invoices/[id]/send` with a paid invoice — 400 returned
- [ ] `POST /api/invoices/[id]/receipt` after recording test payment — receipt email received
- [ ] `GET /api/contacts/[id]/statement` — returns valid statement JSON
- [ ] `GET /api/cron/overdue-detection` with valid `CRON_SECRET` — 200 returned
- [ ] `GET /api/cron/overdue-detection` with invalid secret — 401 returned
- [ ] `GET /api/cron/invoice-reminders` — 200, logs show processing count
- [ ] `GET /api/cron/aging-recalculation` — 200, aging buckets correct
- [ ] Billing page — "Send Invoice" button visible on draft invoices
- [ ] Billing page — "Send Receipt" option after recording payment
- [ ] Sentry — verify cron job errors reported (trigger intentional test error)
- [ ] Structured logs — verify cron entries appear with `cron_name` field

---

## 6. Execution Plan

### Phase 9A — Schema and Infrastructure (Day 1)

**What:** Migration 105, cron auth helper, invoice email service

| Task | Files | Dependency |
|---|---|---|
| Write migration 105 (columns + trigger update) | `scripts/migrations/105-invoice-lifecycle.sql` | None |
| Run migration 105 on Supabase | Supabase MCP | Migration file ready |
| Update `lib/types/database.ts` with new columns | `lib/types/database.ts` | Migration applied |
| Create cron auth helper | `lib/middleware/cron-auth.ts` | None |
| Create invoice email service | `lib/services/invoice-email-service.ts` | Resend SDK, invoice-pdf utility |
| Create receipt PDF generator | `lib/utils/receipt-pdf.ts` | invoice-pdf patterns |

**Why first:** All subsequent work depends on the schema being updated and the email/cron infrastructure being available.

### Phase 9B — API Routes and Cron Jobs (Days 2-3)

**What:** All 7 new API endpoints

| Task | Files | Dependency |
|---|---|---|
| Invoice send route | `app/api/invoices/[id]/send/route.ts` | 9A (email service) |
| Invoice receipt route | `app/api/invoices/[id]/receipt/route.ts` | 9A (receipt PDF) |
| Batch send route | `app/api/invoices/batch-send/route.ts` | 9A (email service) |
| Client statement route | `app/api/contacts/[id]/statement/route.ts` | 9A (schema) |
| Overdue detection cron | `app/api/cron/overdue-detection/route.ts` | 9A (cron auth) |
| Invoice reminders cron | `app/api/cron/invoice-reminders/route.ts` | 9A (cron auth, email service) |
| Aging recalculation cron | `app/api/cron/aging-recalculation/route.ts` | 9A (cron auth) |
| Update `vercel.json` with cron entries | `vercel.json` | Cron routes ready |
| Wire notification events | `lib/services/notification-engine.ts` | 9A |
| Add query hooks | `lib/queries/invoicing.ts` | Routes ready |

**Why second:** Routes are the core deliverable. They must be tested independently before wiring to UI.

### Phase 9C — UI Wiring and Proof Pack (Day 4)

**What:** UI button changes, proof pack execution

| Task | Files | Dependency |
|---|---|---|
| Replace "Mark Sent" with "Send Invoice" button | `app/(dashboard)/billing/page.tsx` | 9B (send route) |
| Add "Send Receipt" after payment recording | `app/(dashboard)/billing/page.tsx` | 9B (receipt route) |
| Add batch send UI | `app/(dashboard)/billing/page.tsx` | 9B (batch route) |
| Add client statement link to contact detail | Contact detail page | 9B (statement route) |
| Execute full proof pack | Live DB | 9A + 9B + 9C |
| Update restore test baseline | `docs/restore-test-evidence.md` | All changes deployed |
| Deliver Phase 9 evidence package | `docs/phase9-evidence-package.md` | Proof pack complete |

**Why last:** UI wiring is the thinnest layer. Proof pack must cover the entire phase.

### Critical Path

```
Migration 105 → Email Service → Send Route → Cron Jobs → UI Wiring → Proof Pack
```

The cron jobs and UI wiring can proceed in parallel once the send route is working.

---

## 7. Post-Phase-8 Items (Outside Phase 9 Scope)

### Optional Hardening

| Item | Effort | Notes |
|---|---|---|
| Generate DB types via `supabase gen types` to replace manual `database.ts` | 2 hours | Reduces schema drift risk further. Requires Supabase CLI access. |
| Add Redis for auth session caching | 4 hours | Reduces DB load per request. Not blocking. |
| Execute full `pg_dump` / `pg_restore` into separate instance | 2 hours | Strengthens restore evidence. Requires second Supabase project. |

### Deferred Refactors

| Item | Effort | Notes |
|---|---|---|
| Consolidate portal route error handling into shared middleware | 4 hours | 22 routes share the same try/catch pattern with `PortalAuthError`. Could be a single wrapper. |
| Extract common invoice permission check into shared function | 1 hour | `/api/invoices/[id]/pdf` has inline permission check. Other invoice routes use `requirePermission()`. Align. |
| Move hardcoded aging bucket thresholds to tenant config | 2 hours | Currently 0-30, 31-60, 61-90, 91-120, 120+. Some firms use different intervals. |

### Technical Debt Not Blocking Phase 9

| Item | Impact | Notes |
|---|---|---|
| Notification engine event types are hardcoded | Low | Adding billing events requires code change, not config. Acceptable for now. |
| Push notifications not wired to any UI trigger | Low | Infrastructure ready but unused. Not a Phase 9 concern. |
| Marketing tables exist with no implementation | None | Schema-only. No code references. |
| AI interaction tables exist with no implementation | None | Schema-only. No code references. |
| Saved views table exists with no implementation | None | Schema-only. No code references. |

---

**This planning package is complete. No implementation will begin until scope memo, surface inventory, enforcement matrix, proof plan, and technical design are approved.**
