-- Migration 064: Calendar Availability for Booking Slots
-- Adds show_as column to calendar_events so Outlook free/busy status
-- can be used to determine slot availability in booking pages.

-- 1. Add show_as column (free, tentative, busy, oof, workingElsewhere, unknown)
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS show_as TEXT DEFAULT 'busy';
COMMENT ON COLUMN calendar_events.show_as IS 'Outlook free/busy status: free, tentative, busy, oof, workingElsewhere, unknown';

-- 2. Performance index for slot generation queries (user + date range, active only)
CREATE INDEX IF NOT EXISTS idx_calendar_events_user_date
  ON calendar_events (created_by, start_at) WHERE is_active = TRUE;
