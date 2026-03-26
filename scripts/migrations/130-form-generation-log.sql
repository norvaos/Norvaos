-- ============================================================================
-- Migration 130: form_generation_log table
-- ============================================================================
-- Records every PDF form generation attempt (success or failure).
-- Supports idempotency via unique (matter_id, form_template_id, generation_key).
-- The Python sidecar processes form_pack_config from matter_type and
-- writes the result back; this table is the audit trail.
--
-- 2026-03-17  -  Sprint 6, Week 2
-- ============================================================================

CREATE TABLE IF NOT EXISTS form_generation_log (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  matter_id           UUID        NOT NULL REFERENCES matters(id) ON DELETE CASCADE,
  -- form_template_id references the template slug/key in the Python sidecar
  form_template_id    TEXT        NOT NULL,
  -- generation_key is used for idempotency: same matter + template + key = same job
  generation_key      TEXT        NOT NULL DEFAULT gen_random_uuid()::TEXT,
  status              TEXT        NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  -- Path in Supabase Storage where the generated PDF is saved
  output_path         TEXT,
  -- Error message if status = 'failed'
  error_message       TEXT,
  -- Number of pages in the generated PDF
  page_count          INTEGER,
  -- ISO timestamp when the sidecar acknowledged the job
  processing_started_at TIMESTAMPTZ,
  -- ISO timestamp when the sidecar wrote the result
  completed_at        TIMESTAMPTZ,
  -- Who requested this form generation
  requested_by        UUID        REFERENCES users(id) ON DELETE SET NULL,
  -- Arbitrary metadata (form_version, field_snapshot hash, etc.)
  metadata            JSONB       NOT NULL DEFAULT '{}',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Unique constraint: prevent duplicate generation for the same key
CREATE UNIQUE INDEX IF NOT EXISTS idx_fgl_idempotency
  ON form_generation_log(matter_id, form_template_id, generation_key);

CREATE INDEX IF NOT EXISTS idx_fgl_matter_id   ON form_generation_log(matter_id);
CREATE INDEX IF NOT EXISTS idx_fgl_tenant_id   ON form_generation_log(tenant_id);
CREATE INDEX IF NOT EXISTS idx_fgl_status      ON form_generation_log(status);
CREATE INDEX IF NOT EXISTS idx_fgl_created_at  ON form_generation_log(created_at);

ALTER TABLE form_generation_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fgl_tenant_select ON form_generation_log;
DROP POLICY IF EXISTS fgl_tenant_insert ON form_generation_log;
DROP POLICY IF EXISTS fgl_tenant_update ON form_generation_log;

CREATE POLICY "fgl_tenant_select" ON form_generation_log
  FOR SELECT
  USING (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()));

CREATE POLICY "fgl_tenant_insert" ON form_generation_log
  FOR INSERT
  WITH CHECK (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()));

CREATE POLICY "fgl_tenant_update" ON form_generation_log
  FOR UPDATE
  USING (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()));

-- updated_at trigger
CREATE OR REPLACE FUNCTION set_fgl_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS fgl_set_updated_at ON form_generation_log;
CREATE TRIGGER fgl_set_updated_at
  BEFORE UPDATE ON form_generation_log
  FOR EACH ROW EXECUTE FUNCTION set_fgl_updated_at();

COMMENT ON TABLE form_generation_log IS
  'Audit log for every PDF form generation job dispatched to the Python sidecar. '
  'status lifecycle: pending → processing → completed | failed. '
  'output_path stores the Supabase Storage path of the generated PDF. '
  'Sprint 6, Week 2  -  Migration 130.';

-- ============================================================================
-- END Migration 130
-- ============================================================================
