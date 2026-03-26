-- ============================================================
-- 123-matter-rule-snapshots.sql
-- Immutable rule versioning snapshots  -  captures the 6 rule
-- objects from a matter's matter_type at the moment of creation.
-- Agent 4 of 6  -  Rule Versioning Snapshots
-- ============================================================

CREATE TABLE IF NOT EXISTS matter_rule_snapshots (
  id              UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id       UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  matter_id       UUID        NOT NULL REFERENCES matters(id) ON DELETE CASCADE,
  rule_type       TEXT        NOT NULL,
  -- 'matter_type_config' | 'sla_config' | 'billing_config' | 'document_checklist' | 'task_templates' | 'form_pack_config'
  snapshot_data   JSONB       NOT NULL DEFAULT '{}',
  version_hash    TEXT        NOT NULL,  -- SHA-256 hex of snapshot_data
  captured_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mrs_matter_id  ON matter_rule_snapshots(matter_id);
CREATE INDEX IF NOT EXISTS idx_mrs_tenant_id  ON matter_rule_snapshots(tenant_id);
CREATE INDEX IF NOT EXISTS idx_mrs_rule_type  ON matter_rule_snapshots(rule_type);

ALTER TABLE matter_rule_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mrs_tenant_select" ON matter_rule_snapshots
  FOR SELECT USING (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()));

CREATE POLICY "mrs_service_insert" ON matter_rule_snapshots
  FOR INSERT WITH CHECK (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()));
