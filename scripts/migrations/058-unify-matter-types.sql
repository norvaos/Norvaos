-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration 058: Unify Matter Types — IRCC Forms + Section Config
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Replaces the immigration_case_types parallel hierarchy by:
--   1. Adding has_ircc_forms flag to matter_types
--   2. Adding matter_type_id to ircc_stream_forms (alongside existing case_type_id)
--   3. Creating matter_type_section_config for dynamic Case Details tab
--
-- Practice Area → Matter Type relationship already exists via matter_types.practice_area_id.
-- This migration extends matter_types to handle IRCC form assignment and section config.
-- ═══════════════════════════════════════════════════════════════════════════════


-- ── 1. Add has_ircc_forms to matter_types ────────────────────────────────────
-- Controls whether IRCC-related UI (form upload, questionnaire) is shown.

ALTER TABLE matter_types
  ADD COLUMN IF NOT EXISTS has_ircc_forms BOOLEAN NOT NULL DEFAULT false;


-- ── 2. Add matter_type_id to ircc_stream_forms ──────────────────────────────
-- Enables form assignment to matter types (in addition to legacy case_type_id).
-- case_type_id is kept temporarily for backward compatibility.

ALTER TABLE ircc_stream_forms
  ADD COLUMN IF NOT EXISTS matter_type_id UUID REFERENCES matter_types(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_ircc_stream_forms_matter_type
  ON ircc_stream_forms(matter_type_id);

-- Add unique constraint for matter_type + form (prevents duplicate assignment)
-- Using a partial unique index since matter_type_id is nullable
CREATE UNIQUE INDEX IF NOT EXISTS idx_ircc_stream_forms_matter_type_form_unique
  ON ircc_stream_forms(matter_type_id, form_id)
  WHERE matter_type_id IS NOT NULL;

-- Make case_type_id nullable (was NOT NULL, now either case_type_id OR matter_type_id)
ALTER TABLE ircc_stream_forms
  ALTER COLUMN case_type_id DROP NOT NULL;

-- Ensure at least one foreign key is set
ALTER TABLE ircc_stream_forms
  ADD CONSTRAINT chk_stream_form_has_parent
  CHECK (case_type_id IS NOT NULL OR matter_type_id IS NOT NULL);


-- ── 3. Create matter_type_section_config ─────────────────────────────────────
-- Controls which sections appear in the unified Case Details tab per matter type.

CREATE TABLE IF NOT EXISTS matter_type_section_config (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  matter_type_id  UUID NOT NULL REFERENCES matter_types(id) ON DELETE CASCADE,
  section_key     TEXT NOT NULL,
  section_label   TEXT NOT NULL,
  is_enabled      BOOLEAN NOT NULL DEFAULT true,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (matter_type_id, section_key)
);

CREATE INDEX IF NOT EXISTS idx_matter_type_section_config_matter_type
  ON matter_type_section_config(matter_type_id);

CREATE INDEX IF NOT EXISTS idx_matter_type_section_config_tenant
  ON matter_type_section_config(tenant_id);


-- ── 4. RLS Policies for matter_type_section_config ──────────────────────────

ALTER TABLE matter_type_section_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY matter_type_section_config_select ON matter_type_section_config
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_current_tenant_id());

CREATE POLICY matter_type_section_config_insert ON matter_type_section_config
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_current_tenant_id());

CREATE POLICY matter_type_section_config_update ON matter_type_section_config
  FOR UPDATE TO authenticated
  USING (tenant_id = public.get_current_tenant_id());

CREATE POLICY matter_type_section_config_delete ON matter_type_section_config
  FOR DELETE TO authenticated
  USING (tenant_id = public.get_current_tenant_id());
