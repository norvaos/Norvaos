-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration 073  -  IRCC Form Version History
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Adds version tracking to IRCC forms so that when IRCC updates a form
-- (new PDF with same form_code), the old version is archived and the history
-- is preserved. Supports the "IRCC Forms Vault" feature for centralized
-- form management with local folder sync.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── 1. Add current_version to ircc_forms ───────────────────────────────────────

ALTER TABLE ircc_forms
  ADD COLUMN IF NOT EXISTS current_version INTEGER NOT NULL DEFAULT 1;

COMMENT ON COLUMN ircc_forms.current_version IS
  'Current version number. Incremented each time the form PDF is replaced.';


-- ── 2. Create ircc_form_versions table ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ircc_form_versions (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          UUID NOT NULL REFERENCES tenants(id),
  form_id            UUID NOT NULL REFERENCES ircc_forms(id) ON DELETE CASCADE,
  version_number     INTEGER NOT NULL,
  storage_path       TEXT NOT NULL,
  file_name          TEXT NOT NULL,
  file_size          INTEGER,
  checksum_sha256    TEXT NOT NULL,
  scan_result        JSONB,
  field_count        INTEGER NOT NULL DEFAULT 0,
  mapped_field_count INTEGER NOT NULL DEFAULT 0,
  is_xfa             BOOLEAN NOT NULL DEFAULT true,
  xfa_root_element   TEXT,
  archived_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  archived_by        UUID REFERENCES users(id),

  UNIQUE (form_id, version_number)
);

COMMENT ON TABLE ircc_form_versions IS
  'Archives old versions of IRCC forms when a new PDF is uploaded for the same form_code.';


-- ── 3. Indexes ─────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_ircc_form_versions_form
  ON ircc_form_versions(form_id);

CREATE INDEX IF NOT EXISTS idx_ircc_form_versions_tenant
  ON ircc_form_versions(tenant_id);


-- ── 4. Row-Level Security ──────────────────────────────────────────────────────

ALTER TABLE ircc_form_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY ircc_form_versions_select ON ircc_form_versions
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_current_tenant_id());

CREATE POLICY ircc_form_versions_insert ON ircc_form_versions
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_current_tenant_id());

CREATE POLICY ircc_form_versions_update ON ircc_form_versions
  FOR UPDATE TO authenticated
  USING (tenant_id = public.get_current_tenant_id());

CREATE POLICY ircc_form_versions_delete ON ircc_form_versions
  FOR DELETE TO authenticated
  USING (tenant_id = public.get_current_tenant_id());


-- ── 5. Reload PostgREST schema cache ──────────────────────────────────────────

NOTIFY pgrst, 'reload schema';
