# Core Enforcement Specification v1.0

> **Status**: Active — FROZEN (see Section 10)
> **Version**: `1.3.0`
> **Last updated**: 2026-03-02
> **Constant**: `CORE_ENFORCEMENT_SPEC_VERSION` in `lib/config/version.ts`
> **Baseline commit**: `1249dd1338f3ff59f8e15eb7082c9669bc6447c5`
> **Git tag**: `enforcement-v1.0.0`
>
> This document is the single source of truth for LexCRM enforcement
> invariants. Any PR that touches a sensitive surface listed below MUST
> either confirm "no impact to enforcement invariants" or include an
> explicit spec update + regression tests. See **CI Gate** section.

---

## Table of Contents

1. [Billing Visibility](#1-billing-visibility)
2. [Enforcement-Enabled Matters & Stage Gating](#2-enforcement-enabled-matters--stage-gating)
3. [Document Slots & Versioned Uploads](#3-document-slots--versioned-uploads)
4. [Conditions Evaluation Policy](#4-conditions-evaluation-policy)
5. [Audit Immutability](#5-audit-immutability)
6. [Non-Goals](#6-non-goals)
7. [Sensitive Surfaces Registry](#7-sensitive-surfaces-registry)
8. [CI Gate](#8-ci-gate)
9. [Version History](#9-version-history)
10. [Enforcement Freeze Policy](#10-enforcement-freeze-policy)

---

## 1. Billing Visibility

### Invariant

**Billing data is visible only to users whose role includes `billing:view`.**

"Billing data" means any row from the `invoices`, `invoice_line_items`,
or `payments` tables, AND any metric derived from those rows (revenue,
accounts receivable, amount due, paid/unpaid status, KPIs, charts,
totals in sidebars).

### Three-Layer Enforcement (Canonical Trio)

| Layer | Mechanism | File | Behaviour |
|-------|-----------|------|-----------|
| **UI** | `<RequirePermission entity="billing" action="view">` | `components/require-permission.tsx` | Prevents rendering of billing content; hooks inside gated child components never execute |
| **API** | `checkBillingPermission()` | `lib/services/billing-permission.ts` | Returns 403 + writes `invoice_pdf_download_denied` audit event with role, IP, user-agent |
| **DB (RLS)** | `has_billing_view()` SECURITY DEFINER | `scripts/migrations/033-billing-rls-role-check.sql` | Blocks SELECT on `invoices`, `invoice_line_items`, `payments` unless the session user's role includes `billing:view` |

All three layers MUST be present. Removing any single layer degrades
defence-in-depth and is a spec violation.

### Enforcement Points

| Surface | Gate | File |
|---------|------|------|
| `/billing` page | `RequirePermission` (UI) | `app/(dashboard)/billing/page.tsx` |
| Matter detail Billing tab | `RequirePermission` (UI) | `app/(dashboard)/matters/[id]/page.tsx` |
| Matter sidebar financial card (total_billed, total_paid, trust_balance) | `RequirePermission` (UI, inline) | `app/(dashboard)/matters/[id]/page.tsx` |
| Reports page Revenue section (3 charts) | `RequirePermission` (UI, inline) wrapping `RevenueSection` | `app/(dashboard)/reports/page.tsx` |
| Reports page Revenue KPI StatCard | `canViewBilling` conditional | `app/(dashboard)/reports/page.tsx` |
| Reports page billing type filter | `canViewBilling` conditional | `app/(dashboard)/reports/page.tsx` |
| Reports page KPI CSV export | `canViewBilling` strips `totalBilledInPeriod` | `app/(dashboard)/reports/page.tsx` |
| RetainerBuilder (invoice/payment creation) | `RequirePermission` (UI, inline) | `components/command-centre/panels/retainer-builder.tsx` |
| Invoice PDF download API | `checkBillingPermission` (server 403 + audit) | `app/api/invoices/[id]/pdf/route.ts` |

### Denied UX

When `billing:view` is denied:

- Heading: **"Billing Restricted"** (never "Access Restricted")
- Message: "You don't have permission to view billing information. Contact your administrator."
- Zero numeric inference: no dollar signs, no financial terms, no amounts, no currency formatting
- Revenue hooks (`useReportRevenueByPracticeArea`, `useReportRevenueByBillingType`, `useReportRevenueTrend`) are inside the gated `RevenueSection` child component and never execute

### Query Prevention

Revenue React Query hooks live inside `<RevenueSection>`, which is a
child of `<RequirePermission>`. When denied, the component tree is
never mounted, so hooks never execute and no network requests are made.

For top-level hooks that return mixed data (e.g. `useReportMatterStats`
returns both matter counts and `totalBilledInPeriod`), the hook
executes but the revenue value is conditionally excluded from rendering
and CSV export via `canViewBilling`.

### CI Static Analysis

`lib/utils/__tests__/permission-wiring.test.ts` contains 4 sections:

1. **Section 1**: Manual registry of all gated surfaces (6+ entries)
2. **Section 2**: Automated scan for files importing `lib/queries/invoicing` without `RequirePermission`
3. **Section 3**: Direct Supabase billing table query detection (`.from('invoices')` etc.)
4. **Section 4**: Financial field rendering detection (patterns like `totalBilledInPeriod`, `total_billed`, `total_paid`, `trust_balance`)

---

## 2. Enforcement-Enabled Matters & Stage Gating

### Invariant

**When `enforcement_enabled` is true on a matter, stage advancement
requires all configured gating rules to pass. The enforcement flag
can only be toggled by users with the Admin role, enforced at the
database trigger level.**

### Enforcement-Enabled Toggle

| Layer | Mechanism | File |
|-------|-----------|------|
| DB trigger | `restrict_enforcement_enabled_to_admin()` SECURITY DEFINER | `scripts/migrations/027-enforcement-enabled-lockdown.sql` |
| DB audit | Auto-insert into `audit_logs` on enforcement_enabled change | Same migration |

Non-Admin users receive a PostgreSQL exception if they attempt to
change `enforcement_enabled` via any client (UI, API, or direct query).

### Gating Rules

The stage engine (`lib/services/stage-engine.ts`) evaluates 6 rule types before allowing advancement:

| Rule Type | Behaviour |
|-----------|-----------|
| `require_checklist_complete` | All checklist items for the current stage must be marked done |
| `require_deadlines` | Named deadline types must have values set |
| `require_previous_stage` | A specific prior stage must appear in stage history |
| `require_intake_complete` | Intake status must be at least `complete` (or `validated`) |
| `require_risk_review` | Risk review must exist; blocks if risk level is in `block_levels` |
| `require_document_slots_complete` | All required document slots must have an accepted version |

### Default Baseline

For enforcement-enabled matter types, `getEffectiveGatingRules()`
injects a default baseline of gating rules (checklist, document slots)
even if the target stage has no explicit rules configured. This ensures
enforcement-enabled matters always have minimum checks.

### Blocked Attempts

When gating fails:

1. An `stage_change_blocked` activity is logged with the failed rules
2. The function returns `{ success: false, failedRules: [...] }`
3. No stage state is modified (atomic: either all rules pass or none)

---

## 3. Document Slots & Versioned Uploads

### Invariant

**Document uploads for enforcement-enabled matters MUST go through
the slot-bound, versioned RPC (`upload_document_version`). Every
upload creates an immutable `document_versions` row and an audit log
entry in a single transaction.**

### Tables

| Table | Mutability | RLS |
|-------|-----------|-----|
| `document_slot_templates` | Mutable (Admin only via `settings:edit`) | Tenant isolation |
| `document_slots` | Mutable (soft-delete via `is_active` flag) | Tenant isolation |
| `document_versions` | **Immutable** (SELECT + INSERT only, no UPDATE/DELETE policies) | Tenant isolation |

### RPCs (Atomic, Transactional)

| RPC | File | Behaviour |
|-----|------|-----------|
| `upload_document_version()` | `scripts/migrations/028-document-engine.sql` | Inserts `document_versions` row, updates slot `current_version_id` + `status`, logs `audit_logs` entry. All in one transaction. |
| `review_document_version()` | `scripts/migrations/028-document-engine.sql` (updated in 032) | Sets review status (accepted/rejected/revision_requested), updates slot status, logs audit. Atomic. |

### Slot Generation

`generateDocumentSlots()` in `lib/services/document-slot-engine.ts`:

- Reads active templates for the matter's type/case type
- Evaluates conditions per template (see Section 4)
- Creates one slot per template (matter-level) or per person (person-scoped)
- Deterministic: same inputs always produce same outputs

### Slot Regeneration

`regenerateDocumentSlots()` performs a deterministic diff:

- Computes expected slots from current templates + people + intake data
- Adds new slots, soft-deletes removed slots, reactivates previously removed slots
- Returns a structured `RegenerateResult` with `added`, `removed`, `reactivated`, `unchanged`

---

## 4. Conditions Evaluation Policy

### Invariant

**Condition evaluation is fail-closed. Any malformed condition, unknown
operator, missing required field, or runtime exception causes the
conditional slot to NOT be generated. Errors are surfaced through
three channels: activity log, notification, and matter banner.**

### Fail-Closed Behaviour

In `evaluateSlotCondition()` (`lib/services/document-slot-engine.ts`):

```
if (!conditions) return true           // No conditions = unconditional slot (generated)
if (malformed condition) return false   // Fail-closed: slot NOT generated
if (unknown operator) return false      // Fail-closed: slot NOT generated
if (runtime exception) return false     // Fail-closed: slot NOT generated
```

The `evaluateSingleCondition()` function's `default` case returns
`false` for unknown operators (fail-closed).

### Supported Operators

`equals`, `not_equals`, `in`, `not_in`, `exists`, `not_exists`,
`gt`, `lt`, `gte`, `lte`

All conditions in an array use AND logic (all must pass).

### Error Surfacing

When condition evaluation fails:

| Channel | Mechanism |
|---------|-----------|
| **Activity log** | `template_condition_error` activity type logged to matter |
| **Notification** | Responsible lawyer notified of misconfigured template |
| **Matter banner** | (Surfaced through activity feed on matter detail) |

### 24-Hour Deduplication

`logConditionErrors()` deduplicates within a 24-hour window:

- If a `template_condition_error` activity exists for the same matter
  within the last 24 hours, the existing row is UPDATED (metadata
  replaced, timestamp refreshed) instead of inserting a new row
- Same deduplication applies to notifications
- Prevents spam when regeneration fires repeatedly (e.g. multiple
  intake edits) for the same broken template

### Non-Blocking

Condition error logging is wrapped in try/catch. Logging failure
never blocks slot generation or regeneration. The slot simply isn't
generated (fail-closed) and processing continues.

---

## 5. Audit Immutability

### Invariant

**Audit log rows cannot be updated or deleted by any user, including
`service_role`. The `audit_logs` and `risk_override_history` tables
are append-only.**

### Database-Level Protection

| Mechanism | Table | File |
|-----------|-------|------|
| `prevent_audit_log_mutation()` trigger | `audit_logs` | `scripts/migrations/024-uee-phase-a-hardening.sql` |
| Same trigger | `risk_override_history` | Same migration |
| Granular RLS: SELECT + INSERT only | `audit_logs` | Same migration |
| Immutable RLS: SELECT + INSERT only | `document_versions` | `scripts/migrations/028-document-engine.sql` |

The `trg_audit_logs_immutable` trigger fires BEFORE UPDATE OR DELETE
and raises an exception:
`'Audit logs are immutable. UPDATE and DELETE are prohibited.'`

This trigger cannot be bypassed by `service_role` (unlike RLS), making
it the strongest immutability guarantee in PostgreSQL.

### Events That Must Be Logged

| Event | Table | Logged By |
|-------|-------|-----------|
| Enforcement-enabled toggle change | `audit_logs` | DB trigger (migration 027) |
| Invoice PDF download denied | `audit_logs` | `checkBillingPermission` server function |
| Document version upload | `audit_logs` | `upload_document_version()` RPC |
| Document version review | `audit_logs` | `review_document_version()` RPC |
| Risk override | `risk_override_history` | Application layer |
| Stage advancement blocked | `activities` | Stage engine |
| Stage advancement success | `activities` | Stage engine |
| Template condition error | `activities` | Document slot engine |

---

## 6. Non-Goals

The following are intentionally NOT supported in v1.0:

| Non-Goal | Rationale |
|----------|-----------|
| Fine-grained billing permissions (e.g. "view invoices but not payments") | `billing:view` is currently a single gateway. Sub-permissions may be added in a future spec version. |
| Bypass overrides for billing enforcement | No admin override to bypass RLS or `RequirePermission` for billing. The only path is granting `billing:view` to the role. |
| Per-matter billing visibility | Billing permissions are role-level, not per-matter. A user either has `billing:view` for all matters or none. |
| Client portal billing access | Portal uses token-based auth (no user session). Invoice visibility in portal is controlled by token scope, not role permissions. |
| Field-level encryption for billing data | Billing data is protected by RLS and application gates, not column-level encryption. |
| Real-time condition evaluation streaming | Conditions are evaluated at slot generation/regeneration time, not continuously monitored. |
| Cross-tenant enforcement inheritance | Each tenant has independent enforcement configuration. No hierarchy or inheritance. |

---

## 7. Sensitive Surfaces Registry

Sensitive surfaces are defined in
[`docs/enforcement/sensitive-surfaces.json`](enforcement/sensitive-surfaces.json).

**The registry is normative. CI enforces it.**

A file qualifies as enforcement-sensitive if modifying it can weaken or
bypass any invariant defined in Sections 1-5 of this document. Categories:
`billing`, `stage_gating`, `documents`, `conditions`, `audit`, `settings`.

There is exactly one list of sensitive surfaces in this repository. The
CI gate (`scripts/check-spec-updated.ts`) and the regression test suite
(`lib/utils/__tests__/enforcement-regression.test.ts`) both consume
the JSON file at runtime. No duplicate registries exist anywhere.

To add a surface: edit `sensitive-surfaces.json`, update tests, get
CODEOWNERS approval. To remove a surface: same process.

---

## 8. CI Gate

### Blocking Script

`scripts/check-spec-updated.ts` runs in CI on every PR. It reads the
sensitive surfaces from `docs/enforcement/sensitive-surfaces.json` and:

1. Determines changed files via `git diff --name-only <base>...HEAD`
2. Intersects with paths from `sensitive-surfaces.json`
3. If intersection is non-empty, **requires enforcement test updates**:
   - At least one enforcement test file must be modified, OR
   - A waiver entry was added to `docs/enforcement/waivers.md`
4. Spec changes alone are NOT sufficient — tests are mandatory
5. There is no commit-message bypass. The only alternative to tests
   is a waiver entry, which itself requires CODEOWNERS approval.

### Waiver Mechanism

If a sensitive surface change genuinely has no enforcement impact,
the developer adds a waiver entry to `docs/enforcement/waivers.md`.
Waivers must include: date, change-ID, affected files, specific
justification, reviewer name, and expiry date (max 14 days).

Changes to `waivers.md`, `sensitive-surfaces.json`, and this spec
are protected by CODEOWNERS (see `CODEOWNERS` file at repo root).

### Regression Test Suite

`lib/utils/__tests__/enforcement-regression.test.ts` is the umbrella
test that asserts all invariants with both behavioural and structural
checks:

- **Behavioural**: imports actual functions (`evaluateSlotCondition`,
  `hasPermission`, `canView`) and verifies enforcement logic directly
- **Structural**: verifies critical files exist and contain expected
  patterns (three-layer billing enforcement, gating rules, immutability)
- **Version consistency**: asserts `CORE_ENFORCEMENT_SPEC_VERSION` matches
  `sensitive-surfaces.json` version and spec document header
- **Registry consumption**: validates the JSON registry is well-formed
  and all paths resolve to existing files

---

## 9. Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-03-01 | Initial specification. Billing visibility, stage gating, document slots, conditions policy, audit immutability. |
| 1.0.0-gov | 2026-03-01 | Governance hardening: canonical JSON registry, waiver mechanism, CODEOWNERS, mandatory tests, behavioural enforcement tests, version consistency. |
| 1.0.0-freeze | 2026-03-01 | Enforcement freeze: tagged `enforcement-v1.0.0`, recorded baseline SHA, exact-count registry guard (26 surfaces), structured 403 logging. |
| 1.1.0 | 2026-03-01 | Added 5 billing surfaces: time-tracking page (self-gated), billing-stats-cards (self-gated), 3 time-tracking child components (parent-gated). Registry now 31 surfaces. |
| 1.2.0 | 2026-03-02 | Added controlled workflow action surface: advance-stage-action.ts (stage_gating category, wraps stage engine). Registry now 32 surfaces. |
| 1.3.0 | 2026-03-08 | Removed stale document-slot-templates/page.tsx. Added billing-tab.tsx (billing, parent-gated) and form-instance-engine.ts (documents, uses evaluateSlotCondition). Registry now 34 surfaces. |

---

## 10. Enforcement Freeze Policy

> **Effective from**: Git tag `enforcement-v1.0.0`
> (`1249dd1338f3ff59f8e15eb7082c9669bc6447c5`)

### Frozen Components

The following enforcement-layer components are **frozen** as of
tag `enforcement-v1.0.0`. No modification is permitted unless a
genuine invariant change is discovered and the full version-bump
protocol is followed.

| Component | Key Files |
|-----------|-----------|
| RequirePermission (UI gate) | `components/require-permission.tsx` |
| checkBillingPermission (API gate) | `lib/services/billing-permission.ts` |
| has_billing_view() RLS | `scripts/migrations/033-billing-rls-role-check.sql` |
| Stage gating engine | `lib/services/stage-engine.ts` |
| Document slot engine | `lib/services/document-slot-engine.ts` |
| Audit immutability triggers | `scripts/migrations/024-uee-phase-a-hardening.sql` |
| CI enforcement gate | `scripts/check-spec-updated.ts` |
| Sensitive surfaces registry | `docs/enforcement/sensitive-surfaces.json` |
| This specification | `docs/core-enforcement-spec-v1.md` |

### Modification Protocol

To modify any frozen component:

1. **Justify**: Document the invariant change in a PR description
2. **Declare**: Include `Enforcement impact: modifies invariant(s): <description>`
3. **Version bump**: Increment `CORE_ENFORCEMENT_SPEC_VERSION` in `lib/config/version.ts`
4. **Co-update**: Update this spec document AND `sensitive-surfaces.json` in the same PR
5. **Test**: Add or update enforcement regression tests covering the change
6. **Review**: Obtain CODEOWNERS approval from `@lexcrm/enforcement-reviewers`
7. **CI**: All enforcement gates must pass

### Registry Size Guard

The sensitive surfaces registry contains **exactly 34 surfaces**.
A CI test asserts this exact count. Any addition or removal requires
spec review and a version bump.

### Engineering Focus

With enforcement governance frozen, engineering effort shifts to:

- Product performance and scalability
- UX cohesion and user experience
- Revenue-driving feature development
- Infrastructure improvements

Enforcement hardening resumes only if a genuine enforcement defect
is discovered through production monitoring, penetration testing, or
audit review.
