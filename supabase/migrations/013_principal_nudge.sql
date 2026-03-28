-- ============================================================================
-- Migration 013: Principal's Nudge — last_nudged_at on leads
-- ============================================================================
-- Adds last_nudged_at timestamptz to the leads table for the Principal's
-- Nudge feature. When the Principal clicks "Nudge" on the Radar, the system:
--   1. Updates last_nudged_at
--   2. Dispatches a high-priority notification to the assigned staff
--   3. Flashes the Stage 4 (Strategy) node for that lead in the staff's view
-- ============================================================================

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS last_nudged_at timestamptz DEFAULT NULL;

-- Index for Radar queries — quickly find leads that were recently nudged
CREATE INDEX IF NOT EXISTS idx_leads_last_nudged_at
  ON leads (tenant_id, last_nudged_at)
  WHERE last_nudged_at IS NOT NULL;

COMMENT ON COLUMN leads.last_nudged_at IS 'Timestamp of last Principal nudge. Updated when the Principal sends a nudge from the Radar.';
