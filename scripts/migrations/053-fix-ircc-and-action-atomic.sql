-- ============================================================================
-- Migration 053: Fix IRCC form packs + execute_action_atomic signature
-- ============================================================================
-- 1. Drop the artifact UPDATE trigger (allow storage path backfill)
-- 2. Add shift_id column to workflow_actions
-- 3. Drop old execute_action_atomic (without p_shift_id) and recreate with it
-- ============================================================================

BEGIN;

-- ─── 1. Fix form_pack_artifacts: allow UPDATE for storage path backfill ──────
-- The generation service creates the artifact via RPC, then uploads the PDF,
-- then updates the artifact with the real storage_path. The DELETE trigger
-- remains to prevent deletion.

DROP TRIGGER IF EXISTS trg_form_pack_artifacts_no_update ON form_pack_artifacts;


-- ─── 2. Add shift_id to workflow_actions if missing ─────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'workflow_actions' AND column_name = 'shift_id'
  ) THEN
    ALTER TABLE workflow_actions ADD COLUMN shift_id UUID;
  END IF;
END;
$$;


-- ─── 3. Drop old execute_action_atomic overload (17 params, no p_shift_id) ──

DROP FUNCTION IF EXISTS execute_action_atomic(
  UUID, TEXT, JSONB, TEXT, UUID, UUID, TEXT,
  TEXT, JSONB, JSONB, TEXT, TEXT, TEXT, JSONB, UUID, UUID, TEXT
);


-- ─── 4. Create execute_action_atomic with p_shift_id (18 params) ────────────

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
  -- Idempotency: check + enforce via unique index
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

  -- 1. Insert workflow_actions (immutable audit record)
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

  -- 2. Insert audit_logs
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

  -- 3. Insert activities (human-readable timeline)
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

-- Grant execute
GRANT EXECUTE ON FUNCTION execute_action_atomic TO authenticated;
GRANT EXECUTE ON FUNCTION execute_action_atomic TO service_role;

COMMIT;
