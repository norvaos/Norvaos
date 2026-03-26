-- ============================================================
-- 009-norva-os-multi-practice.sql
-- Norva OS  -  Phase 1: Multi-Practice Framework
-- ============================================================
-- Adds the generic matter type system, matter stage pipelines,
-- deadline types, practice area enablement flags, per-user
-- practice filter preference, and seeds Real Estate + Immigration
-- matter types, stages, and deadline catalogs.
--
-- Backward compatible: all existing modules unaffected.
-- Safe to run multiple times (IF NOT EXISTS / ON CONFLICT).
-- ============================================================

BEGIN;

-- ============================================================
-- 1. PRACTICE AREAS  -  add is_enabled flag
-- ============================================================
ALTER TABLE practice_areas
  ADD COLUMN IF NOT EXISTS is_enabled BOOLEAN NOT NULL DEFAULT TRUE;

-- Sync: treat any currently-active area as enabled
UPDATE practice_areas SET is_enabled = is_active WHERE is_enabled IS DISTINCT FROM is_active;

-- ============================================================
-- 2. USERS  -  add practice_filter_preference
-- ============================================================
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS practice_filter_preference VARCHAR(50) DEFAULT 'all';

-- ============================================================
-- 3. MATTER TYPES
-- Generic, tenant-scoped matter type table.
-- Supplements (does not replace) immigration_case_types.
-- New matters link via matter_type_id FK; legacy matters have it NULL.
-- ============================================================
CREATE TABLE IF NOT EXISTS matter_types (
  id               UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id        UUID         NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  practice_area_id UUID         NOT NULL REFERENCES practice_areas(id) ON DELETE CASCADE,
  name             VARCHAR(150) NOT NULL,
  description      TEXT,
  color            VARCHAR(7)   NOT NULL DEFAULT '#6366f1',
  icon             VARCHAR(50),
  is_active        BOOLEAN      NOT NULL DEFAULT TRUE,
  sort_order       INTEGER      NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, practice_area_id, name)
);

CREATE INDEX IF NOT EXISTS idx_matter_types_tenant
  ON matter_types(tenant_id);
CREATE INDEX IF NOT EXISTS idx_matter_types_tenant_practice
  ON matter_types(tenant_id, practice_area_id);
CREATE INDEX IF NOT EXISTS idx_matter_types_active
  ON matter_types(tenant_id, is_active);

ALTER TABLE matter_types ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS matter_types_tenant_isolation ON matter_types;
CREATE POLICY matter_types_tenant_isolation ON matter_types
  USING (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()));

CREATE OR REPLACE TRIGGER matter_types_updated_at
  BEFORE UPDATE ON matter_types
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- 4. MATTER STAGE PIPELINES
-- Pipeline container scoped to a matter type.
-- Separate from lead pipelines (pipelines table).
-- ============================================================
CREATE TABLE IF NOT EXISTS matter_stage_pipelines (
  id             UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id      UUID         NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  matter_type_id UUID         NOT NULL REFERENCES matter_types(id) ON DELETE CASCADE,
  name           VARCHAR(150) NOT NULL,
  description    TEXT,
  is_default     BOOLEAN      NOT NULL DEFAULT FALSE,
  is_active      BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, matter_type_id, name)
);

CREATE INDEX IF NOT EXISTS idx_msp_tenant
  ON matter_stage_pipelines(tenant_id);
CREATE INDEX IF NOT EXISTS idx_msp_tenant_type
  ON matter_stage_pipelines(tenant_id, matter_type_id);

ALTER TABLE matter_stage_pipelines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS msp_tenant_isolation ON matter_stage_pipelines;
CREATE POLICY msp_tenant_isolation ON matter_stage_pipelines
  USING (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()));

