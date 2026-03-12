-- ═══════════════════════════════════════════════════════════════════════════════
-- 057 — IRCC Form Management Platform
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Creates the database-driven form management system that replaces the
-- hardcoded form-field-registry.ts / pack-constants.ts / xfa-filler maps.
--
-- Tables:
--   ircc_forms           — Uploaded form templates (PDFs)
--   ircc_form_sections   — Questionnaire sections per form
--   ircc_form_fields     — Extracted XFA fields + admin field mappings
--   ircc_form_array_maps — Array/repeater field configurations
--   ircc_stream_forms    — Junction: case type ↔ forms
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── 1. ircc_forms — Form Library ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ircc_forms (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id),
  form_code         TEXT NOT NULL,
  form_name         TEXT NOT NULL,
  description       TEXT,
  storage_path      TEXT NOT NULL,
  file_name         TEXT NOT NULL,
  file_size         INTEGER,
  checksum_sha256   TEXT NOT NULL,
  xfa_root_element  TEXT,
  is_xfa            BOOLEAN NOT NULL DEFAULT true,
  scan_status       TEXT NOT NULL DEFAULT 'pending'
                      CHECK (scan_status IN ('pending', 'scanning', 'scanned', 'error')),
  scan_error        TEXT,
  scan_result       JSONB,
  mapping_version   TEXT NOT NULL DEFAULT 'v1.0',
  is_active         BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (tenant_id, form_code)
);

CREATE INDEX idx_ircc_forms_tenant ON ircc_forms(tenant_id);

ALTER TABLE ircc_forms ENABLE ROW LEVEL SECURITY;

CREATE POLICY ircc_forms_select ON ircc_forms
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_current_tenant_id());

CREATE POLICY ircc_forms_insert ON ircc_forms
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_current_tenant_id());

CREATE POLICY ircc_forms_update ON ircc_forms
  FOR UPDATE TO authenticated
  USING (tenant_id = public.get_current_tenant_id());

CREATE POLICY ircc_forms_delete ON ircc_forms
  FOR DELETE TO authenticated
  USING (tenant_id = public.get_current_tenant_id());


-- ── 2. ircc_form_sections — Questionnaire Sections ──────────────────────────

CREATE TABLE IF NOT EXISTS ircc_form_sections (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  form_id         UUID NOT NULL REFERENCES ircc_forms(id) ON DELETE CASCADE,
  section_key     TEXT NOT NULL,
  title           TEXT NOT NULL,
  description     TEXT,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  merge_into      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (form_id, section_key)
);

CREATE INDEX idx_ircc_form_sections_form ON ircc_form_sections(form_id);

ALTER TABLE ircc_form_sections ENABLE ROW LEVEL SECURITY;

CREATE POLICY ircc_form_sections_select ON ircc_form_sections
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_current_tenant_id());

CREATE POLICY ircc_form_sections_insert ON ircc_form_sections
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_current_tenant_id());

CREATE POLICY ircc_form_sections_update ON ircc_form_sections
  FOR UPDATE TO authenticated
  USING (tenant_id = public.get_current_tenant_id());

CREATE POLICY ircc_form_sections_delete ON ircc_form_sections
  FOR DELETE TO authenticated
  USING (tenant_id = public.get_current_tenant_id());


-- ── 3. ircc_form_fields — Extracted + Mapped Fields ─────────────────────────

CREATE TABLE IF NOT EXISTS ircc_form_fields (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id),
  form_id           UUID NOT NULL REFERENCES ircc_forms(id) ON DELETE CASCADE,

  -- Scanner-extracted data
  xfa_path          TEXT NOT NULL,
  xfa_field_type    TEXT,
  suggested_label   TEXT,

  -- Admin-configured mapping
  profile_path      TEXT,
  label             TEXT,
  field_type        TEXT,
  options           JSONB,
  is_required       BOOLEAN NOT NULL DEFAULT false,
  placeholder       TEXT,
  description       TEXT,
  section_id        UUID REFERENCES ircc_form_sections(id) ON DELETE SET NULL,
  sort_order        INTEGER NOT NULL DEFAULT 0,
  max_length        INTEGER,

  -- Value transformation
  date_split        TEXT CHECK (date_split IN ('year', 'month', 'day')),
  value_format      JSONB,

  -- Conditional visibility
  show_when         JSONB,

  -- Array/repeater metadata
  is_array_field    BOOLEAN NOT NULL DEFAULT false,
  array_config      JSONB,

  -- Readiness configuration
  required_condition JSONB,
  readiness_section  TEXT,

  -- Status flags
  is_mapped         BOOLEAN NOT NULL DEFAULT false,
  is_meta_field     BOOLEAN NOT NULL DEFAULT false,
  meta_field_key    TEXT,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (form_id, xfa_path)
);

