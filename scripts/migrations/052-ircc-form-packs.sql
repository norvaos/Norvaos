-- ============================================================================
-- Migration 052: IRCC Form Pack Versioning
-- ============================================================================
-- Creates tables and infrastructure for the IRCC form generation system:
--   form_pack_versions   -  one row per generated draft/approved version
--   form_pack_artifacts  -  one row per PDF file in a version (INSERT-only)
--
-- Includes: immutability triggers, RLS policies, version-allocation RPC,
--           approval RPC, and permission seeding for default roles.
-- ============================================================================


-- ── Table: form_pack_versions ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS form_pack_versions (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  matter_id         UUID        NOT NULL REFERENCES matters(id) ON DELETE CASCADE,
  pack_type         TEXT        NOT NULL,  -- e.g. 'IMM5406'
  version_number    INT         NOT NULL DEFAULT 1,
  status            TEXT        NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft', 'approved', 'superseded')),

  -- Frozen data used for generation (immutable after creation)
  input_snapshot    JSONB       NOT NULL,  -- deep clone of contacts.immigration_data
  resolved_fields   JSONB       NOT NULL,  -- XFA path → final string value map
  mapping_version   TEXT        NOT NULL,  -- e.g. 'IMM5406-map-v1.0'
  template_checksum TEXT        NOT NULL,  -- SHA-256 of blank template PDF

  -- Validation result at generation time
  validation_result JSONB,                 -- { filled_count, skipped_count, warnings[], truncations[] }

  -- Tracking
  generated_by      UUID        REFERENCES users(id) ON DELETE SET NULL,
  approved_by       UUID        REFERENCES users(id) ON DELETE SET NULL,
  approved_at       TIMESTAMPTZ,
  idempotency_key   TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Race-condition prevention: one version number per matter + pack_type
  CONSTRAINT uq_form_pack_version UNIQUE (matter_id, pack_type, version_number)
);

-- Idempotency index (same pattern as workflow_actions)
CREATE UNIQUE INDEX IF NOT EXISTS idx_fpv_idempotency
  ON form_pack_versions(idempotency_key) WHERE idempotency_key IS NOT NULL;

-- Lookup indexes
CREATE INDEX IF NOT EXISTS idx_fpv_tenant_matter
  ON form_pack_versions(tenant_id, matter_id);

CREATE INDEX IF NOT EXISTS idx_fpv_matter_status
  ON form_pack_versions(matter_id, status);


-- ── Table: form_pack_artifacts ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS form_pack_artifacts (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  pack_version_id   UUID        NOT NULL REFERENCES form_pack_versions(id) ON DELETE CASCADE,
  form_code         TEXT        NOT NULL,  -- e.g. 'IMM5406'
  storage_path      TEXT        NOT NULL,
  file_name         TEXT        NOT NULL,
  file_size         INT,
  checksum_sha256   TEXT        NOT NULL,
  is_final          BOOLEAN     NOT NULL DEFAULT false,  -- false=draft, true=approved
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fpa_version
  ON form_pack_artifacts(pack_version_id);

CREATE INDEX IF NOT EXISTS idx_fpa_tenant
  ON form_pack_artifacts(tenant_id);


-- ── Immutability Triggers ───────────────────────────────────────────────────

-- Prevent modification of approved form_pack_versions
CREATE OR REPLACE FUNCTION prevent_approved_pack_modification()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status = 'approved' THEN
    RAISE EXCEPTION 'Cannot modify an approved form pack version (id: %). Create a new version instead.', OLD.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_form_pack_versions_no_update_approved
  BEFORE UPDATE ON form_pack_versions
  FOR EACH ROW
  EXECUTE FUNCTION prevent_approved_pack_modification();

-- Prevent ALL deletes on form_pack_versions (versions are permanent history)
CREATE TRIGGER trg_form_pack_versions_no_delete
  BEFORE DELETE ON form_pack_versions
  FOR EACH ROW
  EXECUTE FUNCTION prevent_workflow_action_delete();

-- form_pack_artifacts is INSERT-only: no updates, no deletes
CREATE TRIGGER trg_form_pack_artifacts_no_update
  BEFORE UPDATE ON form_pack_artifacts
  FOR EACH ROW
  EXECUTE FUNCTION prevent_audit_log_mutation();

CREATE TRIGGER trg_form_pack_artifacts_no_delete
  BEFORE DELETE ON form_pack_artifacts
  FOR EACH ROW
  EXECUTE FUNCTION prevent_audit_log_mutation();


-- ── Row Level Security ──────────────────────────────────────────────────────

ALTER TABLE form_pack_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE form_pack_artifacts ENABLE ROW LEVEL SECURITY;

-- form_pack_versions: SELECT + INSERT only (status transitions via SECURITY DEFINER RPCs)
CREATE POLICY fpv_tenant_select ON form_pack_versions
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_current_tenant_id());

