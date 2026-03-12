-- ============================================================================
-- Migration 050: Front Desk Shifts & Events System
-- Tables: front_desk_shifts, front_desk_events
-- Schema changes: workflow_actions.shift_id FK
-- Functions: auto_end_stale_shifts(), updated execute_action_atomic()
-- ============================================================================

BEGIN;

-- ─── 1. Front Desk Shifts ────────────────────────────────────────────────────
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

  -- Denormalized for efficient date-range KPI queries
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

CREATE POLICY fd_shifts_tenant ON front_desk_shifts
  FOR ALL
  USING (tenant_id = public.get_user_tenant_id())
  WITH CHECK (tenant_id = public.get_user_tenant_id());


-- ─── 2. Front Desk Events (Non-Action Events) ───────────────────────────────
-- Lightweight event log for non-action events used in KPI computation.
-- Examples: search_submitted, queue_viewed, idle_gap, heartbeat.
-- Immutable like workflow_actions — no UPDATE or DELETE permitted.

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

CREATE POLICY fd_events_tenant ON front_desk_events
  FOR ALL
  USING (tenant_id = public.get_user_tenant_id())
  WITH CHECK (tenant_id = public.get_user_tenant_id());

-- Immutability: front_desk_events is append-only
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

CREATE TRIGGER no_update_fd_events
  BEFORE UPDATE ON front_desk_events
  FOR EACH ROW EXECUTE FUNCTION prevent_fd_event_update();

CREATE TRIGGER no_delete_fd_events
  BEFORE DELETE ON front_desk_events
  FOR EACH ROW EXECUTE FUNCTION prevent_fd_event_delete();


-- ─── 3. Add shift_id to workflow_actions ─────────────────────────────────────
-- Links every front desk action to its shift for KPI computation.
-- Nullable because: (a) non-front-desk actions don't have shifts,
-- (b) actions before this migration have no shift.

ALTER TABLE workflow_actions
  ADD COLUMN IF NOT EXISTS shift_id UUID REFERENCES front_desk_shifts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_workflow_actions_shift
  ON workflow_actions(shift_id) WHERE shift_id IS NOT NULL;


-- ─── 4. Auto-End Stale Shifts ────────────────────────────────────────────────
-- Called by pg_cron every 15 minutes to end shifts that have been active >12h.
-- Uses SECURITY DEFINER to bypass RLS (system maintenance operation).

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


-- ─── 5. Update execute_action_atomic to accept shift_id ──────────────────────
-- Adds p_shift_id parameter. When provided, the workflow_actions record
-- includes the shift reference for KPI aggregation.

CREATE OR REPLACE FUNCTION execute_action_atomic(
  p_tenant_id         UUID,
  p_action_type       TEXT,
  p_action_config     JSONB,
  p_entity_type       TEXT,
  p_entity_id         UUID,
  p_performed_by      UUID,
  p_source            TEXT,
  p_idempotency_key   TEXT       DEFAULT NULL,
  p_previous_state    JSONB      DEFAULT NULL,
  p_new_state         JSONB      DEFAULT NULL,
  p_activity_type     TEXT       DEFAULT NULL,
  p_activity_title    TEXT       DEFAULT NULL,
  p_activity_description TEXT    DEFAULT NULL,
  p_activity_metadata JSONB      DEFAULT NULL,
  p_activity_matter_id UUID      DEFAULT NULL,
  p_activity_contact_id UUID     DEFAULT NULL,
  p_action_label      TEXT       DEFAULT NULL,
  p_shift_id          UUID       DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_action_id   UUID;
  v_activity_id UUID;
  v_existing_id UUID;
BEGIN
  -- ── Idempotency: check + enforce via unique index ──
  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_existing_id
    FROM workflow_actions
    WHERE idempotency_key = p_idempotency_key
      AND status = 'completed'
    LIMIT 1;

    IF v_existing_id IS NOT NULL THEN
      RETURN jsonb_build_object(
        'action_id', v_existing_id,
        'activity_id', NULL,
        'idempotent_hit', true
      );
    END IF;
  END IF;

  -- ── 1. Insert workflow_actions (immutable audit record) ──
  INSERT INTO workflow_actions (
    tenant_id, action_type, action_config, entity_type, entity_id,
    performed_by, status, source, idempotency_key, previous_state, new_state,
    shift_id
  ) VALUES (
    p_tenant_id, p_action_type, p_action_config, p_entity_type, p_entity_id,
    p_performed_by, 'completed', p_source, p_idempotency_key, p_previous_state, p_new_state,
    p_shift_id
  )
  RETURNING id INTO v_action_id;

  -- ── 2. Insert audit_logs ──
  INSERT INTO audit_logs (
    tenant_id, user_id, action, entity_type, entity_id, metadata
  ) VALUES (
    p_tenant_id, p_performed_by, p_action_type, p_entity_type, p_entity_id,
    jsonb_build_object(
      'source', p_source,
      'workflow_action_id', v_action_id,
      'action_label', COALESCE(p_action_label, p_action_type),
      'shift_id', p_shift_id
    )
  );

  -- ── 3. Insert activities (human-readable timeline) ──
  INSERT INTO activities (
    tenant_id, activity_type, title, description,
    entity_type, entity_id, matter_id, contact_id,
    user_id, metadata
  ) VALUES (
    p_tenant_id,
    COALESCE(p_activity_type, p_action_type),
    COALESCE(p_activity_title, p_action_type),
    p_activity_description,
    p_entity_type, p_entity_id,
    p_activity_matter_id, p_activity_contact_id,
    p_performed_by,
    COALESCE(p_activity_metadata, '{}'::jsonb) ||
      jsonb_build_object(
        'workflow_action_id', v_action_id,
        'action_type', p_action_type,
        'source', p_source,
        'shift_id', p_shift_id
      )
  )
  RETURNING id INTO v_activity_id;

  RETURN jsonb_build_object(
    'action_id', v_action_id,
    'activity_id', v_activity_id,
    'idempotent_hit', false
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Re-grant execute after CREATE OR REPLACE
GRANT EXECUTE ON FUNCTION execute_action_atomic TO authenticated;
GRANT EXECUTE ON FUNCTION execute_action_atomic TO service_role;

-- ─── 6. Grant permissions on new tables ──────────────────────────────────────

GRANT SELECT, INSERT ON front_desk_shifts TO authenticated;
GRANT SELECT, INSERT, UPDATE ON front_desk_shifts TO service_role;
GRANT ALL ON front_desk_shifts TO service_role;

GRANT SELECT, INSERT ON front_desk_events TO authenticated;
GRANT ALL ON front_desk_events TO service_role;

COMMIT;