CREATE OR REPLACE TRIGGER matter_stage_pipelines_updated_at
  BEFORE UPDATE ON matter_stage_pipelines
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- 5. MATTER STAGES
-- Ordered stages within a matter stage pipeline.
-- ============================================================
CREATE TABLE IF NOT EXISTS matter_stages (
  id                UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id         UUID         NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  pipeline_id       UUID         NOT NULL REFERENCES matter_stage_pipelines(id) ON DELETE CASCADE,
  name              VARCHAR(150) NOT NULL,
  description       TEXT,
  color             VARCHAR(7)   NOT NULL DEFAULT '#6366f1',
  sort_order        INTEGER      NOT NULL DEFAULT 0,
  is_terminal       BOOLEAN      NOT NULL DEFAULT FALSE,
  auto_close_matter BOOLEAN      NOT NULL DEFAULT FALSE,
  sla_days          INTEGER,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE(pipeline_id, name)
);

CREATE INDEX IF NOT EXISTS idx_matter_stages_tenant
  ON matter_stages(tenant_id);
CREATE INDEX IF NOT EXISTS idx_matter_stages_pipeline_order
  ON matter_stages(pipeline_id, sort_order);

ALTER TABLE matter_stages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS matter_stages_tenant_isolation ON matter_stages;
CREATE POLICY matter_stages_tenant_isolation ON matter_stages
  USING (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()));

CREATE OR REPLACE TRIGGER matter_stages_updated_at
  BEFORE UPDATE ON matter_stages
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- 6. DEADLINE TYPES
-- Typed deadline catalog, scoped by tenant, practice area,
-- and optionally matter type. NULL practice_area_id = global.
-- ============================================================
CREATE TABLE IF NOT EXISTS deadline_types (
  id                   UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id            UUID         NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  practice_area_id     UUID         REFERENCES practice_areas(id) ON DELETE CASCADE,
  matter_type_id       UUID         REFERENCES matter_types(id) ON DELETE CASCADE,
  name                 VARCHAR(150) NOT NULL,
  description          TEXT,
  color                VARCHAR(7)   NOT NULL DEFAULT '#ef4444',
  default_days_offset  INTEGER,
  is_hard              BOOLEAN      NOT NULL DEFAULT FALSE,
  is_active            BOOLEAN      NOT NULL DEFAULT TRUE,
  sort_order           INTEGER      NOT NULL DEFAULT 0,
  created_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, name)
);

CREATE INDEX IF NOT EXISTS idx_deadline_types_tenant
  ON deadline_types(tenant_id);
CREATE INDEX IF NOT EXISTS idx_deadline_types_tenant_practice
  ON deadline_types(tenant_id, practice_area_id);
CREATE INDEX IF NOT EXISTS idx_deadline_types_active
  ON deadline_types(tenant_id, is_active);

ALTER TABLE deadline_types ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS deadline_types_tenant_isolation ON deadline_types;
CREATE POLICY deadline_types_tenant_isolation ON deadline_types
  USING (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()));

CREATE OR REPLACE TRIGGER deadline_types_updated_at
  BEFORE UPDATE ON deadline_types
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- 7. MATTER DEADLINES  -  add deadline_type_id FK (non-breaking)
-- Existing deadline_type VARCHAR column preserved.
-- deadline_type_id links to the new typed catalog.
-- ============================================================
ALTER TABLE matter_deadlines
  ADD COLUMN IF NOT EXISTS deadline_type_id UUID
    REFERENCES deadline_types(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_matter_deadlines_type_id
  ON matter_deadlines(deadline_type_id);
CREATE INDEX IF NOT EXISTS idx_matter_deadlines_tenant_date
  ON matter_deadlines(tenant_id, due_date);

-- ============================================================
-- 8. MATTER TYPE SCHEMA
-- JSON schema (draft-07 compatible) per matter type for
-- the custom fields panel. Versioned for forward compat.
-- ============================================================
CREATE TABLE IF NOT EXISTS matter_type_schema (
  id             UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id      UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  matter_type_id UUID        NOT NULL REFERENCES matter_types(id) ON DELETE CASCADE,
  schema_version INTEGER     NOT NULL DEFAULT 1,
  json_schema    JSONB       NOT NULL DEFAULT '{}',
  ui_schema      JSONB       NOT NULL DEFAULT '{}',
  is_active      BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(matter_type_id, schema_version)
);

CREATE INDEX IF NOT EXISTS idx_matter_type_schema_tenant
  ON matter_type_schema(tenant_id);
CREATE INDEX IF NOT EXISTS idx_matter_type_schema_active
  ON matter_type_schema(matter_type_id) WHERE is_active;

ALTER TABLE matter_type_schema ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS matter_type_schema_tenant_isolation ON matter_type_schema;
CREATE POLICY matter_type_schema_tenant_isolation ON matter_type_schema
  USING (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()));

