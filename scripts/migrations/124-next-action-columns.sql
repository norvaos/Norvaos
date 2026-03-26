-- ============================================================
-- 124-next-action-columns.sql
-- Adds next_action_* columns to the matters table.
-- Agent 6 of 6  -  Next Action Engine
-- ============================================================

ALTER TABLE matters
  ADD COLUMN IF NOT EXISTS next_action_type        TEXT,
  ADD COLUMN IF NOT EXISTS next_action_description TEXT,
  ADD COLUMN IF NOT EXISTS next_action_due_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS next_action_escalation  TEXT DEFAULT 'none';
  -- escalation: 'none' | 'amber' | 'red' | 'critical'

CREATE INDEX IF NOT EXISTS idx_matters_next_action_escalation
  ON matters(next_action_escalation)
  WHERE next_action_escalation IN ('amber', 'red', 'critical');
