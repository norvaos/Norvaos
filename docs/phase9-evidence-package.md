# Phase 9 Evidence Package  -  Revenue Operations: Invoice Lifecycle Automation

**Date**: 2026-03-15
**Supabase Project**: ztsjvsutlrfisnrwdwfl
**Tenant**: da1788a2-8baa-4aa5-9733-97510944afac

---

## 1. Scope Delivered

Phase 9 delivers the invoice-to-payment automation layer: email dispatch with PDF attachments, payment receipts, overdue detection, reminder scheduling, aging recalculation, and client statements.

### New Files (12)

| # | File | Purpose |
|---|------|---------|
| 1 | `lib/middleware/cron-auth.ts` | CRON_SECRET bearer token auth helper |
| 2 | `lib/services/invoice-email-service.ts` | sendInvoiceEmail, sendReceiptEmail, sendReminderEmail |
| 3 | `lib/utils/receipt-pdf.ts` | Receipt PDF generator (pdf-lib + Inter fonts) |
| 4 | `scripts/migrations/105-invoice-lifecycle.sql` | Lifecycle columns, updated trigger, partial indexes |
| 5 | `scripts/migrations/106-rename-invoice-total-column.sql` | Rename `total` -> `total_amount` to match codebase |
| 6 | `app/api/invoices/[id]/send/route.ts` | POST  -  send invoice email with PDF attachment |
| 7 | `app/api/invoices/[id]/receipt/route.ts` | POST  -  send payment receipt email |
| 8 | `app/api/invoices/batch-send/route.ts` | POST  -  batch send up to 50 invoices |
| 9 | `app/api/contacts/[id]/statement/route.ts` | GET  -  client billing statement |
| 10 | `app/api/cron/overdue-detection/route.ts` | Daily 6AM UTC  -  transitions past-due invoices |
| 11 | `app/api/cron/invoice-reminders/route.ts` | Monday 2PM UTC  -  sends payment reminders |
| 12 | `app/api/cron/aging-recalculation/route.ts` | Daily 4AM UTC  -  recalculates aging buckets |

### Modified Files (4)

| # | File | Change |
|---|------|--------|
| 1 | `vercel.json` | Added 3 cron entries (now 5 total) |
| 2 | `lib/queries/invoicing.ts` | Added useSendInvoice, useSendReceipt, useBatchSendInvoices, useClientStatement hooks |
| 3 | `app/(dashboard)/billing/page.tsx` | Replaced "Send" with "Send Invoice" (email dispatch), added "Send Receipt" for paid invoices |
| 4 | `components/matters/tabs/billing-tab.tsx` | Same UI changes for matter-level billing tab |

### Total: 12 new files + 4 modified files = 16 files

---

## 2. Migrations Applied

### Migration 105  -  Invoice Lifecycle
- **Status**: Applied to production
- **Columns added**: `last_reminder_at`, `reminder_count`, `sent_at`, `sent_to_email`, `receipt_sent_at`
- **Indexes added**: `idx_invoices_status_due_date` (partial), `idx_invoices_reminder_tracking` (partial)
- **Trigger updated**: `prevent_paid_invoice_mutation()`  -  allows metadata writes, blocks financial field changes