CREATE INDEX idx_ircc_form_fields_form ON ircc_form_fields(form_id);
CREATE INDEX idx_ircc_form_fields_profile_path ON ircc_form_fields(profile_path)
  WHERE profile_path IS NOT NULL;
CREATE INDEX idx_ircc_form_fields_section ON ircc_form_fields(section_id)
  WHERE section_id IS NOT NULL;

ALTER TABLE ircc_form_fields ENABLE ROW LEVEL SECURITY;

CREATE POLICY ircc_form_fields_select ON ircc_form_fields
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_current_tenant_id());

CREATE POLICY ircc_form_fields_insert ON ircc_form_fields
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_current_tenant_id());

CREATE POLICY ircc_form_fields_update ON ircc_form_fields
  FOR UPDATE TO authenticated
  USING (tenant_id = public.get_current_tenant_id());

CREATE POLICY ircc_form_fields_delete ON ircc_form_fields
  FOR DELETE TO authenticated
  USING (tenant_id = public.get_current_tenant_id());


-- ── 4. ircc_form_array_maps — Array Field Configurations ────────────────────

CREATE TABLE IF NOT EXISTS ircc_form_array_maps (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id),
  form_id           UUID NOT NULL REFERENCES ircc_forms(id) ON DELETE CASCADE,
  profile_path      TEXT NOT NULL,
  xfa_base_path     TEXT NOT NULL,
  xfa_entry_name    TEXT NOT NULL,
  max_entries       INTEGER NOT NULL DEFAULT 6,
  sub_fields        JSONB NOT NULL DEFAULT '{}',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (form_id, profile_path)
);

CREATE INDEX idx_ircc_form_array_maps_form ON ircc_form_array_maps(form_id);

ALTER TABLE ircc_form_array_maps ENABLE ROW LEVEL SECURITY;

CREATE POLICY ircc_form_array_maps_select ON ircc_form_array_maps
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_current_tenant_id());

CREATE POLICY ircc_form_array_maps_insert ON ircc_form_array_maps
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_current_tenant_id());

CREATE POLICY ircc_form_array_maps_update ON ircc_form_array_maps
  FOR UPDATE TO authenticated
  USING (tenant_id = public.get_current_tenant_id());

CREATE POLICY ircc_form_array_maps_delete ON ircc_form_array_maps
  FOR DELETE TO authenticated
  USING (tenant_id = public.get_current_tenant_id());


-- ── 5. ircc_stream_forms — Case Type ↔ Forms Junction ───────────────────────

CREATE TABLE IF NOT EXISTS ircc_stream_forms (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  case_type_id    UUID NOT NULL REFERENCES immigration_case_types(id) ON DELETE CASCADE,
  form_id         UUID NOT NULL REFERENCES ircc_forms(id) ON DELETE CASCADE,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  is_required     BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (case_type_id, form_id)
);

CREATE INDEX idx_ircc_stream_forms_case_type ON ircc_stream_forms(case_type_id);
CREATE INDEX idx_ircc_stream_forms_form ON ircc_stream_forms(form_id);

ALTER TABLE ircc_stream_forms ENABLE ROW LEVEL SECURITY;

CREATE POLICY ircc_stream_forms_select ON ircc_stream_forms
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_current_tenant_id());

CREATE POLICY ircc_stream_forms_insert ON ircc_stream_forms
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_current_tenant_id());

CREATE POLICY ircc_stream_forms_update ON ircc_stream_forms
  FOR UPDATE TO authenticated
  USING (tenant_id = public.get_current_tenant_id());

CREATE POLICY ircc_stream_forms_delete ON ircc_stream_forms
  FOR DELETE TO authenticated
  USING (tenant_id = public.get_current_tenant_id());


-- ── 6. updated_at trigger ───────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_ircc_form_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_ircc_forms_updated_at
  BEFORE UPDATE ON ircc_forms
  FOR EACH ROW EXECUTE FUNCTION update_ircc_form_updated_at();

CREATE TRIGGER trg_ircc_form_fields_updated_at
  BEFORE UPDATE ON ircc_form_fields
  FOR EACH ROW EXECUTE FUNCTION update_ircc_form_updated_at();
