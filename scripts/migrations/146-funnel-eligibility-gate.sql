-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration 146: Funnel Eligibility Gate
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Adds eligibility verification columns to matter_intake for the
-- Verified-Workflow Funnel. These columns record when/who/what the
-- eligibility gate outcome was for immigration matters.
--
-- No new RLS needed  -  matter_intake already has tenant-scoped RLS.
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE matter_intake
  ADD COLUMN IF NOT EXISTS eligibility_verified_at timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS eligibility_verified_by uuid DEFAULT NULL REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS eligibility_outcome text DEFAULT NULL
    CHECK (eligibility_outcome IN ('pass', 'fail'));

COMMENT ON COLUMN matter_intake.eligibility_verified_at IS
  'Timestamp when the eligibility verification step was completed in the funnel.';
COMMENT ON COLUMN matter_intake.eligibility_verified_by IS
  'User who performed the eligibility verification.';
COMMENT ON COLUMN matter_intake.eligibility_outcome IS
  'Result of the eligibility check: pass or fail.';
