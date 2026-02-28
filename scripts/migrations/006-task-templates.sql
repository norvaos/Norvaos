-- Migration: 006-task-templates
-- Description: Add task template system linked to practice areas

-- Task templates (linked to practice areas)
CREATE TABLE IF NOT EXISTS task_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  name TEXT NOT NULL,
  description TEXT,
  practice_area_id UUID REFERENCES practice_areas(id),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE task_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "task_templates_tenant_isolation" ON task_templates
  FOR ALL USING (tenant_id = get_user_tenant_id());

CREATE INDEX IF NOT EXISTS idx_task_templates_tenant ON task_templates(tenant_id);
CREATE INDEX IF NOT EXISTS idx_task_templates_practice_area ON task_templates(practice_area_id);

-- Task template items (individual tasks within a template)
CREATE TABLE IF NOT EXISTS task_template_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  template_id UUID NOT NULL REFERENCES task_templates(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  priority TEXT NOT NULL DEFAULT 'medium',
  due_days_offset INT,  -- days after matter creation for due date
  sort_order INT NOT NULL DEFAULT 0,
  assigned_role TEXT,    -- 'lead_attorney', 'paralegal', etc. (for future auto-assign)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE task_template_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "task_template_items_tenant_isolation" ON task_template_items
  FOR ALL USING (tenant_id = get_user_tenant_id());

CREATE INDEX IF NOT EXISTS idx_task_template_items_template ON task_template_items(template_id);
CREATE INDEX IF NOT EXISTS idx_task_template_items_tenant ON task_template_items(tenant_id);

-- Seed example templates for common legal practice areas
-- These will be created per-tenant as needed
