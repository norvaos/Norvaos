-- Migration 036: Communications Foundation
-- Adds email activity logging and threaded matter comments.
-- Enables email tracking and internal/client-visible discussions on matters.

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Email Logs — manual email activity logging
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS email_logs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Email metadata
  direction         TEXT NOT NULL,
  subject           TEXT NOT NULL,
  body              TEXT,
  from_address      TEXT NOT NULL,
  to_addresses      TEXT[] NOT NULL,
  cc_addresses      TEXT[],
  bcc_addresses     TEXT[],
  sent_at           TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Linked entities
  contact_id        UUID REFERENCES contacts(id) ON DELETE SET NULL,
  matter_id         UUID REFERENCES matters(id) ON DELETE SET NULL,

  -- Logged by
  logged_by         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- For future email sync integration
  external_message_id TEXT,

  is_active         BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT email_logs_direction_check CHECK (
    direction IN ('inbound','outbound')
  )
);

CREATE INDEX IF NOT EXISTS idx_email_logs_tenant
  ON email_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_email_logs_contact
  ON email_logs(contact_id);
CREATE INDEX IF NOT EXISTS idx_email_logs_matter
  ON email_logs(matter_id);
CREATE INDEX IF NOT EXISTS idx_email_logs_sent_at
  ON email_logs(tenant_id, sent_at DESC);

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Matter Comments — threaded discussion on matters
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS matter_comments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  matter_id         UUID NOT NULL REFERENCES matters(id) ON DELETE CASCADE,
  parent_id         UUID REFERENCES matter_comments(id) ON DELETE CASCADE,

  -- Author
  author_type       TEXT NOT NULL,
  author_user_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  author_contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,

  content           TEXT NOT NULL,
  is_internal       BOOLEAN NOT NULL DEFAULT true,  -- true = staff only, false = client visible

  is_active         BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT comment_author_type_check CHECK (
    author_type IN ('user','client')
  ),
  CONSTRAINT comment_has_author CHECK (
    (author_type = 'user' AND author_user_id IS NOT NULL) OR
    (author_type = 'client' AND author_contact_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_matter_comments_matter
  ON matter_comments(matter_id);
CREATE INDEX IF NOT EXISTS idx_matter_comments_tenant
  ON matter_comments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_matter_comments_parent
  ON matter_comments(parent_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. RLS Policies
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE email_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE matter_comments ENABLE ROW LEVEL SECURITY;

-- Email logs: standard tenant isolation
CREATE POLICY email_logs_tenant_isolation
  ON email_logs
  FOR ALL
  USING (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()));

-- Matter comments: staff can see all comments for their tenant
CREATE POLICY matter_comments_tenant_isolation
  ON matter_comments
  FOR ALL
  USING (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()));

-- Portal: anonymous can read client-visible comments (validated via application logic)
CREATE POLICY matter_comments_anon_read
  ON matter_comments
  FOR SELECT
  TO anon
  USING (is_internal = false AND is_active = true);

-- Portal: anonymous can insert client comments (validated via application logic)
CREATE POLICY matter_comments_anon_insert
  ON matter_comments
  FOR INSERT
  TO anon
  WITH CHECK (author_type = 'client' AND is_internal = false);

COMMIT;
