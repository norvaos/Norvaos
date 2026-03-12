-- ═══════════════════════════════════════════════════════════════════════════════
--- Migration 074: Form Assignment Engine
--- ═══════════════════════════════════════════════════════════════════════════════
---
--- Creates the template → instance pattern for IRCC forms, mirroring the
--- document-slot-engine (document_slot_templates → document_slots).
---
--- Three new tables:
---   1. ircc_form_assignment_templates  — reusable per-matter-type form config
---   2. matter_form_instances           — per-matter snapshot instances
---   3. form_assignment_template_history — append-only audit changelog
---
--- Data migration: existing ircc_stream_forms rows → assignment templates
--- ═══════════════════════════════════════════════════════════════════════════════


-- ── 1. ircc_form_assignment_templates ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ircc_form_assignment_templates (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  matter_type_id    UUID REFERENCES matter_types(id) ON DELETE CASCADE,
  case_type_id      UUID REFERENCES immigration_case_types(id) ON DELETE CASCADE,
  form_id           UUID NOT NULL REFERENCES ircc_forms(id) ON DELETE CASCADE,
  sort_order        INTEGER NOT NULL DEFAULT 0,
  is_required       BOOLEAN NOT NULL DEFAULT true,
  person_role_scope TEXT DEFAULT NULL,
  conditions        JSONB DEFAULT NULL,
  version           INTEGER NOT NULL DEFAULT 1,
  status            TEXT NOT NULL DEFAULT 'published'
                      CHECK (status IN ('draft', 'published', 'archived')),
  effective_date    DATE DEFAULT NULL,
  published_at      TIMESTAMPTZ DEFAULT NULL,
  published_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  archived_at       TIMESTAMPTZ DEFAULT NULL,
  archived_by       UUID REFERENCES users(id) ON DELETE SET NULL,
  is_active         BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Exactly one of matter_type_id / case_type_id must be set
  CONSTRAINT chk_assignment_template_scope CHECK (
    (matter_type_id IS NOT NULL AND case_type_id IS NULL)
    OR (matter_type_id IS NULL AND case_type_id IS NOT NULL)
  ),

  -- One published version per (form, scope, person_role_scope) combo
  CONSTRAINT uq_form_assignment_template UNIQUE (
    tenant_id, matter_type_id, case_type_id, form_id, person_role_scope, version
  )
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_form_assign_tpl_matter_type
  ON ircc_form_assignment_templates(tenant_id, matter_type_id)
  WHERE matter_type_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_form_assign_tpl_case_type
  ON ircc_form_assignment_templates(tenant_id, case_type_id)
  WHERE case_type_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_form_assign_tpl_form
  ON ircc_form_assignment_templates(form_id);

CREATE INDEX IF NOT EXISTS idx_form_assign_tpl_published
  ON ircc_form_assignment_templates(tenant_id, status)
  WHERE status = 'published';

-- RLS
ALTER TABLE ircc_form_assignment_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY ircc_form_assign_tpl_select ON ircc_form_assignment_templates
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_current_tenant_id());

CREATE POLICY ircc_form_assign_tpl_insert ON ircc_form_assignment_templates
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_current_tenant_id());

CREATE POLICY ircc_form_assign_tpl_update ON ircc_form_assignment_templates
  FOR UPDATE TO authenticated
  USING (tenant_id = public.get_current_tenant_id());

CREATE POLICY ircc_form_assign_tpl_delete ON ircc_form_assignment_templates
  FOR DELETE TO authenticated
  USING (tenant_id = public.get_current_tenant_id());

