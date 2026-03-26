-- ============================================================================
-- Migration 096: Email Communication Layer
-- ============================================================================
-- 1. email_accounts  -  per-user and shared mailbox OAuth connections
-- 2. email_account_access  -  granular access to shared mailboxes
-- 3. email_threads  -  conversation grouping with matter/contact association
-- 4. email_messages  -  individual email messages synced from providers
-- 5. email_attachments  -  message attachment metadata
-- 6. email_association_events  -  audit trail for thread-to-matter linking
-- 7. unmatched_email_queue  -  triage queue for unassociated threads
-- 8. email_send_events  -  outbound email audit trail
-- 9. Alter matters: preferred_email_account_id
-- ============================================================================

BEGIN;

-- ─── 1. email_accounts ──────────────────────────────────────────────────────
-- Stores OAuth credentials for personal and shared mailboxes.
-- Tokens are AES-256-GCM encrypted, same pattern as microsoft_connections.

CREATE TABLE IF NOT EXISTS email_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_type TEXT NOT NULL CHECK (account_type IN ('personal', 'shared')),
  provider TEXT NOT NULL CHECK (provider IN ('microsoft', 'google')),
  email_address TEXT NOT NULL,
  display_name TEXT,
  -- Encrypted tokens (AES-256-GCM)
  encrypted_access_token TEXT NOT NULL,
  encrypted_refresh_token TEXT NOT NULL,
  token_expires_at TIMESTAMPTZ NOT NULL,
  -- Access control for shared mailboxes
  authorized_user_ids UUID[] DEFAULT '{}',
  -- Optional practice area scope
  practice_area_id UUID REFERENCES practice_areas(id) ON DELETE SET NULL,
  -- Sync state
  sync_enabled BOOLEAN NOT NULL DEFAULT true,
  delta_link TEXT,
  last_sync_at TIMESTAMPTZ,
  -- Error tracking
  error_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  -- Metadata
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- One email address per tenant
  UNIQUE (tenant_id, email_address)
);

ALTER TABLE email_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY email_accounts_tenant_isolation ON email_accounts
  FOR ALL
  USING (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()))
  WITH CHECK (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()));

CREATE INDEX IF NOT EXISTS idx_email_accounts_user ON email_accounts (user_id);
CREATE INDEX IF NOT EXISTS idx_email_accounts_sync ON email_accounts (is_active, sync_enabled)
  WHERE is_active = true AND sync_enabled = true;

-- ─── 2. email_account_access ────────────────────────────────────────────────
-- Granular access control for shared mailboxes.

CREATE TABLE IF NOT EXISTS email_account_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email_account_id UUID NOT NULL REFERENCES email_accounts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  access_level TEXT NOT NULL CHECK (access_level IN ('send', 'read', 'admin')),
  granted_by UUID NOT NULL REFERENCES users(id),
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- One access record per user per account
  UNIQUE (email_account_id, user_id)
);

ALTER TABLE email_account_access ENABLE ROW LEVEL SECURITY;

CREATE POLICY email_account_access_tenant_isolation ON email_account_access
  FOR ALL
  USING (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()))
  WITH CHECK (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()));

CREATE INDEX IF NOT EXISTS idx_email_account_access_account ON email_account_access (email_account_id);
CREATE INDEX IF NOT EXISTS idx_email_account_access_user ON email_account_access (user_id);

-- ─── 3. email_threads ───────────────────────────────────────────────────────
-- Conversation grouping with matter/contact association.

CREATE TABLE IF NOT EXISTS email_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  conversation_id TEXT NOT NULL,
  subject TEXT,
  last_message_at TIMESTAMPTZ,
  message_count INTEGER NOT NULL DEFAULT 0,
  participant_emails TEXT[] DEFAULT '{}',
  -- Association
  matter_id UUID REFERENCES matters(id) ON DELETE SET NULL,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  association_confidence DECIMAL,
  association_method TEXT CHECK (association_method IN ('manual', 'subject_match', 'contact_match', 'thread_lock')),
  -- Reply context
  last_sender_account_id UUID REFERENCES email_accounts(id) ON DELETE SET NULL,
  -- Draft locking  -  prevents two users from drafting replies simultaneously
  draft_locked_by UUID REFERENCES users(id) ON DELETE SET NULL,
  draft_locked_at TIMESTAMPTZ,
  -- Metadata
  is_archived BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- One conversation per tenant
  UNIQUE (tenant_id, conversation_id)
);

ALTER TABLE email_threads ENABLE ROW LEVEL SECURITY;

CREATE POLICY email_threads_tenant_isolation ON email_threads
  FOR ALL
  USING (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()))
  WITH CHECK (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()));

