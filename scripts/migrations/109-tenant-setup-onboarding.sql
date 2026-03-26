-- Migration 109: Tenant setup log and onboarding checklist
--
-- tenant_setup_log    -  idempotency log for bootstrap/seed actions (admin-only)
-- tenant_onboarding_checklist  -  stores manual checklist completions only;
--                               auto-detected items are computed at read time

BEGIN;

-- ── tenant_setup_log ──────────────────────────────────────────────────────────
-- Records every platform-admin bootstrap action.
-- UNIQUE(tenant_id, action) enforces idempotency  -  same action cannot be applied
-- twice to the same tenant.

CREATE TABLE IF NOT EXISTS tenant_setup_log (
  id            UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id     UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  action        TEXT        NOT NULL,
  starter_pack  TEXT,
  applied_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  applied_by    TEXT        NOT NULL DEFAULT 'platform-admin',
  result        JSONB,
  UNIQUE(tenant_id, action)
);

CREATE INDEX IF NOT EXISTS idx_tenant_setup_log_tenant
  ON tenant_setup_log(tenant_id, applied_at DESC);

-- No direct client reads  -  all access via platform-admin API routes with admin client.
ALTER TABLE tenant_setup_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "setup_log_no_client_access" ON tenant_setup_log
  USING (false);

-- ── tenant_onboarding_checklist ───────────────────────────────────────────────
-- Stores ONLY manual checklist completions.
-- Auto-detected items (practice_areas_configured, team_member_added, etc.)
-- are computed live from system signals and never stored here.

CREATE TABLE IF NOT EXISTS tenant_onboarding_checklist (
  id            UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id     UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  item_key      TEXT        NOT NULL,
  completed_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_by  UUID        REFERENCES users(id),
  notes         TEXT,
  UNIQUE(tenant_id, item_key)
);

CREATE INDEX IF NOT EXISTS idx_onboarding_checklist_tenant
  ON tenant_onboarding_checklist(tenant_id);

ALTER TABLE tenant_onboarding_checklist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "onboarding_checklist_select" ON tenant_onboarding_checklist
  FOR SELECT
  USING (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()));

CREATE POLICY "onboarding_checklist_insert" ON tenant_onboarding_checklist
  FOR INSERT
  WITH CHECK (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()));

COMMIT;
