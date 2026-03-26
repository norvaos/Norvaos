-- ============================================================
-- Migration 010: Phase 2  -  Enforcement Engine & Automation Core
-- ============================================================
-- Adds gating rules, stage history for generic system,
-- automation execution logging, and seeds gating config.
-- Safe to re-run (all IF NOT EXISTS / ON CONFLICT).
-- ============================================================

BEGIN;

-- ============================================================
-- 1. GATING RULES on matter_stages (generic pipeline system)
-- Format: [{"type":"require_checklist_complete"},
--          {"type":"require_deadlines","deadline_type_names":["Closing Date"]}]
-- ============================================================
ALTER TABLE matter_stages
  ADD COLUMN IF NOT EXISTS gating_rules JSONB NOT NULL DEFAULT '[]';

COMMENT ON COLUMN matter_stages.gating_rules IS
  'JSON array of gating rules evaluated before allowing transition to this stage. Types: require_checklist_complete, require_deadlines, require_previous_stage.';

-- ============================================================
-- 2. STAGE HISTORY on matter_stage_state
-- Mirrors immigration system's stage_history JSONB audit trail.
-- Format: [{"stage_id":"...","stage_name":"...","entered_at":"...","exited_at":"...","user_id":"..."}]
-- ============================================================
ALTER TABLE matter_stage_state
  ADD COLUMN IF NOT EXISTS stage_history JSONB NOT NULL DEFAULT '[]';

-- ============================================================
-- 3. EXTEND automation_rules for generic matter types
-- Currently only has case_type_id (immigration). Add matter_type_id.
-- ============================================================
ALTER TABLE automation_rules
  ADD COLUMN IF NOT EXISTS matter_type_id UUID REFERENCES matter_types(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_automation_rules_matter_type
  ON automation_rules(matter_type_id);

CREATE INDEX IF NOT EXISTS idx_automation_rules_trigger
  ON automation_rules(tenant_id, trigger_type, is_active);

-- ============================================================
-- 4. AUTOMATION EXECUTION LOG
-- Audit trail + idempotency reference for automation runs.
-- ============================================================
CREATE TABLE IF NOT EXISTS automation_execution_log (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  automation_rule_id  UUID        NOT NULL REFERENCES automation_rules(id) ON DELETE CASCADE,
  matter_id           UUID        NOT NULL REFERENCES matters(id) ON DELETE CASCADE,
  trigger_event       TEXT        NOT NULL,
  trigger_context     JSONB       NOT NULL DEFAULT '{}',
  actions_executed    JSONB       NOT NULL DEFAULT '[]',
  executed_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  executed_by         UUID        REFERENCES users(id) ON DELETE SET NULL
);

ALTER TABLE automation_execution_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS automation_execution_log_tenant_isolation ON automation_execution_log;
CREATE POLICY automation_execution_log_tenant_isolation ON automation_execution_log
  USING (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()));

CREATE INDEX IF NOT EXISTS idx_auto_exec_tenant
  ON automation_execution_log(tenant_id, executed_at);
CREATE INDEX IF NOT EXISTS idx_auto_exec_matter
  ON automation_execution_log(matter_id);
CREATE INDEX IF NOT EXISTS idx_auto_exec_rule
  ON automation_execution_log(automation_rule_id);

-- ============================================================
-- 5. PERFORMANCE INDEXES for enforcement queries
-- ============================================================
-- Deadline queries by tenant + status + date (for cron worker)
CREATE INDEX IF NOT EXISTS idx_matter_deadlines_tenant_status_date
  ON matter_deadlines(tenant_id, status, due_date);

-- Checklist items by matter + required (for gating checks)
CREATE INDEX IF NOT EXISTS idx_checklist_items_matter_required
  ON matter_checklist_items(matter_id, is_required);

-- Tasks by matter + automation_id (for idempotency check)
CREATE INDEX IF NOT EXISTS idx_tasks_matter_automation
  ON tasks(matter_id, automation_id) WHERE automation_id IS NOT NULL;

-- ============================================================
-- 6. SEED GATING RULES for existing Real Estate stages
-- ============================================================
DO $$
DECLARE
  v_tenant_id   UUID;
  v_pip_id      UUID;
  v_closing_id  UUID;
  v_postclosing_id UUID;
BEGIN
  -- Process all tenants
  FOR v_tenant_id IN SELECT id FROM tenants LOOP

    -- Purchase pipeline: "Closing" requires Closing Date + Requisition Date deadlines
    SELECT p.id INTO v_pip_id
    FROM matter_stage_pipelines p
    JOIN matter_types mt ON mt.id = p.matter_type_id
    WHERE p.tenant_id = v_tenant_id
      AND mt.name = 'Purchase'
      AND p.name = 'Purchase Standard';

    IF v_pip_id IS NOT NULL THEN
      UPDATE matter_stages
      SET gating_rules = '[{"type":"require_deadlines","deadline_type_names":["Closing Date","Requisition Date"]}]'::jsonb
      WHERE pipeline_id = v_pip_id
        AND name = 'Closing'
        AND tenant_id = v_tenant_id;

      -- Post-Closing requires that Closing was previously reached
      UPDATE matter_stages
      SET gating_rules = '[{"type":"require_previous_stage","stage_name":"Closing"}]'::jsonb
      WHERE pipeline_id = v_pip_id
        AND name = 'Post-Closing / Reg'
        AND tenant_id = v_tenant_id;
    END IF;

    -- Sale pipeline: "Closing" requires Closing Date
    SELECT p.id INTO v_pip_id
    FROM matter_stage_pipelines p
    JOIN matter_types mt ON mt.id = p.matter_type_id
    WHERE p.tenant_id = v_tenant_id
      AND mt.name = 'Sale'
      AND p.name = 'Sale Standard';

    IF v_pip_id IS NOT NULL THEN
      UPDATE matter_stages
      SET gating_rules = '[{"type":"require_deadlines","deadline_type_names":["Closing Date"]}]'::jsonb
      WHERE pipeline_id = v_pip_id
        AND name = 'Closing'
        AND tenant_id = v_tenant_id;
    END IF;

    -- Refinance pipeline: "Closing" requires Closing Date
    SELECT p.id INTO v_pip_id
    FROM matter_stage_pipelines p
    JOIN matter_types mt ON mt.id = p.matter_type_id
    WHERE p.tenant_id = v_tenant_id
      AND mt.name = 'Refinance'
      AND p.name = 'Refinance Standard';

    IF v_pip_id IS NOT NULL THEN
      UPDATE matter_stages
      SET gating_rules = '[{"type":"require_deadlines","deadline_type_names":["Closing Date"]}]'::jsonb
      WHERE pipeline_id = v_pip_id
        AND name = 'Closing'
        AND tenant_id = v_tenant_id;
    END IF;

  END LOOP;

  RAISE NOTICE '[010] Gating rules seeded for all tenants.';
END $$;

COMMIT;
