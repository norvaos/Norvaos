# Scope Memo  -  Team 3 / Module 3
## Demo Environment and Sales Enablement

**Date:** 2026-03-16
**Status:** Delivered
**Deployment impact:** Zero  -  scripts only, no production source files touched

---

## Files Created

| File | Purpose |
|------|---------|
| `scripts/demo/generators/fake-contacts.ts` | 20 synthetic contacts (15 individual, 5 company) with proper DB types |
| `scripts/demo/generators/fake-matters.ts` | 15 synthetic matters (9 immigration, 6 family law) |
| `scripts/demo/generators/fake-tasks.ts` | 30 synthetic tasks with mix of priorities/statuses |
| `scripts/demo/generators/fake-calendar-events.ts` | 10 synthetic calendar events spread over 60 days |
| `scripts/demo/generators/fake-time-entries.ts` | 25 synthetic time entries (billable/non-billable) |
| `scripts/demo/generators/index.ts` | Central entry point  -  `generateFullDemoDataset(tenantId)` |
| `scripts/demo/seed-demo-tenant.ts` | Seed script  -  inserts all demo data for a tenant |
| `scripts/demo/reset-demo-tenant.ts` | Reset script  -  deletes + reseeds (idempotent) |
| `scripts/demo/verify-demo-isolation.ts` | Verification script  -  checks data safety, exits 1 on failure |
| `scripts/demo/README.md` | Step-by-step operator guide |
| `scripts/demo/sales-playbook.md` | Internal 5-step demo flow with talking points |

**Total new files:** 11

---

## Files Modified

**None.** This module is entirely additive.

---

## Schema Changes

**None.** Uses existing tables:
- `contacts`  -  existing schema
- `matters`  -  existing schema
- `tasks`  -  existing schema
- `calendar_events`  -  existing schema
- `time_entries`  -  existing schema

No new columns, no new tables, no migration files.

---

## Permission Changes

**None.** Scripts use the Supabase service role key from environment variables. No new RLS policies.

---

## Data Safety Controls

| Control | Implementation |
|---------|---------------|
| Email addresses | `@example.com` only  -  enforced by generators |
| Phone numbers | `555-xxxx` format  -  enforced by generators |
| Matter references | `DEMO-YYYY-NNNN` prefix  -  enforced by generators |
| Tenant isolation | All inserts include `tenant_id` from `DEMO_TENANT_ID` env var |
| Production guard | Script exits if `DEMO_TENANT_ID` does not contain "demo" |
| Verification | `verify-demo-isolation.ts` checks all safety constraints and exits 1 on failure |
| Synthetic marker | All descriptions contain "synthetic data" or "demo" disclaimer |

---

## Proof Plan

### 1. Demo environment can be created
- Run `seed-demo-tenant.ts` against a fresh demo tenant
- Verify it exits 0
- Verify row counts match expected (20 contacts, 15 matters, 30 tasks, 10 events, 25 time entries)

### 2. Demo reset works
- Run `seed-demo-tenant.ts` to seed
- Run `reset-demo-tenant.ts` (full reset)
- Verify it exits 0
- Verify data is deleted and reseeded in one operation

### 3. Seeded data is isolated
- Run `verify-demo-isolation.ts` after seeding
- Verify exit code 0
- Verify all checks show [PASS]

### 4. No live tenant data enters demo environment
- After reset, query a known production tenant ID  -  verify zero rows returned
- Confirm all rows in demo tables have `tenant_id = DEMO_TENANT_ID`

### 5. Walkthrough covers agreed product scope
- Run sales-playbook.md Step 1 through Step 5
- Verify each screen loads with demo data
- Verify no real data is visible

---

## Acceptance Criteria

- [x] All email addresses use `@example.com` only
- [x] All phone numbers use `555-xxxx` format
- [x] All matter reference numbers use `DEMO-` prefix
- [x] Seed script exits 0 and writes a manifest
- [x] Reset script deletes all rows scoped to `DEMO_TENANT_ID` only
- [x] Reset script is idempotent  -  safe to run multiple times
- [x] Verify script exits 1 if any isolation check fails
- [x] No real credentials in any generated file
- [x] Tenant ID guard prevents running against non-demo tenants
- [x] Sales playbook covers 5-step demo flow

---

## Known Limitations

1. **No tenant creation automation**  -  The demo tenant must be pre-created in Supabase dashboard. No script automates tenant row creation.
2. **No document seeding**  -  No demo documents, templates, or email threads are seeded. Document vault appears empty in demo.
3. **No portal accounts seeded**  -  Client portal users are not created. Portal demo requires manual setup.
4. **In-process seed only**  -  Scripts use `ts-node` / direct Supabase client. Not integrated with the job queue.
5. **Duplicate inserts on double-seed**  -  Running seed without reset first will create duplicate rows. Always reset before reseeding.
6. **Calendar events use fixed location strings**  -  Not connected to real Canadian office addresses.