CREATE POLICY fpv_tenant_insert ON form_pack_versions
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_current_tenant_id());

-- form_pack_artifacts: SELECT + INSERT only (immutable)
CREATE POLICY fpa_tenant_select ON form_pack_artifacts
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_current_tenant_id());

CREATE POLICY fpa_tenant_insert ON form_pack_artifacts
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_current_tenant_id());


-- ── RPC: create_form_pack_version ───────────────────────────────────────────
-- Atomically allocates the next version number using FOR UPDATE locking
-- and creates both the version record and artifact record(s).

CREATE OR REPLACE FUNCTION create_form_pack_version(
  p_tenant_id         UUID,
  p_matter_id         UUID,
  p_pack_type         TEXT,
  p_input_snapshot    JSONB,
  p_resolved_fields   JSONB,
  p_mapping_version   TEXT,
  p_template_checksum TEXT,
  p_validation_result JSONB,
  p_generated_by      UUID,
  p_idempotency_key   TEXT,
  -- Artifact fields
  p_form_code         TEXT,
  p_storage_path      TEXT,
  p_file_name         TEXT,
  p_file_size         INT,
  p_checksum_sha256   TEXT,
  p_is_final          BOOLEAN DEFAULT false
)
RETURNS JSONB AS $$
DECLARE
  v_new_version     INT;
  v_version_id      UUID;
  v_artifact_id     UUID;
  v_existing_id     UUID;
