-- ============================================================================
-- Migration 011: Performance Fixes
-- Fixes RLS policies, adds missing indexes, corrects column name mismatches
-- ============================================================================

-- ─── 1. Fix RLS Policies: Replace inline subqueries with cached function ──────
-- The inline (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid())
-- re-executes per row. get_user_tenant_id() is SECURITY DEFINER STABLE = cached.

-- matter_types
DROP POLICY IF EXISTS matter_types_tenant_isolation ON matter_types;
CREATE POLICY matter_types_tenant_isolation ON matter_types
  USING (tenant_id = public.get_user_tenant_id());

-- matter_stage_pipelines (migration 009 named it msp_tenant_isolation)
DROP POLICY IF EXISTS msp_tenant_isolation ON matter_stage_pipelines;
DROP POLICY IF EXISTS matter_stage_pipelines_tenant_isolation ON matter_stage_pipelines;
CREATE POLICY matter_stage_pipelines_tenant_isolation ON matter_stage_pipelines
  USING (tenant_id = public.get_user_tenant_id());

-- matter_stages
DROP POLICY IF EXISTS matter_stages_tenant_isolation ON matter_stages;
CREATE POLICY matter_stages_tenant_isolation ON matter_stages
  USING (tenant_id = public.get_user_tenant_id());

-- deadline_types
DROP POLICY IF EXISTS deadline_types_tenant_isolation ON deadline_types;
CREATE POLICY deadline_types_tenant_isolation ON deadline_types
  USING (tenant_id = public.get_user_tenant_id());

-- matter_type_schema
DROP POLICY IF EXISTS matter_type_schema_tenant_isolation ON matter_type_schema;
CREATE POLICY matter_type_schema_tenant_isolation ON matter_type_schema
  USING (tenant_id = public.get_user_tenant_id());

-- matter_custom_data
DROP POLICY IF EXISTS matter_custom_data_tenant_isolation ON matter_custom_data;
CREATE POLICY matter_custom_data_tenant_isolation ON matter_custom_data
  USING (tenant_id = public.get_user_tenant_id());

-- workflow_templates
DROP POLICY IF EXISTS workflow_templates_tenant_isolation ON workflow_templates;
CREATE POLICY workflow_templates_tenant_isolation ON workflow_templates
  USING (tenant_id = public.get_user_tenant_id());

-- matter_stage_state
DROP POLICY IF EXISTS matter_stage_state_tenant_isolation ON matter_stage_state;
CREATE POLICY matter_stage_state_tenant_isolation ON matter_stage_state
  USING (tenant_id = public.get_user_tenant_id());

-- automation_execution_log
DROP POLICY IF EXISTS automation_execution_log_tenant_isolation ON automation_execution_log;
CREATE POLICY automation_execution_log_tenant_isolation ON automation_execution_log
  USING (tenant_id = public.get_user_tenant_id());


-- ─── 2. Missing Composite Indexes for Hot Query Paths ────────────────────────

-- Matters: dashboard status + practice area filter
CREATE INDEX IF NOT EXISTS idx_matters_tenant_status_practice
  ON matters(tenant_id, status, practice_area_id);

-- Matters: staff workload (active matters per lawyer)
CREATE INDEX IF NOT EXISTS idx_matters_tenant_active_lawyer
  ON matters(tenant_id, responsible_lawyer_id)
  WHERE status = 'active';

-- Tasks: active tasks for a user (dashboard "My Tasks")
CREATE INDEX IF NOT EXISTS idx_tasks_user_active
  ON tasks(tenant_id, assigned_to, due_date)
  WHERE is_deleted = false AND status NOT IN ('done', 'cancelled');

-- Tasks: tenant-scoped non-deleted (used by every task list page)
CREATE INDEX IF NOT EXISTS idx_tasks_tenant_not_deleted
  ON tasks(tenant_id, created_at DESC)
  WHERE is_deleted = false;

-- Matter checklist items: tenant-scoped status queries
CREATE INDEX IF NOT EXISTS idx_checklist_items_tenant_status
  ON matter_checklist_items(tenant_id, status);

-- Matter deadlines: tenant + matter scoped
CREATE INDEX IF NOT EXISTS idx_matter_deadlines_tenant_matter
  ON matter_deadlines(tenant_id, matter_id);

-- Matter contacts: tenant index
CREATE INDEX IF NOT EXISTS idx_mc_tenant
  ON matter_contacts(tenant_id);

-- Immigration case types: tenant lookup
CREATE INDEX IF NOT EXISTS idx_immigration_case_types_tenant
  ON immigration_case_types(tenant_id)
  WHERE is_active = true;

-- Case stage definitions: case_type_id + sort_order
CREATE INDEX IF NOT EXISTS idx_case_stage_definitions_case_type
  ON case_stage_definitions(case_type_id, sort_order);

-- Checklist templates: case_type_id + sort_order
CREATE INDEX IF NOT EXISTS idx_checklist_templates_case_type
  ON checklist_templates(case_type_id, sort_order);

-- Matter immigration: tenant lookup
CREATE INDEX IF NOT EXISTS idx_matter_immigration_tenant
  ON matter_immigration(tenant_id);

-- Automation rules: case_type scoped
CREATE INDEX IF NOT EXISTS idx_automation_rules_case_type
  ON automation_rules(tenant_id, case_type_id)
  WHERE is_active = true;


-- ─── 3. Fix Column Name Mismatch ─────────────────────────────────────────────
-- Migration 009 created an index on deadline_date but the column is due_date
DROP INDEX IF EXISTS idx_matter_deadlines_tenant_date;
CREATE INDEX IF NOT EXISTS idx_matter_deadlines_tenant_date
  ON matter_deadlines(tenant_id, due_date);


-- ─── 4. Remove Redundant Single-Column Indexes ──────────────────────────────
-- These are covered by composite indexes and waste write I/O
-- NOTE: Only drop if the composites exist (they do from 001_initial_schema)
DROP INDEX IF EXISTS idx_matters_tenant;
DROP INDEX IF EXISTS idx_tasks_tenant;