CREATE OR REPLACE TRIGGER matter_type_schema_updated_at
  BEFORE UPDATE ON matter_type_schema
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- 9. MATTER CUSTOM DATA
-- Validated JSONB blob per matter, aligned to the matter type schema.
-- One row per matter (UNIQUE on matter_id).
-- ============================================================
CREATE TABLE IF NOT EXISTS matter_custom_data (
  id                UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id         UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  matter_id         UUID        NOT NULL REFERENCES matters(id) ON DELETE CASCADE,
  matter_type_id    UUID        NOT NULL REFERENCES matter_types(id) ON DELETE CASCADE,
  schema_version    INTEGER     NOT NULL DEFAULT 1,
  data              JSONB       NOT NULL DEFAULT '{}',
  is_valid          BOOLEAN,
  validation_errors JSONB,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(matter_id)
);

CREATE INDEX IF NOT EXISTS idx_matter_custom_data_tenant
  ON matter_custom_data(tenant_id);
CREATE INDEX IF NOT EXISTS idx_matter_custom_data_matter
  ON matter_custom_data(matter_id);
CREATE INDEX IF NOT EXISTS idx_matter_custom_data_type
  ON matter_custom_data(matter_type_id);

ALTER TABLE matter_custom_data ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS matter_custom_data_tenant_isolation ON matter_custom_data;
CREATE POLICY matter_custom_data_tenant_isolation ON matter_custom_data
  USING (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()));

CREATE OR REPLACE TRIGGER matter_custom_data_updated_at
  BEFORE UPDATE ON matter_custom_data
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- 10. WORKFLOW TEMPLATES
-- Binding object: ties a matter type to a stage pipeline,
-- checklist template, and task template. Phase 1: schema only.
-- ============================================================
CREATE TABLE IF NOT EXISTS workflow_templates (
  id                    UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id             UUID         NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  matter_type_id        UUID         NOT NULL REFERENCES matter_types(id) ON DELETE CASCADE,
  name                  VARCHAR(150) NOT NULL,
  description           TEXT,
  stage_pipeline_id     UUID         REFERENCES matter_stage_pipelines(id) ON DELETE SET NULL,
  task_template_id      UUID         REFERENCES task_templates(id) ON DELETE SET NULL,
  checklist_template_id UUID         REFERENCES checklist_templates(id) ON DELETE SET NULL,
  is_default            BOOLEAN      NOT NULL DEFAULT FALSE,
  is_active             BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, matter_type_id, name)
);

CREATE INDEX IF NOT EXISTS idx_workflow_templates_tenant
  ON workflow_templates(tenant_id);
CREATE INDEX IF NOT EXISTS idx_workflow_templates_type
  ON workflow_templates(matter_type_id);

ALTER TABLE workflow_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS workflow_templates_tenant_isolation ON workflow_templates;
CREATE POLICY workflow_templates_tenant_isolation ON workflow_templates
  USING (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()));

CREATE OR REPLACE TRIGGER workflow_templates_updated_at
  BEFORE UPDATE ON workflow_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- 11. MATTER STAGE STATE
