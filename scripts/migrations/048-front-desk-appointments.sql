-- ============================================================================
-- Migration 048: Front Desk Appointment Enhancements
-- ============================================================================
-- 1. Expands appointments.status constraint to support check-in workflow:
--    adds 'checked_in' and 'in_meeting' to the allowed values.
-- 2. Adds matter_id column to link appointments to specific matters.
-- 3. Adds room column for boardroom/meeting room assignment.
-- ============================================================================

BEGIN;

-- ─── 1. Expand status constraint to support front-desk check-in flow ────────
-- Drop the old constraint and create a new one with additional statuses.
ALTER TABLE appointments
  DROP CONSTRAINT IF EXISTS appointments_status_check;

ALTER TABLE appointments
  ADD CONSTRAINT appointments_status_check
  CHECK (status IN ('confirmed', 'checked_in', 'in_meeting', 'completed', 'cancelled', 'no_show'));

-- ─── 2. Add matter_id column for linking appointments to matters ────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'appointments' AND column_name = 'matter_id'
  ) THEN
    ALTER TABLE appointments
      ADD COLUMN matter_id UUID REFERENCES matters(id) ON DELETE SET NULL;

    CREATE INDEX idx_appointments_matter ON appointments(matter_id)
      WHERE matter_id IS NOT NULL;
  END IF;
END $$;

-- ─── 3. Add room column for boardroom/meeting room assignment ───────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'appointments' AND column_name = 'room'
  ) THEN
    ALTER TABLE appointments
      ADD COLUMN room TEXT;
  END IF;
END $$;

COMMIT;
