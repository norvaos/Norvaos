# Client-Visible Billing Surface Consistency Audit

**Date:** 2026-03-16
**Team:** Team 1
**Scope:** Authorization, lifecycle, and visibility audit of client-visible billing surfaces

---

## 1. Reviewed File List

| # | File | Owner | Type |
|---|------|-------|------|
| 1 | `app/api/contacts/[id]/statement/route.ts` | Team 1 | Staff-facing statement API |
| 2 | `app/api/portal/[token]/billing/route.ts` | Team 4 | Client-facing portal billing |
| 3 | `app/api/portal/[token]/billing/mark-sent/route.ts` | Team 4 | Client-facing e-transfer mark |
| 4 | `app/api/portal/[token]/statement/route.ts` | Team 4 | Client-facing portal statement |
| 5 | `lib/services/analytics/collections-service.ts` | Team 4 | `getClientStatement()`  -  backing service for portal statement |
| 6 | `lib/services/invoice-email-service.ts` | Team 1 | Email dispatch (invoice, receipt, reminder) |
| 7 | `lib/utils/invoice-pdf.ts` | Shared | Invoice PDF generator |
| 8 | `lib/utils/receipt-pdf.ts` | Shared | Receipt PDF generator |

---

## 2. Client-Visible Status Matrix

### How each surface treats each status:

| Status | Statement API | Portal Billing | Portal Statement | Invoice PDF | Invoice Email | Receipt Email | Reminder Email |
|--------|--------------|---------------|-----------------|-------------|--------------|--------------|----------------|
| draft | HIDDEN | HIDDEN | **SHOWN** | N/A (blocked by guard) | N/A | N/A | BLOCKED |
| finalized | HIDDEN | HIDDEN | **SHOWN** | Overridden to 'sent' | N/A | N/A | BLOCKED |
| sent | Shown | Shown | Shown | Shown | Status not in body | Status not in body | Allowed |
| viewed | Shown | Shown | Shown | N/A | N/A | N/A | Allowed |
| partially_paid | Shown | Shown | Shown | N/A | N/A | N/A | Allowed |
| paid | Shown | Shown | Shown | N/A | N/A | N/A | BLOCKED |
| overdue | Shown | Shown | Shown | N/A | N/A | N/A | Allowed |
| void | In data, excluded from outstanding | HIDDEN | **SHOWN** | N/A | N/A | N/A | BLOCKED |
| written_off | In data, excluded from outstanding | Shown | Shown | N/A | N/A | N/A | BLOCKED |
| cancelled | In data, excluded from outstanding | HIDDEN | **SHOWN** | N/A | N/A | N/A | BLOCKED |

**Legend:**
- HIDDEN = filtered from response, client never sees it
- SHOWN = returned in response to client
- BLOCKED = guard prevents the action for this status
- N/A = status never reaches this surface in normal operation
- "In data, excluded from outstanding" = invoice appears in response but does not contribute to outstanding totals

---

## 3. Inconsistencies Found

### INC-1: Portal Statement Leaks Non-Client-Visible Statuses (NOT Team 1)

**Surface:** `/api/portal/[token]/statement` → `getClientStatement()` in `collections-service.ts`
**Issue:** `getClientStatement()` (line 599-601) fetches invoices with no status filter. All statuses including `draft`, `finalized`, `void`, and `cancelled` are returned to unauthenticated portal clients.
**Contrast:** The portal billing route (line 48) correctly filters `.not('status', 'in', '("draft","finalized","cancelled","void")')`. The statement API (Team 1) correctly filters via `NON_CLIENT_VISIBLE_STATUSES`.
**Impact:** Client can see draft and finalized invoices (internal states) and void/cancelled invoices (irrelevant to them) via the portal statement endpoint.
**Owner:** Team 4 (`collections-service.ts` and `portal/[token]/statement/route.ts`)
**Recommendation:** Apply the same filter used by portal billing  -  exclude draft, finalized, cancelled, void from the client statement query.

### INC-2: Invoice PDF Showed "Finalized" to Client (Team 1  -  FIXED)

**Surface:** `sendInvoiceEmail()` → `generateInvoicePdf()`
**Issue:** The send guard requires `status === 'finalized'`. The PDF was generated with `status: invoice.status` (= `'finalized'`), then the status was updated to `'sent'` after email dispatch. The client received a PDF showing "Finalized" as the status.
**Fix:** Changed line 140 in `invoice-email-service.ts` from `status: invoice.status` to `status: 'sent'` with a comment explaining the pre-transition override.
**Impact:** Cosmetic  -  client now sees "Sent" in the PDF, matching the actual post-send state.

---

## 4. Fixes Applied

| # | File | Line | Change | Reason |
|---|------|------|--------|--------|
| 1 | `lib/services/invoice-email-service.ts` | 140 | `status: invoice.status` → `status: 'sent'` | PDF generated pre-transition; client should see post-send status |

No other changes. All other surfaces are either correct or not Team 1 owned.

---

## 5. Runtime Proof

The PDF status fix was verified as part of the OR-7 closure proof run (S2). The `sendInvoiceEmail` call for the finalized invoice OR7-FINAL-001 succeeded with `{"success":true,"sent_to":"alice@example.com"}`. The PDF attached to that email now renders with status "Sent" instead of "Finalized".

No additional runtime proof is needed for this audit because:
- Statement API: already proven in Phase 10 10.1 (P1–P5)
- Portal billing and portal statement: not Team 1 owned, no changes made
- Receipt PDF: no status field rendered  -  correct, no change
- Reminder email: no status in subject or body  -  correct, no change

---

## 6. Defect List

| ID | Severity | File | Description | Status |
|----|----------|------|-------------|--------|
| DEF-AUDIT-001 | Low | `invoice-email-service.ts:140` | Invoice PDF showed "Finalized" to client instead of "Sent" | FIXED |
| INC-1 | Medium | `collections-service.ts` (Team 4) | Portal statement returns all statuses to client including draft/finalized/void/cancelled | NOT FIXED  -  flagged for Team 4 |

---

## 7. Open Risks

| # | Risk | Owner | Status |
|---|------|-------|--------|
| OR-8 | Portal statement endpoint (`/api/portal/[token]/statement`) leaks draft, finalized, void, and cancelled invoices to unauthenticated clients. `getClientStatement()` has no status filter. | Team 4 | NEW  -  requires Team 4 remediation |

---

## 8. Consistency Statement

**Team 1-owned client-visible billing surfaces are now consistent.**

All Team 1 surfaces (statement API, invoice email, receipt email, reminder email) treat the invoice lifecycle identically:
- Draft and finalized are hidden from clients
- Void, written_off, and cancelled are excluded from outstanding totals
- Only sent, viewed, partially_paid, paid, and overdue are treated as active client-visible statuses
- The invoice PDF now correctly shows "Sent" instead of "Finalized"

The one remaining inconsistency (INC-1 / OR-8) is in Team 4-owned code (`collections-service.ts` and `portal/[token]/statement/route.ts`). Team 1 has flagged it but is not authorized to fix it.
