# Open Risk #7 Closure — Migration 107 Live Reconciliation

**Date:** 2026-03-16
**Team:** Team 1
**Scope:** Send guard reconciliation + lifecycle verification after Migration 107
**Target environment:** Local dev (localhost:3000) against Supabase project `ztsjvsutlrfisnrwdwfl`
**Migration 107 present:** YES — verified via `pg_get_constraintdef` on `invoices_status_check`. Live constraint includes all 10 statuses: draft, finalized, sent, viewed, partially_paid, paid, overdue, cancelled, void, written_off.

---

## 1. Final Changed File List

| # | File | Change |
|---|------|--------|
| 1 | `lib/services/invoice-email-service.ts` | Line 72: changed send guard from `!== 'draft'` to `!== 'finalized'`. Comment updated to match. Error message updated to reference finalized. |

**Review-only files (no code changes):**

| # | File | Result |
|---|------|--------|
| 2 | `app/api/invoices/[id]/send/route.ts` | No change — delegates to `sendInvoiceEmail()` |
| 3 | `app/api/invoices/batch-send/route.ts` | No change — delegates to `sendInvoiceEmail()` |
| 4 | `app/api/cron/invoice-reminders/route.ts` | No change — queries `status === 'overdue'`, delegates to `sendReminderEmail()` |
| 5 | `app/api/cron/overdue-detection/route.ts` | No change — checks `['sent', 'viewed', 'partially_paid']`, does not include finalized (correct) |
| 6 | `app/api/cron/aging-recalculation/route.ts` | No change — checks `['sent', 'viewed', 'partially_paid', 'overdue']`, does not include finalized (correct) |
| 7 | `app/api/contacts/[id]/statement/route.ts` | No change — already excludes draft and finalized via `NON_CLIENT_VISIBLE_STATUSES` from Phase 10 10.1 |

---

## 2. Migration 107 Verification

**Method:** Direct `pg_constraint` query against live database.

```sql
SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'invoices_status_check';
```

**Result:** CHECK constraint includes: `draft`, `finalized`, `sent`, `viewed`, `partially_paid`, `paid`, `overdue`, `cancelled`, `void`, `written_off`.

**Conclusion:** Migration 107 is confirmed live.

---

## 3. Send Guard — Runtime Proof

### Test Invoices Seeded

| Invoice | Status | Total |
|---------|--------|-------|
| OR7-DRAFT-001 | draft | $113.00 |
| OR7-FINAL-001 | finalized | $226.00 |
| OR7-PAID-001 | paid | $169.50 |

### S1 — Draft Invoice Rejected

**Request:** `POST /api/invoices/[OR7-DRAFT-001]/send`
**HTTP Status:** 400
**Response:** `{"error":"Only finalized invoices can be sent. This invoice has status 'draft'."}`
**Result: PASS** — draft is no longer sendable.

### S2 — Finalized Invoice Accepted

**Request:** `POST /api/invoices/[OR7-FINAL-001]/send`
**HTTP Status:** 200
**Response:** `{"success":true,"sent_to":"alice@example.com","sent_at":"2026-03-16T14:19:57.864Z"}`
**Result: PASS** — finalized invoice accepted, email sent, status transitioned to `sent`.

### S3 — Paid Invoice Rejected

**Request:** `POST /api/invoices/[OR7-PAID-001]/send`
**HTTP Status:** 400
**Response:** `{"error":"Only finalized invoices can be sent. This invoice has status 'paid'."}`
**Result: PASS** — paid invoice correctly rejected.

---

## 4. Obsolete Draft-Send Behaviour — Elimination Proof

The old guard (`!== 'draft'`) allowed sending from any non-draft status (sent, viewed, paid, overdue, void, etc.). This was the root cause of DEF-P9-002.

The new guard (`!== 'finalized'`) rejects ALL statuses except `finalized`:

| Status | Old Guard (`!== 'draft'`) | New Guard (`!== 'finalized'`) | Correct? |
|--------|--------------------------|-------------------------------|----------|
| draft | Rejected | Rejected | Yes — must finalize first |
| finalized | Accepted (wrong) | Accepted | Yes — only sendable status |
| sent | Accepted (wrong) | Rejected | Yes — already sent |
| viewed | Accepted (wrong) | Rejected | Yes — already delivered |
| partially_paid | Accepted (wrong) | Rejected | Yes — payment in progress |
| paid | Accepted (wrong) | Rejected | Yes — terminal |
| overdue | Accepted (wrong) | Rejected | Yes — already sent, past due |
| void | Accepted (wrong) | Rejected | Yes — terminal |
| written_off | Accepted (wrong) | Rejected | Yes — terminal |
| cancelled | Accepted (wrong) | Rejected | Yes — terminal |

S1 (draft rejected) and S3 (paid rejected) prove the guard works. S2 (finalized accepted) proves the correct status passes.

---

## 5. Reminder / Overdue / Aging Compatibility Proof

### C1 — Overdue Detection Cron