-- Updated-at trigger
CREATE TRIGGER set_ircc_form_assign_tpl_updated_at
  BEFORE UPDATE ON ircc_form_assignment_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ── 2. matter_form_instances ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS matter_form_instances (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  matter_id                   UUID NOT NULL REFERENCES matters(id) ON DELETE CASCADE,
  person_id                   UUID REFERENCES matter_people(id) ON DELETE SET NULL,
  assignment_template_id      UUID REFERENCES ircc_form_assignment_templates(id) ON DELETE SET NULL,
  form_id                     UUID NOT NULL REFERENCES ircc_forms(id) ON DELETE CASCADE,
  -- Snapshot fields (denormalized at creation time)
  form_code                   TEXT NOT NULL,
  form_name                   TEXT NOT NULL,
  form_version_at_creation    INTEGER NOT NULL DEFAULT 1,
  form_checksum_at_creation   TEXT,
  person_role                 TEXT DEFAULT NULL,
  sort_order                  INTEGER NOT NULL DEFAULT 0,
  is_required                 BOOLEAN NOT NULL DEFAULT true,
  status                      TEXT NOT NULL DEFAULT 'pending'
                                CHECK (status IN (
                                  'pending', 'in_progress', 'ready_for_review',
                                  'approved', 'rejected', 'generated', 'submitted'
                                )),
  is_active                   BOOLEAN NOT NULL DEFAULT true,
  deactivated_at              TIMESTAMPTZ DEFAULT NULL,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Idempotent: prevent duplicate instances for same template + person
  CONSTRAINT uq_matter_form_instance UNIQUE (matter_id, assignment_template_id, person_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_form_instances_matter
  ON matter_form_instances(matter_id);

CREATE INDEX IF NOT EXISTS idx_form_instances_matter_active
  ON matter_form_instances(matter_id, is_active);

CREATE INDEX IF NOT EXISTS idx_form_instances_matter_status
  ON matter_form_instances(matter_id, status);

CREATE INDEX IF NOT EXISTS idx_form_instances_form
  ON matter_form_instances(form_id);

-- RLS
ALTER TABLE matter_form_instances ENABLE ROW LEVEL SECURITY;

CREATE POLICY matter_form_instances_select ON matter_form_instances
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_current_tenant_id());

CREATE POLICY matter_form_instances_insert ON matter_form_instances
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_current_tenant_id());

CREATE POLICY matter_form_instances_update ON matter_form_instances
  FOR UPDATE TO authenticated
  USING (tenant_id = public.get_current_tenant_id());

CREATE POLICY matter_form_instances_delete ON matter_form_instances
  FOR DELETE TO authenticated
  USING (tenant_id = public.get_current_tenant_id());

-- Updated-at trigger
CREATE TRIGGER set_matter_form_instances_updated_at
  BEFORE UPDATE ON matter_form_instances
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ── 3. form_assignment_template_history ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS form_assignment_template_history (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  template_id       UUID NOT NULL REFERENCES ircc_form_assignment_templates(id) ON DELETE CASCADE,
  version           INTEGER NOT NULL,
  action            TEXT NOT NULL
                      CHECK (action IN ('created', 'published', 'archived', 'conditions_updated', 'moved')),
  previous_state    JSONB,
  new_state         JSONB,
  changed_by        UUID REFERENCES users(id) ON DELETE SET NULL,
  change_reason     TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index
CREATE INDEX IF NOT EXISTS idx_form_assign_history_template
  ON form_assignment_template_history(template_id);

-- RLS
ALTER TABLE form_assignment_template_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY form_assign_history_select ON form_assignment_template_history
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_current_tenant_id());

CREATE POLICY form_assign_history_insert ON form_assignment_template_history
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_current_tenant_id());

-- Append-only: prevent UPDATE and DELETE via restrictive policies
CREATE POLICY form_assign_history_no_update ON form_assignment_template_history
  FOR UPDATE TO authenticated
  USING (false);

CREATE POLICY form_assign_history_no_delete ON form_assignment_template_history
  FOR DELETE TO authenticated
  USING (false);


-- ── 4. RPCs ─────────────────────────────────────────────────────────────────

