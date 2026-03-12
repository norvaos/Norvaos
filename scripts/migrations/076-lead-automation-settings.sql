-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration 076: Lead Automation Settings & Template Management
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Two new tables for workspace-level automation configuration:
--   1. lead_automation_settings — per-trigger enable/disable, channel control, practice area scoping
--   2. lead_message_templates — workspace template overrides with merge field placeholders
--
-- Also extends workspace_workflow_config with automation_message_settings JSONB.
--
-- Three-tier resolution:
--   System defaults (code registry) → workspace settings (this table) → workspace templates (this table)
--
-- Depends on: migration 075 (workspace_workflow_config table must exist)
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── 1. Lead Automation Settings ─────────────────────────────────────────────
-- Per-workspace, per-trigger automation configuration.
-- Controls whether each automation is enabled, which channels it uses,
-- and optional practice-area scoping.

CREATE TABLE IF NOT EXISTS lead_automation_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  trigger_key TEXT NOT NULL,

  -- Enable/disable this automation for this workspace
  is_enabled BOOLEAN NOT NULL DEFAULT TRUE,

  -- Channel control: which channels this automation uses for this workspace
  -- Empty array = use trigger's default supported channels
  enabled_channels JSONB DEFAULT '[]'::jsonb,

  -- Practice area scoping: null = applies to all practice areas
  -- Array of practice_area UUIDs = only fire for leads with these practice areas
  practice_area_ids JSONB DEFAULT NULL,

  -- Trigger-specific behaviour overrides (JSON object)
  -- e.g., { "reminder_hours": [24, 4] } for consultation reminders
  settings_overrides JSONB DEFAULT '{}'::jsonb,

  -- Audit
  updated_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (tenant_id, trigger_key)
);

ALTER TABLE lead_automation_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON lead_automation_settings
  USING (tenant_id = get_current_tenant_id());

CREATE POLICY "tenant_isolation_insert" ON lead_automation_settings
  FOR INSERT WITH CHECK (tenant_id = get_current_tenant_id());

CREATE INDEX idx_lead_automation_settings_tenant
  ON lead_automation_settings(tenant_id);

CREATE INDEX idx_lead_automation_settings_lookup
  ON lead_automation_settings(tenant_id, trigger_key);


-- ─── 2. Lead Message Templates ───────────────────────────────────────────────
-- Workspace-level message template overrides.
-- One row per trigger × channel combination per workspace.
-- If no override exists, the system default from the trigger registry is used.
-- Template content supports merge field placeholders: {{contact.name}}, {{firm.name}}, etc.

CREATE TABLE IF NOT EXISTS lead_message_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  trigger_key TEXT NOT NULL,
  channel TEXT NOT NULL,

  -- Template content (with merge field placeholders)
  -- subject can be null for channels that don't use subjects (sms, in_app)
  subject TEXT,
  body TEXT NOT NULL,

  -- Template metadata
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  -- Incremented on each edit for audit trail
  version INT NOT NULL DEFAULT 1,

  -- Audit
  created_by UUID REFERENCES users(id),
  updated_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- One template per trigger × channel × workspace
  UNIQUE (tenant_id, trigger_key, channel)
);

ALTER TABLE lead_message_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON lead_message_templates
  USING (tenant_id = get_current_tenant_id());

CREATE POLICY "tenant_isolation_insert" ON lead_message_templates
  FOR INSERT WITH CHECK (tenant_id = get_current_tenant_id());

CREATE INDEX idx_lead_message_templates_tenant
  ON lead_message_templates(tenant_id);

CREATE INDEX idx_lead_message_templates_lookup
  ON lead_message_templates(tenant_id, trigger_key);

CREATE INDEX idx_lead_message_templates_full_lookup
  ON lead_message_templates(tenant_id, trigger_key, channel);


-- ─── 3. Extend workspace_workflow_config ─────────────────────────────────────
-- Workspace-wide message preferences (sender name, signature, branding mode)

ALTER TABLE workspace_workflow_config
  ADD COLUMN IF NOT EXISTS automation_message_settings JSONB DEFAULT '{}'::jsonb;

-- Example structure for automation_message_settings:
-- {
--   "default_sender_name": "Smith & Associates",
--   "include_signature": true,
--   "branding_mode": "full",    -- 'full' | 'minimal' | 'none'
--   "reply_to_email": "intake@smithlaw.com"
-- }


-- ─── 4. Updated_at trigger for lead_automation_settings ──────────────────────

CREATE OR REPLACE FUNCTION update_lead_automation_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_lead_automation_settings_updated_at
  BEFORE UPDATE ON lead_automation_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_lead_automation_settings_updated_at();


-- ─── 5. Version increment trigger for lead_message_templates ─────────────────
-- Auto-increments version on update so we have an audit trail of template edits.

CREATE OR REPLACE FUNCTION update_lead_message_templates_metadata()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  -- Only increment version if content actually changed
  IF NEW.subject IS DISTINCT FROM OLD.subject OR NEW.body IS DISTINCT FROM OLD.body THEN
    NEW.version = OLD.version + 1;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_lead_message_templates_metadata
  BEFORE UPDATE ON lead_message_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_lead_message_templates_metadata();
