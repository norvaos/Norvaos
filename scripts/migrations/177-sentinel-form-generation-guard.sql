-- ============================================================================
-- Migration 177: SENTINEL Form Generation Guard
-- ============================================================================
-- Three security layers for the IRCC Form-Mapper:
--
-- 1. READINESS GATE: Block form generation if readiness_score < 90%
-- 2. FORM GENERATION AUDIT: Log every form generation to sentinel_audit_log
-- 3. ENCRYPTED PDF VAULT: Per-matter encryption keys for form pack storage
-- 4. DATA DIFF TRACKING: Table to store snapshot diffs for mismatch detection
-- ============================================================================


-- ── 1. Readiness Gate Function ───────────────────────────────────────────────
-- Called by the app layer before generating a form pack.
-- Returns the current readiness score and whether generation is allowed.

CREATE OR REPLACE FUNCTION sentinel_check_readiness_gate(
  p_matter_id UUID,
  p_tenant_id UUID,
  p_min_score INT DEFAULT 90
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _score INT;
  _focus TEXT;
  _level TEXT;
BEGIN
  SELECT
    readiness_score,
    readiness_focus_area
  INTO _score, _focus
  FROM matters
  WHERE id = p_matter_id
    AND tenant_id = p_tenant_id;

  IF _score IS NULL THEN
    _score := 0;
    _focus := 'readiness_not_computed';
  END IF;

  _level := CASE
    WHEN _score >= 90 THEN 'ready'
    WHEN _score >= 70 THEN 'high'
    WHEN _score >= 40 THEN 'medium'
    WHEN _score >= 20 THEN 'low'
    ELSE 'critical'
  END;

  RETURN jsonb_build_object(
    'allowed', _score >= p_min_score,
    'score', _score,
    'min_required', p_min_score,
    'level', _level,
    'focus_area', COALESCE(_focus, 'none'),
    'checked_at', now()
  );
END;
$$;


-- ── 2. Form Generation Audit Trigger ─────────────────────────────────────────
-- Fires AFTER INSERT on form_pack_versions to log every generation event.

CREATE OR REPLACE FUNCTION sentinel_log_form_generation()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO sentinel_audit_log (
    event_type, severity, tenant_id, user_id,
    table_name, record_id, details
  ) VALUES (
    'FORM_GENERATION',
    'info',
    NEW.tenant_id,
    NEW.generated_by,
    'form_pack_versions',
    NEW.id::TEXT,
    jsonb_build_object(
      'matter_id', NEW.matter_id,
      'pack_type', NEW.pack_type,
      'version_number', NEW.version_number,
      'status', NEW.status,
      'mapping_version', NEW.mapping_version,
      'template_checksum', LEFT(NEW.template_checksum, 16)
    )
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sentinel_form_generation ON form_pack_versions;
CREATE TRIGGER trg_sentinel_form_generation
  AFTER INSERT ON form_pack_versions
  FOR EACH ROW
  EXECUTE FUNCTION sentinel_log_form_generation();


-- ── 3. Per-Matter Encryption Keys for PDF Vault ──────────────────────────────

CREATE TABLE IF NOT EXISTS matter_vault_keys (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  matter_id       UUID        NOT NULL REFERENCES matters(id) ON DELETE CASCADE,
  encryption_key  TEXT        NOT NULL,  -- AES-256 key (encrypted at rest by Supabase)
  key_version     INT         NOT NULL DEFAULT 1,
  created_by      UUID        REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_matter_vault_key UNIQUE (matter_id, key_version)
);

-- RLS: Only the assigned lawyer or admin can access vault keys
ALTER TABLE matter_vault_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY matter_vault_keys_select ON matter_vault_keys
  FOR SELECT
  USING (
    tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid())
    AND (
      -- Assigned lawyer
      EXISTS (
        SELECT 1 FROM matters m
        WHERE m.id = matter_vault_keys.matter_id
          AND m.responsible_lawyer_id = (SELECT id FROM users WHERE auth_user_id = auth.uid())
      )
      -- OR admin
      OR EXISTS (
        SELECT 1 FROM users u
        JOIN roles r ON r.id = u.role_id
        WHERE u.auth_user_id = auth.uid()
          AND r.name IN ('admin', 'super_admin', 'superadmin')
      )
    )
  );

CREATE POLICY matter_vault_keys_insert ON matter_vault_keys
  FOR INSERT
  WITH CHECK (
    tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid())
  );

-- Index for fast lookup
CREATE INDEX IF NOT EXISTS idx_mvk_matter ON matter_vault_keys(matter_id);
CREATE INDEX IF NOT EXISTS idx_mvk_tenant ON matter_vault_keys(tenant_id);


-- ── 4. Function to generate or retrieve vault key for a matter ───────────────

CREATE OR REPLACE FUNCTION get_or_create_vault_key(
  p_matter_id UUID,
  p_tenant_id UUID,
  p_user_id UUID
)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _key TEXT;
BEGIN
  -- Try to get existing key
  SELECT encryption_key INTO _key
  FROM matter_vault_keys
  WHERE matter_id = p_matter_id
    AND tenant_id = p_tenant_id
  ORDER BY key_version DESC
  LIMIT 1;

  -- Generate new key if none exists (32 bytes = 256 bits, hex encoded)
  IF _key IS NULL THEN
    _key := encode(gen_random_bytes(32), 'hex');
    INSERT INTO matter_vault_keys (tenant_id, matter_id, encryption_key, created_by)
    VALUES (p_tenant_id, p_matter_id, _key, p_user_id);
  END IF;

  RETURN _key;
END;
$$;


-- ── 5. Form Data Diff Tracking ───────────────────────────────────────────────
-- Stores detected mismatches between current data and last form snapshot.

CREATE TABLE IF NOT EXISTS form_data_diffs (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  matter_id       UUID        NOT NULL REFERENCES matters(id) ON DELETE CASCADE,
  pack_version_id UUID        NOT NULL REFERENCES form_pack_versions(id) ON DELETE CASCADE,
  form_code       TEXT        NOT NULL,
  field_path      TEXT        NOT NULL,   -- e.g. 'personal.family_name'
  snapshot_value  TEXT,                     -- value at time of last form generation
  current_value   TEXT,                     -- current value in profile
  detected_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at     TIMESTAMPTZ,             -- NULL = unresolved
  resolved_by     UUID        REFERENCES users(id) ON DELETE SET NULL,

  CONSTRAINT uq_form_diff UNIQUE (pack_version_id, field_path)
);

ALTER TABLE form_data_diffs ENABLE ROW LEVEL SECURITY;

CREATE POLICY form_data_diffs_tenant ON form_data_diffs
  FOR ALL
  USING (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()));

CREATE INDEX IF NOT EXISTS idx_fdd_matter ON form_data_diffs(matter_id);
CREATE INDEX IF NOT EXISTS idx_fdd_version ON form_data_diffs(pack_version_id);
CREATE INDEX IF NOT EXISTS idx_fdd_unresolved ON form_data_diffs(matter_id) WHERE resolved_at IS NULL;


-- ── 6. Add is_encrypted + vault columns to form_pack_artifacts ───────────────

ALTER TABLE form_pack_artifacts
  ADD COLUMN IF NOT EXISTS is_encrypted BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS encryption_iv TEXT;  -- AES IV for decryption