-- Per-matter current stage tracking within a matter stage pipeline.
-- UNIQUE(matter_id, pipeline_id) = one active stage per pipeline.
-- ============================================================
CREATE TABLE IF NOT EXISTS matter_stage_state (
  id                UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id         UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  matter_id         UUID        NOT NULL REFERENCES matters(id) ON DELETE CASCADE,
  pipeline_id       UUID        NOT NULL REFERENCES matter_stage_pipelines(id) ON DELETE CASCADE,
  current_stage_id  UUID        NOT NULL REFERENCES matter_stages(id) ON DELETE RESTRICT,
  entered_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  previous_stage_id UUID        REFERENCES matter_stages(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(matter_id, pipeline_id)
);

CREATE INDEX IF NOT EXISTS idx_matter_stage_state_tenant
  ON matter_stage_state(tenant_id);
CREATE INDEX IF NOT EXISTS idx_matter_stage_state_matter
  ON matter_stage_state(matter_id);
CREATE INDEX IF NOT EXISTS idx_matter_stage_state_stage
  ON matter_stage_state(current_stage_id);
CREATE INDEX IF NOT EXISTS idx_matter_stage_state_tenant_date
  ON matter_stage_state(tenant_id, entered_at);

ALTER TABLE matter_stage_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS matter_stage_state_tenant_isolation ON matter_stage_state;
CREATE POLICY matter_stage_state_tenant_isolation ON matter_stage_state
  USING (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()));

