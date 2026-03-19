-- ============================================================================
-- Migration 134: Front Desk Shifts & Events — catch-up
-- ============================================================================
-- Migration 050 was written but never applied to production.
-- Migrations 053+ assumed the tables existed (added shift_id column to
-- workflow_actions without creating the target tables).
--
-- This migration creates the two missing tables safely using IF NOT EXISTS
-- guards everywhere. Does NOT touch execute_action_atomic (handled in 053).
--
-- Safe to re-run: all DDL uses IF NOT EXISTS / DO $$ guards.
-- ============================================================================

BEGIN;

-- ─── 1. front_desk_shifts ────────────────────────────────────────────────────
-- Tracks shift start/end for KPI scoping. One active shift per user.
-- Auto-ended after 12 hours via cron or manual admin action.

CREATE TABLE IF NOT EXISTS front_desk_shifts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at        TIMESTAMPTZ,
  ended_reason    TEXT CHECK (ended_reason IS NULL OR ended_reason IN (
    'manual', 'auto_12h', 'admin_force', 'session_expired'
  )),

  -- Denormalised for efficient date-range KPI queries
  shift_date      DATE NOT NULL DEFAULT CURRENT_DATE,

  metadata        JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Active shift lookups (one active per user)
CREATE INDEX IF NOT EXISTS idx_fd_shifts_active
  ON front_desk_shifts(tenant_id, user_id) WHERE ended_at IS NULL;

-- Date-range aggregation for KPI dashboards
CREATE INDEX IF NOT EXISTS idx_fd_shifts_date
  ON front_desk_shifts(tenant_id, shift_date);

-- Per-user history
CREATE INDEX IF NOT EXISTS idx_fd_shifts_user
  ON front_desk_shifts(user_id, started_at DESC);

ALTER TABLE front_desk_shifts ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'front_desk_shifts' AND policyname = 'fd_shifts_tenant'
  ) THEN
    CREATE POLICY fd_shifts_tenant ON front_desk_shifts
      FOR ALL
      USING (tenant_id = public.get_user_tenant_id())
      WITH CHECK (tenant_id = public.get_user_tenant_id());
  END IF;
END $$;


-- ─── 2. front_desk_events ────────────────────────────────────────────────────
-- Lightweight event log for non-action events used in KPI computation.
-- Examples: search_submitted, queue_viewed, idle_gap, heartbeat.
-- Immutable — no UPDATE or DELETE permitted.

CREATE TABLE IF NOT EXISTS front_desk_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  shift_id        UUID REFERENCES front_desk_shifts(id) ON DELETE SET NULL,

  event_type      TEXT NOT NULL CHECK (event_type IN (
    'queue_viewed',
    'search_submitted',
    'contact_opened',
    'idle_gap',
    'shift_start',
    'shift_end',
    'panel_opened',
    'panel_closed',
    'heartbeat'
  )),

  event_data      JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Per-shift event lookups (primary KPI query path)
CREATE INDEX IF NOT EXISTS idx_fd_events_shift
  ON front_desk_events(shift_id, event_type);

-- Per-user date-range aggregation
CREATE INDEX IF NOT EXISTS idx_fd_events_user_date
  ON front_desk_events(tenant_id, user_id, created_at);

-- Type-based aggregation
CREATE INDEX IF NOT EXISTS idx_fd_events_type
  ON front_desk_events(tenant_id, event_type, created_at);

ALTER TABLE front_desk_events ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'front_desk_events' AND policyname = 'fd_events_tenant'
  ) THEN
    CREATE POLICY fd_events_tenant ON front_desk_events
      FOR ALL
      USING (tenant_id = public.get_user_tenant_id())
      WITH CHECK (tenant_id = public.get_user_tenant_id());
  END IF;
END $$;

-- Immutability triggers (append-only)
CREATE OR REPLACE FUNCTION prevent_fd_event_update()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'UPDATE of front_desk_events records is not permitted.';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION prevent_fd_event_delete()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'DELETE of front_desk_events records is not permitted.';
END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'no_update_fd_events'
  ) THEN
    CREATE TRIGGER no_update_fd_events
      BEFORE UPDATE ON front_desk_events
      FOR EACH ROW EXECUTE FUNCTION prevent_fd_event_update();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'no_delete_fd_events'
  ) THEN
    CREATE TRIGGER no_delete_fd_events
      BEFORE DELETE ON front_desk_events
      FOR EACH ROW EXECUTE FUNCTION prevent_fd_event_delete();
  END IF;
END $$;


-- ─── 3. Add FK from workflow_actions.shift_id → front_desk_shifts ────────────
-- Migration 053 added shift_id as a plain UUID column (no FK, because the
-- target table didn't exist yet). Now that the table exists, add the FK.

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    JOIN information_schema.constraint_column_usage ccu
      ON tc.constraint_name = ccu.constraint_name
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_name = 'workflow_actions'
      AND ccu.column_name = 'id'
      AND ccu.table_name = 'front_desk_shifts'
  ) THEN
    ALTER TABLE workflow_actions
      ADD CONSTRAINT fk_workflow_actions_shift_id
      FOREIGN KEY (shift_id) REFERENCES front_desk_shifts(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_workflow_actions_shift
  ON workflow_actions(shift_id) WHERE shift_id IS NOT NULL;


-- ─── 4. Auto-end stale shifts function ───────────────────────────────────────
-- Called by pg_cron every 15 minutes to end shifts active > 12 hours.

CREATE OR REPLACE FUNCTION auto_end_stale_shifts()
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE front_desk_shifts
  SET ended_at = now(),
      ended_reason = 'auto_12h'
  WHERE ended_at IS NULL
    AND started_at < now() - INTERVAL '12 hours';

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION auto_end_stale_shifts TO service_role;


-- ─── 5. Grants ───────────────────────────────────────────────────────────────

GRANT SELECT, INSERT ON front_desk_shifts TO authenticated;
GRANT SELECT, INSERT, UPDATE ON front_desk_shifts TO service_role;
GRANT ALL ON front_desk_shifts TO service_role;

GRANT SELECT, INSERT ON front_desk_events TO authenticated;
GRANT ALL ON front_desk_events TO service_role;

COMMIT;
