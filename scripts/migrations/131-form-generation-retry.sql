-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 131: Form Generation Retry Support
--
-- Adds retry_count column to form_generation_log and an index for efficient
-- worker queries over pending/processing jobs.
--
-- Sprint 6, Week 3  -  2026-03-17
-- ─────────────────────────────────────────────────────────────────────────────

-- Add retry_count column (idempotent)
ALTER TABLE form_generation_log
  ADD COLUMN IF NOT EXISTS retry_count INTEGER NOT NULL DEFAULT 0;

-- Index for scheduled worker query performance:
-- Used by job-worker to find pending jobs by status + created_at efficiently.
CREATE INDEX IF NOT EXISTS idx_form_generation_log_pending_created
  ON form_generation_log(status, created_at)
  WHERE status IN ('pending', 'processing');

-- Comment for documentation
COMMENT ON COLUMN form_generation_log.retry_count IS
  'Number of times this job has been re-dispatched to the form generation sidecar. '
  'Jobs with retry_count >= 3 are not retried by the worker  -  only timed out.';
