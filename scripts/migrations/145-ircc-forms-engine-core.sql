-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration 145: IRCC Forms Engine  -  Core Infrastructure
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Implements ADR-1 through ADR-7 schema requirements:
--   • Per-form-instance answer storage with source tracking (ADR-1)
--   • Canonical domain tagging on form fields (ADR-2)
--   • Propagation escape hatch for shared profile_paths (ADR condition #2)
--   • Stale dependency configuration per field (ADR-4)
--   • DB-driven validation columns on form fields (ADR-7)
--   • Composite validation rules for multi-field/multi-entity logic (ADR condition #3)
--   • Append-only answer history audit trail
--   • Reuse event log for cross-form and cross-matter tracking
-- ═══════════════════════════════════════════════════════════════════════════════


-- ── 1. ALTER matter_form_instances (migration 074) ─────────────────────────────

ALTER TABLE matter_form_instances
  ADD COLUMN IF NOT EXISTS answers JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS completion_state JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS blocker_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stale_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS missing_required_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_prefill_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS prefill_source TEXT;


-- ── 2. ALTER ircc_form_fields (migration 057) ─────────────────────────────────

ALTER TABLE ircc_form_fields
  ADD COLUMN IF NOT EXISTS on_parent_change TEXT NOT NULL DEFAULT 'mark_stale'
    CHECK (on_parent_change IN ('mark_stale', 'auto_clear')),
  ADD COLUMN IF NOT EXISTS propagation_mode TEXT NOT NULL DEFAULT 'auto'
    CHECK (propagation_mode IN ('auto', 'no_propagate')),
  ADD COLUMN IF NOT EXISTS min_length INTEGER,
  ADD COLUMN IF NOT EXISTS validation_pattern TEXT,
  ADD COLUMN IF NOT EXISTS validation_message TEXT,
  ADD COLUMN IF NOT EXISTS is_blocking BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS canonical_domain TEXT;

-- NOTE: propagation_mode is the escape hatch from ADR condition #2.
-- When set to 'no_propagate', cross-form reuse will NOT auto-propagate
-- this field even if it shares a profile_path with fields in other forms.


-- ── 3. ALTER ircc_form_sections (migration 057) ───────────────────────────────

ALTER TABLE ircc_form_sections
  ADD COLUMN IF NOT EXISTS completion_condition JSONB,
  ADD COLUMN IF NOT EXISTS is_repeatable BOOLEAN NOT NULL DEFAULT false;


-- ── 4. form_instance_answer_history (append-only audit) ───────────────────────

CREATE TABLE IF NOT EXISTS form_instance_answer_history (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  form_instance_id  UUID NOT NULL REFERENCES matter_form_instances(id) ON DELETE CASCADE,
  profile_path      TEXT NOT NULL,
  old_value         JSONB,
  new_value         JSONB,
  source            TEXT NOT NULL CHECK (source IN (
                      'client_portal', 'staff_entry', 'canonical_prefill',
                      'cross_form_reuse', 'cross_matter_import', 'extraction', 'migration'
                    )),
  source_origin     TEXT,
  changed_by        UUID REFERENCES users(id) ON DELETE SET NULL,
  changed_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  stale_triggered   BOOLEAN NOT NULL DEFAULT false
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_answer_history_instance
  ON form_instance_answer_history(form_instance_id);

CREATE INDEX IF NOT EXISTS idx_answer_history_tenant_instance
  ON form_instance_answer_history(tenant_id, form_instance_id);

CREATE INDEX IF NOT EXISTS idx_answer_history_path_changed
  ON form_instance_answer_history(profile_path, changed_at);

-- RLS: append-only (SELECT + INSERT only, no UPDATE, no DELETE)
ALTER TABLE form_instance_answer_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY answer_history_select ON form_instance_answer_history
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_current_tenant_id());

CREATE POLICY answer_history_insert ON form_instance_answer_history
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_current_tenant_id());


-- ── 5. reuse_log ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS reuse_log (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                 UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  reuse_type                TEXT NOT NULL CHECK (reuse_type IN ('cross_form', 'cross_matter', 'canonical_prefill')),
  target_instance_id        UUID NOT NULL REFERENCES matter_form_instances(id) ON DELETE CASCADE,
  target_profile_path       TEXT NOT NULL,
  source_instance_id        UUID REFERENCES matter_form_instances(id) ON DELETE SET NULL,
  source_matter_id          UUID REFERENCES matters(id) ON DELETE SET NULL,
  source_canonical_field_id UUID,
  value                     JSONB NOT NULL,
  accepted                  BOOLEAN,
  accepted_by               UUID REFERENCES users(id) ON DELETE SET NULL,
  accepted_at               TIMESTAMPTZ,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_reuse_log_target_instance
  ON reuse_log(target_instance_id);

CREATE INDEX IF NOT EXISTS idx_reuse_log_tenant
  ON reuse_log(tenant_id);

CREATE INDEX IF NOT EXISTS idx_reuse_log_source_matter
  ON reuse_log(source_matter_id)
  WHERE source_matter_id IS NOT NULL;

-- RLS: SELECT + INSERT only, no UPDATE/DELETE
ALTER TABLE reuse_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY reuse_log_select ON reuse_log
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_current_tenant_id());

CREATE POLICY reuse_log_insert ON reuse_log
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_current_tenant_id());


-- ── 6. composite_validation_rules ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS composite_validation_rules (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  form_id            UUID REFERENCES ircc_forms(id) ON DELETE CASCADE,
  rule_key           TEXT NOT NULL,
  description        TEXT NOT NULL,
  severity           TEXT NOT NULL DEFAULT 'blocking'
                       CHECK (severity IN ('blocking', 'warning')),
  scope              TEXT NOT NULL DEFAULT 'form'
                       CHECK (scope IN ('form', 'matter', 'entity')),
  condition          JSONB NOT NULL,
  field_paths        TEXT[] NOT NULL,
  error_message      TEXT NOT NULL,
  error_message_staff TEXT,
  is_active          BOOLEAN NOT NULL DEFAULT true,
  sort_order         INTEGER NOT NULL DEFAULT 0,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (tenant_id, form_id, rule_key)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_composite_rules_form
  ON composite_validation_rules(form_id)
  WHERE form_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_composite_rules_tenant_scope
  ON composite_validation_rules(tenant_id, scope);

-- RLS: full CRUD for authenticated with tenant match
ALTER TABLE composite_validation_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY composite_rules_select ON composite_validation_rules
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_current_tenant_id());

CREATE POLICY composite_rules_insert ON composite_validation_rules
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_current_tenant_id());

CREATE POLICY composite_rules_update ON composite_validation_rules
  FOR UPDATE TO authenticated
  USING (tenant_id = public.get_current_tenant_id());

CREATE POLICY composite_rules_delete ON composite_validation_rules
  FOR DELETE TO authenticated
  USING (tenant_id = public.get_current_tenant_id());


-- ── 7. updated_at trigger for composite_validation_rules ──────────────────────

CREATE OR REPLACE FUNCTION update_composite_validation_rules_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_composite_validation_rules_updated_at
  BEFORE UPDATE ON composite_validation_rules
  FOR EACH ROW EXECUTE FUNCTION update_composite_validation_rules_updated_at();
