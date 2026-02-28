-- ============================================================================
-- Migration 018: Client Notification Tracking
-- Phase 3C: Automated Client Status Updates
-- ============================================================================
-- Tracks email notifications sent to clients (stage changes, document requests,
-- general updates). Separate from the internal `notifications` table which is
-- for app users (lawyers).
-- ============================================================================

-- 1. Client notifications table
CREATE TABLE IF NOT EXISTS client_notifications (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          UUID NOT NULL REFERENCES tenants(id),
  matter_id          UUID NOT NULL REFERENCES matters(id),
  contact_id         UUID NOT NULL REFERENCES contacts(id),
  notification_type  TEXT NOT NULL DEFAULT 'stage_change',
  subject            TEXT NOT NULL,
  body_html          TEXT,
  body_text          TEXT,
  channel            TEXT NOT NULL DEFAULT 'email',
  status             TEXT NOT NULL DEFAULT 'pending',
  recipient_email    TEXT,
  resend_message_id  TEXT,
  error_message      TEXT,
  metadata           JSONB DEFAULT '{}'::jsonb,
  sent_at            TIMESTAMPTZ,
  delivered_at       TIMESTAMPTZ,
  opened_at          TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Indexes
CREATE INDEX IF NOT EXISTS idx_client_notif_tenant ON client_notifications(tenant_id);
CREATE INDEX IF NOT EXISTS idx_client_notif_matter ON client_notifications(matter_id);
CREATE INDEX IF NOT EXISTS idx_client_notif_contact ON client_notifications(contact_id);
CREATE INDEX IF NOT EXISTS idx_client_notif_status ON client_notifications(status);

-- 3. RLS
ALTER TABLE client_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "client_notifications_tenant_isolation" ON client_notifications
  USING (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()));

-- 4. updated_at trigger
CREATE TRIGGER set_client_notifications_updated_at
  BEFORE UPDATE ON client_notifications
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 5. Email notification preference on contacts (opt-out model, defaults true)
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS email_notifications_enabled BOOLEAN DEFAULT true;