CREATE OR REPLACE TRIGGER matter_stage_state_updated_at
  BEFORE UPDATE ON matter_stage_state
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- 12. MATTERS  -  add matter_type_id FK (nullable, backward-compat)
-- ============================================================
ALTER TABLE matters
  ADD COLUMN IF NOT EXISTS matter_type_id UUID
    REFERENCES matter_types(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_matters_matter_type
  ON matters(matter_type_id);
CREATE INDEX IF NOT EXISTS idx_matters_tenant_type
  ON matters(tenant_id, matter_type_id);
CREATE INDEX IF NOT EXISTS idx_matters_tenant_practice_type
  ON matters(tenant_id, practice_area_id, matter_type_id);

-- ============================================================
-- 13. SEED DATA
-- Seeds Real Estate + Immigration practice areas, matter types,
-- stage pipelines, stages, and deadline type catalogs.
-- All inserts are ON CONFLICT DO NOTHING  -  safe to re-run.
-- ============================================================
DO $$
DECLARE
  v_tenant_id      UUID;
  v_re_pa_id       UUID;
  v_imm_pa_id      UUID;
  v_purchase_id    UUID;
  v_sale_id        UUID;
  v_refinance_id   UUID;
  v_lease_id       UUID;
  v_pip_id         UUID;
BEGIN
  -- Resolve the first (and only) tenant
  SELECT id INTO v_tenant_id FROM tenants ORDER BY created_at LIMIT 1;
  IF v_tenant_id IS NULL THEN
    RAISE NOTICE '[009] No tenant found  -  skipping seed data.';
    RETURN;
  END IF;

  RAISE NOTICE '[009] Seeding for tenant %', v_tenant_id;

  -- ── Immigration practice area ──────────────────────────────
  INSERT INTO practice_areas (tenant_id, name, color, is_active, is_enabled)
  VALUES (v_tenant_id, 'Immigration', '#6366f1', TRUE, TRUE)
  ON CONFLICT (tenant_id, name)
    DO UPDATE SET is_enabled = TRUE
  RETURNING id INTO v_imm_pa_id;

  IF v_imm_pa_id IS NULL THEN
    SELECT id INTO v_imm_pa_id FROM practice_areas
     WHERE tenant_id = v_tenant_id AND name = 'Immigration';
  END IF;

  -- ── Real Estate practice area ──────────────────────────────
  INSERT INTO practice_areas (tenant_id, name, color, is_active, is_enabled)
  VALUES (v_tenant_id, 'Real Estate', '#10b981', TRUE, TRUE)
  ON CONFLICT (tenant_id, name)
    DO UPDATE SET is_active = TRUE, is_enabled = TRUE, color = '#10b981'
  RETURNING id INTO v_re_pa_id;

  IF v_re_pa_id IS NULL THEN
    SELECT id INTO v_re_pa_id FROM practice_areas
     WHERE tenant_id = v_tenant_id AND name = 'Real Estate';
  END IF;

  -- ── Real Estate matter types ───────────────────────────────
  INSERT INTO matter_types
    (tenant_id, practice_area_id, name, description, color, sort_order)
  VALUES
    (v_tenant_id, v_re_pa_id, 'Purchase',
     'Residential or commercial property purchase transaction', '#10b981', 1),
    (v_tenant_id, v_re_pa_id, 'Sale',
     'Residential or commercial property sale transaction',     '#f59e0b', 2),
    (v_tenant_id, v_re_pa_id, 'Refinance',
     'Mortgage refinancing transaction',                        '#3b82f6', 3),
    (v_tenant_id, v_re_pa_id, 'Lease Review',
     'Lease agreement review and negotiation',                  '#8b5cf6', 4)
  ON CONFLICT (tenant_id, practice_area_id, name) DO NOTHING;

  SELECT id INTO v_purchase_id  FROM matter_types WHERE tenant_id = v_tenant_id AND practice_area_id = v_re_pa_id AND name = 'Purchase';
  SELECT id INTO v_sale_id      FROM matter_types WHERE tenant_id = v_tenant_id AND practice_area_id = v_re_pa_id AND name = 'Sale';
  SELECT id INTO v_refinance_id FROM matter_types WHERE tenant_id = v_tenant_id AND practice_area_id = v_re_pa_id AND name = 'Refinance';
  SELECT id INTO v_lease_id     FROM matter_types WHERE tenant_id = v_tenant_id AND practice_area_id = v_re_pa_id AND name = 'Lease Review';

  -- ── Purchase pipeline + stages ────────────────────────────
  INSERT INTO matter_stage_pipelines (tenant_id, matter_type_id, name, is_default, is_active)
  VALUES (v_tenant_id, v_purchase_id, 'Purchase Standard', TRUE, TRUE)
  ON CONFLICT (tenant_id, matter_type_id, name) DO NOTHING;

  SELECT id INTO v_pip_id FROM matter_stage_pipelines
   WHERE tenant_id = v_tenant_id AND matter_type_id = v_purchase_id AND name = 'Purchase Standard';

  INSERT INTO matter_stages (tenant_id, pipeline_id, name, color, sort_order, sla_days)
  VALUES
    (v_tenant_id, v_pip_id, 'Intake',              '#6366f1', 1,  2),
    (v_tenant_id, v_pip_id, 'Title Search',         '#f59e0b', 2,  7),
    (v_tenant_id, v_pip_id, 'Mortgage Instructions','#3b82f6', 3,  5),
    (v_tenant_id, v_pip_id, 'Pre-Closing Review',   '#8b5cf6', 4,  3),
    (v_tenant_id, v_pip_id, 'Closing',              '#10b981', 5,  1),
    (v_tenant_id, v_pip_id, 'Post-Closing / Reg',   '#14b8a6', 6, 10),
    (v_tenant_id, v_pip_id, 'Completed',            '#22c55e', 7,  NULL)
  ON CONFLICT (pipeline_id, name) DO NOTHING;

  -- ── Sale pipeline + stages ────────────────────────────────
  INSERT INTO matter_stage_pipelines (tenant_id, matter_type_id, name, is_default, is_active)
  VALUES (v_tenant_id, v_sale_id, 'Sale Standard', TRUE, TRUE)
  ON CONFLICT (tenant_id, matter_type_id, name) DO NOTHING;

  SELECT id INTO v_pip_id FROM matter_stage_pipelines
   WHERE tenant_id = v_tenant_id AND matter_type_id = v_sale_id AND name = 'Sale Standard';

  INSERT INTO matter_stages (tenant_id, pipeline_id, name, color, sort_order, sla_days)
  VALUES
    (v_tenant_id, v_pip_id, 'Intake',             '#6366f1', 1,  2),
    (v_tenant_id, v_pip_id, 'Title Search',        '#f59e0b', 2,  7),
    (v_tenant_id, v_pip_id, 'Requisitions',        '#3b82f6', 3,  5),
    (v_tenant_id, v_pip_id, 'Pre-Closing Review',  '#8b5cf6', 4,  3),
    (v_tenant_id, v_pip_id, 'Closing',             '#10b981', 5,  1),
    (v_tenant_id, v_pip_id, 'Completed',           '#22c55e', 6,  NULL)
  ON CONFLICT (pipeline_id, name) DO NOTHING;

  -- ── Refinance pipeline + stages ───────────────────────────
  INSERT INTO matter_stage_pipelines (tenant_id, matter_type_id, name, is_default, is_active)
  VALUES (v_tenant_id, v_refinance_id, 'Refinance Standard', TRUE, TRUE)
  ON CONFLICT (tenant_id, matter_type_id, name) DO NOTHING;

  SELECT id INTO v_pip_id FROM matter_stage_pipelines
   WHERE tenant_id = v_tenant_id AND matter_type_id = v_refinance_id AND name = 'Refinance Standard';

  INSERT INTO matter_stages (tenant_id, pipeline_id, name, color, sort_order, sla_days)
  VALUES
    (v_tenant_id, v_pip_id, 'Intake',              '#6366f1', 1,  2),
    (v_tenant_id, v_pip_id, 'Mortgage Instructions','#f59e0b', 2,  5),
    (v_tenant_id, v_pip_id, 'Title Search',         '#3b82f6', 3,  7),
    (v_tenant_id, v_pip_id, 'Pre-Closing Review',   '#8b5cf6', 4,  3),
    (v_tenant_id, v_pip_id, 'Closing',              '#10b981', 5,  1),
    (v_tenant_id, v_pip_id, 'Post-Closing / Reg',   '#14b8a6', 6, 10),
    (v_tenant_id, v_pip_id, 'Completed',            '#22c55e', 7,  NULL)
  ON CONFLICT (pipeline_id, name) DO NOTHING;

  -- ── Lease Review pipeline + stages ───────────────────────
  INSERT INTO matter_stage_pipelines (tenant_id, matter_type_id, name, is_default, is_active)
  VALUES (v_tenant_id, v_lease_id, 'Lease Review Standard', TRUE, TRUE)
  ON CONFLICT (tenant_id, matter_type_id, name) DO NOTHING;

  SELECT id INTO v_pip_id FROM matter_stage_pipelines
   WHERE tenant_id = v_tenant_id AND matter_type_id = v_lease_id AND name = 'Lease Review Standard';

  INSERT INTO matter_stages (tenant_id, pipeline_id, name, color, sort_order, sla_days)
  VALUES
    (v_tenant_id, v_pip_id, 'Intake',       '#6366f1', 1,  2),
    (v_tenant_id, v_pip_id, 'Review',        '#f59e0b', 2,  7),
    (v_tenant_id, v_pip_id, 'Negotiation',   '#3b82f6', 3, 14),
    (v_tenant_id, v_pip_id, 'Final Review',  '#8b5cf6', 4,  3),
    (v_tenant_id, v_pip_id, 'Execution',     '#10b981', 5,  1),
    (v_tenant_id, v_pip_id, 'Completed',     '#22c55e', 6,  NULL)
  ON CONFLICT (pipeline_id, name) DO NOTHING;

  -- ── Real Estate deadline types ────────────────────────────
  INSERT INTO deadline_types
    (tenant_id, practice_area_id, name, description, color, is_hard, sort_order)
  VALUES
    (v_tenant_id, v_re_pa_id, 'Closing Date',
     'Scheduled date for transaction closing', '#ef4444', TRUE, 1),
    (v_tenant_id, v_re_pa_id, 'Requisition Date',
     'Date by which requisitions must be submitted to vendor''s counsel', '#ef4444', TRUE, 2),
    (v_tenant_id, v_re_pa_id, 'Mortgage Condition Date',
     'Date by which financing condition must be satisfied or waived', '#f59e0b', TRUE, 3),
    (v_tenant_id, v_re_pa_id, 'Home Inspection Date',
     'Scheduled date for property inspection', '#3b82f6', FALSE, 4),
    (v_tenant_id, v_re_pa_id, 'Title Search Deadline',
     'Deadline for completing title search and reporting', '#8b5cf6', FALSE, 5),
    (v_tenant_id, v_re_pa_id, 'Document Collection Deadline',
     'Deadline for receiving all required client documents', '#6366f1', FALSE, 6),
    (v_tenant_id, v_re_pa_id, 'Registration Date',
     'Date for registering transfer/charge at Land Registry', '#10b981', FALSE, 7)
  ON CONFLICT (tenant_id, name) DO NOTHING;

  -- ── Immigration matter types ──────────────────────────────
  IF v_imm_pa_id IS NOT NULL THEN
    INSERT INTO matter_types
      (tenant_id, practice_area_id, name, description, color, sort_order)
    VALUES
      (v_tenant_id, v_imm_pa_id, 'Spousal Sponsorship',
       'Sponsoring a spouse or partner for permanent residence', '#6366f1', 1),
      (v_tenant_id, v_imm_pa_id, 'Work Permit',
       'Temporary work permit application', '#3b82f6', 2),
      (v_tenant_id, v_imm_pa_id, 'Study Permit',
       'Study permit application', '#8b5cf6', 3),
      (v_tenant_id, v_imm_pa_id, 'Permanent Residence',
       'Express Entry or Provincial Nominee permanent residence', '#10b981', 4),
      (v_tenant_id, v_imm_pa_id, 'Refugee Claim',
       'Refugee protection claim', '#f59e0b', 5),
      (v_tenant_id, v_imm_pa_id, 'Visitor Visa',
       'Temporary resident visa for visitors', '#06b6d4', 6),
      (v_tenant_id, v_imm_pa_id, 'Citizenship',
       'Canadian citizenship application', '#ec4899', 7),
      (v_tenant_id, v_imm_pa_id, 'LMIA',
       'Labour Market Impact Assessment', '#84cc16', 8)
    ON CONFLICT (tenant_id, practice_area_id, name) DO NOTHING;

    -- Immigration deadline types
    INSERT INTO deadline_types
      (tenant_id, practice_area_id, name, description, color, is_hard, sort_order)
    VALUES
      (v_tenant_id, v_imm_pa_id, 'IRCC Submission Deadline',
       'Deadline for submitting application to IRCC', '#ef4444', TRUE, 1),
      (v_tenant_id, v_imm_pa_id, 'Biometrics Deadline',
       'Deadline for biometrics collection appointment', '#f59e0b', TRUE, 2),
      (v_tenant_id, v_imm_pa_id, 'Medical Exam Expiry',
       'Date when immigration medical examination expires', '#f59e0b', TRUE, 3),
      (v_tenant_id, v_imm_pa_id, 'Police Certificate Expiry',
       'Date when police certificate expires', '#f59e0b', FALSE, 4),
      (v_tenant_id, v_imm_pa_id, 'Status Expiry',
       'Date when current immigration status expires', '#ef4444', TRUE, 5),
      (v_tenant_id, v_imm_pa_id, 'IAD Appeal Deadline',
       'Immigration Appeal Division appeal filing deadline', '#ef4444', TRUE, 6),
      (v_tenant_id, v_imm_pa_id, 'Document Collection Deadline (Immigration)',
       'Deadline for receiving all required client documents', '#6366f1', FALSE, 7)
    ON CONFLICT (tenant_id, name) DO NOTHING;
  END IF;

  RAISE NOTICE '[009] Seed data complete.';
END $$;

COMMIT;