CREATE INDEX IF NOT EXISTS idx_email_threads_matter ON email_threads (matter_id) WHERE matter_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_email_threads_last_message ON email_threads (last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_threads_contact ON email_threads (contact_id) WHERE contact_id IS NOT NULL;

-- ─── 4. email_messages ──────────────────────────────────────────────────────
-- Individual email messages synced from providers.

CREATE TABLE IF NOT EXISTS email_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  thread_id UUID NOT NULL REFERENCES email_threads(id) ON DELETE CASCADE,
  message_id TEXT NOT NULL,
  email_account_id UUID NOT NULL REFERENCES email_accounts(id) ON DELETE CASCADE,
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  -- Addresses
  from_address TEXT,
  from_name TEXT,
  to_addresses JSONB DEFAULT '[]',
  cc_addresses JSONB DEFAULT '[]',
  bcc_addresses JSONB DEFAULT '[]',
  -- Content
  subject TEXT,
  body_text TEXT,
  body_html TEXT,
  -- Flags
  has_attachments BOOLEAN NOT NULL DEFAULT false,
  is_read BOOLEAN NOT NULL DEFAULT true,
  importance TEXT NOT NULL DEFAULT 'normal',
  -- Timestamps
  received_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- One message per tenant
  UNIQUE (tenant_id, message_id)
);

ALTER TABLE email_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY email_messages_tenant_isolation ON email_messages
  FOR ALL
  USING (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()))
  WITH CHECK (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()));

CREATE INDEX IF NOT EXISTS idx_email_messages_thread ON email_messages (thread_id, received_at);
CREATE INDEX IF NOT EXISTS idx_email_messages_account ON email_messages (email_account_id);

-- ─── 5. email_attachments ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS email_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  message_id UUID NOT NULL REFERENCES email_messages(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  content_type TEXT,
  size_bytes INTEGER,
  storage_path TEXT,
  external_attachment_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE email_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY email_attachments_tenant_isolation ON email_attachments
  FOR ALL
  USING (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()))
  WITH CHECK (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()));

CREATE INDEX IF NOT EXISTS idx_email_attachments_message ON email_attachments (message_id);

-- ─── 6. email_association_events ────────────────────────────────────────────
-- Audit trail for thread-to-matter association changes.

CREATE TABLE IF NOT EXISTS email_association_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  thread_id UUID NOT NULL REFERENCES email_threads(id) ON DELETE CASCADE,
  matter_id UUID NOT NULL REFERENCES matters(id) ON DELETE CASCADE,
  associated_by UUID NOT NULL REFERENCES users(id),
  association_type TEXT NOT NULL CHECK (association_type IN ('auto', 'manual', 'override')),
  confidence_score DECIMAL,
  previous_matter_id UUID REFERENCES matters(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE email_association_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY email_association_events_tenant_isolation ON email_association_events
  FOR ALL
  USING (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()))
  WITH CHECK (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()));

CREATE INDEX IF NOT EXISTS idx_email_association_events_thread ON email_association_events (thread_id);

-- ─── 7. unmatched_email_queue ───────────────────────────────────────────────
-- Triage queue for threads that could not be auto-associated.

CREATE TABLE IF NOT EXISTS unmatched_email_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  thread_id UUID NOT NULL REFERENCES email_threads(id) ON DELETE CASCADE,
  suggested_matter_ids UUID[] DEFAULT '{}',
  suggested_contact_ids UUID[] DEFAULT '{}',
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'resolved', 'dismissed')),
  resolved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE unmatched_email_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY unmatched_email_queue_tenant_isolation ON unmatched_email_queue
  FOR ALL
  USING (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()))
  WITH CHECK (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()));

CREATE INDEX IF NOT EXISTS idx_unmatched_email_queue_pending ON unmatched_email_queue (status)
  WHERE status = 'pending';

-- ─── 8. email_send_events ───────────────────────────────────────────────────
-- Outbound email audit trail.

CREATE TABLE IF NOT EXISTS email_send_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  message_id UUID NOT NULL REFERENCES email_messages(id) ON DELETE CASCADE,
  email_account_id UUID NOT NULL REFERENCES email_accounts(id) ON DELETE CASCADE,
  matter_id UUID NOT NULL REFERENCES matters(id) ON DELETE CASCADE,
  sent_by UUID NOT NULL REFERENCES users(id),
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE email_send_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY email_send_events_tenant_isolation ON email_send_events
  FOR ALL
  USING (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()))
  WITH CHECK (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()));

CREATE INDEX IF NOT EXISTS idx_email_send_events_matter ON email_send_events (matter_id);

-- ─── 9. Alter matters  -  preferred email account ─────────────────────────────

ALTER TABLE matters
  ADD COLUMN IF NOT EXISTS preferred_email_account_id UUID REFERENCES email_accounts(id) ON DELETE SET NULL;

COMMIT;
