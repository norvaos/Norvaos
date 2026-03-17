# Migration Rollback Plans

This document provides rollback guidance for each Sprint 6 migration.
Execute rollback files in **reverse order** (130 → 129 → 128) if a full
sprint rollback is required.

> **Warning:** Rollbacks for migrations 129 and 130 are destructive. Any data
> written to those tables or columns after the migration was applied will be
> permanently lost. Take a full database backup before executing any rollback.
> Migration 128 rollback is non-destructive (RLS policy replacement only).

---

## Migration 128 — Read Model SELECT Restrictions

**Forward migration file**: `128-read-model-rls.sql`
**Rollback script**: `128-read-model-rls.rollback.sql`
**Applied**: 2026-03-17
**Risk**: Low — no tables, columns, or indexes are created or dropped.
The rollback replaces role-gated SELECT policies with tenant-only SELECT
policies on nine tables. No data is lost.

### Preconditions before running

- [ ] Confirm the application does not rely on the role-gated restrictions
      being in place (e.g., confirm that widening SELECT access is acceptable
      until a hotfix or re-migration is applied).
- [ ] Confirm migrations 129 and 130 have already been rolled back if doing
      a full Sprint 6 rollback (migration 128 is the last in the sequence).
- [ ] Take a full Supabase database backup (belt-and-suspenders).

### Run the rollback

```sql
-- Execute contents of 128-read-model-rls.rollback.sql in the Supabase SQL editor.
```

### Verify rollback succeeded

```sql
-- Confirm role-gated split policies on activities are gone:
SELECT polname, tablename
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'activities'
  AND polname IN ('activities_select_non_sensitive', 'activities_select_sensitive');
-- Expected: 0 rows

-- Confirm matter_risk_flags reverted to mrf_tenant_select (no role guard):
SELECT polname, tablename
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'matter_risk_flags'
  AND polname = 'matter_risk_flags_select';
-- Expected: 0 rows (the new policy is named mrf_tenant_select)

-- Confirm tenant-only SELECT policies exist on trust tables (no get_my_role() call):
SELECT polname, tablename, pg_get_expr(polqual, polrelid) AS using_expr
FROM pg_policy p
JOIN pg_class c ON c.oid = p.polrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('trust_transactions', 'trust_bank_accounts')
  AND p.polcmd = 'r'
ORDER BY c.relname;
-- Expected: using_expr must NOT contain 'get_my_role'
```

---

## Migration 129 — Refusal Workflow, Closure Columns, Submission Confirmation

**Forward migration file**: `129-refusal-closure-submission.sql`
**Rollback script**: `129-refusal-closure-submission.rollback.sql`
**Applied**: 2026-03-17
**Risk**: High — drops `refusal_actions` table (all JR deadline audit rows
permanently lost), removes six columns from `ircc_correspondence`, three
columns from `matters`, and four columns from `matter_intake`. Also reverts
the `matters.status` CHECK constraint to exclude `'refused'` and
`'closed_withdrawn'`.

### Preconditions before running

- [ ] Confirm migration 130 has already been rolled back (run 130 rollback first).
- [ ] Confirm zero matters have `status IN ('refused', 'closed_withdrawn')`:
      `SELECT id, status FROM matters WHERE status IN ('refused', 'closed_withdrawn');`
      If any exist, UPDATE them to a valid status before proceeding.
- [ ] Export `refusal_actions` table to CSV for archival:
      `COPY refusal_actions TO '/tmp/refusal_actions_backup.csv' CSV HEADER;`
- [ ] Export affected `ircc_correspondence` columns to CSV for archival.
- [ ] Export affected `matter_intake` columns to CSV for archival.
- [ ] Confirm POST `.../handle-refusal` route is disabled (returns 503).
- [ ] Confirm POST `.../close` route is disabled (returns 503).
- [ ] Alert legal team that any computed JR deadlines will no longer be stored
      in the database — record them manually if still active.
- [ ] Take a full Supabase database backup.

### Run the rollback

```sql
-- Execute contents of 129-refusal-closure-submission.rollback.sql in the Supabase SQL editor.
```

### Verify rollback succeeded

```sql
-- 1. Confirm refusal_actions table is gone:
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND table_name = 'refusal_actions';
-- Expected: 0 rows

-- 2. Confirm ircc_correspondence columns are gone:
SELECT column_name FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'ircc_correspondence'
  AND column_name IN (
    'jr_deadline', 'jr_basis', 'jr_matter_id',
    'reapplication_matter_id', 'client_notified_at', 'urgent_task_id'
  );
-- Expected: 0 rows

-- 3. Confirm matters closure columns are gone:
SELECT column_name FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'matters'
  AND column_name IN ('closed_reason', 'closed_by', 'closed_at');
-- Expected: 0 rows

-- 4. Confirm status constraint excludes 'refused' and 'closed_withdrawn':
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'matters'::regclass AND conname = 'matters_status_check';
-- Expected: definition must NOT contain 'refused' or 'closed_withdrawn'

-- 5. Confirm matter_intake submission columns are gone:
SELECT column_name FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'matter_intake'
  AND column_name IN (
    'submission_confirmation_number', 'submission_confirmation_doc_path',
    'submission_confirmed_at', 'submission_confirmed_by'
  );
-- Expected: 0 rows
```

---

## Migration 130 — form_generation_log Table

**Forward migration file**: `130-form-generation-log.sql`
**Rollback script**: `130-form-generation-log.rollback.sql`
**Applied**: 2026-03-17
**Risk**: Medium — drops the entire `form_generation_log` table. All pending,
processing, completed, and failed PDF generation job records are permanently
lost. The `output_path` references to generated PDFs in Supabase Storage are
lost (the actual files in Storage are NOT deleted). The `generate-form`,
`job-worker`, and form-generation-callback endpoints will fail until the
migration is re-applied.

### Preconditions before running

- [ ] Confirm migration 131 (`131-form-generation-retry.sql`) has been rolled
      back first if it was applied (it depends on this table).
- [ ] Confirm no form generation jobs are currently `pending` or `processing`:
      `SELECT id, status, matter_id FROM form_generation_log WHERE status IN ('pending', 'processing');`
- [ ] Export all `form_generation_log` rows to CSV for archival
      (especially `output_path` values to preserve storage path references):
      `COPY form_generation_log TO '/tmp/form_generation_log_backup.csv' CSV HEADER;`
- [ ] Disable POST `/api/matters/[id]/generate-form` (return 503).
- [ ] Disable GET `/api/internal/job-worker` cron route (return 503).
- [ ] Stop the Python sidecar or ensure its callback URL will return 404.
- [ ] Take a full Supabase database backup.

### Run the rollback

```sql
-- Execute contents of 130-form-generation-log.rollback.sql in the Supabase SQL editor.
```

### Verify rollback succeeded

```sql
-- 1. Confirm table is gone:
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND table_name = 'form_generation_log';
-- Expected: 0 rows

-- 2. Confirm indexes are gone:
SELECT indexname FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname IN (
    'idx_fgl_idempotency', 'idx_fgl_matter_id',
    'idx_fgl_tenant_id', 'idx_fgl_status', 'idx_fgl_created_at'
  );
-- Expected: 0 rows

-- 3. Confirm trigger function is gone:
SELECT proname FROM pg_proc
JOIN pg_namespace ON pg_namespace.oid = pg_proc.pronamespace
WHERE nspname = 'public' AND proname = 'set_fgl_updated_at';
-- Expected: 0 rows
```
