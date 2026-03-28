-- ════════════════════════════════════════════════════════════════════════════
-- Migration 012: Lead Snooze / Smart Pause Columns
-- ════════════════════════════════════════════════════════════════════════════
-- Adds snooze infrastructure to the leads table for the NurtureControl
-- "Smart Pause" feature. When a lead is snoozed (e.g. in Stage 4 "Strategy
-- Held"), it becomes hidden from active queues until snooze_until expires,
-- at which point it re-appears on the Principal's Radar with Emerald Pulse.
-- ════════════════════════════════════════════════════════════════════════════

-- 1. Add snooze columns
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS snooze_until    timestamptz  DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS snoozed_at      timestamptz  DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS snoozed_by      uuid         DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS visibility_status text       DEFAULT 'visible'
    CHECK (visibility_status IN ('visible', 'snoozed', 'archived'));

-- 2. Index for efficient "expired snooze" lookups (Principal's Radar)
CREATE INDEX IF NOT EXISTS idx_leads_snooze_expiry
  ON leads (tenant_id, visibility_status, snooze_until)
  WHERE visibility_status = 'snoozed' AND snooze_until IS NOT NULL;

-- 3. Index for filtering visible-only leads in list views
CREATE INDEX IF NOT EXISTS idx_leads_visibility_status
  ON leads (tenant_id, visibility_status);

-- 4. Comment for discoverability
COMMENT ON COLUMN leads.snooze_until IS 'When the snooze expires. Lead re-appears on Principal''s Radar.';
COMMENT ON COLUMN leads.snoozed_at IS 'Timestamp when the lead was snoozed.';
COMMENT ON COLUMN leads.snoozed_by IS 'User ID who initiated the snooze.';
COMMENT ON COLUMN leads.visibility_status IS 'visible | snoozed | archived. Controls list/radar visibility.';
