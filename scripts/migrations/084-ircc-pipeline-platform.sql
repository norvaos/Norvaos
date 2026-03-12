-- ═══════════════════════════════════════════════════════════════════════════════
-- 084 — IRCC Pipeline Platform Extensions
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Extends the IRCC form management platform (mig 057) with:
--   1. page_number on ircc_form_fields (for page-grouped admin UI)
--   2. generation_source + form_id on form_pack_versions (DB vs legacy tracking)
--   3. field_verifications table (per-matter lawyer sign-off on field values)
--   4. profile_field_history table (audit trail for immigration_data changes)
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── 1. Add page_number to ircc_form_fields ────────────────────────────────────

ALTER TABLE ircc_form_fields
  ADD COLUMN IF NOT EXISTS page_number INTEGER;

-- ── 2. Extend form_pack_versions for DB-driven generation ─────────────────────

ALTER TABLE form_pack_versions
  ADD COLUMN IF NOT EXISTS generation_source TEXT DEFAULT 'legacy'
    CHECK (generation_source IN ('legacy', 'db'));

ALTER TABLE form_pack_versions
  ADD COLUMN IF NOT EXISTS form_id UUID REFERENCES ircc_forms(id);

-- ── 3. field_verifications — Lawyer field-level sign-off ──────────────────────

CREATE TABLE IF NOT EXISTS field_verifications (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  matter_id       UUID NOT NULL REFERENCES matters(id) ON DELETE CASCADE,
  profile_path    TEXT NOT NULL,
  verified_value  JSONB,
  verified_by     UUID NOT NULL REFERENCES users(id),
  verified_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes           TEXT,

  UNIQUE (tenant_id, matter_id, profile_path)
);

CREATE INDEX IF NOT EXISTS idx_field_verifications_matter
  ON field_verifications(matter_id);

ALTER TABLE field_verifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY field_verifications_select ON field_verifications
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_current_tenant_id());

CREATE POLICY field_verifications_insert ON field_verifications
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_current_tenant_id());

CREATE POLICY field_verifications_update ON field_verifications
  FOR UPDATE TO authenticated
  USING (tenant_id = public.get_current_tenant_id());

CREATE POLICY field_verifications_delete ON field_verifications
  FOR DELETE TO authenticated
  USING (tenant_id = public.get_current_tenant_id());

-- ── 4. profile_field_history — Immigration data audit trail ───────────────────

CREATE TABLE IF NOT EXISTS profile_field_history (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  contact_id      UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  profile_path    TEXT NOT NULL,
  old_value       JSONB,
  new_value       JSONB,
  changed_by      TEXT NOT NULL,  -- 'portal' or user UUID
  changed_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_profile_field_history_contact_path
  ON profile_field_history(contact_id, profile_path, changed_at DESC);

CREATE INDEX IF NOT EXISTS idx_profile_field_history_tenant
  ON profile_field_history(tenant_id, changed_at DESC);

ALTER TABLE profile_field_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY profile_field_history_select ON profile_field_history
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_current_tenant_id());

CREATE POLICY profile_field_history_insert ON profile_field_history
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_current_tenant_id());

-- History is append-only — no update or delete policies
