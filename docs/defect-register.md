# NorvaOS Defect Register

Tracked defects found during Team 2 delivery. Each entry requires explicit approval before a fix is applied.

---

## DEF-001 — collections-service.ts: balance_due / total column mismatch

**Status:** Open — awaiting approval
**Severity:** High — incorrect financial figures returned
**File:** `lib/services/analytics/collections-service.ts`
**Lines:** ~601–672

**Description:**
Same column mismatch as was present in `analytics-service.ts` (fixed in Module 2).
The service queries `invoices.total` and `invoices.balance_due`, neither of which exists:
- Correct column name: `total_amount`
- `balance_due` does not exist as a stored column — must be computed as `total_amount - amount_paid`

**Impact:**
Client account statement totals (`total_cents`, `amount_paid_cents`, `balance_cents`) all compute from wrong source fields. `balance_due` returns `null` → `0` silently. Client statements show incorrect outstanding balances.

**Fix pattern (same as analytics-service.ts Module 2 fix):**
- In the `.select(...)` string: `total, balance_due` → `total_amount, amount_paid`
- In the mapping: `Number(inv.total)` → `Number(inv.total_amount)`, `Number(inv.balance_due)` → `Math.max(0, Number(inv.total_amount) - Number(inv.amount_paid))`

**Approval required before touching.**
Do not fix until separately approved.

---
