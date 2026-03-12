-- ============================================================================
-- Migration 054: Microsoft 365 Integration
-- ============================================================================
-- 1. New table: microsoft_connections (per-user OAuth tokens)
-- 2. New table: sync_log (sync run audit trail)
-- 3. Alter tasks: add external_id, external_provider, last_synced_at
-- 4. Alter documents: add external_id, external_provider, onedrive fields
-- ============================================================================

BEGIN;

-- ─── 1. microsoft_connections ───────────────────────────────────────────────
-- Stores encrypted OAuth tokens per user. One connection per user.
-- Token refresh happens server-side; tokens are AES-256-GCM encrypted.

CREATE TABLE IF NOT EXISTS microsoft_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- Microsoft identity
  microsoft_user_id TEXT NOT NULL,
  microsoft_email TEXT NOT NULL,
  microsoft_display_name TEXT,
  -- Encrypted tokens (AES-256-GCM, stored as base64)
  access_token_encrypted TEXT NOT NULL,
  refresh_token_encrypted TEXT NOT NULL,
  token_expires_at TIMESTAMPTZ NOT NULL,
  -- Granted scopes
  scopes TEXT[] NOT NULL DEFAULT '{}',
  -- Sync state
  calendar_sync_enabled BOOLEAN NOT NULL DEFAULT false,
  calendar_delta_link TEXT,
  tasks_sync_enabled BOOLEAN NOT NULL DEFAULT false,
  tasks_delta_link TEXT,
  onedrive_enabled BOOLEAN NOT NULL DEFAULT false,
  last_calendar_sync_at TIMESTAMPTZ,
  last_tasks_sync_at TIMESTAMPTZ,
  -- Metadata
  is_active BOOLEAN NOT NULL DEFAULT true,
  error_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  last_error_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- One connection per user
  UNIQUE (user_id)
);

ALTER TABLE microsoft_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY microsoft_connections_tenant_isolation ON microsoft_connections
  FOR ALL
  USING (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()))
  WITH CHECK (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()));

CREATE INDEX IF NOT EXISTS idx_ms_connections_user ON microsoft_connections (user_id);
CREATE INDEX IF NOT EXISTS idx_ms_connections_sync ON microsoft_connections (is_active, calendar_sync_enabled)
  WHERE is_active = true;

-- ─── 2. sync_log ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS sync_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  connection_id UUID NOT NULL REFERENCES microsoft_connections(id) ON DELETE CASCADE,
  sync_type TEXT NOT NULL,
  direction TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running',
  items_created INTEGER NOT NULL DEFAULT 0,
  items_updated INTEGER NOT NULL DEFAULT 0,
  items_deleted INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'
);

ALTER TABLE sync_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY sync_log_tenant_isolation ON sync_log
  FOR ALL
  USING (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()))
  WITH CHECK (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()));

CREATE INDEX IF NOT EXISTS idx_sync_log_connection ON sync_log (connection_id, started_at DESC);

-- ─── 3. Extend tasks table ─────────────────────────────────────────────────

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS external_id TEXT,
  ADD COLUMN IF NOT EXISTS external_provider TEXT,
  ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_tasks_external ON tasks (external_provider, external_id)
  WHERE external_id IS NOT NULL;

-- ─── 4. Extend documents table ─────────────────────────────────────────────

ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS external_id TEXT,
  ADD COLUMN IF NOT EXISTS external_provider TEXT,
  ADD COLUMN IF NOT EXISTS onedrive_item_id TEXT,
  ADD COLUMN IF NOT EXISTS onedrive_web_url TEXT;

CREATE INDEX IF NOT EXISTS idx_documents_external ON documents (external_provider, external_id)
  WHERE external_id IS NOT NULL;

COMMIT;
