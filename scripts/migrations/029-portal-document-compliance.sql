-- ============================================================================
-- Migration 029: Portal Document Compliance
-- Phase B.4 — Client Portal + Document Compliance Automation
-- ============================================================================
-- New tables:
--   1. document_requests      — audit trail for "Send Document Request" actions
--   2. document_reminders     — history of automated/manual reminders
--   3. document_reminder_configs — per-tenant reminder schedule settings
--
-- Column additions:
--   matter_stages.client_label, notify_client_on_stage_change
--   case_stage_definitions.client_label, notify_client_on_stage_change
--   matter_types.auto_send_document_request
-- ============================================================================

-- ─── 1. document_requests ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS document_requests (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  matter_id       UUID NOT NULL REFERENCES matters(id) ON DELETE CASCADE,
  contact_id      UUID REFERENCES contacts(id) ON DELETE SET NULL,
  requested_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  slot_ids        UUID[] NOT NULL,
  slot_names      TEXT[] NOT NULL,
  message         TEXT,
  notification_id UUID REFERENCES client_notifications(id) ON DELETE SET NULL,
  portal_link_id  UUID REFERENCES portal_links(id) ON DELETE SET NULL,
  status          TEXT NOT NULL DEFAULT 'sent',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_document_requests_matter
  ON document_requests(matter_id);
CREATE INDEX IF NOT EXISTS idx_document_requests_tenant
  ON document_requests(tenant_id);

ALTER TABLE document_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS document_requests_tenant_isolation ON document_requests;
CREATE POLICY document_requests_tenant_isolation ON document_requests
  FOR ALL
  USING (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()))
  WITH CHECK (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()));

-- ─── 2. document_reminders ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS document_reminders (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  matter_id              UUID NOT NULL REFERENCES matters(id) ON DELETE CASCADE,
  contact_id             UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  reminder_number        INT NOT NULL,
  reminder_type          TEXT NOT NULL DEFAULT 'client',
  outstanding_slot_ids   UUID[] NOT NULL,
  outstanding_slot_names TEXT[] NOT NULL,
  notification_id        UUID REFERENCES client_notifications(id) ON DELETE SET NULL,
  sent_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_document_reminders_matter
  ON document_reminders(matter_id);
CREATE INDEX IF NOT EXISTS idx_document_reminders_tenant
  ON document_reminders(tenant_id);

ALTER TABLE document_reminders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS document_reminders_tenant_isolation ON document_reminders;
CREATE POLICY document_reminders_tenant_isolation ON document_reminders
  FOR ALL
  USING (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()))
  WITH CHECK (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()));

-- ─── 3. document_reminder_configs ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS document_reminder_configs (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  matter_type_id        UUID REFERENCES matter_types(id) ON DELETE CASCADE,
  schedule_days         INT[] NOT NULL DEFAULT '{2,5,10}',
  quiet_hours_start     INT DEFAULT 21,
  quiet_hours_end       INT DEFAULT 8,
  max_reminders         INT DEFAULT 5,
  escalation_after_days INT DEFAULT 14,
  is_active             BOOLEAN DEFAULT true,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, matter_type_id)
);

ALTER TABLE document_reminder_configs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS document_reminder_configs_tenant_isolation ON document_reminder_configs;
CREATE POLICY document_reminder_configs_tenant_isolation ON document_reminder_configs
  FOR ALL
  USING (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()))
  WITH CHECK (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()));

-- ─── 4. Column additions to existing tables ────────────────────────────────

-- Client-facing stage labels (nullable — falls back to stage name when null)
ALTER TABLE matter_stages
  ADD COLUMN IF NOT EXISTS client_label TEXT DEFAULT NULL;
ALTER TABLE case_stage_definitions
  ADD COLUMN IF NOT EXISTS client_label TEXT DEFAULT NULL;

-- Configurable client notification on stage change (default: off)
ALTER TABLE matter_stages
  ADD COLUMN IF NOT EXISTS notify_client_on_stage_change BOOLEAN DEFAULT false;
ALTER TABLE case_stage_definitions
  ADD COLUMN IF NOT EXISTS notify_client_on_stage_change BOOLEAN DEFAULT false;

-- Auto-send document request when new required slots appear from regeneration
ALTER TABLE matter_types
  ADD COLUMN IF NOT EXISTS auto_send_document_request BOOLEAN DEFAULT false;