-- publish_form_assignment_template: Locks row, archives previous published,
-- sets status to published, inserts history entry.
CREATE OR REPLACE FUNCTION public.publish_form_assignment_template(
  p_template_id UUID,
  p_user_id UUID
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_template RECORD;
  v_prev_id UUID;
BEGIN
  -- Lock and fetch the template
  SELECT * INTO v_template
  FROM ircc_form_assignment_templates
  WHERE id = p_template_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Template not found');
  END IF;

  IF v_template.status = 'published' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Template is already published');
  END IF;

  IF v_template.status = 'archived' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot publish an archived template');
  END IF;

  -- Archive any existing published version of same tuple
  UPDATE ircc_form_assignment_templates
  SET status = 'archived',
      archived_at = now(),
      archived_by = p_user_id,
      updated_at = now()
  WHERE tenant_id = v_template.tenant_id
    AND form_id = v_template.form_id
    AND COALESCE(matter_type_id::text, '') = COALESCE(v_template.matter_type_id::text, '')
    AND COALESCE(case_type_id::text, '') = COALESCE(v_template.case_type_id::text, '')
    AND COALESCE(person_role_scope, '') = COALESCE(v_template.person_role_scope, '')
    AND status = 'published'
    AND id != p_template_id
  RETURNING id INTO v_prev_id;

  -- If we archived a previous version, insert history for it
  IF v_prev_id IS NOT NULL THEN
    INSERT INTO form_assignment_template_history (
      tenant_id, template_id, version, action, previous_state, new_state, changed_by
    ) VALUES (
      v_template.tenant_id,
      v_prev_id,
      (SELECT version FROM ircc_form_assignment_templates WHERE id = v_prev_id),
      'archived',
      jsonb_build_object('status', 'published'),
      jsonb_build_object('status', 'archived', 'reason', 'superseded_by_version_' || v_template.version),
      p_user_id
    );
  END IF;

  -- Publish the template
  UPDATE ircc_form_assignment_templates
  SET status = 'published',
      published_at = now(),
      published_by = p_user_id,
      updated_at = now()
  WHERE id = p_template_id;

  -- Insert history entry
  INSERT INTO form_assignment_template_history (
    tenant_id, template_id, version, action, previous_state, new_state, changed_by
  ) VALUES (
    v_template.tenant_id,
    p_template_id,
    v_template.version,
    'published',
    jsonb_build_object('status', v_template.status),
    jsonb_build_object('status', 'published'),
    p_user_id
  );

  RETURN jsonb_build_object(
    'success', true,
    'template_id', p_template_id,
    'version', v_template.version,
    'archived_previous_id', v_prev_id
  );
END;
$$;

-- archive_form_assignment_template: Archives a published template
CREATE OR REPLACE FUNCTION public.archive_form_assignment_template(
  p_template_id UUID,
  p_user_id UUID,
  p_reason TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_template RECORD;
BEGIN
  -- Lock and fetch
  SELECT * INTO v_template
  FROM ircc_form_assignment_templates
  WHERE id = p_template_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Template not found');
  END IF;

  IF v_template.status != 'published' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only published templates can be archived');
  END IF;

  -- Archive
  UPDATE ircc_form_assignment_templates
  SET status = 'archived',
      archived_at = now(),
      archived_by = p_user_id,
      updated_at = now()
  WHERE id = p_template_id;

  -- Insert history
  INSERT INTO form_assignment_template_history (
    tenant_id, template_id, version, action, previous_state, new_state, changed_by, change_reason
  ) VALUES (
    v_template.tenant_id,
    p_template_id,
    v_template.version,
    'archived',
    jsonb_build_object('status', 'published'),
    jsonb_build_object('status', 'archived'),
    p_user_id,
    p_reason
  );

  RETURN jsonb_build_object(
    'success', true,
    'template_id', p_template_id,
    'version', v_template.version
  );
END;
$$;


-- ── 5. Data Migration ──────────────────────────────────────────────────────
--- Migrate existing ircc_stream_forms rows into ircc_form_assignment_templates
--- as published, version 1 templates.

INSERT INTO ircc_form_assignment_templates (
  tenant_id,
  matter_type_id,
  case_type_id,
  form_id,
  sort_order,
  is_required,
  version,
  status,
  published_at,
  created_at
)
SELECT
  sf.tenant_id,
  sf.matter_type_id,
  sf.case_type_id,
  sf.form_id,
  sf.sort_order,
  sf.is_required,
  1,             -- version
  'published',   -- status
  sf.created_at, -- published_at = original creation time
  sf.created_at
FROM ircc_stream_forms sf
ON CONFLICT DO NOTHING;


-- ── Done ────────────────────────────────────────────────────────────────────
