-- ============================================================================
-- ROLLBACK: 129-refusal-closure-submission.sql
-- Created: 2026-03-17
-- ============================================================================
--
-- DATA-LOSS WARNINGS:
--   1. ALL rows in the `refusal_actions` table are permanently deleted.
--      This includes every JR deadline set event, urgent task creation record,
--      client notification record, JR matter creation record, and reapplication
--      matter creation record. This data cannot be recovered after rollback.
--   2. The following columns are dropped from `ircc_correspondence`:
--        jr_deadline, jr_basis, jr_matter_id, reapplication_matter_id,
--        client_notified_at, urgent_task_id
--      All values stored in these columns are permanently lost.
--   3. The following columns are dropped from `matters`:
--        closed_reason, closed_by, closed_at
--      All closure metadata on matters is permanently lost.
--   4. The `matters.status` CHECK constraint is reverted to exclude
--      'refused' and 'closed_withdrawn'. Any matter currently in one of
--      those statuses will violate the restored constraint.
--      YOU MUST resolve all such rows before running this rollback.
--   5. The following columns are dropped from `matter_intake`:
--        submission_confirmation_number, submission_confirmation_doc_path,
--        submission_confirmed_at, submission_confirmed_by
--      All submission confirmation data is permanently lost.
--
-- ROLLBACK ORDER:
--   If rolling back all Sprint 6 migrations, apply rollbacks in reverse order:
--   130 → 129 → 128
--   Run this file (129) after 130 has been rolled back.
--
-- PRECONDITIONS (verify before running):
--   - No matters have status = 'refused' or status = 'closed_withdrawn'.
--     Run: SELECT id, status FROM matters WHERE status IN ('refused', 'closed_withdrawn');
--   - Export refusal_actions to CSV for archival.
--   - Export ircc_correspondence columns to CSV for archival.
--   - POST .../handle-refusal and POST .../close routes are disabled (return 503).
--   - Full database backup has been taken.
-- ============================================================================

-- ─── Step 1: Drop RLS policies on refusal_actions (before dropping table) ────

DROP POLICY IF EXISTS ra_tenant_select ON refusal_actions;
DROP POLICY IF EXISTS ra_tenant_insert ON refusal_actions;

-- ─── Step 2: Drop indexes on refusal_actions ──────────────────────────────────

DROP INDEX IF EXISTS idx_ra_matter_id;
DROP INDEX IF EXISTS idx_ra_correspondence_id;
DROP INDEX IF EXISTS idx_ra_tenant_id;

-- ─── Step 3: Drop refusal_actions table ───────────────────────────────────────
-- WARNING: ALL refusal audit rows are permanently deleted.

DROP TABLE IF EXISTS refusal_actions;

-- ─── Step 4: Drop columns added to ircc_correspondence ────────────────────────
-- Drop FK-referencing columns first (jr_matter_id, reapplication_matter_id,
-- urgent_task_id) then the simple columns.

ALTER TABLE ircc_correspondence
  DROP COLUMN IF EXISTS jr_matter_id,
  DROP COLUMN IF EXISTS reapplication_matter_id,
  DROP COLUMN IF EXISTS urgent_task_id,
  DROP COLUMN IF EXISTS jr_deadline,
  DROP COLUMN IF EXISTS jr_basis,
  DROP COLUMN IF EXISTS client_notified_at;

-- ─── Step 5: Drop closure columns added to matters ────────────────────────────
-- Drop closed_by (FK to users) then the plain columns.

ALTER TABLE matters
  DROP COLUMN IF EXISTS closed_by,
  DROP COLUMN IF EXISTS closed_reason,
  DROP COLUMN IF EXISTS closed_at;

-- ─── Step 6: Revert matters.status CHECK constraint ───────────────────────────
-- IMPORTANT: Before executing this step, confirm zero rows have status IN
-- ('refused', 'closed_withdrawn'). If any exist, UPDATE them to a valid
-- status first, or this constraint addition will fail.
--
-- Verify: SELECT count(*) FROM matters WHERE status IN ('refused','closed_withdrawn');

ALTER TABLE matters
  DROP CONSTRAINT IF EXISTS matters_status_check;

ALTER TABLE matters
  ADD CONSTRAINT matters_status_check CHECK (status IN (
    'intake',
    'active',
    'on_hold',
    'closed_won',
    'closed_lost',
    'archived',
    'import_reverted'
  ));

-- ─── Step 7: Drop submission confirmation columns from matter_intake ──────────
-- Drop submission_confirmed_by (FK to users) then the plain columns.

ALTER TABLE matter_intake
  DROP COLUMN IF EXISTS submission_confirmed_by,
  DROP COLUMN IF EXISTS submission_confirmation_number,
  DROP COLUMN IF EXISTS submission_confirmation_doc_path,
  DROP COLUMN IF EXISTS submission_confirmed_at;

-- ============================================================================
-- Rollback verification: list objects that should no longer exist after this rollback
--
-- 1. Confirm refusal_actions table is gone:
--
--   SELECT table_name
--   FROM information_schema.tables
--   WHERE table_schema = 'public' AND table_name = 'refusal_actions';
--   -- Expected: 0 rows
--
-- 2. Confirm ircc_correspondence columns are gone:
--
--   SELECT column_name
--   FROM information_schema.columns
--   WHERE table_schema = 'public'
--     AND table_name = 'ircc_correspondence'
--     AND column_name IN (
--       'jr_deadline', 'jr_basis', 'jr_matter_id',
--       'reapplication_matter_id', 'client_notified_at', 'urgent_task_id'
--     );
--   -- Expected: 0 rows
--
-- 3. Confirm matters closure columns are gone:
--
--   SELECT column_name
--   FROM information_schema.columns
--   WHERE table_schema = 'public'
--     AND table_name = 'matters'
--     AND column_name IN ('closed_reason', 'closed_by', 'closed_at');
--   -- Expected: 0 rows
--
-- 4. Confirm matters status constraint excludes 'refused' and 'closed_withdrawn':
--
--   SELECT conname, pg_get_constraintdef(oid)
--   FROM pg_constraint
--   WHERE conrelid = 'matters'::regclass AND conname = 'matters_status_check';
--   -- Expected: constraint definition must NOT contain 'refused' or 'closed_withdrawn'
--
-- 5. Confirm matter_intake submission columns are gone:
--
--   SELECT column_name
--   FROM information_schema.columns
--   WHERE table_schema = 'public'
--     AND table_name = 'matter_intake'
--     AND column_name IN (
--       'submission_confirmation_number', 'submission_confirmation_doc_path',
--       'submission_confirmed_at', 'submission_confirmed_by'
--     );
--   -- Expected: 0 rows
-- ============================================================================
