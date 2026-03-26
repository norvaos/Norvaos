-- Migration 180: Ghost-Writer — AI email reply drafts
-- Stores AI-generated reply drafts for inbound emails. Each inbound email
-- in a matter-associated thread triggers Ghost-Writer to pre-generate a
-- response draft before the lawyer opens the thread.

CREATE TABLE IF NOT EXISTS email_ghost_drafts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email_thread_id uuid NOT NULL REFERENCES email_threads(id) ON DELETE CASCADE,
  email_message_id uuid REFERENCES email_messages(id) ON DELETE SET NULL,
  matter_id       uuid NOT NULL REFERENCES matters(id) ON DELETE CASCADE,

  -- The generated draft
  draft_subject   text,
  draft_body_text text NOT NULL,
  draft_body_html text,

  -- AI metadata
  model           text NOT NULL DEFAULT 'claude-sonnet-4-20250514',
  tokens_input    integer,
  tokens_output   integer,
  duration_ms     integer,

  -- Status workflow: generated → reviewed → sent → discarded
  status          text NOT NULL DEFAULT 'generated'
                  CHECK (status IN ('generating', 'generated', 'reviewed', 'sent', 'discarded')),

  reviewed_by     uuid REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at     timestamptz,

  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_ghost_drafts_thread
  ON email_ghost_drafts(email_thread_id);
CREATE INDEX IF NOT EXISTS idx_ghost_drafts_matter
  ON email_ghost_drafts(matter_id);
CREATE INDEX IF NOT EXISTS idx_ghost_drafts_tenant_status
  ON email_ghost_drafts(tenant_id, status);

-- RLS
ALTER TABLE email_ghost_drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON email_ghost_drafts
  USING (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()));

-- Trigger for updated_at
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON email_ghost_drafts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();