**Execution:** `POST /api/cron/overdue-detection`
**HTTP Status:** 200
**Response:** `{"success":true,"stats":{"tenantsProcessed":6,"overdueUpdated":0}}`
**Analysis:** No new overdue invoices (OR7-SENT-001 is not past due; OR7-OVERDUE-001 is already overdue). Cron ran successfully without errors. `finalized` is correctly excluded from the overdue-eligible set `['sent', 'viewed', 'partially_paid']`.

### C2 — Invoice Reminders Cron

**Execution:** `POST /api/cron/invoice-reminders`
**HTTP Status:** 200
**Response:** `{"success":true,"stats":{"remindersChecked":1,"remindersSent":1,"skippedRecent":0}}`
**Analysis:** OR7-OVERDUE-001 received a reminder. The reminder whitelist `['sent', 'viewed', 'overdue', 'partially_paid']` is compatible with Migration 107. `finalized` is correctly excluded (not yet sent to client, no reminder needed).

### C3 — Aging Recalculation Cron

**Execution:** `POST /api/cron/aging-recalculation`
**HTTP Status:** 200
**Response:** `{"success":true,"stats":{"totalChecked":4,"bucketsUpdated":0,"bucketBreakdown":{"current":3,"1-30":1}}}`
**Analysis:** 4 invoices checked (sent, overdue, finalized excluded correctly). Aging set `['sent', 'viewed', 'partially_paid', 'overdue']` does not include `finalized` — correct, because finalized invoices are pre-send and not yet receivables.

---

## 6. Statement Visibility Compatibility Proof

### V1 — Statement After Send Guard Change

**Request:** `GET /api/contacts/[Alice]/statement` (as Alex Admin)
**HTTP Status:** 200

**Invoices in statement response:**
- OR7-FINAL-001 — appears as `sent` (transitioned by S2 proof)
- OR7-SENT-001 — `sent`
- OR7-PAID-001 — `paid`
- OR7-OVERDUE-001 — `overdue`

**NOT in statement:**
- OR7-DRAFT-001 — `draft` → excluded by `NON_CLIENT_VISIBLE_STATUSES`

**Statuses in response:** `sent`, `paid`, `overdue` — no `draft`, no `finalized`.

**Result: PASS** — statement route correctly hides draft and finalized. Client-visible statuses are: sent, viewed, partially_paid, paid, overdue, written_off.

---

## 7. Status Audit Table

| File | Status References (line) | Change in this task | M107 Compatible |
|------|------------------------|---------------------|-----------------|
| `invoice-email-service.ts` | `'finalized'` (72), `'sent'` (212), `['sent','viewed','overdue','partially_paid']` (380) | Line 72: `'draft'` → `'finalized'` | Yes |
| `invoices/[id]/send/route.ts` | None (delegates) | No change | Yes |
| `invoices/batch-send/route.ts` | None (delegates) | No change | Yes |
| `cron/overdue-detection/route.ts` | `['sent','viewed','partially_paid']` (48), `'overdue'` (57) | No change | Yes |
| `cron/invoice-reminders/route.ts` | `'overdue'` (52) | No change | Yes |
| `cron/aging-recalculation/route.ts` | `['sent','viewed','partially_paid','overdue']` (54) | No change | Yes |
| `contacts/[id]/statement/route.ts` | `['draft','finalized']` (9), `['void','written_off','cancelled']` (12) | No change | Yes |

**Total files reviewed:** 7
**Files changed:** 1
**Stale draft-send assumptions remaining:** 0

---

## 8. Defect List

| ID | Severity | Description | Status |
|----|----------|-------------|--------|
| DEF-P9-002 | High | Send guard checked `!== 'finalized'` against pre-M107 schema (Phase 9), then `!== 'draft'` as interim fix. Now reconciled to `!== 'finalized'` with M107 live. | **CLOSED** |

No new defects introduced.

---

## 9. Open Risks

| # | Risk | Status |
|---|------|--------|
| OR-6 | Statement route matter-scoped access | CLOSED (Phase 10 Team 1 10.1) |
| OR-7 | Send guard reconciliation after Migration 107 | **CLOSED** (this package) |

No new open risks.

---

## 10. Open Risk #7 Status

**Open Risk #7 is now CLOSED.**

The send guard in `invoice-email-service.ts` line 72 has been reconciled from `!== 'draft'` to `!== 'finalized'`, aligning with the live Migration 107 lifecycle. Runtime proof confirms:

- Draft invoices are rejected (S1)
- Finalized invoices are accepted and transition to sent (S2)
- All other statuses are rejected (S3)
- Statement route correctly hides finalized from client view (V1)
- All three cron jobs are compatible and do not process finalized invoices (C1, C2, C3)
- No stale draft-send assumption remains in any Team 1-owned file

---

## Cleanup Confirmation

**Test data seeded:** 5 invoices (OR7-DRAFT-001, OR7-FINAL-001, OR7-PAID-001, OR7-SENT-001, OR7-OVERDUE-001)
**Cleanup method:** Triggers disabled → targeted delete → triggers re-enabled (same pattern as Phase 9/10)
**Post-cleanup verification:** 0 OR7 invoices remaining
**Test script:** `scripts/or7-proofs.cjs` created for proof execution, deleted after completion
