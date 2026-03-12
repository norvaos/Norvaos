-- Migration 078: Portal Analytics + Questionnaire Edit Requests
-- Two new tables: portal_events (immutable append-only) and questionnaire_edit_requests

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1. portal_events — Immutable append-only event log for portal usage analytics
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS portal_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  portal_link_id  UUID NOT NULL REFERENCES portal_links(id) ON DELETE CASCADE,
  matter_id       UUID NOT NULL REFERENCES matters(id) ON DELETE CASCADE,
  contact_id      UUID REFERENCES contacts(id) ON DELETE SET NULL,

  event_type      TEXT NOT NULL CHECK (event_type IN (
    'portal_opened',
    'device_context',
    'section_expanded',
    'section_collapsed',
    'document_upload_started',
    'document_upload_completed',
    'document_upload_failed',
    'questionnaire_step_completed',
    'questionnaire_completed',
    'questionnaire_edit_requested',
    'payment_mark_sent_clicked',
    'payment_credit_card_clicked',
    'payment_instructions_copied',
    'message_section_opened',
    'message_sent',
    'next_action_displayed',
    'next_action_go_clicked',
    'portal_help_contact_clicked',
    'support_email_clicked',
    'support_phone_clicked'
  )),

  event_data      JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_portal_events_link_type_time
  ON portal_events (portal_link_id, event_type, created_at);

CREATE INDEX IF NOT EXISTS idx_portal_events_tenant_type_time
  ON portal_events (tenant_id, event_type, created_at);

CREATE INDEX IF NOT EXISTS idx_portal_events_matter_time
  ON portal_events (matter_id, created_at);

-- RLS
ALTER TABLE portal_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY portal_events_tenant ON portal_events
  FOR ALL
  USING (tenant_id = public.get_user_tenant_id())
  WITH CHECK (tenant_id = public.get_user_tenant_id());

-- Immutability triggers (append-only, following front_desk_events pattern)
CREATE OR REPLACE FUNCTION prevent_portal_event_update()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'UPDATE of portal_events records is not permitted.';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION prevent_portal_event_delete()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'DELETE of portal_events records is not permitted.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER no_update_portal_events
  BEFORE UPDATE ON portal_events
  FOR EACH ROW EXECUTE FUNCTION prevent_portal_event_update();

CREATE TRIGGER no_delete_portal_events
  BEFORE DELETE ON portal_events
  FOR EACH ROW EXECUTE FUNCTION prevent_portal_event_delete();


-- ═══════════════════════════════════════════════════════════════════════════════
-- 2. questionnaire_edit_requests — Client requests to reopen completed questionnaires
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS questionnaire_edit_requests (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  matter_id       UUID NOT NULL REFERENCES matters(id) ON DELETE CASCADE,
  portal_link_id  UUID NOT NULL REFERENCES portal_links(id) ON DELETE CASCADE,
  session_id      UUID NOT NULL REFERENCES ircc_questionnaire_sessions(id) ON DELETE CASCADE,
  contact_id      UUID REFERENCES contacts(id) ON DELETE SET NULL,

  reason          TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied')),

  resolved_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  resolved_at     TIMESTAMPTZ,
  resolution_note TEXT,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_qer_matter_status
  ON questionnaire_edit_requests (matter_id, status);

CREATE INDEX IF NOT EXISTS idx_qer_tenant_pending
  ON questionnaire_edit_requests (tenant_id, status)
  WHERE status = 'pending';

-- RLS
ALTER TABLE questionnaire_edit_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY qer_tenant ON questionnaire_edit_requests
  FOR ALL
  USING (tenant_id = public.get_user_tenant_id())
  WITH CHECK (tenant_id = public.get_user_tenant_id());