BEGIN
  -- Idempotency check: if a version was already created with this key, return it
  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_existing_id
    FROM form_pack_versions
    WHERE idempotency_key = p_idempotency_key
    LIMIT 1;

    IF v_existing_id IS NOT NULL THEN
      RETURN jsonb_build_object(
        'version_id', v_existing_id,
        'version_number', (SELECT version_number FROM form_pack_versions WHERE id = v_existing_id),
        'artifact_id', (SELECT id FROM form_pack_artifacts WHERE pack_version_id = v_existing_id LIMIT 1),
        'idempotent_hit', true
      );
    END IF;
  END IF;

  -- Lock the matter row to serialize concurrent version allocations
  PERFORM id FROM matters WHERE id = p_matter_id FOR UPDATE;

  -- Compute next version number atomically
  SELECT COALESCE(MAX(version_number), 0) + 1 INTO v_new_version
  FROM form_pack_versions
  WHERE matter_id = p_matter_id AND pack_type = p_pack_type;

  -- Insert version record
  INSERT INTO form_pack_versions (
    tenant_id, matter_id, pack_type, version_number, status,
    input_snapshot, resolved_fields, mapping_version, template_checksum,
    validation_result, generated_by, idempotency_key
  ) VALUES (
    p_tenant_id, p_matter_id, p_pack_type, v_new_version, 'draft',
    p_input_snapshot, p_resolved_fields, p_mapping_version, p_template_checksum,
    p_validation_result, p_generated_by, p_idempotency_key
  )
  RETURNING id INTO v_version_id;

  -- Insert artifact record
  INSERT INTO form_pack_artifacts (
    tenant_id, pack_version_id, form_code,
    storage_path, file_name, file_size, checksum_sha256, is_final
  ) VALUES (
    p_tenant_id, v_version_id, p_form_code,
    p_storage_path, p_file_name, p_file_size, p_checksum_sha256, p_is_final
  )
  RETURNING id INTO v_artifact_id;

  RETURN jsonb_build_object(
    'version_id', v_version_id,
    'version_number', v_new_version,
    'artifact_id', v_artifact_id,
    'idempotent_hit', false
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ── RPC: approve_form_pack_version ──────────────────────────────────────────
-- Sets a draft version to approved status. Must be called before the
-- immutability trigger blocks further updates.

CREATE OR REPLACE FUNCTION approve_form_pack_version(
  p_tenant_id       UUID,
  p_version_id      UUID,
  p_approved_by     UUID
)
RETURNS JSONB AS $$
DECLARE
  v_current_status TEXT;
  v_version_number INT;
  v_pack_type      TEXT;
BEGIN
  -- Fetch and lock the version row
  SELECT status, version_number, pack_type
  INTO v_current_status, v_version_number, v_pack_type
  FROM form_pack_versions
  WHERE id = p_version_id AND tenant_id = p_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Version not found');
  END IF;

  IF v_current_status <> 'draft' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only draft versions can be approved. Current status: ' || v_current_status);
  END IF;

  -- Approve the version (this UPDATE is allowed because status is 'draft')
  UPDATE form_pack_versions SET
    status = 'approved',
    approved_by = p_approved_by,
    approved_at = now()
  WHERE id = p_version_id AND tenant_id = p_tenant_id;

  RETURN jsonb_build_object(
    'success', true,
    'version_id', p_version_id,
    'version_number', v_version_number,
    'pack_type', v_pack_type
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ── RPC: add_form_pack_artifact ─────────────────────────────────────────────
-- Adds an artifact (e.g., the final approved PDF) to an existing version.

CREATE OR REPLACE FUNCTION add_form_pack_artifact(
  p_tenant_id       UUID,
  p_version_id      UUID,
  p_form_code       TEXT,
  p_storage_path    TEXT,
  p_file_name       TEXT,
  p_file_size       INT,
  p_checksum_sha256 TEXT,
  p_is_final        BOOLEAN
)
RETURNS UUID AS $$
DECLARE
  v_artifact_id UUID;
BEGIN
  INSERT INTO form_pack_artifacts (
    tenant_id, pack_version_id, form_code,
    storage_path, file_name, file_size, checksum_sha256, is_final
  ) VALUES (
    p_tenant_id, p_version_id, p_form_code,
    p_storage_path, p_file_name, p_file_size, p_checksum_sha256, p_is_final
  )
  RETURNING id INTO v_artifact_id;

  RETURN v_artifact_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ── Permission Seeding ──────────────────────────────────────────────────────
-- Update default role permissions to include form_packs.
-- Admin gets all, Lawyer gets full access, Paralegal can view+create, Clerk can view.

DO $$
DECLARE
  r RECORD;
  v_perms JSONB;
BEGIN
  FOR r IN SELECT id, name, permissions FROM roles WHERE is_system = true
  LOOP
    v_perms := COALESCE(r.permissions, '{}'::jsonb);

    CASE r.name
      WHEN 'Admin' THEN
        v_perms := v_perms || '{"form_packs": {"view": true, "create": true, "approve": true, "export": true}}'::jsonb;
      WHEN 'Lawyer' THEN
        v_perms := v_perms || '{"form_packs": {"view": true, "create": true, "approve": true, "export": true}}'::jsonb;
      WHEN 'Paralegal' THEN
        v_perms := v_perms || '{"form_packs": {"view": true, "create": true, "approve": false, "export": false}}'::jsonb;
      WHEN 'Clerk' THEN
        v_perms := v_perms || '{"form_packs": {"view": true, "create": false, "approve": false, "export": false}}'::jsonb;
      ELSE
        -- Other roles: view only
        v_perms := v_perms || '{"form_packs": {"view": true, "create": false, "approve": false, "export": false}}'::jsonb;
    END CASE;

    UPDATE roles SET permissions = v_perms WHERE id = r.id;
  END LOOP;
END;
$$;
