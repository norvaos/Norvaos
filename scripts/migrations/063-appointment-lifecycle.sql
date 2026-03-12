-- 063-appointment-lifecycle.sql
-- Adds lifecycle timestamps to appointments table and relaxes
-- automation_execution_log.matter_id for appointment-based automations.

BEGIN;

-- Add checked_in_at timestamp
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'appointments' AND column_name = 'checked_in_at'
  ) THEN
    ALTER TABLE appointments ADD COLUMN checked_in_at TIMESTAMPTZ;
  END IF;
END $$;

-- Add started_at timestamp (when lawyer starts meeting)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'appointments' AND column_name = 'started_at'
  ) THEN
    ALTER TABLE appointments ADD COLUMN started_at TIMESTAMPTZ;
  END IF;
END $$;

-- Add completed_at timestamp
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'appointments' AND column_name = 'completed_at'
  ) THEN
    ALTER TABLE appointments ADD COLUMN completed_at TIMESTAMPTZ;
  END IF;
END $$;

-- Index for today's appointments widget (user + date + active statuses)
CREATE INDEX IF NOT EXISTS idx_appointments_user_date
  ON appointments(user_id, appointment_date)
  WHERE status IN ('confirmed', 'checked_in', 'in_meeting');

-- Allow appointment automations without a matter
ALTER TABLE automation_execution_log ALTER COLUMN matter_id DROP NOT NULL;

COMMIT;
