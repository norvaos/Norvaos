-- ============================================================================
-- Migration 135: Add lunch_break_start / lunch_break_end event types
-- ============================================================================
-- Migration 134 created front_desk_events with a CHECK constraint that only
-- allows 9 event types. The lunch break feature introduced two new types
-- (lunch_break_start, lunch_break_end) that the API now emits but the DB
-- was rejecting. This migration widens the constraint to include them.
--
-- Safe to re-run: uses DROP IF EXISTS + conditional trigger guards.
-- ============================================================================

BEGIN;

-- ─── 1. Drop the old inline CHECK constraint ─────────────────────────────────
-- PostgreSQL auto-names inline CHECK constraints as <table>_<column>_check.
-- We use a DO block to handle both the auto-named and any manually-named variant.

DO $$
DECLARE
  v_constraint TEXT;
BEGIN
  SELECT conname INTO v_constraint
    FROM pg_constraint
    WHERE conrelid = 'front_desk_events'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%event_type%'
    LIMIT 1;

  IF v_constraint IS NOT NULL THEN
    EXECUTE format('ALTER TABLE front_desk_events DROP CONSTRAINT %I', v_constraint);
    RAISE NOTICE '[135] Dropped constraint: %', v_constraint;
  ELSE
    RAISE NOTICE '[135] No event_type CHECK constraint found  -  skipping drop.';
  END IF;
END $$;


-- ─── 2. Add the updated CHECK constraint ─────────────────────────────────────

ALTER TABLE front_desk_events
  ADD CONSTRAINT front_desk_events_event_type_check
  CHECK (event_type IN (
    'queue_viewed',
    'search_submitted',
    'contact_opened',
    'idle_gap',
    'shift_start',
    'shift_end',
    'panel_opened',
    'panel_closed',
    'heartbeat',
    'lunch_break_start',
    'lunch_break_end'
  ));


COMMIT;
