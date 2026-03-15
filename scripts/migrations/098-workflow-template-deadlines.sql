-- Migration 098: Workflow Template Deadlines (Phase 3)
-- Adds junction table linking workflow templates to deadline types,
-- adds source_template_item_id to tasks for idempotent template-based creation,
-- and adds idempotency indexes on both tasks and matter_deadlines.

-- ============================================================
-- 1. Junction table: workflow_template_deadlines
-- ============================================================
CREATE TABLE IF NOT EXISTS workflow_template_deadlines (
  id                    UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id             UUID         NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  workflow_template_id  UUID         NOT NULL REFERENCES workflow_templates(id) ON DELETE CASCADE,
  deadline_type_id      UUID         NOT NULL REFERENCES deadline_types(id) ON DELETE CASCADE,
  days_offset           INTEGER      NOT NULL DEFAULT 0,
  title_override        VARCHAR(255),
  created_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE(workflow_template_id, deadline_type_id)
);

CREATE INDEX IF NOT EXISTS idx_wtd_workflow
  ON workflow_template_deadlines(workflow_template_id);
CREATE INDEX IF NOT EXISTS idx_wtd_tenant
  ON workflow_template_deadlines(tenant_id);

ALTER TABLE workflow_template_deadlines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS workflow_template_deadlines_tenant_isolation ON workflow_template_deadlines;
CREATE POLICY workflow_template_deadlines_tenant_isolation ON workflow_template_deadlines
  FOR ALL
  USING (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()));

-- ============================================================
-- 2. Add source_template_item_id to tasks
-- ============================================================
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS source_template_item_id UUID;

COMMENT ON COLUMN tasks.source_template_item_id IS
  'FK to task_template_items.id — used for idempotent template-based task creation. '
  'If a task was auto-created from a workflow template, this links back to the source item.';

-- Idempotency index: one auto-created task per template item per matter
CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_template_idempotency
  ON tasks(matter_id, source_template_item_id)
  WHERE source_template_item_id IS NOT NULL;

-- ============================================================
-- 3. Idempotency index on matter_deadlines for auto-generated deadlines
-- ============================================================
-- One auto-generated deadline per deadline_type per matter
CREATE UNIQUE INDEX IF NOT EXISTS idx_matter_deadlines_auto_idempotency
  ON matter_deadlines(matter_id, deadline_type_id)
  WHERE auto_generated = TRUE;
