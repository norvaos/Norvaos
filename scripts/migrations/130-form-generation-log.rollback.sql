-- ============================================================================
-- ROLLBACK: 130-form-generation-log.sql
-- Created: 2026-03-17
-- ============================================================================
--
-- DATA-LOSS WARNINGS:
--   1. ALL rows in the `form_generation_log` table are permanently deleted.
--      This includes every pending, processing, completed, and failed job record.
--      The `output_path` values pointing to generated PDFs in Supabase Storage
--      will be lost  -  the actual PDF files in Storage are NOT deleted by this
--      rollback, but their metadata records will be gone permanently.
--   2. The `set_fgl_updated_at` trigger function is dropped. If migration 131
--      (form-generation-retry) or any later migration references this function,
--      roll those back first.
--
-- ROLLBACK ORDER:
--   If rolling back all Sprint 6 migrations, apply rollbacks in reverse order:
--   130 → 129 → 128
--   Run this file (130) FIRST in the sequence.
--   If migration 131 (form-generation-retry) has been applied, roll that back
--   before running this file.
--
-- PRECONDITIONS (verify before running):
--   - No form generation jobs are currently in status = 'pending' or 'processing'.
--     Run: SELECT id, status, matter_id FROM form_generation_log
--          WHERE status IN ('pending', 'processing');
--   - Export all form_generation_log rows to CSV (especially output_path values).
--   - POST /api/matters/[id]/generate-form route is disabled (returns 503).
--   - GET /api/internal/job-worker cron route is disabled (returns 503).
--   - Python sidecar is stopped or its callback URL will return 404.
--   - Migration 131 (form-generation-retry) has been rolled back if applied.
--   - Full database backup has been taken.
-- ============================================================================

-- ─── Step 1: Drop trigger (before dropping the table it fires on) ─────────────

DROP TRIGGER IF EXISTS fgl_set_updated_at ON form_generation_log;

-- ─── Step 2: Drop RLS policies (policies before table) ────────────────────────

DROP POLICY IF EXISTS fgl_tenant_select ON form_generation_log;
DROP POLICY IF EXISTS fgl_tenant_insert ON form_generation_log;
DROP POLICY IF EXISTS fgl_tenant_update ON form_generation_log;

-- ─── Step 3: Drop indexes (unique index + regular indexes) ────────────────────
-- Indexes are dropped automatically when the table is dropped, but explicit
-- drops here ensure idempotency if the table was partially cleaned up.

DROP INDEX IF EXISTS idx_fgl_idempotency;
DROP INDEX IF EXISTS idx_fgl_matter_id;
DROP INDEX IF EXISTS idx_fgl_tenant_id;
DROP INDEX IF EXISTS idx_fgl_status;
DROP INDEX IF EXISTS idx_fgl_created_at;

-- ─── Step 4: Drop form_generation_log table ───────────────────────────────────
-- CASCADE will drop any remaining dependent objects (FK constraints from any
-- table referencing form_generation_log, if applicable).
-- WARNING: ALL rows are permanently deleted.

DROP TABLE IF EXISTS form_generation_log CASCADE;

-- ─── Step 5: Drop the updated_at trigger function ─────────────────────────────
-- Dropped after the table so the trigger can be removed first.

DROP FUNCTION IF EXISTS set_fgl_updated_at();

-- ============================================================================
-- Rollback verification: list objects that should no longer exist after this rollback
--
-- 1. Confirm table is gone:
--
--   SELECT table_name
--   FROM information_schema.tables
--   WHERE table_schema = 'public' AND table_name = 'form_generation_log';
--   -- Expected: 0 rows
--
-- 2. Confirm indexes are gone:
--
--   SELECT indexname
--   FROM pg_indexes
--   WHERE schemaname = 'public'
--     AND indexname IN (
--       'idx_fgl_idempotency',
--       'idx_fgl_matter_id',
--       'idx_fgl_tenant_id',
--       'idx_fgl_status',
--       'idx_fgl_created_at'
--     );
--   -- Expected: 0 rows
--
-- 3. Confirm RLS policies are gone:
--
--   SELECT polname
--   FROM pg_policies
--   WHERE schemaname = 'public'
--     AND tablename = 'form_generation_log';
--   -- Expected: 0 rows
--
-- 4. Confirm trigger function is gone:
--
--   SELECT proname
--   FROM pg_proc
--   JOIN pg_namespace ON pg_namespace.oid = pg_proc.pronamespace
--   WHERE nspname = 'public' AND proname = 'set_fgl_updated_at';
--   -- Expected: 0 rows
-- ============================================================================
