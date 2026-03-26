-- ============================================================================
-- Migration 043: Enforcement Hardening
-- ============================================================================
-- Phase 6 of the Controlled Workflow System.
-- Addresses 8 structural gaps for production-grade enforcement:
--   6A: DOB lockout table
--   6B: Atomic triple-write function
--   6C: Idempotency unique constraint
--   6E: RLS WITH CHECK on core tables
--   6H: portal_links metadata column + dead index fix
-- ============================================================================

-- ── 6H: Fix portal_links schema drift ──────────────────────────────────────

-- Code writes metadata but no migration created the column
ALTER TABLE portal_links ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

-- Fix dead index from migration 022 that references non-existent revoked_at column
DROP INDEX IF EXISTS idx_portal_links_matter;
CREATE INDEX IF NOT EXISTS idx_portal_links_matter
  ON portal_links(matter_id) WHERE is_active = true;

-- ── 6A-2: DOB lockout table ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS dob_lockouts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  contact_id      UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  attempts        INTEGER NOT NULL DEFAULT 0,
  locked_until    TIMESTAMPTZ,
  last_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, contact_id)
);

ALTER TABLE dob_lockouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY dob_lockouts_tenant ON dob_lockouts
  FOR ALL
  USING (tenant_id = public.get_current_tenant_id())
  WITH CHECK (tenant_id = public.get_current_tenant_id());

CREATE INDEX IF NOT EXISTS idx_dob_lockouts_contact
  ON dob_lockouts(tenant_id, contact_id);

-- ── 6C-1: Idempotency unique constraint ────────────────────────────────────

-- Drop the old non-unique index if it exists
DROP INDEX IF EXISTS idx_workflow_actions_idempotency;

-- Create a proper UNIQUE partial index
CREATE UNIQUE INDEX IF NOT EXISTS idx_workflow_actions_idempotency_unique
  ON workflow_actions(idempotency_key) WHERE idempotency_key IS NOT NULL;

-- ── 6E: Tighten RLS  -  add WITH CHECK to core tables ────────────────────────

-- Replace USING-only policies with full USING + WITH CHECK policies
-- Also upgrades from inline subquery to cached get_current_tenant_id()
DO $$ DECLARE t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY['matters', 'contacts', 'leads', 'activities']) LOOP
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation_%I ON %I', t, t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation_%I ON %I
       FOR ALL
       USING (tenant_id = public.get_current_tenant_id())
       WITH CHECK (tenant_id = public.get_current_tenant_id())',
      t, t
    );
  END LOOP;
END $$;

-- ── 6B-pre: Idempotency advisory lock ─────────────────────────────────────────
-- Serializes concurrent requests with the same idempotency key using Postgres
-- session-level advisory locks. Prevents the race condition where two concurrent
-- requests both pass the SELECT check, both execute business logic, and one
-- silently loses its audit trail to the unique constraint.
--
-- Flow: acquire_idempotency_lock() → execute() → execute_action_atomic() → release_idempotency_lock()

CREATE OR REPLACE FUNCTION acquire_idempotency_lock(
  p_idempotency_key TEXT
) RETURNS JSONB AS $$
DECLARE
  v_lock_id BIGINT;
  v_existing_id UUID;
BEGIN
  IF p_idempotency_key IS NULL THEN
    RETURN jsonb_build_object('locked', true, 'existing_id', NULL);
  END IF;

  -- Convert text key to a bigint for pg_advisory_lock
  v_lock_id := hashtext(p_idempotency_key);

  -- Acquire session-level advisory lock (blocks if another session holds it)
  PERFORM pg_advisory_lock(v_lock_id);

  -- Now check if a completed record already exists
  SELECT id INTO v_existing_id
  FROM workflow_actions
  WHERE idempotency_key = p_idempotency_key
    AND status = 'completed'
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    -- Duplicate found  -  release lock and report
    PERFORM pg_advisory_unlock(v_lock_id);
    RETURN jsonb_build_object('locked', false, 'existing_id', v_existing_id);
  END IF;

  -- Lock held  -  caller proceeds with execute() then triple-write
  RETURN jsonb_build_object('locked', true, 'existing_id', NULL);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION release_idempotency_lock(
  p_idempotency_key TEXT
) RETURNS void AS $$
BEGIN
  IF p_idempotency_key IS NOT NULL THEN
    PERFORM pg_advisory_unlock(hashtext(p_idempotency_key));
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION acquire_idempotency_lock TO authenticated;
GRANT EXECUTE ON FUNCTION acquire_idempotency_lock TO service_role;
GRANT EXECUTE ON FUNCTION release_idempotency_lock TO authenticated;
GRANT EXECUTE ON FUNCTION release_idempotency_lock TO service_role;

-- ── 6B: Atomic triple-write function ────────────────────────────────────────

-- Wraps the workflow_actions + audit_logs + activities inserts in a single
-- database transaction. Called from the Action Executor via supabase.rpc().
-- SECURITY DEFINER so it can bypass RLS (same as admin client pattern).

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
  p_action_label      TEXT       DEFAULT NULL
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
    performed_by, status, source, idempotency_key, previous_state, new_state
  ) VALUES (
    p_tenant_id, p_action_type, p_action_config, p_entity_type, p_entity_id,
    p_performed_by, 'completed', p_source, p_idempotency_key, p_previous_state, p_new_state
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
      'action_label', COALESCE(p_action_label, p_action_type)
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
      jsonb_build_object('workflow_action_id', v_action_id, 'action_type', p_action_type, 'source', p_source)
  )
  RETURNING id INTO v_activity_id;

  RETURN jsonb_build_object(
    'action_id', v_action_id,
    'activity_id', v_activity_id,
    'idempotent_hit', false
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute to authenticated users (service role always has access)
GRANT EXECUTE ON FUNCTION execute_action_atomic TO authenticated;
GRANT EXECUTE ON FUNCTION execute_action_atomic TO service_role;
