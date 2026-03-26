-- Migration 181: Delta-Sync Engine  -  Background Clio polling for 7-day post-migration sync
-- Tracks sync sessions and individual sync runs for auditing/debugging

-- ─── Sync Sessions ─────────────────────────────────────────────────────────
-- One row per active delta-sync session (one per tenant+platform)
CREATE TABLE IF NOT EXISTS delta_sync_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  connection_id UUID NOT NULL REFERENCES platform_connections(id),
  platform TEXT NOT NULL CHECK (platform IN ('clio')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed', 'failed')),
  -- Polling config
  poll_interval_seconds INTEGER NOT NULL DEFAULT 120,
  entity_types TEXT[] NOT NULL DEFAULT ARRAY['notes', 'documents', 'trust_line_items'],
  -- Watermarks: last-seen updated_at per entity type (JSONB: { notes: "2026-...", documents: "2026-..." })
  watermarks JSONB NOT NULL DEFAULT '{}',
  -- Lifecycle
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '7 days'),
  paused_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  -- Stats
  total_synced INTEGER NOT NULL DEFAULT 0,
  total_errors INTEGER NOT NULL DEFAULT 0,
  last_poll_at TIMESTAMPTZ,
  last_error TEXT,
  last_error_at TIMESTAMPTZ,
  -- Meta
  started_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, platform, status) -- Only one active session per tenant+platform
);

CREATE INDEX IF NOT EXISTS idx_delta_sync_sessions_active
  ON delta_sync_sessions(status, expires_at)
  WHERE status = 'active';

ALTER TABLE delta_sync_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY delta_sync_sessions_tenant_isolation ON delta_sync_sessions
  USING (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()))
  WITH CHECK (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()));

-- ─── Sync Run Log ──────────────────────────────────────────────────────────
-- One row per individual poll cycle for observability
CREATE TABLE IF NOT EXISTS delta_sync_runs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES delta_sync_sessions(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  entity_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed')),
  -- What was fetched
  items_fetched INTEGER NOT NULL DEFAULT 0,
  items_created INTEGER NOT NULL DEFAULT 0,
  items_updated INTEGER NOT NULL DEFAULT 0,
  items_skipped INTEGER NOT NULL DEFAULT 0,
  -- Timing
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER,
  -- Errors
  error_message TEXT,
  -- Watermark advancement
  previous_watermark TIMESTAMPTZ,
  new_watermark TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_delta_sync_runs_session
  ON delta_sync_runs(session_id, created_at DESC);

ALTER TABLE delta_sync_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY delta_sync_runs_tenant_isolation ON delta_sync_runs
  USING (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()))
  WITH CHECK (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()));

-- ─── Updated-at trigger ────────────────────────────────────────────────────
CREATE TRIGGER set_delta_sync_sessions_updated_at
  BEFORE UPDATE ON delta_sync_sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