### Migration 106  -  Column Rename
- **Status**: Applied to production
- **Change**: `invoices.total` renamed to `invoices.total_amount`
- **Reason**: DB column name was `total` but all TypeScript types and application code referenced `total_amount`. This was a pre-existing latent mismatch (no invoice data existed so it hadn't manifested). Proof pack caught it during trigger testing.
- **Trigger refreshed**: `prevent_paid_invoice_mutation()` rebuilt with correct column reference.

---

## 3. Proof Pack Results

### Proof 1: Migration Columns Exist
**Result**: PASS
```
last_reminder_at  | timestamp with time zone | null
receipt_sent_at   | timestamp with time zone | null
reminder_count    | integer                  | 0
sent_at           | timestamp with time zone | null
sent_to_email     | text                     | null
```

### Proof 2: Partial Indexes Exist
**Result**: PASS
```
idx_invoices_status_due_date     -  btree (status, due_date) WHERE status IN ('sent','viewed','overdue')
idx_invoices_reminder_tracking   -  btree (status, due_date, last_reminder_at) WHERE status IN ('sent','viewed','overdue')
```

### Proof 3: Metadata Update on Paid Invoice (Positive Path)
**Result**: PASS
- Created paid invoice TEST-P9-VERIFY (total_amount=11300, status=paid)
- Updated: `last_reminder_at=NOW(), reminder_count=3, sent_at=NOW(), sent_to_email='verify@test.com', receipt_sent_at=NOW()`
- SELECT confirmed all metadata fields written while financial fields unchanged
- Test data cleaned up

### Proof 4a: Financial Field Update Blocked (total_amount)
**Result**: PASS
```
ERROR: P0001: Paid invoices are immutable. Use a credit note or reversal for corrections. Invoice: 0208dd11-...
CONTEXT: PL/pgSQL function prevent_paid_invoice_mutation() line 17 at RAISE
```

### Proof 4b: Status Change Blocked
**Result**: PASS
```
ERROR: P0001: Paid invoices are immutable. Use a credit note or reversal for corrections. Invoice: 0208dd11-...
```

### Proof 4c: Delete Blocked
**Result**: PASS
```
ERROR: P0001: Paid invoices cannot be deleted. Invoice: 0208dd11-...
CONTEXT: PL/pgSQL function prevent_paid_invoice_delete() line 4 at RAISE
```

### Proof 5: Overdue Detection Query
**Result**: PASS
- Query `SELECT COUNT(*) FROM invoices WHERE status IN ('sent','viewed') AND due_date < CURRENT_DATE` executed successfully
- 0 candidates (no invoice data yet  -  expected)

### Proof 6: Aging Bucket Query
**Result**: PASS
- Aging bucket CASE query executed successfully
- Empty result set (no unpaid invoices  -  expected)

### Proof 7: Reminder Index Usage (EXPLAIN)
**Result**: PASS
```
Index Scan using idx_invoices_reminder_tracking on invoices (cost=0.12..2.35 rows=1 width=166)
  Index Cond: ((status)::text = 'overdue'::text)
  Filter: (tenant_id = 'da1788a2-...'::uuid)
```
- Optimizer uses the partial index as designed  -  no sequential scans.

---

## 4. TypeScript Compilation

**Result**: PASS  -  zero Phase 9 type errors
- All 16 Phase 9 files compile cleanly
- 3 pre-existing errors in `lib/services/notifications/` (delivery-tracker module + Resend type)  -  unrelated to Phase 9

---

## 5. Build Verification

**Result**: PASS  -  `npx next build` completes successfully
- All new API routes compiled
- All cron routes compiled
- All UI components compiled

---

## 6. Security Controls

### Authentication & Authorization
| Route | Auth | Permission |
|-------|------|-----------|
| POST /api/invoices/[id]/send | authenticateRequest | billing:edit |
| POST /api/invoices/[id]/receipt | authenticateRequest | billing:edit |
| POST /api/invoices/batch-send | authenticateRequest | billing:edit |
| GET /api/contacts/[id]/statement | authenticateRequest | billing:view |
| POST /api/cron/overdue-detection | CRON_SECRET bearer | N/A (service role) |
| POST /api/cron/invoice-reminders | CRON_SECRET bearer | N/A (service role) |
| POST /api/cron/aging-recalculation | CRON_SECRET bearer | N/A (service role) |

### Tenant Isolation
- All user-facing routes filter by `tenant_id` from authenticated session
- All cron routes use `createAdminClient()` with explicit tenant loop
- No cross-tenant data leakage paths

### Idempotency Guards
- Reminder emails: 24-hour minimum gap via `last_reminder_at` check
- Cron overdue detection: only transitions `sent`/`viewed` → `overdue` (no double-transition)
- Aging recalculation: bucket comparison before UPDATE (skips if unchanged)

---

## 7. Cron Schedule (vercel.json)

| Cron | Schedule | Purpose |
|------|----------|---------|
| /api/cron/aging-recalculation | 0 4 * * * (Daily 4AM UTC) | Recalculate aging buckets |
| /api/cron/overdue-detection | 0 6 * * * (Daily 6AM UTC) | Transition past-due invoices |
| /api/cron/deadline-alerts | 0 8 * * * (Daily 8AM UTC) | Pre-existing |
| /api/cron/document-reminders | 0 9 * * 1 (Monday 9AM UTC) | Pre-existing |
| /api/cron/invoice-reminders | 0 14 * * 1 (Monday 2PM UTC) | Send payment reminders |

---

## 8. Issue Found & Fixed During Proof Pack

**Column name mismatch**: `invoices.total` (DB) vs `total_amount` (TypeScript types + all code)
- **Root cause**: Pre-existing. The column was created as `total` in an earlier migration, but the manually-maintained TypeScript types defined it as `total_amount`. No invoice data existed, so the mismatch was latent.
- **Discovery**: Proof 3 INSERT failed with `column "total_amount" does not exist`.
- **Fix**: Migration 106  -  `ALTER TABLE invoices RENAME COLUMN total TO total_amount`
- **Impact**: Without this fix, all invoice email dispatch, PDF generation, and amount calculations would have returned `undefined` at runtime.

---

## 9. Known Limitations

1. **Email delivery requires RESEND_API_KEY**  -  All email functions gracefully return `{ success: false, error: 'RESEND_API_KEY not configured' }` when the key is missing.
2. **PDF font loading**  -  Receipt PDF uses `readFileSync` for Inter font from `public/fonts/`. Requires font files to be present at deploy time.
3. **Cron auth in development**  -  When `CRON_SECRET` is unset, cron endpoints accept any request (dev passthrough).
4. **Batch send rate limit**  -  100ms delay between emails is client-side. No server-side queue. Max 50 per batch.
5. **Client statement trust balance**  -  Uses `amount_cents` from `trust_transactions`. Assumes all trust transactions have valid `matter_id` linkage.

---

## 10. Checklist

- [x] Migration 105 applied  -  lifecycle columns + indexes
- [x] Migration 106 applied  -  column rename fix
- [x] Immutability trigger verified  -  metadata allowed, financial fields blocked
- [x] 4 API routes created with auth + audit logging
- [x] 3 cron routes created with CRON_SECRET auth
- [x] vercel.json updated with 3 new cron entries
- [x] TanStack Query hooks added for all new endpoints
- [x] UI wired  -  "Send Invoice" replaces "Send", "Send Receipt" added for paid invoices
- [x] TypeScript compilation: zero Phase 9 errors
- [x] Next.js build: PASS
- [x] 7 proof tests executed against live Supabase: all PASS
- [x] Test data cleaned up  -  zero residual test invoices
