-- Migration 055: Platform API connections for GHL and Clio
-- Stores encrypted OAuth tokens for direct API import

CREATE TABLE IF NOT EXISTS platform_connections (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  platform TEXT NOT NULL CHECK (platform IN ('ghl', 'clio')),
  access_token_encrypted TEXT NOT NULL,
  refresh_token_encrypted TEXT NOT NULL,
  token_expires_at TIMESTAMPTZ NOT NULL,
  location_id TEXT,
  platform_user_id TEXT,
  platform_user_name TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  error_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  last_error_at TIMESTAMPTZ,
  connected_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, platform)
);

CREATE INDEX IF NOT EXISTS idx_platform_connections_tenant ON platform_connections(tenant_id);
CREATE INDEX IF NOT EXISTS idx_platform_connections_active ON platform_connections(tenant_id, platform, is_active);

ALTER TABLE platform_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY platform_connections_tenant_isolation ON platform_connections
  USING (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()))
  WITH CHECK (tenant_id = (SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()));

-- Add import_mode to import_batches for API vs CSV tracking
ALTER TABLE import_batches ADD COLUMN IF NOT EXISTS import_mode TEXT NOT NULL DEFAULT 'csv'
  CHECK (import_mode IN ('csv', 'api'));
ALTER TABLE import_batches ADD COLUMN IF NOT EXISTS connection_id UUID REFERENCES platform_connections(id);
