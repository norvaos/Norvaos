-- ============================================================================
-- Migration 217: Ignite Ritual Columns  -  Directive 051
--
-- Adds the columns and policies needed for the Ignite Ritual  -  the ceremony
-- that permanently locks a matter once its readiness score reaches 100 and
-- the user confirms submission.  Once ignited, the matter is immutable
-- (except for Admin overrides).
-- ============================================================================

-- ── New columns on matters ──────────────────────────────────────────────────

ALTER TABLE matters
  ADD COLUMN IF NOT EXISTS ignited_at   TIMESTAMPTZ  DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS ignited_by   UUID         DEFAULT NULL REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS is_locked    BOOLEAN      DEFAULT FALSE;

COMMENT ON COLUMN matters.ignited_at IS 'Timestamp when the Ignite Ritual was executed and the matter was sealed for submission.';
COMMENT ON COLUMN matters.ignited_by IS 'The user who executed the Ignite Ritual.';
COMMENT ON COLUMN matters.is_locked  IS 'When TRUE the matter is immutable  -  no file uploads, deletions, or field edits (except Admin override).';

-- ── Index for the Ignite Archive view ───────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_matters_ignited_at
  ON matters (ignited_at)
  WHERE ignited_at IS NOT NULL;

-- ── RLS policy: locked matters cannot be updated (except by Admin) ─────────
-- Drop first to make the migration idempotent.

DROP POLICY IF EXISTS locked_matter_update_guard ON matters;

CREATE POLICY locked_matter_update_guard ON matters
  FOR UPDATE
  USING (
    -- Allow the row to be visible (standard tenant check)
    tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid())
  )
  WITH CHECK (
    -- If the matter is NOT locked, allow any update.
    -- If it IS locked, only allow if the current user has an Admin role.
    (NOT is_locked)
    OR
    EXISTS (
      SELECT 1
      FROM users u
      JOIN roles r ON r.id = u.role_id
      WHERE u.auth_user_id = auth.uid()
        AND r.name = 'Admin'
    )
  );
