-- ══════════════════════════════════════════════════════════════════════════════
-- Migration 147: Communication Templates & Communication Logs
-- Phase 6  -  Multi-Tenant Dynamic Template Engine
-- ══════════════════════════════════════════════════════════════════════════════

-- ── communication_templates ─────────────────────────────────────────────────
-- System-provided and user-editable message templates with jurisdiction support.
-- Tenant-isolated via RLS. Slugs are unique per tenant+jurisdiction.

CREATE TABLE IF NOT EXISTS communication_templates (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  slug            TEXT NOT NULL,
  name            TEXT NOT NULL,
  subject         TEXT NOT NULL,
  body            TEXT NOT NULL,  -- HTML/Markdown with {{variable}} placeholders
  jurisdiction    TEXT NOT NULL DEFAULT 'CA',
  category        TEXT NOT NULL DEFAULT 'general',
  is_system_default BOOLEAN NOT NULL DEFAULT false,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_by      UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, slug, jurisdiction)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_comm_templates_tenant_category
  ON communication_templates (tenant_id, category);

CREATE INDEX IF NOT EXISTS idx_comm_templates_tenant_jurisdiction_active
  ON communication_templates (tenant_id, jurisdiction, is_active);

-- RLS
ALTER TABLE communication_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY communication_templates_tenant_isolation ON communication_templates
  FOR ALL
  USING (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()))
  WITH CHECK (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()));

-- ── communication_logs ──────────────────────────────────────────────────────
-- Audit trail for template-based communications sent to clients.
-- rendered_subject/rendered_body capture the resolved output at send time.

CREATE TABLE IF NOT EXISTS communication_logs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  matter_id       UUID NOT NULL REFERENCES matters(id) ON DELETE CASCADE,
  sender_id       UUID REFERENCES users(id),
  recipient_email TEXT NOT NULL,
  template_slug   TEXT,
  channel         TEXT NOT NULL DEFAULT 'email',
  rendered_subject TEXT,
  rendered_body   TEXT,
  sent_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_comm_logs_matter_sent
  ON communication_logs (matter_id, sent_at DESC);

CREATE INDEX IF NOT EXISTS idx_comm_logs_tenant_sent
  ON communication_logs (tenant_id, sent_at DESC);

-- RLS
ALTER TABLE communication_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY communication_logs_tenant_isolation ON communication_logs
  FOR ALL
  USING (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()))
  WITH CHECK (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()));
