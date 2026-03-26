-- ============================================================================
-- Migration 214: Import Pause / Resume
--
-- Adds pause_requested flag and paused/pausing statuses to import_batches.
-- ============================================================================

BEGIN;

-- Add pause_requested flag
ALTER TABLE import_batches
  ADD COLUMN IF NOT EXISTS pause_requested BOOLEAN NOT NULL DEFAULT FALSE;

-- Extend the status check constraint to include pausing + paused
ALTER TABLE import_batches
  DROP CONSTRAINT IF EXISTS import_batches_status_check;

ALTER TABLE import_batches
  ADD CONSTRAINT import_batches_status_check
  CHECK (status IN (
    'pending', 'validating', 'importing',
    'pausing', 'paused',
    'completed', 'completed_with_errors', 'failed', 'rolled_back'
  ));

COMMIT;
